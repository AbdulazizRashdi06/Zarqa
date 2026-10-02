using System.Security.Cryptography;
using System.Text;

namespace Zarqa.Api.Auth;

/// <summary>One-time sign-in codes: 6 digits, stored salted and hashed, compared in constant time.</summary>
public static class LoginCodes
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    public const int MaxAttempts = 5;
    /// <summary>Codes one address can request per window.</summary>
    public const int MaxPerWindow = 3;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    public static string Generate() => RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");

    public static bool IsWellFormed(string? code) => code is { Length: 6 } && code.All(char.IsAsciiDigit);

    public static string Hash(string email, string code)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(Digest(salt, email, code))}";
    }

    public static bool Verify(string stored, string email, string code)
    {
        var parts = stored.Split('.');
        if (parts.Length != 2) return false;
        var salt = Convert.FromBase64String(parts[0]);
        var expected = Convert.FromBase64String(parts[1]);
        return CryptographicOperations.FixedTimeEquals(expected, Digest(salt, email, code));
    }

    private static byte[] Digest(byte[] salt, string email, string code) =>
        SHA256.HashData([.. salt, .. Encoding.UTF8.GetBytes($"{email}\n{code}")]);
}
