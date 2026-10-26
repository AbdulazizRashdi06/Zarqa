using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Rsa;

/// <summary>
/// Short codes read out at the RSA desk: drop codes (finder) and pickup codes (owner).
/// Six characters without look-alikes (no 0/O, 1/I/L, 2/Z, 5/S, 8/B), shown as "K7P-4QM".
/// </summary>
public static class RsaCodes
{
    public const string Alphabet = "ACDEFGHJKMNPQRTUVWXY34679";

    public static string Random() => string.Create(6, 0, (span, _) =>
    {
        for (var i = 0; i < span.Length; i++) span[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
    });

    /// <summary>What staff typed, as stored: upper case, no dash or spaces. Null when it can't be a code.</summary>
    public static string? Normalize(string? typed)
    {
        var s = new string((typed ?? "").Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
        return s.Length == 6 && s.All(Alphabet.Contains) ? s : null;
    }

    public static string? Format(string? code) => code is { Length: 6 } ? $"{code[..3]}-{code[3..]}" : null;

    /// <summary>A code no report or match uses yet. Drop and pickup codes share one space so a typed code means one thing.</summary>
    public static async Task<string> NewAsync(ZarqaDb db, CancellationToken ct)
    {
        while (true)
        {
            var code = Random();
            if (!await db.Reports.AnyAsync(r => r.DropCode == code, ct) && !await db.Matches.AnyAsync(m => m.PickupCode == code, ct)) return code;
        }
    }
}
