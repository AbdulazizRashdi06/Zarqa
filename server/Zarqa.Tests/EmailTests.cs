using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Zarqa.Api.Auth;
using Zarqa.Api.Email;
using Zarqa.Api.Notifications;

namespace Zarqa.Tests;

public class EmailTests
{
    [Fact]
    public void Code_email_shows_the_code_and_has_no_links()
    {
        var m = SignInCodeEmail.Build("042917");
        Assert.Equal("Your Zarqa code: 042917", m.Subject);
        // No space inside the code, so one long-press or paste takes all six digits.
        Assert.Contains("<span>042</span><span style=\"margin-left:14px;\">917</span>", m.Html);
        Assert.Contains("code is 042917", m.Text);
        Assert.DoesNotContain("042 917", m.Html);
        Assert.DoesNotContain("href=", m.Html);
        Assert.Contains($"src=\"{EmailLayout.ArtBase}key.png\"", m.Html);
    }

    [Fact]
    public void Every_email_shows_a_Zarqa_picture_that_exists_and_still_has_no_links()
    {
        var art = Path.Combine(RepoRoot(), "web", "public", "mascot", "email");
        foreach (var look in EmailLooks.All)
        {
            // A missing file would be a broken picture in every inbox. Rebuild them with deploy/email-mascots.py.
            Assert.True(File.Exists(Path.Combine(art, look.Art + ".png")), $"{look.Art}.png is missing from web/public/mascot/email");

            var (html, text) = NoticeEmail.Build("LABEL", "A headline", "The body.", look, item: "Blue <b>bottle</b>");

            Assert.Contains($"src=\"{EmailLayout.ArtBase}{look.Art}.png\"", html);
            Assert.Contains($"alt=\"{look.Alt}\"", html);
            Assert.Contains(look.Sticker.Replace("'", "&#39;"), html);
            Assert.Contains("&ldquo;Blue &lt;b&gt;bottle&lt;/b&gt;&rdquo;", html);
            Assert.DoesNotContain("href=", html);
            Assert.DoesNotContain("[", html); // the headline's accent brackets never reach the reader
            Assert.Contains("“Blue <b>bottle</b>”", text);
        }
    }

    [Fact]
    public void Headline_accent_follows_who_the_email_is_for_and_a_pickup_code_is_set_large()
    {
        var (owner, _) = NoticeEmail.Build("READY TO COLLECT", "It's at the RSA desk", "Body.", EmailLooks.ReadyToCollect, item: "Calculator", code: "KT7-4QM");
        Assert.Contains("the <span style=\"color:#BD9777;\">RSA</span><br><span style=\"color:#BD9777;\">desk</span>", owner); // tan, like Lost
        Assert.Contains("letter-spacing:3px;line-height:1.1;white-space:nowrap;\">KT7-4QM</div>", owner);

        var (finder, _) = NoticeEmail.Build("YOU'RE A LEGEND", "Someone thinks it's theirs", "Body.", EmailLooks.Claimed, item: "Earbuds");
        Assert.Contains("<span style=\"color:#8E9DA0;\">theirs</span>", finder); // sage, like Found
        Assert.DoesNotContain("letter-spacing:3px", finder); // no code block without a code
    }

    /// <summary>
    /// Not a check: writes every email as a file when ZARQA_EMAIL_PREVIEW_DIR is set, with the pictures read from
    /// this checkout instead of the live site, so a changed layout can be looked at in a browser before it ships.
    /// </summary>
    [Fact]
    public void Emails_can_be_written_out_to_look_at()
    {
        var dir = Environment.GetEnvironmentVariable("ZARQA_EMAIL_PREVIEW_DIR");
        if (string.IsNullOrWhiteSpace(dir)) return;
        Directory.CreateDirectory(dir);
        var local = new Uri(Path.Combine(RepoRoot(), "web", "public", "mascot", "email") + Path.DirectorySeparatorChar).AbsoluteUri;
        void Write(string name, string html) => File.WriteAllText(Path.Combine(dir, name + ".html"), html.Replace(EmailLayout.ArtBase, local));
        static Zarqa.Api.Data.Report Report(Zarqa.Api.Data.ReportKind kind, string title) =>
            new() { Kind = kind, Title = title, Description = "", CategoryText = "", CategoryNorm = "", LocationText = "", LocationName = "" };

        Write("sign-in", SignInCodeEmail.Build("482915").Html);
        Write("expired-lost", Zarqa.Api.Admin.Retention.ExpiryEmail(Report(Zarqa.Api.Data.ReportKind.Lost, "I lost my blue water bottle")).Html);
        Write("expired-found", Zarqa.Api.Admin.Retention.ExpiryEmail(Report(Zarqa.Api.Data.ReportKind.Found, "Black umbrella left in the cafeteria")).Html);
        const string body = "Someone found an item that might be yours and handed it to the RSA desk. Open Zarqa and check the match: if it's yours, you'll get a pickup code.";
        Write("spotted", NoticeEmail.Build("ZARQA SPOTTED SOMETHING", "Could this be yours?", body, EmailLooks.Spotted, item: "Black wallet with a small Oman flag sticker", footer: NoticeEmail.AlertsFooter).Html);
        Write("claimed", NoticeEmail.Build("YOU'RE A LEGEND", "Someone thinks it's theirs", body, EmailLooks.Claimed, item: "White earbuds case with a sticker on the back").Html);
        Write("ready", NoticeEmail.Build("READY TO COLLECT", "It's at the RSA desk", body, EmailLooks.ReadyToCollect, item: "My grey Casio calculator", code: "KT7-4QM").Html);
        Write("test", NoticeEmail.Build("TEST", "Resend can send", "An admin asked for this test email. It went through Resend.", EmailLooks.Test("Resend"), footer: "Sent from the admin page.").Html);
    }

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "benchmark"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
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

    [Fact]
    public async Task Resend_out_of_allowance_is_told_apart_from_a_burst_limit()
    {
        var options = Options.Create(new EmailOptions { ResendApiKey = "re_test", From = "Zarqa <hello@zarqa.test>" });
        var quota = new ResendEmailSender(new HttpClient(new RecordingHandler(HttpStatusCode.TooManyRequests, "{\"name\":\"daily_quota_exceeded\"}")), options, NullLogger<ResendEmailSender>.Instance);
        var burst = new ResendEmailSender(new HttpClient(new RecordingHandler(HttpStatusCode.TooManyRequests, "{\"name\":\"rate_limit_exceeded\"}")), options, NullLogger<ResendEmailSender>.Instance);

        var q = await Assert.ThrowsAsync<EmailNotSentException>(() => quota.SendAsync("a@gutech.edu.om", "s", "h", "t", CancellationToken.None));
        var b = await Assert.ThrowsAsync<EmailNotSentException>(() => burst.SendAsync("a@gutech.edu.om", "s", "h", "t", CancellationToken.None));
        Assert.True(q.QuotaExceeded);
        Assert.False(b.QuotaExceeded);
        Assert.Equal(429, b.Status);
    }

    [Fact]
    public async Task Brevo_gets_the_right_request()
    {
        var handler = new RecordingHandler(HttpStatusCode.Created);
        var sender = new BrevoEmailSender(new HttpClient(handler),
            Options.Create(new EmailOptions { Provider = "brevo", BrevoApiKey = "xkeysib-test", From = "Zarqa <hello@zarqa.test>" }),
            NullLogger<BrevoEmailSender>.Instance);

        await sender.SendSignInCodeAsync("a@gutech.edu.om", "123456", CancellationToken.None);

        Assert.Equal("https://api.brevo.com/v3/smtp/email", handler.Request!.RequestUri!.ToString());
        Assert.Equal("xkeysib-test", handler.Request.Headers.GetValues("api-key").Single());
        Assert.Null(handler.Request.Headers.Authorization);
        var body = JsonDocument.Parse(handler.Body!).RootElement;
        Assert.Equal("Zarqa", body.GetProperty("sender").GetProperty("name").GetString());
        Assert.Equal("hello@zarqa.test", body.GetProperty("sender").GetProperty("email").GetString());
        Assert.Equal("a@gutech.edu.om", body.GetProperty("to")[0].GetProperty("email").GetString());
        Assert.Equal("Your Zarqa code: 123456", body.GetProperty("subject").GetString());
        Assert.Contains("123", body.GetProperty("htmlContent").GetString());
        Assert.Contains("123456", body.GetProperty("textContent").GetString());
    }

    [Fact]
    public async Task Brevo_uses_its_own_sender_when_set_and_throws_on_refusal()
    {
        var handler = new RecordingHandler(HttpStatusCode.Unauthorized);
        var sender = new BrevoEmailSender(new HttpClient(handler),
            Options.Create(new EmailOptions { BrevoApiKey = "xkeysib-test", From = "Zarqa <hello@zarqa.test>", BrevoFrom = "codes@mail.zarqa.test" }),
            NullLogger<BrevoEmailSender>.Instance);

        var e = await Assert.ThrowsAsync<EmailNotSentException>(() => sender.SendAsync("a@gutech.edu.om", "s", "h", "t", CancellationToken.None));

        Assert.Equal(401, e.Status);
        Assert.False(e.QuotaExceeded); // 401 is a wrong key or an address Brevo has not been told about, not a used-up plan
        var from = JsonDocument.Parse(handler.Body!).RootElement.GetProperty("sender");
        Assert.Equal("codes@mail.zarqa.test", from.GetProperty("email").GetString());
        Assert.Equal("Zarqa", from.GetProperty("name").GetString());
    }

    [Theory]
    [InlineData(HttpStatusCode.PaymentRequired, "{\"code\":\"not_enough_credits\"}")]
    [InlineData(HttpStatusCode.BadRequest, "{\"message\":\"You have reached your daily limit\"}")]
    public async Task Brevo_out_of_allowance_is_reported_as_such(HttpStatusCode status, string body)
    {
        var sender = new BrevoEmailSender(new HttpClient(new RecordingHandler(status, body)),
            Options.Create(new EmailOptions { BrevoApiKey = "xkeysib-test", From = "Zarqa <hello@zarqa.test>" }), NullLogger<BrevoEmailSender>.Instance);

        var e = await Assert.ThrowsAsync<EmailNotSentException>(() => sender.SendAsync("a@gutech.edu.om", "s", "h", "t", CancellationToken.None));

        Assert.True(e.QuotaExceeded);
    }

    [Fact]
    public async Task A_mistyped_Brevo_sender_fails_like_an_unsent_email_and_never_calls_Brevo()
    {
        var handler = new RecordingHandler(HttpStatusCode.Created);
        var sender = new BrevoEmailSender(new HttpClient(handler),
            Options.Create(new EmailOptions { BrevoApiKey = "xkeysib-test", From = "Zarqa <hello@zarqa.test>", BrevoFrom = "not an address" }), NullLogger<BrevoEmailSender>.Instance);

        // The same failure type as a refusal, so sign-in answers "couldn't send" and the fallback's filters apply.
        await Assert.ThrowsAsync<EmailNotSentException>(() => sender.SendSignInCodeAsync("a@gutech.edu.om", "123456", CancellationToken.None));

        Assert.Null(handler.Request);
    }

    [Fact]
    public async Task Backup_sends_when_the_first_provider_refuses_times_out_or_is_unreachable()
    {
        foreach (var failure in new Exception[] { new EmailNotSentException(422), new HttpRequestException("no route"), new TaskCanceledException("timeout") })
        {
            var first = new FakeSender { Fail = failure };
            var backup = new FakeSender();
            var sender = new FallbackEmailSender(first, backup, new EmailFallbackState(new Clock()), NullLogger<FallbackEmailSender>.Instance);

            await sender.SendSignInCodeAsync("a@gutech.edu.om", "123456", CancellationToken.None);

            Assert.Equal(1, first.Calls);
            Assert.Equal(["a@gutech.edu.om|Your Zarqa code: 123456"], backup.Sent);
        }
    }

    [Fact]
    public async Task A_working_first_provider_never_touches_the_backup()
    {
        var first = new FakeSender();
        var backup = new FakeSender();
        var sender = new FallbackEmailSender(first, backup, new EmailFallbackState(new Clock()), NullLogger<FallbackEmailSender>.Instance);

        await sender.SendAsync("a@gutech.edu.om", "Hello", "h", "t", CancellationToken.None);

        Assert.Equal(["a@gutech.edu.om|Hello"], first.Sent);
        Assert.Equal(0, backup.Calls);
    }

    [Fact]
    public async Task An_exhausted_allowance_skips_the_first_provider_for_a_while_then_tries_it_again()
    {
        var clock = new Clock();
        var state = new EmailFallbackState(clock);
        var first = new FakeSender { Fail = new EmailNotSentException(429, quotaExceeded: true) };
        var backup = new FakeSender();
        IEmailSender Sender() => new FallbackEmailSender(first, backup, state, NullLogger<FallbackEmailSender>.Instance);

        await Sender().SendAsync("a@gutech.edu.om", "1", "h", "t", CancellationToken.None);
        await Sender().SendAsync("b@gutech.edu.om", "2", "h", "t", CancellationToken.None);
        Assert.Equal(1, first.Calls); // the second email did not ask the exhausted provider again
        Assert.Equal(2, backup.Calls);

        clock.Now += EmailFallbackState.QuotaPause + TimeSpan.FromSeconds(1);
        first.Fail = null;
        await Sender().SendAsync("c@gutech.edu.om", "3", "h", "t", CancellationToken.None);
        Assert.Equal(["c@gutech.edu.om|3"], first.Sent);
        Assert.Equal(2, backup.Calls);
    }

    [Fact]
    public async Task A_burst_limit_does_not_park_the_first_provider()
    {
        var state = new EmailFallbackState(new Clock());
        var first = new FakeSender { Fail = new EmailNotSentException(429) };
        var backup = new FakeSender();
        IEmailSender Sender() => new FallbackEmailSender(first, backup, state, NullLogger<FallbackEmailSender>.Instance);

        await Sender().SendAsync("a@gutech.edu.om", "1", "h", "t", CancellationToken.None);
        await Sender().SendAsync("b@gutech.edu.om", "2", "h", "t", CancellationToken.None);

        Assert.Equal(2, first.Calls);
        Assert.Equal(2, backup.Calls);
    }

    [Fact]
    public async Task When_both_providers_fail_the_caller_sees_the_failure()
    {
        var sender = new FallbackEmailSender(new FakeSender { Fail = new HttpRequestException("down") }, new FakeSender { Fail = new EmailNotSentException(500) },
            new EmailFallbackState(new Clock()), NullLogger<FallbackEmailSender>.Instance);

        await Assert.ThrowsAsync<EmailNotSentException>(() => sender.SendSignInCodeAsync("a@gutech.edu.om", "123456", CancellationToken.None));
    }

    [Fact]
    public async Task A_caller_who_gave_up_does_not_trigger_the_backup()
    {
        using var gone = new CancellationTokenSource();
        gone.Cancel();
        var backup = new FakeSender();
        var sender = new FallbackEmailSender(new FakeSender { Fail = new TaskCanceledException() }, backup, new EmailFallbackState(new Clock()), NullLogger<FallbackEmailSender>.Instance);

        await Assert.ThrowsAsync<TaskCanceledException>(() => sender.SendAsync("a@gutech.edu.om", "s", "h", "t", gone.Token));

        Assert.Equal(0, backup.Calls);
    }

    [Fact]
    public async Task Reserved_invalid_addresses_reach_neither_provider()
    {
        var first = new FakeSender();
        var backup = new FakeSender();
        var sender = new FallbackEmailSender(first, backup, new EmailFallbackState(new Clock()), NullLogger<FallbackEmailSender>.Instance);
        var handler = new RecordingHandler(HttpStatusCode.Created);
        var brevo = new BrevoEmailSender(new HttpClient(handler), Options.Create(new EmailOptions { BrevoApiKey = "k", From = "hello@zarqa.test" }), NullLogger<BrevoEmailSender>.Instance);

        await sender.SendAsync("maryam@sample.invalid", "s", "h", "t", CancellationToken.None);
        await brevo.SendAsync("maryam@sample.invalid", "s", "h", "t", CancellationToken.None);

        Assert.Equal(0, first.Calls + backup.Calls);
        Assert.Null(handler.Request);
    }

    [Theory]
    [InlineData("resend", "re_x", null, typeof(ResendEmailSender))]
    [InlineData("resend", "re_x", "xkeysib-x", typeof(FallbackEmailSender))]
    [InlineData("brevo", null, "xkeysib-x", typeof(BrevoEmailSender))]
    [InlineData("brevo", "re_x", "xkeysib-x", typeof(FallbackEmailSender))]
    [InlineData("log", "re_x", "xkeysib-x", typeof(Zarqa.Api.Auth.LogEmailSender))]
    public void Setup_picks_the_sender_from_the_provider_and_the_keys_present(string provider, string? resend, string? brevo, Type expected)
    {
        var options = new EmailOptions { Provider = provider, ResendApiKey = resend, BrevoApiKey = brevo, From = "Zarqa <hello@zarqa.test>" };
        var services = new ServiceCollection().AddLogging().AddSingleton(TimeProvider.System).Configure<EmailOptions>(o =>
        {
            o.Provider = options.Provider; o.ResendApiKey = options.ResendApiKey; o.BrevoApiKey = options.BrevoApiKey; o.From = options.From;
        });
        services.AddZarqaEmail(options);
        using var provided = services.BuildServiceProvider();

        var sender = provided.GetRequiredService<IEmailSender>();
        Assert.IsType(expected, sender);
        var routes = provided.GetRequiredService<EmailProbe>().Routes;
        if (sender is FallbackEmailSender both)
        {
            // The named provider goes first, the other is the backup, and the admin check lists them in that order.
            Assert.IsType(provider == "resend" ? typeof(ResendEmailSender) : typeof(BrevoEmailSender), both.Primary);
            Assert.IsType(provider == "resend" ? typeof(BrevoEmailSender) : typeof(ResendEmailSender), both.Backup);
            Assert.Equal(provider == "resend" ? ["Resend", "Brevo"] : new[] { "Brevo", "Resend" }, routes.Select(r => r.Name));
            // One shared memory of "the first provider is used up", or the pause would never hold.
            Assert.Same(provided.GetRequiredService<EmailFallbackState>(), provided.GetRequiredService<EmailFallbackState>());
        }
        else Assert.Equal(provider == "log" ? 0 : 1, routes.Count);
    }

    [Fact]
    public void Two_providers_together_answer_inside_the_apps_15_second_request_limit()
    {
        Assert.True(EmailSetup.FirstTimeout + EmailSetup.BackupTimeout < TimeSpan.FromSeconds(15));
        Assert.Equal(TimeSpan.FromSeconds(15), EmailSetup.SingleTimeout); // one provider keeps the time it always had
    }

    [Fact]
    public void A_bad_Brevo_sender_stops_the_start_only_when_Brevo_is_the_chosen_provider()
    {
        var asBackup = new EmailOptions { Provider = "resend", ResendApiKey = "re_x", BrevoApiKey = "xkeysib-x", From = "Zarqa <hello@zarqa.test>", BrevoFrom = "not an address" };
        var asFirst = new EmailOptions { Provider = "brevo", BrevoApiKey = "xkeysib-x", From = "Zarqa <hello@zarqa.test>", BrevoFrom = "not an address" };

        new ServiceCollection().AddZarqaEmail(asBackup); // adding a backup key can never take the site down
        Assert.Throws<InvalidOperationException>(() => new ServiceCollection().AddZarqaEmail(asFirst));
    }

    [Theory]
    [InlineData("resend", null, "xkeysib-x", "Zarqa <hello@zarqa.test>")] // the named provider's own key is missing
    [InlineData("brevo", "re_x", null, "Zarqa <hello@zarqa.test>")]
    [InlineData("resend", "re_x", null, null)] // no sender address
    public void Setup_refuses_to_start_half_configured(string provider, string? resend, string? brevo, string? from)
    {
        var options = new EmailOptions { Provider = provider, ResendApiKey = resend, BrevoApiKey = brevo, From = from };
        Assert.Throws<InvalidOperationException>(() => new ServiceCollection().AddZarqaEmail(options));
    }

    private sealed class FakeSender : Zarqa.Api.Auth.IEmailSender
    {
        public Exception? Fail { get; set; }
        public int Calls { get; private set; }
        public List<string> Sent { get; } = [];

        public Task SendSignInCodeAsync(string email, string code, CancellationToken ct) => throw new NotSupportedException("The fallback builds the message itself.");

        public Task SendAsync(string to, string subject, string html, string text, CancellationToken ct)
        {
            Calls++;
            if (Fail is not null) return Task.FromException(Fail);
            Sent.Add($"{to}|{subject}");
            return Task.CompletedTask;
        }
    }

    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 14, 8, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class RecordingHandler(HttpStatusCode status, string body = "{}") : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(status) { Content = new StringContent(body) };
        }
    }
}
