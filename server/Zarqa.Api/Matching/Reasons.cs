using System.Text.Json;

namespace Zarqa.Api.Matching;

/// <summary>
/// The "why we think so" lines on the Match screen. Written only for matches already decided, so the
/// decision prompts stay identical to the benchmark. Code facts first, then 1–2 detail lines from Luna.
/// </summary>
public sealed class ReasonWriter(ILuna luna, AliasIndex aliases)
{
    public const int Max = 4;

    private const string System = """
        You write the short reasons shown to a student when a lost-and-found app thinks a FOUND item may be theirs.
        Give 1 or 2 reasons, each at most 10 words, citing concrete details both reports share (colour, brand, model, stickers, marks, contents).
        Do not mention place, date or time. Do not invent details. Plain, friendly wording, no trailing full stop.
        """;

    private const string Schema = """
        {"type":"object","additionalProperties":false,"required":["reasons"],"properties":{"reasons":{"type":"array","items":{"type":"string"}}}}
        """;

    public sealed record Result(string[] Reasons, decimal CostUsd);

    public async Task<Result> WriteAsync(MatchInput lost, MatchInput found, TimeOnly? lostTime, TimeOnly? foundTime, CancellationToken ct)
    {
        var lines = Facts(lost, found, lostTime, foundTime, aliases).ToList();
        decimal cost = 0;
        if (luna.IsConfigured)
        {
            try
            {
                var text = $"LOST report: {PromptParts.Stringify(PromptParts.Brief(lost))}\nFOUND report: {PromptParts.Stringify(PromptParts.Brief(found))}";
                var res = await luna.ChatJsonAsync(System.ReplaceLineEndings("\n"), text, [], "match_reasons", PromptParts.Schema(Schema), ct);
                cost = res.CostUsd;
                if (res.Parsed.TryGetProperty("reasons", out var arr) && arr.ValueKind == JsonValueKind.Array)
                    lines.AddRange(arr.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String)
                        .Select(x => TextRules.Truncate(x.GetString()!.Trim().TrimEnd('.'), 80)).Where(x => x.Length > 0).Take(2));
            }
            catch (Exception e) when (e is ModelCallException or HttpRequestException or TaskCanceledException or JsonException && !ct.IsCancellationRequested)
            {
                // The code facts are enough on their own.
            }
        }
        return new Result(lines.Take(Max).ToArray(), cost);
    }

    /// <summary>Things code can state for sure: same kind of item, same place, the time gap.</summary>
    public static IEnumerable<string> Facts(MatchInput lost, MatchInput found, TimeOnly? lostTime, TimeOnly? foundTime, AliasIndex aliases)
    {
        if (lost.CategoryKey.Length > 0 && lost.CategoryKey == found.CategoryKey)
            yield return $"Same kind of item: {lost.CategoryKey.ToLowerInvariant()}";

        // Several places can match ("GU1 Library" also matches the GU1 building): name the most specific one.
        var lostPlaces = aliases.Match(lost.Location).Select(g => g.Canonical).ToHashSet();
        var shared = aliases.Match(found.Location).Where(g => lostPlaces.Contains(g.Canonical))
            .OrderByDescending(g => string.Equals(g.Canonical, found.Location, StringComparison.OrdinalIgnoreCase)
                                    || string.Equals(g.Canonical, lost.Location, StringComparison.OrdinalIgnoreCase))
            .ThenByDescending(g => g.Canonical.Length)
            .FirstOrDefault();
        if (shared is not null) yield return $"Same spot: {shared.Canonical}";
        else if (lost.Location.Length > 0 && string.Equals(lost.Location, found.Location, StringComparison.OrdinalIgnoreCase))
            yield return $"Same spot: {found.Location}";

        if (DateOnly.TryParse(lost.EventDate, out var ld) && DateOnly.TryParse(found.EventDate, out var fd))
        {
            var days = fd.DayNumber - ld.DayNumber;
            if (days == 0 && lostTime is { } lt && foundTime is { } ft && ft >= lt)
            {
                var hours = (ft - lt).TotalHours;
                yield return hours < 1 ? "Found within the hour" : $"Found about {Math.Round(hours * 2) / 2:0.#} hours later";
            }
            else if (days == 0) yield return "Found the same day";
            else if (days == 1) yield return "Found the next day";
            else if (days > 1 && days <= 30) yield return $"Found {days} days later";
        }
    }
}
