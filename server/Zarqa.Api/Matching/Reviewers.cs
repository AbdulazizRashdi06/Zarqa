using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

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
        var o = new JsonObject
        {
            ["title"] = r.Title,
            ["category"] = r.Category,
            ["description"] = TextRules.Truncate(r.Description, 500),
            ["location"] = r.Location,
        };
        if (r.EventDate is not null) o["eventDate"] = r.EventDate;
        return o;
    }

    public static string AliasLine(MatchInput lost, MatchInput found, AliasIndex aliases)
    {
        var groups = aliases.Match(lost.Location).Concat(aliases.Match(found.Location)).Select(g => $"{g.Canonical}: {string.Join(", ", g.Names)}").ToList();
        return groups.Count > 0 ? string.Join(" | ", groups) : "none";
    }

    public static JsonObject Schema(string json) => JsonNode.Parse(json)!.AsObject();
}

/// <summary>luna-debate (benchmark/src/reviewers/debate.js): two Luna advocates argue, Jev decides.</summary>
public sealed class DebateReviewer(ILuna luna, IJev jev, AliasIndex aliases)
{
    public const double Threshold = 0.65;

    private static readonly Dictionary<string, string> Sides = new()
    {
        ["for"] = "You are the advocate FOR a match. Make the strongest honest case that the LOST and FOUND reports describe the same physical item.",
        ["against"] = "You are the advocate AGAINST a match. Make the strongest honest case that the LOST and FOUND reports describe different items.",
    };

    private const string Common = """
        This is a university lost-and-found app. Use only evidence in the reports and photos: item type, colour, brand/model, distinctive marks, place (location aliases name the same place), and timing (an item cannot be found before it was lost).
        Cite concrete details, say how strong each point is, and do not invent facts. If the evidence on your side is weak, say so plainly. At most 120 words.
        """;

    private const string AdvocateSchema = """
        {"type":"object","additionalProperties":false,"required":["argument","strength"],"properties":{"argument":{"type":"string"},"strength":{"type":"string","enum":["weak","moderate","strong"]}}}
        """;

    public static readonly string[] Levels =
    [
        "Clearly different items",
        "Probably different items",
        "Unclear, could be either",
        "Probably the same item",
        "Almost certainly the same physical item",
    ];

    private static JsonObject Questions() => new()
    {
        ["same_item"] = new JsonObject
        {
            ["type"] = "noul",
            ["instructions"] = "Weighing both advocates' cases against the two reports, do the LOST and FOUND reports describe the same physical item?",
        },
        ["stronger_case"] = new JsonObject
        {
            ["type"] = "choice",
            ["instructions"] = "Which advocate's case is better supported by the concrete evidence in the reports?",
            ["criteria"] = new JsonObject
            {
                ["for"] = "The case FOR a match is better supported",
                ["against"] = "The case AGAINST a match is better supported",
                ["balanced"] = "Both cases are about equally supported",
            },
        },
        ["overall"] = new JsonObject
        {
            ["type"] = "score",
            ["instructions"] = "How likely is it that the found item is exactly the item described in the lost report?",
            ["criteria"] = new JsonArray(Levels.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray()),
        },
    };

    public static double Score(double sameItem, double overall) => 0.5 * sameItem + 0.5 * overall;

    /// <summary>Null when an advocate failed (try again later); throws <see cref="ModelCallException"/> when Jev fails (use the fallback).</summary>
    public async Task<Review?> ReviewAsync(MatchInput lost, MatchInput found, IReadOnlyList<string> images, CancellationToken ct)
    {
        var text =
            $"LOST report: {PromptParts.Stringify(PromptParts.Brief(lost))}\nFOUND report: {PromptParts.Stringify(PromptParts.Brief(found))}\n" +
            $"Location aliases: {PromptParts.AliasLine(lost, found, aliases)}\n" +
            $"Attached photos: {Photos.CountFor(lost)} from the LOST report first, then {Photos.CountFor(found)} from the FOUND report.";

        LunaResult pro, con;
        try
        {
            var calls = new[] { "for", "against" }.Select(side =>
                luna.ChatJsonAsync($"{Sides[side]}\n{Common.ReplaceLineEndings("\n")}", text, images, $"advocate_{side}", PromptParts.Schema(AdvocateSchema), ct)).ToArray();
            var results = await Task.WhenAll(calls);
            (pro, con) = (results[0], results[1]);
        }
        catch (Exception e) when (e is ModelCallException or HttpRequestException or TaskCanceledException or JsonException && !ct.IsCancellationRequested)
        {
            return null;
        }

        var state = new JsonObject
        {
            ["lost"] = PromptParts.Brief(lost),
            ["found"] = PromptParts.Brief(found),
            ["timing"] = TextRules.DateRelation(lost, found),
            ["case_for"] = new JsonObject { ["argument"] = Str(pro.Parsed, "argument"), ["self_rated_strength"] = Str(pro.Parsed, "strength") },
            ["case_against"] = new JsonObject { ["argument"] = Str(con.Parsed, "argument"), ["self_rated_strength"] = Str(con.Parsed, "strength") },
        };

        var answer = await jev.AskAsync(state, Questions(), ct);
        var a = answer.Answers;
        var sameItem = JevReaders.Noul(Get(a, "same_item")) ?? 0;
        var overall = JevReaders.Score(Get(a, "overall"), Levels.Length) ?? 0;
        var stronger = JevReaders.Choice(Get(a, "stronger_case"), ["for", "against", "balanced"]) ?? "balanced";
        var score = Score(sameItem, overall);

        var log = new JsonObject
        {
            ["for"] = new JsonObject { ["argument"] = Str(pro.Parsed, "argument"), ["strength"] = Str(pro.Parsed, "strength") },
            ["against"] = new JsonObject { ["argument"] = Str(con.Parsed, "argument"), ["strength"] = Str(con.Parsed, "strength") },
            ["jevAnswers"] = JsonNode.Parse(a.GetRawText()),
            ["sameItem"] = sameItem,
            ["overall"] = overall,
            ["stronger"] = stronger,
            ["finalScore"] = score,
            ["timing"] = state["timing"]!.GetValue<string>(),
            ["tokens"] = new JsonObject
            {
                ["lunaIn"] = pro.InputTokens + con.InputTokens,
                ["lunaOut"] = pro.OutputTokens + con.OutputTokens,
                ["jevIn"] = answer.InputTokens,
            },
            ["latencyMs"] = Math.Max(pro.LatencyMs, con.LatencyMs) + answer.LatencyMs,
        };
        return new Review(score >= Threshold, score, sameItem, overall, "debate", log, pro.CostUsd + con.CostUsd + answer.CostUsd);
    }

    private static JsonElement? Get(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) ? v : null;

    internal static string Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
}

/// <summary>Plain gpt-6-luna review (benchmark/src/reviewers/luna.js): the fallback when Jev is unavailable.</summary>
public sealed class LunaReviewer(ILuna luna, AliasIndex aliases)
{
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
        var o = new JsonObject
        {
            ["title"] = r.Title,
            ["category"] = r.Category,
            ["description"] = r.Description,
            ["location"] = r.Location,
            ["campusZone"] = r.CampusZone,
        };
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

/// <summary>Photos the reviewers may see: the first 2 per report, never a card/ID report's.</summary>
public static class Photos
{
    public const int PerReport = 2;

    public static int CountFor(MatchInput r) => r.IsSensitive ? 0 : Math.Min(PerReport, r.PhotoPaths.Count(File.Exists));

    public static IReadOnlyList<string> DataUrls(MatchInput lost, MatchInput found) =>
        [.. Urls(lost), .. Urls(found)];

    private static IEnumerable<string> Urls(MatchInput r) =>
        r.IsSensitive
            ? []
            : r.PhotoPaths.Where(File.Exists).Take(PerReport).Select(p => $"data:image/jpeg;base64,{Convert.ToBase64String(File.ReadAllBytes(p))}");
}
