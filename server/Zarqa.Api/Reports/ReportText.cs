using System.Text.RegularExpressions;

namespace Zarqa.Api.Reports;

/// <summary>
/// The Home form has one "describe it" box. The matcher (ported from the benchmark) still wants a short
/// item name, a category and a description, so they are derived here: the name is the first phrase,
/// the description is the whole text, and the category comes from <see cref="Categories.Normalize"/>.
/// </summary>
public static partial class ReportText
{
    public const int MaxTitle = 60;

    public sealed record Parts(string Title, string Category, string Description);

    public static Parts? Split(string? text)
    {
        var clean = Regex.Replace(text?.Trim() ?? "", @"\s+", " ");
        if (clean.Length == 0) return null;

        // First phrase: up to the first sentence or clause break (". , ; : ! ? ( -"), else the whole text.
        var first = PhraseEnd().Split(clean, 2)[0].Trim();
        if (first.Length == 0) first = clean;
        var title = first;
        if (title.Length > MaxTitle)
        {
            // Cut at a word boundary when there is one reasonably late in the phrase.
            var cut = title.LastIndexOf(' ', MaxTitle);
            title = title[..(cut > 10 ? cut : MaxTitle)].Trim();
        }
        title = char.ToUpperInvariant(title[0]) + title[1..];

        return new Parts(title, Categories.Normalize(clean, null) ?? "", clean);
    }

    [GeneratedRegex(@"[.,;:!?(]| - | – ")]
    private static partial Regex PhraseEnd();
}
