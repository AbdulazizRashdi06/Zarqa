using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Zarqa.Api.Matching;

/// <summary>What a reviewer decided about one lost/found pair, plus everything worth logging.</summary>
public sealed record Review(
    bool IsMatch,
    double FinalScore,
    double? SameItem,
    double? Overall,
    string Decider,
    JsonObject Log,
    decimal CostUsd);

/// <summary>Shared prompt pieces (benchmark/src/reviewers/*.js), kept verbatim.</summary>
internal static class PromptParts
{
    // JSON.stringify keeps non-ASCII as-is; match that so prompts are byte-identical to the benchmark's.
    private static readonly JsonSerializerOptions Js = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static string Stringify(JsonObject o) => o.ToJsonString(Js);

    /// <summary>benchmark brief(r): title, category, description (≤500 chars), location, eventDate.</summary>
    public static JsonObject Brief(MatchInput r)
    {
        var o = new JsonObject();
        // One-text reports have no item name: the description carries everything.
        if (r.Title.Length > 0) o["title"] = r.Title;
        if (r.Category.Length > 0) o["category"] = r.Category;
        o["description"] = TextRules.Truncate(r.Description, 500);
        o["location"] = r.Location;
        o["eventDate"] = r.EventDate;
        return o;
    }

    public static string AliasLine(MatchInput lost, MatchInput found, AliasIndex aliases)
    {
        var groups = aliases.Match(lost.Location).Concat(aliases.Match(found.Location)).Select(g => $"{g.Canonical}: {string.Join(", ", g.Names)}").ToList();
        return groups.Count > 0 ? string.Join(" | ", groups) : "none";
    }

    public static JsonObject Schema(string json) => JsonNode.Parse(json)!.AsObject();
}

/// <summary>luna-debate-terra: two Luna advocates and a Terra judge, with DeepSeek available for each stage.</summary>
public sealed class DebateReviewer(ILuna luna, ITerra terra, IDeepSeek deepSeek, IJev jev, AliasIndex aliases,
    IOptions<ModelOptions> options, ILogger<DebateReviewer> log)
{
    public const double Threshold = 0.55;
    public bool IsConfigured => options.Value.UseTerraJudge
        ? (luna.IsConfigured || deepSeek.IsConfigured) && (terra.IsConfigured || deepSeek.IsConfigured)
        : luna.IsConfigured;

    private static readonly Dictionary<string, string> Sides = new()
    {
        ["for"] = "You are the advocate FOR a match. Make the strongest honest case that the LOST and FOUND reports describe the same physical item.",
        ["against"] = "You are the advocate AGAINST a match. Make the strongest honest case that the LOST and FOUND reports describe different items.",
    };

    private const string Common = $$"""
        This is a university lost-and-found app. Use only evidence in the reports and photos: item type, colour, brand/model, distinctive marks, place (location aliases name the same place), and timing (an item cannot be found before it was lost).
        {{SimilarityRule}}
        Cite concrete details, say how strong each point is, and do not invent facts. If the evidence on your side is weak, say so plainly. At most 120 words.
        """;

    private const string AdvocateSchema = """
        {"type":"object","additionalProperties":false,"required":["argument","strength"],"properties":{"argument":{"type":"string"},"strength":{"type":"string","enum":["weak","moderate","strong"]}}}
        """;
    private const string AdvocateExample = """{"argument":"Both reports mention the same distinctive sticker.","strength":"strong"}""";
    private const string JudgeExample = """{"same_item_probability":0.62,"stronger_case":"for","overall_probabilities":{"clearly_different":0.05,"probably_different":0.1,"unclear":0.25,"probably_same":0.5,"almost_certainly_same":0.1}}""";

    public static readonly string[] Levels =
    [
        "Clearly different items",
        "Probably different items",
        "Unclear, could be either",
        "Probably the same item",
        "Almost certainly the same physical item",
    ];

    /// <summary>
    /// Owner decisions (2026-10-27 and 2026-10-31, decisions.md): read item names in context and don't hold thin
    /// reports ("black wallet" at GU2) back for lacking proof. The advocates get the same text. Not re-measured on the benchmark.
    /// </summary>
    public const string SimilarityRule = "People describe the same kind of item in different ways and often give very few details. Interpret item names in context; different words, levels of detail, or singular and plural forms alone neither prove nor disprove a match. Missing specifics are not evidence against a match. A missed real match may prevent an item being returned, while the owner can reject a wrong suggestion, so prefer recall when the evidence makes a match plausible. Still weigh concrete contradictions honestly.";

    private const string SameItemQuestion = "Weighing both advocates' cases against the two reports, do the LOST and FOUND reports describe the same physical item? " + SimilarityRule;
    private const string StrongerQuestion = "Which advocate's case is better supported by the concrete evidence in the reports?";
    private const string OverallQuestion = "How likely is it that the found item is exactly the item described in the lost report? " + SimilarityRule;
    private const string ForCriterion = "The case FOR a match is better supported";
    private const string AgainstCriterion = "The case AGAINST a match is better supported";
    private const string BalancedCriterion = "Both cases are about equally supported";
    private static readonly string[] LevelKeys = ["clearly_different", "probably_different", "unclear", "probably_same", "almost_certainly_same"];

    private static readonly string TerraSystem = $$"""
        You are the judge in a university lost-and-found app. Two advocates have argued whether a LOST report and a FOUND report describe the same physical item. Read the reports and both cases, then answer three questions.
        same_item: {{SameItemQuestion}} Give the probability (0 to 1) that the answer is yes.
        stronger_case: {{StrongerQuestion}} "for" = {{ForCriterion}}; "against" = {{AgainstCriterion}}; "balanced" = {{BalancedCriterion}}.
        overall: {{OverallQuestion}} Give a probability (0 to 1) for each level; they should sum to 1. Levels: {{string.Join("; ", LevelKeys.Zip(Levels, (key, label) => $"{key} = \"{label}\""))}}.
        """.ReplaceLineEndings("\n");

    private const string JudgeSchema = """
        {"type":"object","additionalProperties":false,"required":["same_item_probability","stronger_case","overall_probabilities"],"properties":{"same_item_probability":{"type":"number"},"stronger_case":{"type":"string","enum":["for","against","balanced"]},"overall_probabilities":{"type":"object","additionalProperties":false,"required":["clearly_different","probably_different","unclear","probably_same","almost_certainly_same"],"properties":{"clearly_different":{"type":"number"},"probably_different":{"type":"number"},"unclear":{"type":"number"},"probably_same":{"type":"number"},"almost_certainly_same":{"type":"number"}}}}}
        """;

    private static JsonObject Questions() => new()
    {
        ["same_item"] = new JsonObject
        {
            ["type"] = "noul",
            ["instructions"] = SameItemQuestion,
        },
        ["stronger_case"] = new JsonObject
        {
            ["type"] = "choice",
            ["instructions"] = StrongerQuestion,
            ["criteria"] = new JsonObject
            {
                ["for"] = ForCriterion,
                ["against"] = AgainstCriterion,
                ["balanced"] = BalancedCriterion,
            },
        },
        ["overall"] = new JsonObject
        {
            ["type"] = "score",
            ["instructions"] = OverallQuestion,
            ["criteria"] = new JsonArray(Levels.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray()),
        },
    };

    public static double Score(double sameItem, double overall) => 0.5 * sameItem + 0.5 * overall;

    /// <summary>Null when an advocate failed, so the worker can retry. Judge failures are handled by the matcher.</summary>
    public async Task<Review?> ReviewAsync(MatchInput lost, MatchInput found, IReadOnlyList<string> images, CancellationToken ct)
    {
        var text =
            $"LOST report: {PromptParts.Stringify(PromptParts.Brief(lost))}\nFOUND report: {PromptParts.Stringify(PromptParts.Brief(found))}\n" +
            $"Location aliases: {PromptParts.AliasLine(lost, found, aliases)}\n" +
            $"Attached photos: {Photos.CountFor(lost)} from the LOST report first, then {Photos.CountFor(found)} from the FOUND report.";

        LunaResult pro, con;
        try
        {
            var results = await Task.WhenAll(AdvocateAsync("for"), AdvocateAsync("against"));
            (pro, con) = (results[0], results[1]);
        }
        catch (Exception e) when (IsModelFailure(e, ct))
        {
            log.LogWarning("Debate advocates unavailable; matching will retry");
            return null;
        }

        Task<LunaResult> AdvocateAsync(string side)
        {
            var system = $"{Sides[side]}\n{Common.ReplaceLineEndings("\n")}";
            var name = $"advocate_{side}";
            return options.Value.UseTerraJudge
                ? WithFallbackAsync(luna, system, text, images, name, AdvocateSchema, AdvocateExample, ValidAdvocate, ct)
                : luna.ChatJsonAsync(system, text, images, name, PromptParts.Schema(AdvocateSchema), ct);
        }

        var state = new JsonObject
        {
            ["lost"] = PromptParts.Brief(lost),
            ["found"] = PromptParts.Brief(found),
            ["timing"] = TextRules.DateRelation(lost, found),
            ["case_for"] = new JsonObject { ["argument"] = Str(pro.Parsed, "argument"), ["self_rated_strength"] = Str(pro.Parsed, "strength") },
            ["case_against"] = new JsonObject { ["argument"] = Str(con.Parsed, "argument"), ["self_rated_strength"] = Str(con.Parsed, "strength") },
        };

        if (options.Value.UseTerraJudge)
        {
            var judged = await WithFallbackAsync(terra, TerraSystem, PromptParts.Stringify(state), [], "debate_judge",
                JudgeSchema, JudgeExample, answer => ReadJudge(answer) is not null, ct);
            var result = ReadJudge(judged.Parsed)!.Value;
            return Complete(result.SameItem, result.Overall, result.Stronger, judged.Parsed, judged.Model ?? options.Value.TerraModel,
                judged.InputTokens, judged.OutputTokens, judged.LatencyMs, judged.CostUsd, "judgeAnswers");
        }

        var answer = await jev.AskAsync(state, Questions(), ct);
        var a = answer.Answers;
        var sameItem = JevReaders.Noul(Get(a, "same_item")) ?? 0;
        var overall = JevReaders.Score(Get(a, "overall"), Levels.Length) ?? 0;
        var stronger = JevReaders.Choice(Get(a, "stronger_case"), ["for", "against", "balanced"]) ?? "balanced";
        return Complete(sameItem, overall, stronger, a, options.Value.JevModel, answer.InputTokens, answer.OutputTokens,
            answer.LatencyMs, answer.CostUsd, "jevAnswers");

        Review Complete(double sameItem, double overall, string stronger, JsonElement answers, string judgeModel,
            int judgeIn, int judgeOut, long judgeMs, decimal judgeCost, string answerKey)
        {
            var score = Score(sameItem, overall);
            var details = new JsonObject
            {
                ["for"] = AdvocateLog(pro),
                ["against"] = AdvocateLog(con),
                ["judgeModel"] = judgeModel,
                [answerKey] = JsonNode.Parse(answers.GetRawText()),
                ["sameItem"] = sameItem,
                ["overall"] = overall,
                ["stronger"] = stronger,
                ["finalScore"] = score,
                ["timing"] = state["timing"]!.GetValue<string>(),
                ["tokens"] = new JsonObject
                {
                    ["advocatesIn"] = pro.InputTokens + con.InputTokens,
                    ["advocatesOut"] = pro.OutputTokens + con.OutputTokens,
                    ["judgeIn"] = judgeIn,
                    ["judgeOut"] = judgeOut,
                },
                ["latencyMs"] = Math.Max(pro.LatencyMs, con.LatencyMs) + judgeMs,
            };
            return new Review(score >= Threshold, score, sameItem, overall, "debate", details, pro.CostUsd + con.CostUsd + judgeCost);
        }

        JsonObject AdvocateLog(LunaResult result) => new()
        {
            ["argument"] = Str(result.Parsed, "argument"),
            ["strength"] = Str(result.Parsed, "strength"),
            ["model"] = result.Model ?? options.Value.LunaModel,
        };
    }

    private async Task<LunaResult> WithFallbackAsync(IStructuredChat primary, string system, string text,
        IReadOnlyList<string> images, string name, string schema, string example, Func<JsonElement, bool> valid, CancellationToken ct)
    {
        var started = System.Diagnostics.Stopwatch.StartNew();
        if (primary.IsConfigured)
        {
            try { return await CallAsync(primary, system); }
            catch (Exception e) when (deepSeek.IsConfigured && IsModelFailure(e, ct))
            {
                log.LogWarning("Primary debate model failed for {Stage}; using DeepSeek", name);
            }
        }
        ct.ThrowIfCancellationRequested();
        if (!deepSeek.IsConfigured) throw new ModelCallException($"No provider configured for {name}.");
        var fallback = await CallAsync(deepSeek, $"{system}\nExample JSON response (illustrative values only): {example}");
        return fallback with { LatencyMs = started.ElapsedMilliseconds };

        async Task<LunaResult> CallAsync(IStructuredChat model, string prompt)
        {
            ct.ThrowIfCancellationRequested();
            var result = await model.ChatJsonAsync(prompt, text, images, name, PromptParts.Schema(schema), ct);
            if (!valid(result.Parsed)) throw new ModelCallException($"Invalid JSON for {name}.");
            return result;
        }
    }

    internal static bool IsModelFailure(Exception e, CancellationToken ct) =>
        !ct.IsCancellationRequested && e is ModelCallException or HttpRequestException or OperationCanceledException or JsonException;

    private static bool ValidAdvocate(JsonElement answer) =>
        !string.IsNullOrWhiteSpace(Str(answer, "argument")) && Str(answer, "strength") is "weak" or "moderate" or "strong";

    private static (double SameItem, double Overall, string Stronger)? ReadJudge(JsonElement answer)
    {
        var sameItem = Probability(Get(answer, "same_item_probability"));
        var stronger = Str(answer, "stronger_case");
        if (sameItem is null || stronger is not ("for" or "against" or "balanced") || Get(answer, "overall_probabilities") is not { } levels)
            return null;
        var total = 0d;
        var weighted = 0d;
        for (var i = 0; i < LevelKeys.Length; i++)
        {
            if (Probability(Get(levels, LevelKeys[i])) is not { } p) return null;
            total += p;
            weighted += p * i;
        }
        return total > 0 ? (sameItem.Value, weighted / total / (LevelKeys.Length - 1), stronger) : null;
    }

    private static double? Probability(JsonElement? value) =>
        value is { ValueKind: JsonValueKind.Number } p && p.TryGetDouble(out var number) && double.IsFinite(number)
            ? Math.Clamp(number, 0, 1) : null;

    private static JsonElement? Get(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) ? v : null;

    internal static string Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
}

/// <summary>Plain gpt-6-luna review (benchmark/src/reviewers/luna.js): the fallback when Jev is unavailable.</summary>
public sealed class LunaReviewer(ILuna luna, AliasIndex aliases)
{
    /// <summary>Benchmarked for this cautious prompt; the 2026-11-01 drop to 0.55 applies to the Jev debate only.</summary>
    public const double Threshold = 0.72;

    private const string System = """
        You review one possible match between a LOST report and a FOUND report on a university campus lost-and-found app.
        Be cautious: a false match wastes both people's time. Penalize any conflict in item type, colour, brand, location, or dates that make the match impossible (an item cannot be found before it was lost).
        Location aliases name the same place. Photos, when present, are strong evidence.
        Return finalScore in 0..1 as your probability that both reports describe the same physical item.
        """;

    private const string Schema = """
        {"type":"object","additionalProperties":false,"required":["isLikelyMatch","finalScore","explanation","matchedFields","riskFlags"],"properties":{"isLikelyMatch":{"type":"boolean"},"finalScore":{"type":"number"},"explanation":{"type":"string"},"matchedFields":{"type":"array","items":{"type":"string"}},"riskFlags":{"type":"array","items":{"type":"string"}}}}
        """;

    private static JsonObject Describe(MatchInput r)
    {
        var o = new JsonObject();
        if (r.Title.Length > 0) o["title"] = r.Title;
        if (r.Category.Length > 0) o["category"] = r.Category;
        o["description"] = r.Description;
        o["location"] = r.Location;
        o["campusZone"] = r.CampusZone;
        if (r.EventDate is not null) o["eventDate"] = r.EventDate;
        return o;
    }

    /// <summary>Null when Luna failed (try again later).</summary>
    public async Task<Review?> ReviewAsync(MatchInput lost, MatchInput found, IReadOnlyList<string> images, CancellationToken ct)
    {
        var text =
            $"LOST report: {PromptParts.Stringify(Describe(lost))}\nFOUND report: {PromptParts.Stringify(Describe(found))}\nLocation aliases: {PromptParts.AliasLine(lost, found, aliases)}\n" +
            $"Attached photos: {Photos.CountFor(lost)} from the LOST report first, then {Photos.CountFor(found)} from the FOUND report.";
        LunaResult res;
        try
        {
            res = await luna.ChatJsonAsync(System.ReplaceLineEndings("\n"), text, images, "match_review", PromptParts.Schema(Schema), ct);
        }
        catch (Exception e) when (e is ModelCallException or HttpRequestException or TaskCanceledException or JsonException && !ct.IsCancellationRequested)
        {
            return null;
        }
        var p = res.Parsed;
        var likely = p.TryGetProperty("isLikelyMatch", out var l) && l.ValueKind == JsonValueKind.True;
        var score = p.TryGetProperty("finalScore", out var f) && f.ValueKind == JsonValueKind.Number ? Math.Clamp(f.GetDouble(), 0, 1) : 0;
        var log = new JsonObject
        {
            ["isLikelyMatch"] = likely,
            ["finalScore"] = score,
            ["explanation"] = DebateReviewer.Str(p, "explanation"),
            ["tokens"] = new JsonObject { ["lunaIn"] = res.InputTokens, ["lunaOut"] = res.OutputTokens },
            ["latencyMs"] = res.LatencyMs,
        };
        return new Review(likely && score >= Threshold, score, null, null, "luna_fallback", log, res.CostUsd);
    }
}

/// <summary>Tolerant readers for Jev's answers (benchmark/src/jevClient.js).</summary>
public static class JevReaders
{
    /// <summary>P(yes) for a noul question.</summary>
    public static double? Noul(JsonElement? a)
    {
        if (a is not { } e) return null;
        if (e.ValueKind == JsonValueKind.Number) return e.GetDouble();
        foreach (var key in new[] { "noul", "probability", "value" })
            if (e.ValueKind == JsonValueKind.Object && e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number) return v.GetDouble();
        return null;
    }

    /// <summary>The chosen option: "choice", else the most probable option.</summary>
    public static string? Choice(JsonElement? a, string[] options)
    {
        if (a is not { ValueKind: JsonValueKind.Object } e) return null;
        if (e.TryGetProperty("choice", out var c) && c.ValueKind == JsonValueKind.String) return c.GetString();
        if (!e.TryGetProperty("probabilities", out var probs)) return null;
        var pairs = probs.ValueKind == JsonValueKind.Array
            ? options.Select((o, i) => (o, p: i < probs.GetArrayLength() && probs[i].ValueKind == JsonValueKind.Number ? probs[i].GetDouble() : 0))
            : probs.EnumerateObject().Select(p => (o: p.Name, p: p.Value.ValueKind == JsonValueKind.Number ? p.Value.GetDouble() : 0));
        return pairs.OrderByDescending(x => x.p).Select(x => x.o).FirstOrDefault();
    }

    /// <summary>Score question → 0..1. Prefers the expected level from probabilities; levels may be 0- or 1-based.</summary>
    public static double? Score(JsonElement? a, int n)
    {
        if (a is not { ValueKind: JsonValueKind.Object } e) return null;
        double? expected = null;
        if (e.TryGetProperty("probabilities", out var probs))
        {
            double[]? p = null;
            if (probs.ValueKind == JsonValueKind.Array && probs.GetArrayLength() == n)
                p = probs.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Number ? x.GetDouble() : 0).ToArray();
            else if (probs.ValueKind == JsonValueKind.Object)
                p = Enumerable.Range(0, n).Select(i =>
                    probs.EnumerateObject().Where(kv => kv.Name == DebateReviewer.Levels.ElementAtOrDefault(i) || kv.Name == i.ToString())
                        .Select(kv => kv.Value.GetDouble()).FirstOrDefault()).ToArray();
            if (p is not null)
            {
                var total = p.Sum();
                if (total == 0) total = 1;
                expected = p.Select((v, i) => v / total * i).Sum();
            }
        }
        if (expected is null && e.TryGetProperty("score", out var s) && s.ValueKind == JsonValueKind.Number)
        {
            var v = s.GetDouble();
            expected = v > n - 1 ? v - 1 : v;
        }
        return expected is null ? null : Math.Clamp(expected.Value / (n - 1), 0, 1);
    }
}

/// <summary>
/// Photos the reviewers may see: the first 2 per report. For a card/ID report the matcher passes only the
/// covered copies (numbers and barcodes covered locally), so originals never reach a model.
/// </summary>
public static class Photos
{
    public const int PerReport = 2;

    public static int CountFor(MatchInput r) => Math.Min(PerReport, r.PhotoPaths.Count(File.Exists));

    public static IReadOnlyList<string> DataUrls(MatchInput lost, MatchInput found) =>
        [.. Urls(lost), .. Urls(found)];

    private static IEnumerable<string> Urls(MatchInput r) =>
        r.PhotoPaths.Where(File.Exists).Take(PerReport).Select(p => $"data:image/jpeg;base64,{Convert.ToBase64String(File.ReadAllBytes(p))}");
}
