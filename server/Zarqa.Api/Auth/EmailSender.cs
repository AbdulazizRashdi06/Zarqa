namespace Zarqa.Api.Auth;

public interface IEmailSender
{
    Task SendSignInCodeAsync(string email, string code, CancellationToken ct);
}

/// <summary>
/// Stand-in until an email provider is chosen: the code goes to the server log
/// (docker compose logs api). Swap for a real sender behind the same interface.
/// </summary>
public sealed class LogEmailSender(ILogger<LogEmailSender> log) : IEmailSender
{
    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        log.LogWarning("Sign-in code for {Email}: {Code}", email, code);
        return Task.CompletedTask;
    }
}
