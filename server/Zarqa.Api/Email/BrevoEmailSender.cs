using System.Net.Mail;
using Microsoft.Extensions.Options;
using Zarqa.Api.Auth;

namespace Zarqa.Api.Email;

/// <summary>
/// Sends email through Brevo's HTTP API (https://developers.brevo.com/reference/sendtransacemail).
/// The backup route for when Resend refuses or is unreachable; see <see cref="FallbackEmailSender"/>.
/// Brevo refuses calls from server addresses it has not been told about (Security > Authorized IPs), with a 401.
/// </summary>
public sealed class BrevoEmailSender(HttpClient http, IOptions<EmailOptions> options, ILogger<BrevoEmailSender> log) : IEmailSender
{
    /// <summary>Brevo wants the sender as separate name and address; the setting is one "Name &lt;address&gt;" string.</summary>
    public static bool TryParseSender(EmailOptions email, out MailAddress? sender) =>
        MailAddress.TryCreate(email.BrevoFrom is { Length: > 0 } own ? own : email.From, out sender);

    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        var message = SignInCodeEmail.Build(code);
        return SendAsync(email, message.Subject, message.Html, message.Text, ct);
    }

    public async Task SendAsync(string email, string subject, string html, string text, CancellationToken ct)
    {
        // .invalid is reserved and never delivers (RFC 2606): sample data and test fixtures use it.
        if (email.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase)) return;
        if (!TryParseSender(options.Value, out var from) || from is null)
        {
            // A setting mistake must fail like any other unsent email, not as a crash on the day the backup is needed.
            log.LogError("Brevo cannot send: BREVO_EMAIL_FROM / EMAIL_FROM is not a valid address");
            throw new EmailNotSentException();
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email")
        {
            Content = JsonContent.Create(new
            {
                sender = new { name = from.DisplayName is { Length: > 0 } name ? name : "Zarqa", email = from.Address },
                to = new[] { new { email } },
                subject,
                htmlContent = html,
                textContent = text,
            }),
        };
        request.Headers.Add("api-key", options.Value.BrevoApiKey);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            var status = (int)response.StatusCode;
            log.LogError("Brevo refused the email to {Email}: {Status} {Body}", email, status, body);
            // Best effort: 402 is "not enough credits"; a used-up daily allowance may also come as another 4xx
            // that says so. Wrongly reading one as "used up" only rests Brevo for a few minutes.
            var quota = status == 402 || status is >= 400 and < 500 && (
                body.Contains("not_enough_credits", StringComparison.OrdinalIgnoreCase) ||
                body.Contains("quota", StringComparison.OrdinalIgnoreCase) ||
                body.Contains("daily limit", StringComparison.OrdinalIgnoreCase));
            throw new EmailNotSentException(status, quota);
        }
    }
}
