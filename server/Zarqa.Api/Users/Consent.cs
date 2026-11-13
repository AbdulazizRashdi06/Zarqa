namespace Zarqa.Api.Users;

/// <summary>
/// Express consent to the Terms and Privacy notice, including processing outside Oman (PDPL Art. 10;
/// Executive Regulations Art. 37). Bump <see cref="Current"/> whenever either text changes in substance:
/// everyone is then asked again before they can carry on.
/// </summary>
public static class Consent
{
    public const string Current = "2026-11-13";
}
