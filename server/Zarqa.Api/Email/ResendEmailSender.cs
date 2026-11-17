using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using Zarqa.Api.Auth;

namespace Zarqa.Api.Email;

public sealed class EmailOptions
{
    /// <summary>
    /// "log" (codes go to the server log), "resend" or "brevo": the provider tried first. When the other
    /// provider's key is also set, it is the backup (see <see cref="FallbackEmailSender"/>).
    /// </summary>
    public string Provider { get; set; } = "log";
    public string? ResendApiKey { get; set; }
    public string? BrevoApiKey { get; set; }
    /// <summary>Sender, e.g. "Zarqa &lt;hello@zarqa.example&gt;". Its domain must be verified with each provider used.</summary>
    public string? From { get; set; }
    /// <summary>Optional different sender for Brevo; empty means <see cref="From"/>.</summary>
    public string? BrevoFrom { get; set; }
}

/// <summary>Sends email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).</summary>
public sealed class ResendEmailSender(HttpClient http, IOptions<EmailOptions> options, ILogger<ResendEmailSender> log) : IEmailSender
{
    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        var message = SignInCodeEmail.Build(code);
        return SendAsync(email, message.Subject, message.Html, message.Text, ct);
    }

    public async Task SendAsync(string email, string subject, string html, string text, CancellationToken ct)
    {
        // .invalid is reserved and never delivers (RFC 2606): sample data and test fixtures use it.
        if (email.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase)) return;
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
        {
            Content = JsonContent.Create(new
            {
                from = options.Value.From,
                to = new[] { email },
                subject,
                html,
                text,
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ResendApiKey);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            log.LogError("Resend refused the email to {Email}: {Status} {Body}", email, (int)response.StatusCode, body);
            // 429 is either a burst limit (try again in a second) or a used-up plan allowance:
            // "daily_quota_exceeded" / "monthly_quota_exceeded" (https://resend.com/docs/api-reference/errors).
            var quota = (int)response.StatusCode == 429 && body.Contains("quota", StringComparison.OrdinalIgnoreCase);
            throw new EmailNotSentException((int)response.StatusCode, quota);
        }
    }
}

/// <param name="status">The provider's HTTP status, when it answered.</param>
/// <param name="quotaExceeded">The provider's sending allowance is used up, so asking again soon is pointless.</param>
public sealed class EmailNotSentException(int? status = null, bool quotaExceeded = false) : Exception("The email provider refused the message.")
{
    public int? Status { get; } = status;
    public bool QuotaExceeded { get; } = quotaExceeded;
}
