using Zarqa.Api.Auth;

namespace Zarqa.Api.Email;

/// <summary>
/// Remembers that the first provider has run out of its sending allowance, so the next emails skip it
/// instead of asking and being refused each time. One instance for the whole app.
/// </summary>
public sealed class EmailFallbackState(TimeProvider clock)
{
    /// <summary>How long to leave the first provider alone after it reports an exhausted allowance.</summary>
    public static readonly TimeSpan QuotaPause = TimeSpan.FromMinutes(10);

    private long _skipUntilTicks;

    public bool SkipPrimary => clock.GetUtcNow().UtcTicks < Interlocked.Read(ref _skipUntilTicks);

    public void PrimaryOutOfQuota() => Interlocked.Exchange(ref _skipUntilTicks, (clock.GetUtcNow() + QuotaPause).UtcTicks);
}

/// <summary>
/// Sends through the first provider and, when it refuses, times out or cannot be reached, through the backup.
/// Sign-in depends on these emails, and the free Resend plan stops at 100 a day (decisions.md, 2026-11-14).
/// If both fail, the backup's error is thrown, so callers see the same failure types as with one provider.
/// </summary>
public sealed class FallbackEmailSender(IEmailSender primary, IEmailSender backup, EmailFallbackState state, ILogger<FallbackEmailSender> log) : IEmailSender
{
    public IEmailSender Primary => primary;
    public IEmailSender Backup => backup;

    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        var message = SignInCodeEmail.Build(code);
        return SendAsync(email, message.Subject, message.Html, message.Text, ct);
    }

    public async Task SendAsync(string to, string subject, string html, string text, CancellationToken ct)
    {
        // .invalid is reserved and never delivers (RFC 2606): sample data and test fixtures use it.
        if (to.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase)) return;

        if (!state.SkipPrimary)
        {
            try
            {
                await primary.SendAsync(to, subject, html, text, ct);
                return;
            }
            // A timeout surfaces as TaskCanceledException; the caller giving up (ct) is not a provider failure.
            catch (Exception e) when (e is EmailNotSentException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                if (e is EmailNotSentException { QuotaExceeded: true })
                {
                    state.PrimaryOutOfQuota();
                    log.LogWarning("The first email provider is out of its allowance; using the backup for the next {Minutes} minutes", EmailFallbackState.QuotaPause.TotalMinutes);
                }
                else log.LogWarning("The first email provider failed ({Reason}); trying the backup", e.GetType().Name);
            }
        }
        await backup.SendAsync(to, subject, html, text, ct);
    }
}
