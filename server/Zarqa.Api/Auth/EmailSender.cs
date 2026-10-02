namespace Zarqa.Api.Auth;

public interface IEmailSender
{
    Task SendSignInCodeAsync(string email, string code, CancellationToken ct);

    /// <summary>Any other email (match alerts, claims). No links in our emails: they can't be imitated for phishing.</summary>
    Task SendAsync(string to, string subject, string html, string text, CancellationToken ct);
}

/// <summary>
/// Stand-in when no email provider is configured: codes and messages go to the server log
/// (docker compose logs api). Swap for a real sender behind the same interface.
/// </summary>
public sealed class LogEmailSender(ILogger<LogEmailSender> log) : IEmailSender
{
    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        log.LogWarning("Sign-in code for {Email}: {Code}", email, code);
        return Task.CompletedTask;
    }

    public Task SendAsync(string to, string subject, string html, string text, CancellationToken ct)
    {
        log.LogInformation("Email to {Email}: {Subject}", to, subject);
        return Task.CompletedTask;
    }
}
