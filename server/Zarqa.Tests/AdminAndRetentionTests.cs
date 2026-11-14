using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Zarqa.Api.Admin;
using Zarqa.Api.Data;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

public class AdminAndRetentionTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Only_admins_reach_the_admin_api()
    {
        var user = await app.SignedIn("plain.user@gutech.edu.om");
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/admin/stats")).StatusCode);

        var admin = await app.SignedIn("admin@gutech.edu.om");
        Assert.True((await Json(await admin.GetAsync("/api/me"))).GetProperty("isAdmin").GetBoolean());
        var stats = await Json(await admin.GetAsync("/api/admin/stats"));
        Assert.True(stats.GetProperty("users").GetInt32() >= 2);
    }

    [Fact]
    public async Task Admin_can_close_reports_and_ban_users()
    {
        var admin = await app.SignedIn("admin@gutech.edu.om");
        var troll = await app.SignedIn("troll@gutech.edu.om");
        var report = (await Json(await troll.PostAsync("/api/reports", Form("found", "Totally real item", "Other")))).GetProperty("id").GetGuid();

        // Re-check queues every open report again (after a matching change).
        await using (var jobs = app.Db())
            await jobs.MatchJobs.Where(j => j.ReportId == report).ExecuteUpdateAsync(x => x.SetProperty(j => j.CompletedAt, DateTimeOffset.UtcNow));
        var queued = (await Json(await admin.PostAsync("/api/admin/rematch", null))).GetProperty("queued").GetInt32();
        Assert.True(queued >= 1);
        await using (var jobs = app.Db())
            Assert.True(await jobs.MatchJobs.AnyAsync(j => j.ReportId == report && j.CompletedAt == null));
        Assert.Equal(HttpStatusCode.Forbidden, (await troll.PostAsync("/api/admin/rematch", null)).StatusCode);

        var listed = await Json(await admin.GetAsync("/api/admin/reports"));
        var row = listed.EnumerateArray().First(r => r.GetProperty("id").GetGuid() == report);
        Assert.Equal("troll@gutech.edu.om", row.GetProperty("owner").GetString());

        Assert.Equal(HttpStatusCode.NotFound, (await admin.PostAsync($"/api/admin/users/{Guid.NewGuid()}/ban", null)).StatusCode);
        var ownerId = row.GetProperty("ownerId").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/users/{ownerId}/ban", null)).StatusCode);

        // Banned: the very next request is refused, and their open reports are closed.
        Assert.Equal(HttpStatusCode.Unauthorized, (await troll.GetAsync("/api/me")).StatusCode);
        await using var db = app.Db();
        Assert.Equal(ReportStatus.Closed, (await db.Reports.FirstAsync(r => r.Id == report)).Status);
    }

    [Fact]
    public async Task Deleting_an_account_removes_everything_and_reopens_the_other_side()
    {
        var owner = await app.SignedIn("leaving@gutech.edu.om");
        var finder = await app.SignedIn("staying@gutech.edu.om");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Black umbrella", "Other", photos: 1)))).GetProperty("id").GetGuid();
        var found = (await Json(await finder.PostAsync("/api/reports", Form("found", "Umbrella", "Other")))).GetProperty("id").GetGuid();
        Guid match;
        await using (var db = app.Db())
        {
            var m = new Match { LostId = lost, FoundId = found, FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(m);
            await db.SaveChangesAsync();
            match = m.Id;
        }
        await owner.PostAsync($"/api/matches/{match}/confirm", null);
        string photoFile;
        await using (var db = app.Db())
            photoFile = Path.Combine(app.PhotoRoot, (await db.Photos.FirstAsync(p => p.ReportId == lost)).StorageKey);
        Assert.True(File.Exists(photoFile));

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.GetAsync("/api/me")).StatusCode);

        await using var check = app.Db();
        Assert.False(await check.Users.AnyAsync(u => u.Email == "leaving@gutech.edu.om"));
        Assert.False(await check.Reports.AnyAsync(r => r.Id == lost));
        Assert.False(await check.Conversations.AnyAsync(c => c.MatchId == match));
        Assert.Equal(ReportStatus.Open, (await check.Reports.FirstAsync(r => r.Id == found)).Status);
        Assert.False(File.Exists(photoFile));
    }

    [Fact]
    public async Task Retention_expires_old_open_reports_and_deletes_old_finished_ones()
    {
        var http = await app.SignedIn("retention@gutech.edu.om");
        var stale = (await Json(await http.PostAsync("/api/reports", Form("lost", "Old scarf", "Clothing")))).GetProperty("id").GetGuid();
        var finished = (await Json(await http.PostAsync("/api/reports", Form("found", "Old calculator", "Stationery")))).GetProperty("id").GetGuid();
        var fresh = (await Json(await http.PostAsync("/api/reports", Form("lost", "New pen", "Stationery")))).GetProperty("id").GetGuid();
        await using (var db = app.Db())
        {
            await db.Reports.Where(r => r.Id == stale).ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTimeOffset.UtcNow.AddDays(-61)));
            await db.Reports.Where(r => r.Id == finished).ExecuteUpdateAsync(s => s
                .SetProperty(r => r.Status, ReportStatus.Returned).SetProperty(r => r.UpdatedAt, DateTimeOffset.UtcNow.AddDays(-200)));
        }

        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<Retention>().RunAsync(CancellationToken.None);

        await using var check = app.Db();
        Assert.Equal(ReportStatus.Expired, (await check.Reports.FirstAsync(r => r.Id == stale)).Status);
        Assert.False(await check.Reports.AnyAsync(r => r.Id == finished));
        Assert.Equal(ReportStatus.Open, (await check.Reports.FirstAsync(r => r.Id == fresh)).Status);
        Assert.Contains(app.Emails.Sent, e => e.To == "retention@gutech.edu.om" && e.Subject == "Your lost report has expired: Old scarf");
    }

    [Fact]
    public void Expiry_email_is_worded_for_each_kind_and_keeps_the_title_out_of_sentences()
    {
        var lost = Retention.ExpiryEmail(new Report { Kind = ReportKind.Lost, Title = "I lost my black wallet", Description = "", CategoryText = "", CategoryNorm = "", LocationText = "", LocationName = "" });
        Assert.Equal("Your lost report has expired: I lost my black wallet", lost.Subject);
        Assert.Contains("STILL LOOKING?", lost.Html);
        Assert.Contains("“I lost my black wallet”", lost.Text);
        Assert.Contains(Zarqa.Api.Notifications.NoticeEmail.OwnReportFooter, lost.Text);
        Assert.DoesNotContain("Match alerts", lost.Text);

        var found = Retention.ExpiryEmail(new Report { Kind = ReportKind.Found, Title = "Blue <b>bottle</b>", Description = "", CategoryText = "", CategoryNorm = "", LocationText = "", LocationName = "" });
        Assert.Equal("Your found report has expired: Blue <b>bottle</b>", found.Subject);
        Assert.Contains("STILL HAVE IT?", found.Html);
        Assert.Contains("RSA desk", found.Text);
        Assert.DoesNotContain("still looking", found.Text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<b>bottle", found.Html);
    }

    [Fact]
    public async Task Admin_search_stats_and_log_name_the_other_report()
    {
        var admin = await app.SignedIn("admin@gutech.edu.om");
        var owner = await app.SignedIn("searcher@gutech.edu.om");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Zebra_pattern 100% umbrella", "Other")))).GetProperty("id").GetGuid();
        var other = await app.SignedIn("other.finder@gutech.edu.om");
        var found = (await Json(await other.PostAsync("/api/reports", Form("found", "Striped umbrella", "Other")))).GetProperty("id").GetGuid();

        // Search runs on the server across title and owner email; % and _ are literal.
        var byTitle = await Json(await admin.GetAsync("/api/admin/reports?q=zebra_pattern%20100%25"));
        Assert.Equal([lost], byTitle.EnumerateArray().Select(r => r.GetProperty("id").GetGuid()).ToArray());
        Assert.Empty((await Json(await admin.GetAsync("/api/admin/reports?q=zebra%25umbrella"))).EnumerateArray());
        var byEmail = await Json(await admin.GetAsync("/api/admin/reports?q=OTHER.FINDER"));
        Assert.Contains(byEmail.EnumerateArray(), r => r.GetProperty("id").GetGuid() == found && !r.GetProperty("ownerIsAdmin").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/admin/reports?q=zebra")).StatusCode);

        var stats = await Json(await admin.GetAsync("/api/admin/stats"));
        Assert.True(stats.GetProperty("admins").GetInt32() >= 1);
        Assert.Equal(0, stats.GetProperty("sampleUsers").GetInt32());
        Assert.Equal(0, stats.GetProperty("sampleReports").GetInt32());

        await using (var db = app.Db())
        {
            db.ReviewLogs.Add(new ReviewLog { ReportId = found, CounterpartId = lost, Step = "review", Payload = "{\"finalScore\":0.9}", CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        var log = await Json(await admin.GetAsync($"/api/admin/log?reportId={lost}"));
        var entry = log.EnumerateArray().First(l => l.GetProperty("step").GetString() == "review");
        Assert.Equal("Striped umbrella", entry.GetProperty("counterpartTitle").GetString());
        Assert.Equal("found", entry.GetProperty("counterpartKind").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync($"/api/admin/log?reportId={lost}")).StatusCode);
    }

    [Fact]
    public async Task Email_test_is_admin_only_and_reports_no_provider_when_emails_go_to_the_log()
    {
        var admin = await app.SignedIn("admin@gutech.edu.om");
        var student = await app.SignedIn("emailtest.student@gutech.edu.om");

        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync("/api/admin/email-test", null)).StatusCode);
        var answer = await ReportFlowTests.Json(await admin.PostAsync("/api/admin/email-test", null));

        Assert.Equal("admin@gutech.edu.om", answer.GetProperty("to").GetString());
        Assert.Equal(0, answer.GetProperty("results").GetArrayLength()); // the test app has no provider configured
    }
}
