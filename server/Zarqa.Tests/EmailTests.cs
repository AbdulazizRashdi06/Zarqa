using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Zarqa.Api.Email;

namespace Zarqa.Tests;

public class EmailTests
{
    [Fact]
    public void Code_email_shows_the_code_and_has_no_links()
    {
        var m = SignInCodeEmail.Build("042917");
        Assert.Equal("Your Zarqa code: 042917", m.Subject);
        Assert.Contains("042 917", m.Html);
        Assert.Contains("042 917", m.Text);
        Assert.DoesNotContain("href=", m.Html);
    }

    [Fact]
    public async Task Resend_gets_the_right_request()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK);
        var sender = new ResendEmailSender(new HttpClient(handler),
            Options.Create(new EmailOptions { Provider = "resend", ResendApiKey = "re_test", From = "Zarqa <hello@zarqa.test>" }),
            NullLogger<ResendEmailSender>.Instance);

        await sender.SendSignInCodeAsync("a@gutech.edu.om", "123456", CancellationToken.None);

        Assert.Equal("https://api.resend.com/emails", handler.Request!.RequestUri!.ToString());
        Assert.Equal("Bearer re_test", handler.Request.Headers.Authorization!.ToString());
        var body = JsonDocument.Parse(handler.Body!).RootElement;
        Assert.Equal("Zarqa <hello@zarqa.test>", body.GetProperty("from").GetString());
        Assert.Equal("a@gutech.edu.om", body.GetProperty("to")[0].GetString());
        Assert.Equal("Your Zarqa code: 123456", body.GetProperty("subject").GetString());
    }

    [Fact]
    public async Task Resend_refusal_throws()
    {
        var sender = new ResendEmailSender(new HttpClient(new RecordingHandler(HttpStatusCode.UnprocessableEntity)),
            Options.Create(new EmailOptions { ResendApiKey = "re_test", From = "Zarqa <hello@zarqa.test>" }),
            NullLogger<ResendEmailSender>.Instance);
        await Assert.ThrowsAsync<EmailNotSentException>(() => sender.SendSignInCodeAsync("a@gutech.edu.om", "123456", CancellationToken.None));
    }

    private sealed class RecordingHandler(HttpStatusCode status) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(status) { Content = new StringContent("{}") };
        }
    }
}
