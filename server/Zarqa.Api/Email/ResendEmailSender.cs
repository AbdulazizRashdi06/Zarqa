using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using Zarqa.Api.Auth;

namespace Zarqa.Api.Email;

public sealed class EmailOptions
{
    /// <summary>"log" (codes go to the server log) or "resend".</summary>
    public string Provider { get; set; } = "log";
    public string? ResendApiKey { get; set; }
    /// <summary>Sender, e.g. "Zarqa &lt;hello@zarqa.example&gt;". Its domain must be verified in Resend.</summary>
    public string? From { get; set; }
}

/// <summary>Sends email through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).</summary>
public sealed class ResendEmailSender(HttpClient http, IOptions<EmailOptions> options, ILogger<ResendEmailSender> log) : IEmailSender
{
    public async Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        var message = SignInCodeEmail.Build(code);
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails")
        {
            Content = JsonContent.Create(new
            {
                from = options.Value.From,
                to = new[] { email },
                subject = message.Subject,
                html = message.Html,
                text = message.Text,
            }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ResendApiKey);

        using var response = await http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            log.LogError("Resend refused the sign-in email to {Email}: {Status} {Body}", email, (int)response.StatusCode, body);
            throw new EmailNotSentException();
        }
    }
}

public sealed class EmailNotSentException() : Exception("The email provider refused the message.");
