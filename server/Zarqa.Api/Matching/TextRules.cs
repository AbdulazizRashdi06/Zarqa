using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Zarqa.Api.Reports;

namespace Zarqa.Api.Matching;

/// <summary>A report as the matcher sees it: the same fields as the benchmark's reports.</summary>
public sealed record MatchInput(
    Guid Id,
    string Type,
    string Title,
    string Category,
    // Normalised category for the prescore's category term ("" when it doesn't normalise).
    string CategoryKey,
    string Description,
    string Location,
    string CampusZone,
    string? EventDate, // yyyy-MM-dd or null
    bool IsSensitive,
    IReadOnlyList<string> PhotoPaths,
    // The person's words plus a plain-English rendering (ReportNormalizer), when one exists. Only for finding and
    // ranking candidates: the embedded text and the prescore. No model that reviews a pair reads them.
    string? RankText = null,
    string? RankLocation = null,
    // When the report was posted. Only read when ModelOptions.PostedOn is on.
    DateTimeOffset? CreatedAt = null)
{
    /// <summary>The prescore's category: guessed from the rendering when there is one (benchmark/scripts/edge.js --normalize).</summary>
    public string RankCategoryKey => RankText is null ? CategoryKey : Categories.Normalize(RankText, null) ?? "";
}

/// <summary>
/// Port of benchmark/src/text.js. Kept behaviour-identical (checked by the golden fixture test),
/// because the benchmark's numbers only hold if the app computes the same things.
/// </summary>
public static partial class TextRules
{
    private static readonly HashSet<string> Stopwords =
        "a an the and or of in on at to for with my i it is was this that near by from lost found item some".Split(' ').ToHashSet();

    [GeneratedRegex(@"[^\p{L}\p{N}\s]")]
    private static partial Regex NonWordRe();

    [GeneratedRegex(@"\s+")]
    private static partial Regex SpaceRe();

    [GeneratedRegex(@"[^\p{L}\p{N}]+")]
    private static partial Regex NormRe();

    public static List<string> Tokens(string? text) =>
        SpaceRe().Split(NonWordRe().Replace((text ?? "").ToLowerInvariant().Normalize(NormalizationForm.FormKD), " "))
            .Where(t => t.Length > 1 && !Stopwords.Contains(t))
            .ToList();

    /// <summary>Overlap coefficient |A∩B| / min(|A|,|B|).</summary>
    public static double Overlap(IEnumerable<string> a, IEnumerable<string> b)
    {
        var A = new HashSet<string>(a);
        var B = new HashSet<string>(b);
        if (A.Count == 0 || B.Count == 0) return 0;
        var hit = A.Count(B.Contains);
        return (double)hit / Math.Min(A.Count, B.Count);
    }

    public static string Norm(string? s) => NormRe().Replace((s ?? "").ToLowerInvariant(), " ").Trim();

    public static IReadOnlyList<string> ExpandedLocationTokens(MatchInput r, AliasIndex aliases)
    {
        var place = r.RankLocation ?? r.Location;
        var tokens = Tokens($"{place} {r.CampusZone}");
        foreach (var g in aliases.Match(place))
            foreach (var n in g.Names) tokens.AddRange(Tokens(n));
        return tokens;
    }

    public static double? DaysBetween(string? a, string? b)
    {
        if (!TryDate(a, out var x) || !TryDate(b, out var y)) return null;
        return Math.Abs(x.DayNumber - y.DayNumber);
    }

    /// <summary>Code-side date label, so the decision model never compares dates itself.</summary>
    public static string DateRelation(MatchInput lost, MatchInput found)
    {
        if (!TryDate(lost.EventDate, out var l) || !TryDate(found.EventDate, out var f)) return "unknown";
        double d = f.DayNumber - l.DayNumber;
        if (d < -1) return "found_before_lost";
        if (Math.Abs(d) <= 1) return "same_or_next_day";
        if (d <= 7) return "within_a_week";
        return "more_than_a_week";
    }

    // ---- Switches from the 2026-11-16 tuning loop (benchmark/src/text.js); the wording is kept verbatim. ----

    /// <summary>benchmark postedOn(r): the day a report was posted in Oman time (UTC+4, no daylight saving) with its weekday.</summary>
    public static string? PostedOn(MatchInput r) =>
        r.CreatedAt is { } t ? t.ToOffset(TimeSpan.FromHours(4)).ToString("yyyy-MM-dd dddd", CultureInfo.InvariantCulture) : null;

    public const string PostedNote =
        "postedOn is the day each report was posted, in campus time. Words in a report such as \"today\", \"yesterday\" or \"last week\" count from that day, not from your own today.";

    /// <summary>benchmark foundOneDayBeforeLost: both dates present and the found one exactly one calendar day earlier.</summary>
    public static bool FoundOneDayBeforeLost(MatchInput lost, MatchInput found) =>
        TryDate(lost.EventDate, out var l) && TryDate(found.EventDate, out var f) && l.DayNumber - f.DayNumber == 1;

    public const string OneDayText =
        "Dates: the FOUND date is one calendar day before the LOST date. The lost date may be the day the owner noticed the loss rather than the day it happened, so this order is not a point against a match, alone or together with other points, and not a point for one. It counts against a match only if the LOST report's own words say the owner still had or used the item on the LOST date. Repeating that date or saying when the loss was noticed does not, and words such as \"today\", \"this morning\" or \"yesterday\" count from the day the report was posted, which may not be the LOST date.";

    // ---- Date notes for the one-model reviewer (loop O2, accepted on outside set 5, decisions.md 2026-11-19). ----

    /// <summary>
    /// benchmark foundFirstDays: calendar days the found date is before the lost date, when both dates are given and
    /// the found one is first; null otherwise. Code counts the days, so the reviewer cannot miscount them.
    /// </summary>
    public static int? FoundDaysBeforeLost(MatchInput lost, MatchInput found) =>
        TryDate(lost.EventDate, out var l) && TryDate(found.EventDate, out var f) && l.DayNumber - f.DayNumber >= 1 ? l.DayNumber - f.DayNumber : null;

    /// <summary>
    /// The longest gap that gets a date note (benchmark SOLO_DATES_GATE=2). At three days and more the note let wrong
    /// pairs through on the seen sets, and no test set holds a real pair there, so those gaps keep the old sentence.
    /// </summary>
    public const int DateNoteMaxDays = 2;

    /// <summary>benchmark earlyText(days): the owner's longer-gap note (ruling of 2026-11-16), word for word.</summary>
    public static string EarlyText(int days) =>
        $"Dates: the FOUND date is {days} calendar days before the LOST date. The lost date is typed from memory and is often the day the loss was noticed or reported, so this order does not rule a match out. It is a point against a match, never a point for one, and it weighs more the longer the gap: a few days count for little, but over a long gap the same kind of item in the same place is not enough without something distinctive in common. It is a strong point against only if the LOST report's own words clearly say the owner still had or used the item after the FOUND date; repeating the LOST date does not say that.";

    /// <summary>The structured text that gets embedded.</summary>
    public static string EmbeddingText(MatchInput r, AliasIndex aliases)
    {
        var place = r.RankLocation ?? r.Location;
        var names = aliases.Match(place).SelectMany(g => g.Names).Distinct().ToList();
        var lines = new[]
        {
            $"type: {r.Type}",
            $"title: {r.Title}",
            $"category: {r.Category}",
            $"description: {r.RankText ?? r.Description}",
            $"location: {place}",
            $"campus zone: {r.CampusZone}",
            names.Count > 0 ? $"location aliases: {string.Join(", ", names)}" : "",
            $"date: {r.EventDate ?? ""}",
        };
        return string.Join("\n", lines.Where(l => l.Length > 0));
    }

    public static string Truncate(string? s, int n) => (s ?? "").Length > n ? s![..n] + "…" : s ?? "";

    private static bool TryDate(string? s, out DateOnly d) =>
        DateOnly.TryParseExact(s is { Length: >= 10 } ? s[..10] : s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out d);
}

/// <summary>
/// Location aliases from the campus map. Mirrors the benchmark's JavaScript Map: a name set twice
/// keeps its first position but points to the later group, which affects alias order.
/// </summary>
public sealed class AliasIndex
{
    public sealed record Group(string Canonical, IReadOnlyList<string> Names);

    private readonly List<(string Key, Group Group)> _entries = [];

    public AliasIndex(IEnumerable<(string Canonical, string[] Aliases)> locations)
    {
        var position = new Dictionary<string, int>();
        foreach (var (canonical, aliases) in locations)
        {
            if (canonical.StartsWith('_')) continue;
            var group = new Group(canonical, [canonical, .. aliases]);
            foreach (var n in group.Names)
            {
                var key = TextRules.Norm(n);
                if (position.TryGetValue(key, out var i)) _entries[i] = (key, group);
                else
                {
                    position[key] = _entries.Count;
                    _entries.Add((key, group));
                }
            }
        }
    }

    /// <summary>Groups whose name or alias appears in the location text (short names as whole words only).</summary>
    public IReadOnlyList<Group> Match(string? location)
    {
        var text = $" {TextRules.Norm(location)} ";
        var seen = new HashSet<string>();
        var result = new List<Group>();
        foreach (var (name, group) in _entries)
        {
            if ((text.Contains($" {name} ", StringComparison.Ordinal) || (name.Length > 3 && text.Contains(name, StringComparison.Ordinal)))
                && seen.Add(group.Canonical))
                result.Add(group);
        }
        return result;
    }
}

public static class Prescore
{
    public sealed record Result(double Score, double Cosine, double Category, double Text, double Location, double Date);

    public static double Cosine(IReadOnlyList<double>? a, IReadOnlyList<double>? b)
    {
        if (a is null || b is null || a.Count != b.Count) return 0;
        double dot = 0, na = 0, nb = 0;
        for (var i = 0; i < a.Count; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return na != 0 && nb != 0 ? dot / Math.Sqrt(na * nb) : 0;
    }

    public static double Cosine(IReadOnlyList<float>? a, IReadOnlyList<float>? b)
    {
        if (a is null || b is null || a.Count != b.Count) return 0;
        double dot = 0, na = 0, nb = 0;
        for (var i = 0; i < a.Count; i++)
        {
            dot += (double)a[i] * b[i];
            na += (double)a[i] * a[i];
            nb += (double)b[i] * b[i];
        }
        return na != 0 && nb != 0 ? dot / Math.Sqrt(na * nb) : 0;
    }

    /// <summary>Port of benchmark/src/prescore.js: cosine + category ± + text overlap + location overlap + date bonus.</summary>
    public static Result Score(MatchInput a, MatchInput b, double cosine, AliasIndex aliases)
    {
        double category = 0;
        var ca = a.RankCategoryKey.ToLowerInvariant().Trim();
        var cb = b.RankCategoryKey.ToLowerInvariant().Trim();
        if (ca.Length > 0 && cb.Length > 0) category = ca == cb ? 0.05 : -0.02;

        double text;
        if (a.Title.Length == 0 && b.Title.Length == 0)
        {
            // One-text reports (the app): no item names, so the whole 0.24 text weight goes on the one text.
            // Fixed rule, set before measuring; shortlist recall checked in benchmark/scripts/shortlist-experiment.js.
            text = 0.24 * TextRules.Overlap(TextRules.Tokens(a.RankText ?? a.Description), TextRules.Tokens(b.RankText ?? b.Description));
        }
        else
        {
            var titleOverlap = TextRules.Overlap(TextRules.Tokens(a.Title), TextRules.Tokens(b.Title));
            var detailOverlap = TextRules.Overlap(TextRules.Tokens($"{a.Title} {a.Description}"), TextRules.Tokens($"{b.Title} {b.Description}"));
            text = 0.14 * titleOverlap + 0.10 * detailOverlap;
        }

        var location = 0.08 * TextRules.Overlap(TextRules.ExpandedLocationTokens(a, aliases), TextRules.ExpandedLocationTokens(b, aliases));

        var days = TextRules.DaysBetween(a.EventDate, b.EventDate);
        var date = days is null ? 0 : days <= 1 ? 0.04 : days <= 7 ? 0.02 : 0;

        var score = Math.Min(1, Math.Max(0, cosine + category + text + location + date));
        return new Result(score, cosine, category, text, location, date);
    }
}
