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

        // The name starts after greetings and lead-ins that say nothing about the item ("Hi,", "URGENT:",
        // "I lost my", "Found a"), so "Hi, I lost my black wallet" is named "Black wallet", not "Hi".
        // The description keeps the whole text.
        var named = NameStart(clean);

        // First phrase: up to the first sentence or clause break (". , ; : ! ? ( -"), else the whole text.
        var first = PhraseEnd().Split(named, 2)[0].Trim();
        if (first.Length == 0) first = named;
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

    /// <summary>The text from where the item is named; the whole text when stripping would leave nothing.</summary>
    private static string NameStart(string clean)
    {
        var rest = Opener().Replace(clean, "", 1);
        var afterVerb = LeadVerb().Replace(rest, "", 1);
        rest = afterVerb.Length != rest.Length
            ? Article().Replace(afterVerb, "", 1) // "found a wallet" -> "wallet"
            : Mine().Replace(rest, "", 1); // "My keys" -> "keys"
        rest = rest.Trim();
        return rest.Any(char.IsLetterOrDigit) ? rest : clean;
    }

    [GeneratedRegex(@"[.,;:!?(،؛؟]| - | – ")]
    private static partial Regex PhraseEnd();

    // Greetings and calls for help at the very start, any number of them: "Hi guys, please help! URGENT:".
    [GeneratedRegex(@"^(?:(?:hi+|hello|hey|hiya|salam|salaam|as-?salamu? ?alaikum|assalamualaikum|السلام عليكم|مرحبا|guys|everyone|please help|pls help|plz help|help|urgent|asap|sos)\b[\s.,;:!?،؛؟\-–]*)+", RegexOptions.IgnoreCase)]
    private static partial Regex Opener();

    // "I lost", "I've found", "we left", "Lost:", "Found", "Missing", and the Arabic lost/found verbs.
    [GeneratedRegex(@"^(?:(?:i|we)(?:\s+have|'ve|’ve)?(?:\s+just)?\s+(?:lost|found|left|dropped|forgot|misplaced)|lost|found|missing|فقدت|ضيعت|لقيت|وجدت)\b[\s.,;:!?،؛؟\-–]*", RegexOptions.IgnoreCase)]
    private static partial Regex LeadVerb();

    [GeneratedRegex(@"^(?:my|our|a|an|the|this|some|someone's|someone’s|someones)\b\s*", RegexOptions.IgnoreCase)]
    private static partial Regex Article();

    [GeneratedRegex(@"^(?:my|our)\s+", RegexOptions.IgnoreCase)]
    private static partial Regex Mine();
}
