using System.Text;
using System.Text.RegularExpressions;

namespace Zarqa.Api.Reports;

/// <summary>
/// The category is free text in the app. For matching it's normalised to the benchmark's categories,
/// so the preliminary score's category term behaves as it did in the benchmark. Text that doesn't
/// normalise gets no category term at all, so free text never blocks a pair.
/// </summary>
public static partial class Categories
{
    public static readonly string[] All =
        ["Electronics", "Stationery", "Bags", "Wallets & cards", "Accessories", "Clothing", "Books", "Keys", "Bottles", "Sports", "Other"];

    // First hit wins, so more specific words come before broader ones.
    private static readonly (string Category, string[] Words)[] Keywords =
    [
        ("Wallets & cards", ["wallet", "purse", "card", "cards", "id", "ids", "license", "licence", "passport", "bank", "visa", "mastercard", "permit"]),
        ("Keys", ["key", "keys", "keychain", "keyring", "car key"]),
        ("Electronics", ["tech", "electronics", "electronic", "phone", "iphone", "samsung", "galaxy", "laptop", "macbook", "notebook pc", "charger",
            "cable", "earbuds", "airpods", "buds", "headphones", "headset", "earphones", "powerbank", "power bank", "ipad", "tablet", "remote",
            "usb", "flash", "drive", "mouse", "keyboard", "speaker", "camera", "jbl", "beats"]),
        ("Bottles", ["bottle", "bottles", "flask", "tumbler", "thermos", "cup", "mug"]),
        ("Bags", ["bag", "bags", "backpack", "handbag", "tote", "pouch", "satchel", "suitcase", "luggage"]),
        ("Books", ["book", "books", "textbook", "novel", "quran", "mushaf"]),
        ("Stationery", ["stationery", "pen", "pens", "pencil", "notebook", "notes", "calculator", "casio fx", "ruler", "highlighter", "folder", "binder"]),
        ("Clothing", ["clothes", "clothing", "jacket", "hoodie", "sweater", "shirt", "tshirt", "t-shirt", "scarf", "shayla", "hijab", "abaya",
            "dishdasha", "kumma", "massar", "cap", "hat", "shoe", "shoes", "sandals", "slippers", "sneakers", "coat", "jumper"]),
        ("Accessories", ["accessories", "accessory", "glasses", "eyeglasses", "sunglasses", "spectacles", "watch", "ring", "bracelet", "necklace",
            "earring", "earrings", "jewelry", "jewellery", "umbrella", "beads", "masbaha", "tasbih", "misbaha"]),
        ("Sports", ["sports", "sport", "ball", "football", "racket", "racquet", "paddle", "gym", "padel", "shuttlecock"]),
        ("Other", ["other", "misc", "miscellaneous"]),
    ];

    /// <summary>Benchmark category for the typed category, falling back to the item name; null when nothing fits.</summary>
    public static string? Normalize(string? categoryText, string? title)
    {
        foreach (var source in new[] { categoryText, title })
        {
            var words = Words(source);
            if (words.Count == 0) continue;
            var joined = " " + string.Join(' ', words) + " ";
            foreach (var (category, keys) in Keywords)
                if (keys.Any(k => joined.Contains($" {k} ", StringComparison.Ordinal))) return category;
        }
        return null;
    }

    /// <summary>Card/ID report: its photos never go to a model. Same rule as the PWA's notice (web/src/lib/rules.ts). Pass the user's words, not a label from <see cref="All"/>.</summary>
    /// <remarks>
    /// Each text is checked as typed and again with Arabic vowel marks, tatweel and invisible characters taken out
    /// ("بِطـاقة", "I&#x200B;D"), so the clean-up can only find more cards, never fewer. When unsure, it's a card.
    /// </remarks>
    public static bool IsSensitive(params string?[] texts) =>
        texts.Any(t => t is not null && (Spots(t) || Spots(Plain(t))));

    private static bool Spots(string text) => SensitiveRe().IsMatch(NotCardRe().Replace(text, " "));

    private static string Plain(string text)
    {
        try
        {
            return Invisible().Replace(text.Normalize(NormalizationForm.FormKC), "");
        }
        catch (ArgumentException)
        {
            // Broken UTF-16 (a lone surrogate) can't be normalised: strip what we can.
            return Invisible().Replace(text, "");
        }
    }

    // Arabic words take prefixes and suffixes (البطاقة, بطاقتي), so they match as stems, not whole words. Informal spellings
    // count too: ه for ة (هويه, رخصه), كرت/كارت for card (not ذكرت "I mentioned", شكرت "I thanked"), فيزا, باسبور.
    // ECMAScript makes \b work as in the PWA (ASCII letters only), so "الID" counts on both sides.
    [GeneratedRegex(@"\b(cards?|ids?|i\.d|license|licence|passport|bank|atm|visa|mastercard|debit|credit|mulkiya|iqama)\b|بطاق|هوي[ةته]|جواز|رخص[ةته]|ملكي[ةته]|بنك|مصرف|صراف|(^|[^ذش])كرت|كارت|فيزا|باسبور", RegexOptions.IgnoreCase | RegexOptions.ECMAScript)]
    private static partial Regex SensitiveRe();

    // Things called "card" or "bank" that aren't ID or bank cards. Only the phrase is removed, so
    // "SIM card and my ID" and "power bank and my bank card" still count. Same list as the PWA.
    [GeneratedRegex(@"\b(power ?banks?|(micro ?)?sd ?cards?|sim ?cards?|memory ?cards?|graphics ?cards?|flash ?cards?|playing ?cards?)\b", RegexOptions.IgnoreCase | RegexOptions.ECMAScript)]
    private static partial Regex NotCardRe();

    // Arabic vowel marks and tatweel, zero-width and direction marks, soft hyphen. Same list as the PWA.
    [GeneratedRegex(@"[ً-ٰٟـ­​-‏‪-‮⁠-⁩﻿]")]
    private static partial Regex Invisible();

    private static List<string> Words(string? s) =>
        string.IsNullOrWhiteSpace(s) ? [] : WordRe().Split(s.ToLowerInvariant()).Where(w => w.Length > 0).ToList();

    [GeneratedRegex(@"[^\p{L}\p{N}-]+")]
    private static partial Regex WordRe();
}
