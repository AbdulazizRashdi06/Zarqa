using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

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
    IReadOnlyList<string> PhotoPaths);

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
        var tokens = Tokens($"{r.Location} {r.CampusZone}");
        foreach (var g in aliases.Match(r.Location))
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

    /// <summary>The structured text that gets embedded.</summary>
    public static string EmbeddingText(MatchInput r, AliasIndex aliases)
    {
        var names = aliases.Match(r.Location).SelectMany(g => g.Names).Distinct().ToList();
        var lines = new[]
        {
            $"type: {r.Type}",
            $"title: {r.Title}",
            $"category: {r.Category}",
            $"description: {r.Description}",
            $"location: {r.Location}",
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
        var ca = a.CategoryKey.ToLowerInvariant().Trim();
        var cb = b.CategoryKey.ToLowerInvariant().Trim();
        if (ca.Length > 0 && cb.Length > 0) category = ca == cb ? 0.05 : -0.02;

        var titleOverlap = TextRules.Overlap(TextRules.Tokens(a.Title), TextRules.Tokens(b.Title));
        var detailOverlap = TextRules.Overlap(TextRules.Tokens($"{a.Title} {a.Description}"), TextRules.Tokens($"{b.Title} {b.Description}"));
        var text = 0.14 * titleOverlap + 0.10 * detailOverlap;

        var location = 0.08 * TextRules.Overlap(TextRules.ExpandedLocationTokens(a, aliases), TextRules.ExpandedLocationTokens(b, aliases));

        var days = TextRules.DaysBetween(a.EventDate, b.EventDate);
        var date = days is null ? 0 : days <= 1 ? 0.04 : days <= 7 ? 0.02 : 0;

        var score = Math.Min(1, Math.Max(0, cosine + category + text + location + date));
        return new Result(score, cosine, category, text, location, date);
    }
}
