using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Auth;

public static class EmailRules
{
    public const string UniversityDomain = "gutech.edu.om";

    /// <summary>
    /// Lower-cased address when it's a plain GUtech address (the domain is exactly gutech.edu.om
    /// or a subdomain of it, e.g. student.gutech.edu.om) or an explicitly allowed address; otherwise null.
    /// Compares the parsed domain, never a string suffix, so fakegutech.edu.om is refused.
    /// </summary>
    public static string? NormalizeSignInEmail(string? input, string? allowedEmails = null)
    {
        var raw = input?.Trim();
        if (string.IsNullOrEmpty(raw) || raw.Length > 254) return null;
        if (!MailAddress.TryCreate(raw, out var parsed)) return null;
        // Refuse "Name <a@b>" forms and anything the parser rewrote: only a bare address.
        if (!string.Equals(parsed.Address, raw, StringComparison.OrdinalIgnoreCase)) return null;

        var domain = parsed.Host.ToLowerInvariant();
        var allowed = domain == UniversityDomain || domain.EndsWith("." + UniversityDomain, StringComparison.Ordinal);
        allowed |= (allowedEmails ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Contains(parsed.Address, StringComparer.OrdinalIgnoreCase);
        return allowed ? parsed.Address.ToLowerInvariant() : null;
    }

    /// <summary>
    /// Staff for the coming-soon gate: admins, RSA desk members, the pilot's exact sign-in exceptions
    /// (Auth:AllowedEmails), and university staff, whose address is directly @gutech.edu.om. Students use a
    /// subdomain (student.gutech.edu.om), so they wait.
    /// </summary>
    public static async Task<bool> IsStaffAsync(string address, bool isAdmin, ZarqaDb db, IConfiguration config, CancellationToken ct)
    {
        if (isAdmin) return true;
        if (address.EndsWith("@" + UniversityDomain, StringComparison.Ordinal)) return true;
        if ((config["Auth:AllowedEmails"] ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Contains(address, StringComparer.OrdinalIgnoreCase)) return true;
        return await db.RsaMembers.AnyAsync(m => m.Email == address, ct);
    }

    /// <summary>A friendly first-name guess from the address, e.g. "abdulaziz.rashdi@…" → "Abdulaziz".</summary>
    public static string? GuessFirstName(string email)
    {
        var local = email.Split('@')[0];
        var first = local.Split('.', '_', '-')[0];
        if (first.Length < 2 || !first.All(char.IsLetter)) return null;
        return char.ToUpperInvariant(first[0]) + first[1..].ToLowerInvariant();
    }
}
