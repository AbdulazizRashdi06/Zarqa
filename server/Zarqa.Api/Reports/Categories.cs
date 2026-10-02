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

    /// <summary>Card/ID report: its photos never go to a model. Same rule as the PWA's notice.</summary>
    public static bool IsSensitive(params string?[] texts) => texts.Any(t => t is not null && SensitiveRe().IsMatch(t));

    [GeneratedRegex(@"\b(cards?|ids?|license|licence|passport|bank)\b", RegexOptions.IgnoreCase)]
    private static partial Regex SensitiveRe();

    private static List<string> Words(string? s) =>
        string.IsNullOrWhiteSpace(s) ? [] : WordRe().Split(s.ToLowerInvariant()).Where(w => w.Length > 0).ToList();

    [GeneratedRegex(@"[^\p{L}\p{N}-]+")]
    private static partial Regex WordRe();
}
