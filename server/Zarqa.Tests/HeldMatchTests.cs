using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Zarqa.Api.Chat;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using Zarqa.Api.Notifications;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>
/// Debate matches from 0.55 up to 0.60 wait for an admin (owner decision, 2026-11-14): invisible to the owner and the
/// finder, approved or rejected on /admin, and released by themselves after 48 hours.
/// </summary>
public class HeldMatchTests : IClassFixture<TestApp>, IAsyncLifetime
{
    private readonly TestApp app;

    public HeldMatchTests(TestApp app) => this.app = app;

    public Task InitializeAsync()
    {
        app.Models.Reset();
        return Task.CompletedTask;
    }

    public Task DisposeAsync() => Task.CompletedTask;

    // One admin sign-in for the whole class: sign-in codes are rate-limited per address.
    private static readonly System.Runtime.CompilerServices.ConditionalWeakTable<TestApp, Task<HttpClient>> Admins = [];

    private Task<HttpClient> Admin() => Admins.GetValue(app, a => a.SignedIn("admin@gutech.edu.om"));

    private sealed record Pair(HttpClient Owner, HttpClient Finder, Guid Lost, Guid Found, Guid Match, string OwnerEmail, string FinderEmail);

    /// <summary>A clock a fixed span ahead of the real one: "48 hours later" without waiting.</summary>
    private sealed class AheadClock(TimeSpan ahead) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => base.GetUtcNow() + ahead;
    }

    /// <summary>Sends in the caller's scope, so a test sees the push and the email as soon as the call returns.</summary>
    private sealed class DirectNotifier(NotificationSender sender) : NoopNotifierBase
    {
        public override Task MatchCreatedAsync(Guid matchId, CancellationToken ct) => sender.MatchCreatedAsync(matchId, ct);
    }

    private abstract class NoopNotifierBase : INotifier
    {
        public abstract Task MatchCreatedAsync(Guid matchId, CancellationToken ct);
        public Task ClaimedAsync(Guid conversationId, CancellationToken ct) => Task.CompletedTask;
        public Task MessageAsync(long messageId, CancellationToken ct) => Task.CompletedTask;
        public Task HandoverAsync(long messageId, CancellationToken ct) => Task.CompletedTask;
        public Task RsaReceivedAsync(Guid reportId, CancellationToken ct) => Task.CompletedTask;
        public Task CollectedAsync(Guid matchId, CancellationToken ct) => Task.CompletedTask;
    }

    /// <summary>Runs the 48-hour release as the background loop does, with the clock moved ahead.</summary>
    private async Task<int> ReleaseDue(TimeSpan ahead)
    {
        using var scope = app.Services.CreateScope();
        var held = new HeldMatches(scope.ServiceProvider.GetRequiredService<ZarqaDb>(),
            new DirectNotifier(scope.ServiceProvider.GetRequiredService<NotificationSender>()), new AheadClock(ahead));
        return await held.ReleaseDueAsync(CancellationToken.None);
    }

    private static async Task<Guid> Post(HttpClient who, MultipartFormDataContent form) =>
        (await Json(await who.PostAsync("/api/reports", form))).GetProperty("id").GetGuid();

    /// <summary>Two people, a lost and a found report, and a held match between them, as the matcher stores one.</summary>
    private async Task<Pair> HeldPair(string tag, double score = 0.57, int foundPhotos = 0, string category = "Accessories", string item = "scarf")
    {
        var ownerEmail = $"owner.{tag}@gutech.edu.om";
        var finderEmail = $"finder.{tag}@gutech.edu.om";
        var owner = await app.SignedIn(ownerEmail, "Maryam");
        var finder = await app.SignedIn(finderEmail, "Omar");
        var lost = await Post(owner, Form("lost", $"Grey {tag} {item}", category, "GU1 Library"));
        var found = await Post(finder, Form("found", $"Found {tag} {item}", category, "GU1 Library", photos: foundPhotos));
        await using var db = app.Db();
        // These tests place the match themselves, so the matcher must not review the pair as well.
        await db.MatchJobs.Where(j => j.ReportId == lost || j.ReportId == found).ExecuteUpdateAsync(s => s.SetProperty(j => j.CompletedAt, DateTimeOffset.UtcNow));
        var m = new Match
        {
            LostId = lost, FoundId = found, FinalScore = score, SameItem = score, Overall = score, DecidedBy = MatchDecider.Debate,
            Reasons = ["Both are a grey scarf"], Status = MatchStatus.Held, CreatedAt = DateTimeOffset.UtcNow,
        };
        db.Matches.Add(m);
        await db.SaveChangesAsync();
        return new Pair(owner, finder, lost, found, m.Id, ownerEmail, finderEmail);
    }

    private async Task Subscribe(HttpClient http, string endpoint) =>
        (await http.PostAsJsonAsync("/api/push/subscribe", new { endpoint, keys = new { p256dh = "BPublicKeyForTests", auth = "authsecret" } })).EnsureSuccessStatusCode();

    private async Task<Match> Stored(Guid id)
    {
        await using var db = app.Db();
        return await db.Matches.AsNoTracking().SingleAsync(m => m.Id == id);
    }

    private static async Task<JsonElement> Mine(HttpClient who, Guid report) =>
        (await Json(await who.GetAsync("/api/reports/mine"))).EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == report);

    /// <summary>Everything an owner or finder could open: none of it may show a match that is held (or was rejected in review).</summary>
    private static async Task AssertInvisible(Pair p)
    {
        foreach (var who in new[] { p.Owner, p.Finder })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await who.GetAsync($"/api/matches/{p.Match}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await who.PostAsync($"/api/matches/{p.Match}/confirm", null)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await who.PostAsync($"/api/matches/{p.Match}/reject", null)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await who.PostAsync($"/api/matches/{p.Match}/release", null)).StatusCode);
            Assert.Equal(0, (await Json(await who.GetAsync("/api/home"))).GetProperty("matchesWaiting").GetInt32());
            Assert.Equal(0, (await Json(await who.GetAsync("/api/conversations"))).GetArrayLength());
        }
        foreach (var (who, report) in new[] { (p.Owner, p.Lost), (p.Finder, p.Found) })
        {
            var card = await Mine(who, report);
            Assert.Equal("Searching", card.GetProperty("pill").GetString());
            Assert.Equal(JsonValueKind.Null, card.GetProperty("matchId").ValueKind);
            Assert.Equal(JsonValueKind.Null, card.GetProperty("conversationId").ValueKind);
            Assert.Equal(JsonValueKind.Null, card.GetProperty("pickupMatchId").ValueKind);
            var single = await Json(await who.GetAsync($"/api/reports/{report}"));
            Assert.Equal("Searching", single.GetProperty("pill").GetString());
            Assert.Equal(JsonValueKind.Null, single.GetProperty("matchId").ValueKind);
        }
    }

    [Theory]
    [InlineData(MatchDecider.Debate, 0.55, true)]
    [InlineData(MatchDecider.Debate, 0.599, true)]
    [InlineData(MatchDecider.Debate, 0.60, false)]
    [InlineData(MatchDecider.Debate, 0.95, false)]
    [InlineData(MatchDecider.LunaFallback, 0.57, false)]
    [InlineData(MatchDecider.RsaStaff, 1.0, false)]
    public void Only_debate_matches_under_060_are_held(MatchDecider by, double score, bool held) =>
        Assert.Equal(held, HeldMatches.ShouldHold(by, score));

    [Fact]
    public void The_release_rule_is_48_hours()
    {
        Assert.Equal(TimeSpan.FromHours(48), HeldMatches.ReleaseAfter);
        Assert.Equal(0.60, HeldMatches.HoldBelow);
    }

    [Fact]
    public async Task The_matcher_holds_a_low_debate_match_and_tells_nobody()
    {
        app.Models.SameItem = 0.65;
        app.Models.OverallLevel = 2; // 0.5·0.65 + 0.5·0.5 = 0.575
        var ownerEmail = "owner.pipeline@gutech.edu.om";
        var owner = await app.SignedIn(ownerEmail, "Maryam");
        var finder = await app.SignedIn("finder.pipeline@gutech.edu.om", "Omar");
        await Subscribe(owner, "https://push.example/owner-pipeline");
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var lost = await Post(owner, Form("lost", "Blue pipeline water bottle", "Bottles", "GU1 Library", today, "10:00", 1, "blue metal bottle, cat sticker, small dent"));
        var found = await Post(finder, Form("found", "Blue pipeline bottle", "Bottles", "GU1 Library", today, "13:00", 1, "blue metal water bottle with a cat sticker"));
        await app.DrainMatchingAsync();

        Guid id;
        await using (var db = app.Db())
        {
            var m = await db.Matches.SingleAsync(x => x.LostId == lost && x.FoundId == found);
            Assert.Equal(MatchStatus.Held, m.Status);
            Assert.Equal(MatchDecider.Debate, m.DecidedBy);
            Assert.Equal(0.575, m.FinalScore, 3);
            Assert.Null(m.ResolvedAt);
            Assert.True(await db.ReviewLogs.AnyAsync(l => l.Step == HeldMatches.HeldStep && l.ReportId == lost && l.CounterpartId == found));
            id = m.Id;
        }
        await AssertInvisible(new Pair(owner, finder, lost, found, id, ownerEmail, "finder.pipeline@gutech.edu.om"));
        // The found item's photo is not the owner's to open yet either.
        await using (var db = app.Db())
        {
            var photo = await db.Photos.Where(p => p.ReportId == found).Select(p => p.Id).FirstAsync();
            Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/photos/{photo}")).StatusCode);
        }

        // Notifications are sent by a background queue: give it time, then check nothing went out.
        await Task.Delay(500);
        Assert.DoesNotContain(app.Emails.Sent, e => e.To == ownerEmail && e.Subject.Contains("possible match"));
        Assert.DoesNotContain(app.Push.Sent, p => p.Endpoint == "https://push.example/owner-pipeline");

        // It still counts as decided: editing the lost report runs matching again, and the pair is not reviewed again.
        Assert.Contains(app.Models.Prompts, x => x.SchemaName == "advocate_for" && x.Text.Contains("Blue pipeline bottle"));
        var advocates = app.Models.LunaCalls.Count(c => c.SchemaName.StartsWith("advocate_"));
        var judges = app.Models.JudgeModels.Count;
        Assert.Equal(2, advocates);
        await AssertRematchSkipsThePair(owner, lost, found, "Blue pipeline bottle", new { description = "blue metal bottle, cat sticker" });
        // Nothing else here is a blue bottle, so no model reviewed anything at all.
        Assert.Equal(advocates, app.Models.LunaCalls.Count(c => c.SchemaName.StartsWith("advocate_")));
        Assert.Equal(judges, app.Models.JudgeModels.Count);
        await using (var db = app.Db())
        {
            Assert.Equal(1, await db.ReviewLogs.CountAsync(l => l.Step == "review"
                && ((l.ReportId == lost && l.CounterpartId == found) || (l.ReportId == found && l.CounterpartId == lost))));
            Assert.Equal(MatchStatus.Held, (await db.Matches.SingleAsync(x => x.LostId == lost && x.FoundId == found)).Status);
        }
    }

    /// <summary>
    /// Edits the lost report so matching runs again, and checks the matcher left the pair alone. A second review of a
    /// pair that already has a match cannot be seen in review_log (the match row is unique per pair, so the save fails
    /// and takes the log row with it), so this looks at what such a review cannot hide: the shortlist, the prompts the
    /// models were sent, and the job, which would fail and be retried.
    /// </summary>
    private async Task AssertRematchSkipsThePair(HttpClient owner, Guid lost, Guid found, string foundTitle, object edit)
    {
        var promptsBefore = app.Models.Prompts.Count;
        long lastJob, lastLog;
        await using (var db = app.Db())
        {
            lastJob = await db.MatchJobs.MaxAsync(j => j.Id);
            lastLog = await db.ReviewLogs.MaxAsync(l => l.Id);
        }
        (await owner.PatchAsync($"/api/reports/{lost}", JsonContent.Create(edit))).EnsureSuccessStatusCode();
        await app.DrainMatchingAsync();

        await using (var db = app.Db())
        {
            // The edit queued one job, and it finished first time: no failure, no retry.
            var job = await db.MatchJobs.SingleAsync(j => j.ReportId == lost && j.Id > lastJob);
            Assert.NotNull(job.CompletedAt);
            Assert.Null(job.LastError);
            Assert.Equal(1, job.Attempts);
            // The counterpart was in the pool, and was left off the shortlist.
            var shortlist = JsonDocument.Parse((await db.ReviewLogs.SingleAsync(l => l.Step == "shortlist" && l.ReportId == lost && l.Id > lastLog)).Payload).RootElement;
            Assert.True(shortlist.GetProperty("pool").GetInt32() >= 1);
            Assert.DoesNotContain(shortlist.GetProperty("candidates").EnumerateArray(), c => c.GetProperty("id").GetString() == found.ToString());
            Assert.False(await db.ReviewLogs.AnyAsync(l => l.Id > lastLog && (l.Step == "review" || l.Step == "reasons")
                && ((l.ReportId == lost && l.CounterpartId == found) || (l.ReportId == found && l.CounterpartId == lost))));
        }
        // No model was asked about the found report again.
        Assert.DoesNotContain(app.Models.Prompts.Skip(promptsBefore), x => x.Text.Contains(foundTitle));
    }

    [Fact]
    public async Task A_debate_match_from_060_is_an_ordinary_suggestion()
    {
        app.Models.SameItem = 0.72;
        app.Models.OverallLevel = 2; // 0.5·0.72 + 0.5·0.5 = 0.61
        var owner = await app.SignedIn("owner.sixty@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.sixty@gutech.edu.om", "Omar");
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var lost = await Post(owner, Form("lost", "Red sixty umbrella", "Other", "GU1 Library", today, "10:00", 0, "red folding umbrella, wooden handle"));
        var found = await Post(finder, Form("found", "Red sixty umbrella", "Other", "GU1 Library", today, "13:00", 0, "red folding umbrella with a wooden handle"));
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var m = await db.Matches.SingleAsync(x => x.LostId == lost && x.FoundId == found);
        Assert.Equal(MatchStatus.Suggested, m.Status);
        var view = await Json(await owner.GetAsync($"/api/matches/{m.Id}"));
        Assert.Equal("small", view.GetProperty("strength").GetString());
        Assert.Equal("Possible match", (await Mine(owner, lost)).GetProperty("pill").GetString());
    }

    [Fact]
    public async Task A_held_match_is_invisible_to_owner_finder_and_the_rsa_desk()
    {
        var p = await HeldPair("hidden", foundPhotos: 1);
        await Subscribe(p.Owner, "https://push.example/owner-hidden");
        await AssertInvisible(p);

        // Even a notification asked for by mistake stays silent while the match is held.
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<NotificationSender>().MatchCreatedAsync(p.Match, CancellationToken.None);
        Assert.DoesNotContain(app.Emails.Sent, e => e.To == p.OwnerEmail);
        Assert.DoesNotContain(app.Push.Sent, x => x.Endpoint == "https://push.example/owner-hidden");

        await using (var db = app.Db())
        {
            var photo = await db.Photos.Where(x => x.ReportId == p.Found).Select(x => x.Id).FirstAsync();
            Assert.Equal(HttpStatusCode.NotFound, (await p.Owner.GetAsync($"/api/photos/{photo}")).StatusCode);
            Assert.False(await db.Conversations.AnyAsync(c => c.MatchId == p.Match));
            Assert.Null((await db.Matches.SingleAsync(m => m.Id == p.Match)).PickupCode);
            db.RsaMembers.Add(new RsaMember { Email = "rsa.hidden@gutech.edu.om", AddedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        // The desk's list of found items names who a match was sent to: a held one was sent to nobody.
        var staff = await app.SignedIn("rsa.hidden@gutech.edu.om", "Huda");
        var item = (await Json(await staff.GetAsync("/api/rsa/found"))).EnumerateArray().Single(i => i.GetProperty("id").GetGuid() == p.Found);
        Assert.Equal(0, item.GetProperty("suggestedTo").GetArrayLength());
        Assert.Equal("finder", item.GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/held")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await p.Owner.GetAsync("/api/admin/held")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await p.Owner.PostAsync($"/api/admin/held/{p.Match}/approve", null)).StatusCode);
        Assert.Equal(MatchStatus.Held, (await Stored(p.Match)).Status);
    }

    [Fact]
    public async Task Admin_sees_both_reports_and_approving_makes_it_a_small_chance_suggestion_with_the_usual_alert()
    {
        var p = await HeldPair("approve", foundPhotos: 1);
        await Subscribe(p.Owner, "https://push.example/owner-approve");
        var admin = await Admin();

        var row = (await Json(await admin.GetAsync("/api/admin/held"))).EnumerateArray().Single(m => m.GetProperty("id").GetGuid() == p.Match);
        Assert.Equal(0.57, row.GetProperty("score").GetDouble(), 3);
        Assert.Equal("Both are a grey scarf", row.GetProperty("reasons")[0].GetString());
        Assert.Equal(row.GetProperty("createdAt").GetDateTimeOffset() + HeldMatches.ReleaseAfter, row.GetProperty("releaseAt").GetDateTimeOffset());
        var lost = row.GetProperty("lost");
        Assert.Equal(p.Lost, lost.GetProperty("id").GetGuid());
        Assert.Equal("Grey approve scarf", lost.GetProperty("title").GetString());
        Assert.Equal("black, sticker on the back", lost.GetProperty("description").GetString());
        Assert.Equal("GU1 Library", lost.GetProperty("location").GetString());
        Assert.Equal(p.OwnerEmail, lost.GetProperty("owner").GetString());
        var found = row.GetProperty("found");
        Assert.Equal(p.Found, found.GetProperty("id").GetGuid());
        Assert.Equal(1, found.GetProperty("photoIds").GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/photos/{found.GetProperty("photoIds")[0].GetGuid()}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/held/{p.Match}/approve", null)).StatusCode);

        var stored = await Stored(p.Match);
        Assert.Equal(MatchStatus.Suggested, stored.Status);
        Assert.Null(stored.ResolvedAt);
        var view = await Json(await p.Owner.GetAsync($"/api/matches/{p.Match}"));
        Assert.Equal("Suggested", view.GetProperty("status").GetString());
        Assert.Equal("small", view.GetProperty("strength").GetString());
        var card = await Mine(p.Owner, p.Lost);
        Assert.Equal("Possible match", card.GetProperty("pill").GetString());
        Assert.Equal(p.Match, card.GetProperty("matchId").GetGuid());
        Assert.Equal(1, (await Json(await p.Owner.GetAsync("/api/home"))).GetProperty("matchesWaiting").GetInt32());
        Assert.DoesNotContain((await Json(await admin.GetAsync("/api/admin/held"))).EnumerateArray(), m => m.GetProperty("id").GetGuid() == p.Match);

        // The usual match alert goes out at that moment (push and email, through the background queue).
        for (var i = 0; i < 100 && !app.Emails.Sent.Any(e => e.To == p.OwnerEmail); i++) await Task.Delay(50);
        Assert.Contains(app.Emails.Sent, e => e.To == p.OwnerEmail && e.Subject == "Zarqa spotted a possible match: Grey approve scarf");
        Assert.Contains(app.Push.Sent, x => x.Endpoint == "https://push.example/owner-approve" && x.Payload.Url == $"/matches/{p.Match}");

        await using var db = app.Db();
        var adminId = await db.Users.Where(u => u.Email == "admin@gutech.edu.om").Select(u => u.Id).SingleAsync();
        var log = await db.ReviewLogs.SingleAsync(l => l.Step == HeldMatches.ApproveStep && l.ReportId == p.Lost && l.CounterpartId == p.Found);
        var payload = JsonDocument.Parse(log.Payload).RootElement;
        Assert.Equal(adminId.ToString(), payload.GetProperty("by").GetString());
        Assert.Equal(p.Match.ToString(), payload.GetProperty("matchId").GetString());
        Assert.True(log.CreatedAt > DateTimeOffset.UtcNow.AddMinutes(-1));

        // Decided once: a second tap, or a reject after the approve, changes nothing.
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/held/{p.Match}/approve", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/held/{p.Match}/reject", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/held/{Guid.NewGuid()}/approve", null)).StatusCode);
        Assert.Equal(MatchStatus.Suggested, (await Stored(p.Match)).Status);
        Assert.Equal(1, app.Emails.Sent.Count(e => e.To == p.OwnerEmail));

        // From here it is an ordinary suggestion: the owner can claim it.
        var chat = await Json(await p.Owner.PostAsync($"/api/matches/{p.Match}/confirm", null));
        Assert.NotEqual(Guid.Empty, chat.GetProperty("conversationId").GetGuid());
    }

    [Fact]
    public async Task Rejecting_hides_it_for_good_and_leaves_both_reports_searching()
    {
        var p = await HeldPair("reject");
        var admin = await Admin();
        int jobsBefore;
        await using (var db = app.Db()) jobsBefore = await db.MatchJobs.CountAsync(j => j.ReportId == p.Lost || j.ReportId == p.Found);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/held/{p.Match}/reject", null)).StatusCode);

        var stored = await Stored(p.Match);
        Assert.Equal(MatchStatus.Withheld, stored.Status);
        Assert.NotNull(stored.ResolvedAt);
        await AssertInvisible(p);
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == p.Lost || r.Id == p.Found).ToListAsync(), r => Assert.Equal(ReportStatus.Open, r.Status));
            // Nothing is queued again.
            Assert.Equal(jobsBefore, await db.MatchJobs.CountAsync(j => j.ReportId == p.Lost || j.ReportId == p.Found));
            Assert.False(await db.MatchJobs.AnyAsync(j => (j.ReportId == p.Lost || j.ReportId == p.Found) && j.CompletedAt == null));
            var adminId = await db.Users.Where(u => u.Email == "admin@gutech.edu.om").Select(u => u.Id).SingleAsync();
            var log = await db.ReviewLogs.SingleAsync(l => l.Step == HeldMatches.RejectStep && l.ReportId == p.Lost && l.CounterpartId == p.Found);
            Assert.Equal(adminId.ToString(), JsonDocument.Parse(log.Payload).RootElement.GetProperty("by").GetString());
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/held/{p.Match}/approve", null)).StatusCode);

        // Like a pair the owner rejected: matching the report again neither reviews nor suggests it, and 48 hours change nothing.
        // The found report gets its vector, as it would have by the time a match exists, so it is in the pool below.
        await using (var db = app.Db())
        {
            var embedded = await app.Models.Embedder.EmbedAsync(["title: Found reject scarf\ndescription: black, sticker on the back\ncategory: Accessories"], CancellationToken.None);
            (await db.Reports.SingleAsync(r => r.Id == p.Found)).Embedding = new Pgvector.Vector(embedded.Vectors[0]);
            await db.SaveChangesAsync();
        }
        await AssertRematchSkipsThePair(p.Owner, p.Lost, p.Found, "Found reject scarf", new { description = "black, sticker on the back, grey" });
        await ReleaseDue(TimeSpan.FromHours(49));
        await using (var db = app.Db())
        {
            Assert.Equal(MatchStatus.Withheld, (await db.Matches.SingleAsync(m => m.LostId == p.Lost && m.FoundId == p.Found)).Status);
            Assert.False(await db.ReviewLogs.AnyAsync(l => l.Step == "review"
                && ((l.ReportId == p.Lost && l.CounterpartId == p.Found) || (l.ReportId == p.Found && l.CounterpartId == p.Lost))));
        }
        await Task.Delay(300);
        Assert.DoesNotContain(app.Emails.Sent, e => e.To == p.OwnerEmail);
    }

    [Fact]
    public async Task After_48_hours_with_no_decision_it_is_released_like_an_approval()
    {
        var p = await HeldPair("late");
        await Subscribe(p.Owner, "https://push.example/owner-late");

        // One minute short of 48 hours: still held, still silent.
        await ReleaseDue(HeldMatches.ReleaseAfter - TimeSpan.FromMinutes(1));
        Assert.Equal(MatchStatus.Held, (await Stored(p.Match)).Status);
        Assert.DoesNotContain(app.Emails.Sent, e => e.To == p.OwnerEmail);
        await AssertInvisible(p);

        Assert.True(await ReleaseDue(HeldMatches.ReleaseAfter + TimeSpan.FromMinutes(1)) >= 1);
        var stored = await Stored(p.Match);
        Assert.Equal(MatchStatus.Suggested, stored.Status);
        Assert.Null(stored.ResolvedAt);
        Assert.Contains(app.Emails.Sent, e => e.To == p.OwnerEmail && e.Subject == "Zarqa spotted a possible match: Grey late scarf");
        Assert.Contains(app.Push.Sent, x => x.Endpoint == "https://push.example/owner-late" && x.Payload.Url == $"/matches/{p.Match}");
        var view = await Json(await p.Owner.GetAsync($"/api/matches/{p.Match}"));
        Assert.Equal("small", view.GetProperty("strength").GetString());
        Assert.Equal(p.Match, (await Mine(p.Owner, p.Lost)).GetProperty("matchId").GetGuid());

        await using (var db = app.Db())
        {
            var log = await db.ReviewLogs.SingleAsync(l => l.Step == HeldMatches.AutoReleaseStep && l.ReportId == p.Lost && l.CounterpartId == p.Found);
            Assert.Equal(HeldMatches.Auto, JsonDocument.Parse(log.Payload).RootElement.GetProperty("by").GetString());
        }

        // A second pass finds nothing left to release for this pair, and does not notify twice.
        await ReleaseDue(HeldMatches.ReleaseAfter + TimeSpan.FromHours(1));
        Assert.Equal(1, app.Emails.Sent.Count(e => e.To == p.OwnerEmail));
    }

    /// <summary>A context whose saves first run <paramref name="onSave"/>: a database that fails, or a caller who goes away, mid-decision.</summary>
    private ZarqaDb DbThat(Action onSave) => new(new DbContextOptionsBuilder<ZarqaDb>()
        .UseNpgsql(app.ConnectionString, o => o.UseVector())
        .UseSnakeCaseNamingConvention()
        .AddInterceptors(new OnSave(onSave))
        .Options);

    private sealed class OnSave(Action action) : Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesInterceptor
    {
        public override ValueTask<Microsoft.EntityFrameworkCore.Diagnostics.InterceptionResult<int>> SavingChangesAsync(
            Microsoft.EntityFrameworkCore.Diagnostics.DbContextEventData eventData,
            Microsoft.EntityFrameworkCore.Diagnostics.InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            action();
            return base.SavingChangesAsync(eventData, result, cancellationToken);
        }
    }

    private async Task<int> Logs(Pair p, string step)
    {
        await using var db = app.Db();
        return await db.ReviewLogs.CountAsync(l => l.Step == step && l.ReportId == p.Lost && l.CounterpartId == p.Found);
    }

    [Fact]
    public async Task A_decision_whose_audit_row_cannot_be_stored_leaves_the_match_held_for_the_next_try()
    {
        var release = await HeldPair("faulty");
        var reject = await HeldPair("faultyno");
        using (var scope = app.Services.CreateScope())
        {
            await using var broken = DbThat(() => throw new InvalidOperationException("database went away"));
            var held = new HeldMatches(broken, new DirectNotifier(scope.ServiceProvider.GetRequiredService<NotificationSender>()), TimeProvider.System);
            await Assert.ThrowsAsync<InvalidOperationException>(() => held.ApproveAsync(release.Match, Guid.NewGuid(), CancellationToken.None));
            await Assert.ThrowsAsync<InvalidOperationException>(() => held.RejectAsync(reject.Match, Guid.NewGuid(), CancellationToken.None));
        }
        // Neither half was stored: still waiting, nothing in the audit trail, nobody told.
        foreach (var p in new[] { release, reject })
        {
            var stored = await Stored(p.Match);
            Assert.Equal(MatchStatus.Held, stored.Status);
            Assert.Null(stored.ResolvedAt);
            Assert.Equal(0, await Logs(p, HeldMatches.ApproveStep) + await Logs(p, HeldMatches.RejectStep));
            Assert.DoesNotContain(app.Emails.Sent, e => e.To == p.OwnerEmail);
            await AssertInvisible(p);
        }

        // So the next pass still finds it, and this time the owner hears, once, with the audit row.
        Assert.True(await ReleaseDue(TimeSpan.FromHours(49)) >= 1);
        Assert.Equal(MatchStatus.Suggested, (await Stored(release.Match)).Status);
        Assert.Equal(1, await Logs(release, HeldMatches.AutoReleaseStep));
        Assert.Equal(1, app.Emails.Sent.Count(e => e.To == release.OwnerEmail));
        var admin = await Admin();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/held/{reject.Match}/reject", null)).StatusCode); // released above, like the other
    }

    [Fact]
    public async Task A_caller_who_goes_away_mid_decision_cannot_split_it()
    {
        // The request is dropped (or the host starts stopping) right after the match left Held.
        var approve = await HeldPair("dropped");
        var reject = await HeldPair("droppedno");
        var adminId = Guid.NewGuid();
        using (var scope = app.Services.CreateScope())
        {
            using var gone = new CancellationTokenSource();
            await using var db = DbThat(gone.Cancel);
            var held = new HeldMatches(db, new DirectNotifier(scope.ServiceProvider.GetRequiredService<NotificationSender>()), TimeProvider.System);
            Assert.True(await held.ApproveAsync(approve.Match, adminId, gone.Token));
            Assert.True(gone.IsCancellationRequested);
        }
        using (var scope = app.Services.CreateScope())
        {
            using var gone = new CancellationTokenSource();
            await using var db = DbThat(gone.Cancel);
            var held = new HeldMatches(db, new DirectNotifier(scope.ServiceProvider.GetRequiredService<NotificationSender>()), TimeProvider.System);
            Assert.True(await held.RejectAsync(reject.Match, adminId, gone.Token));
        }

        Assert.Equal(MatchStatus.Suggested, (await Stored(approve.Match)).Status);
        Assert.Equal(1, await Logs(approve, HeldMatches.ApproveStep));
        Assert.Equal(1, app.Emails.Sent.Count(e => e.To == approve.OwnerEmail && e.Subject == "Zarqa spotted a possible match: Grey dropped scarf"));
        Assert.Equal(MatchStatus.Withheld, (await Stored(reject.Match)).Status);
        Assert.Equal(1, await Logs(reject, HeldMatches.RejectStep));
        Assert.DoesNotContain(app.Emails.Sent, e => e.To == reject.OwnerEmail);

        // A caller who was gone before anything happened changes nothing.
        var early = await HeldPair("droppedearly");
        using (var scope = app.Services.CreateScope())
        {
            using var gone = new CancellationTokenSource();
            gone.Cancel();
            var held = new HeldMatches(scope.ServiceProvider.GetRequiredService<ZarqaDb>(), new DirectNotifier(scope.ServiceProvider.GetRequiredService<NotificationSender>()), TimeProvider.System);
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => held.ApproveAsync(early.Match, adminId, gone.Token));
        }
        Assert.Equal(MatchStatus.Held, (await Stored(early.Match)).Status);
        Assert.Equal(0, await Logs(early, HeldMatches.ApproveStep));
    }

    /// <summary>A clock the test moves by hand.</summary>
    private sealed class ManualClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    /// <summary>
    /// A clock for the worker's own loop: the first <paramref name="fire"/> waits end at once (and move the clock on by
    /// what was asked for), later ones never end. Every wait asked for is kept.
    /// </summary>
    private sealed class LoopClock(int fire) : TimeProvider
    {
        private readonly Lock gate = new();
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public List<TimeSpan> Waits { get; } = [];
        public int WaitCount { get { lock (gate) return Waits.Count; } }

        public override DateTimeOffset GetUtcNow() { lock (gate) return now; }

        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            bool go;
            lock (gate)
            {
                Waits.Add(dueTime);
                go = Waits.Count <= fire;
                if (go) now += dueTime;
            }
            return base.CreateTimer(callback, state, go ? TimeSpan.Zero : Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        }
    }

    private Zarqa.Api.Admin.RetentionWorker Worker(TimeProvider clock) => new(app.Services.GetRequiredService<IServiceScopeFactory>(), clock,
        Microsoft.Extensions.Logging.Abstractions.NullLogger<Zarqa.Api.Admin.RetentionWorker>.Instance);

    /// <summary>Makes a held match as old as one nobody decided for 49 hours.</summary>
    private async Task MadeLongAgo(Pair p)
    {
        await using var db = app.Db();
        await db.Matches.Where(m => m.Id == p.Match).ExecuteUpdateAsync(s => s.SetProperty(m => m.CreatedAt, DateTimeOffset.UtcNow.AddHours(-49)));
    }

    private async Task<ReportStatus> StatusOf(Guid report)
    {
        await using var db = app.Db();
        return await db.Reports.Where(r => r.Id == report).Select(r => r.Status).SingleAsync();
    }

    private async Task Untouched60Days(Guid report)
    {
        await using var db = app.Db();
        await db.Reports.Where(r => r.Id == report).ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTimeOffset.UtcNow.AddDays(-61)));
    }

    [Fact]
    public async Task The_background_loop_releases_due_matches_every_pass_and_still_runs_retention_once_a_day()
    {
        var clock = new ManualClock();
        var worker = Worker(clock);
        var due = await HeldPair("tick");
        var fresh = await HeldPair("tickfresh");
        await MadeLongAgo(due);
        var finder = await app.SignedIn("finder.tickold@gutech.edu.om", "Omar");
        var oldA = await Post(finder, Form("found", "Old tick charger", "Electronics"));
        await Untouched60Days(oldA);

        // First pass: the 49-hour-old match is released (audit row says "auto", owner told), and retention runs.
        await worker.TickAsync(CancellationToken.None);
        Assert.Equal(MatchStatus.Suggested, (await Stored(due.Match)).Status);
        Assert.Equal(MatchStatus.Held, (await Stored(fresh.Match)).Status);
        Assert.Equal(1, await Logs(due, HeldMatches.AutoReleaseStep));
        for (var i = 0; i < 100 && !app.Emails.Sent.Any(e => e.To == due.OwnerEmail); i++) await Task.Delay(50);
        Assert.Contains(app.Emails.Sent, e => e.To == due.OwnerEmail && e.Subject == "Zarqa spotted a possible match: Grey tick scarf");
        Assert.Equal(ReportStatus.Expired, await StatusOf(oldA));

        // Fifteen minutes later, and up to a day later: held matches are still released, retention waits.
        var oldB = await Post(finder, Form("found", "Old tick cable", "Electronics"));
        await Untouched60Days(oldB);
        clock.Now += HeldMatches.CheckEvery;
        await worker.TickAsync(CancellationToken.None);
        Assert.Equal(ReportStatus.Open, await StatusOf(oldB));
        await MadeLongAgo(fresh);
        clock.Now = clock.Now - HeldMatches.CheckEvery + Zarqa.Api.Admin.RetentionWorker.RetentionEvery - TimeSpan.FromMinutes(1);
        await worker.TickAsync(CancellationToken.None);
        Assert.Equal(MatchStatus.Suggested, (await Stored(fresh.Match)).Status);
        Assert.Equal(ReportStatus.Open, await StatusOf(oldB));

        // A day after its last run, retention runs again.
        clock.Now += TimeSpan.FromMinutes(1);
        await worker.TickAsync(CancellationToken.None);
        Assert.Equal(ReportStatus.Expired, await StatusOf(oldB));
    }

    [Fact]
    public async Task The_running_worker_waits_two_minutes_then_wakes_every_fifteen()
    {
        Assert.Equal(TimeSpan.FromMinutes(15), HeldMatches.CheckEvery);
        var due = await HeldPair("loop");
        await MadeLongAgo(due);
        var clock = new LoopClock(fire: 2);
        using var worker = Worker(clock);
        await worker.StartAsync(CancellationToken.None);
        // The third wait is asked for once the second pass has finished.
        for (var i = 0; i < 400 && clock.WaitCount < 3; i++) await Task.Delay(50);
        await worker.StopAsync(CancellationToken.None);

        Assert.Equal([Zarqa.Api.Admin.RetentionWorker.StartDelay, HeldMatches.CheckEvery, HeldMatches.CheckEvery], clock.Waits);
        Assert.Equal(TimeSpan.FromMinutes(2), Zarqa.Api.Admin.RetentionWorker.StartDelay);
        Assert.Equal(MatchStatus.Suggested, (await Stored(due.Match)).Status);
        Assert.Equal(1, await Logs(due, HeldMatches.AutoReleaseStep));
    }

    [Fact]
    public async Task A_report_leaving_the_pool_ends_its_held_match_and_it_is_never_released()
    {
        // The owner closes the lost report.
        var closed = await HeldPair("closed");
        Assert.Equal(HttpStatusCode.NoContent, (await closed.Owner.PostAsync($"/api/reports/{closed.Lost}/close", null)).StatusCode);
        Assert.Equal(MatchStatus.Withheld, (await Stored(closed.Match)).Status);

        // An admin closes the found report.
        var moderated = await HeldPair("moderated");
        var admin = await Admin();
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/reports/{moderated.Found}/close", null)).StatusCode);
        Assert.Equal(MatchStatus.Withheld, (await Stored(moderated.Match)).Status);
        Assert.DoesNotContain((await Json(await admin.GetAsync("/api/admin/held"))).EnumerateArray(),
            m => m.GetProperty("id").GetGuid() == moderated.Match || m.GetProperty("id").GetGuid() == closed.Match);

        // The found item goes back to someone else: the held match for a second owner ends with the other suggestions.
        var returned = await HeldPair("returned");
        var other = await app.SignedIn("owner.returned.b@gutech.edu.om", "Sara");
        var otherLost = await Post(other, Form("lost", "Grey scarf of mine", "Accessories"));
        Guid winner;
        await using (var db = app.Db())
        {
            var m = new Match { LostId = otherLost, FoundId = returned.Found, FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(m);
            await db.SaveChangesAsync();
            winner = m.Id;
        }
        var chat = (await Json(await other.PostAsync($"/api/matches/{winner}/confirm", null))).GetProperty("conversationId").GetGuid();
        // While the item is only being talked about, the held match waits like any other suggestion for it.
        Assert.Equal(MatchStatus.Held, (await Stored(returned.Match)).Status);
        var ask = (await Json(await other.PostAsync($"/api/conversations/{chat}/returned", null))).GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.OK, (await returned.Finder.PostAsync($"/api/returns/{ask}/confirm", null)).StatusCode);
        Assert.Equal(MatchStatus.Withheld, (await Stored(returned.Match)).Status);

        // Retention expires an old report.
        var stale = await HeldPair("stale");
        await using (var db = app.Db())
            await db.Reports.Where(r => r.Id == stale.Lost).ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTimeOffset.UtcNow.AddDays(-61)));
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<Zarqa.Api.Admin.Retention>().RunAsync(CancellationToken.None);
        Assert.Equal(MatchStatus.Withheld, (await Stored(stale.Match)).Status);

        // A deleted report or account takes its held matches with it.
        var deleted = await HeldPair("deleted");
        Assert.Equal(HttpStatusCode.NoContent, (await deleted.Finder.DeleteAsync($"/api/reports/{deleted.Found}")).StatusCode);
        var left = await HeldPair("left");
        Assert.Equal(HttpStatusCode.NoContent, (await left.Owner.DeleteAsync("/api/me")).StatusCode);
        await using (var db = app.Db())
        {
            Assert.False(await db.Matches.AnyAsync(m => m.Id == deleted.Match || m.Id == left.Match));
            Assert.Equal(ReportStatus.Open, (await db.Reports.SingleAsync(r => r.Id == left.Found)).Status);
        }

        // A ban closes reports without touching their matches; a held one must still not reach the owner afterwards.
        var banned = await HeldPair("banned");
        Assert.Equal(MatchStatus.Held, (await Stored(banned.Match)).Status);
        await using (var db = app.Db())
        {
            var finderId = await db.Users.Where(u => u.Email == banned.FinderEmail).Select(u => u.Id).SingleAsync();
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsync($"/api/admin/users/{finderId}/ban", null)).StatusCode);
        }

        // Forty-nine hours on, none of them is released and nobody was told.
        await ReleaseDue(TimeSpan.FromHours(49));
        foreach (var p in new[] { closed, moderated, returned, stale, banned })
        {
            Assert.Equal(MatchStatus.Withheld, (await Stored(p.Match)).Status);
            Assert.DoesNotContain(app.Emails.Sent, e => e.To == p.OwnerEmail && e.Subject.Contains("possible match"));
        }
        // Never shown, so never the owner's to open, even by its address.
        foreach (var p in new[] { closed, moderated, returned, stale })
            Assert.Equal(HttpStatusCode.NotFound, (await p.Owner.GetAsync($"/api/matches/{p.Match}")).StatusCode);
    }

    [Fact]
    public async Task Not_the_same_item_and_delete_everything_treat_a_held_match_like_a_waiting_suggestion()
    {
        // "Not the same item" in a chat reopens both reports and leaves their other matches alone.
        var p = await HeldPair("notit");
        var other = await app.SignedIn("owner.notit.b@gutech.edu.om", "Sara");
        var otherLost = await Post(other, Form("lost", "Another grey scarf", "Accessories"));
        Guid claimed;
        await using (var db = app.Db())
        {
            var m = new Match { LostId = otherLost, FoundId = p.Found, FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(m);
            await db.SaveChangesAsync();
            claimed = m.Id;
        }
        var chat = (await Json(await other.PostAsync($"/api/matches/{claimed}/confirm", null))).GetProperty("conversationId").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await other.PostAsync($"/api/conversations/{chat}/not-it", null)).StatusCode);
        Assert.Equal(MatchStatus.Held, (await Stored(p.Match)).Status);
        await AssertInvisibleMatchRoutes(p);

        // Delete everything removes held matches with the reports.
        var admin = await Admin();
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/admin/delete-everything", new { confirm = "DELETE" })).StatusCode);
        await using (var db = app.Db()) Assert.False(await db.Matches.AnyAsync());
        Assert.Equal(0, (await Json(await admin.GetAsync("/api/admin/held"))).GetArrayLength());
    }

    private static async Task AssertInvisibleMatchRoutes(Pair p)
    {
        foreach (var who in new[] { p.Owner, p.Finder })
            Assert.Equal(HttpStatusCode.NotFound, (await who.GetAsync($"/api/matches/{p.Match}")).StatusCode);
    }

    [Fact]
    public async Task A_card_photo_reaches_the_admin_only_as_its_covered_copy()
    {
        var p = await HeldPair("card", foundPhotos: 1, category: "Wallets & cards", item: "student ID card");
        var admin = await Admin();
        var row = (await Json(await admin.GetAsync("/api/admin/held"))).EnumerateArray().Single(m => m.GetProperty("id").GetGuid() == p.Match);
        var found = row.GetProperty("found");
        Assert.True(found.GetProperty("isSensitive").GetBoolean());
        // Not covered yet, so there is nothing an admin may open: the original stays with its uploader.
        Assert.Equal(0, found.GetProperty("photoIds").GetArrayLength());
        Guid photo;
        await using (var db = app.Db())
        {
            photo = await db.Photos.Where(x => x.ReportId == p.Found).Select(x => x.Id).SingleAsync();
            Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/photos/{photo}")).StatusCode);
            // Once the covered copy exists, that copy (never the original) is what the list offers.
            var stored = await db.Photos.SingleAsync(x => x.Id == photo);
            var covered = $"covered-{Guid.NewGuid():N}.jpg";
            await File.WriteAllBytesAsync(Path.Combine(app.PhotoRoot, covered), [0xFF, 0xD8, 0xFF, 0xD9]);
            stored.CoveredKey = covered;
            stored.CoverState = CoverState.Ready;
            await db.SaveChangesAsync();
        }
        row = (await Json(await admin.GetAsync("/api/admin/held"))).EnumerateArray().Single(m => m.GetProperty("id").GetGuid() == p.Match);
        Assert.Equal(photo, row.GetProperty("found").GetProperty("photoIds")[0].GetGuid());
        var served = await (await admin.GetAsync($"/api/photos/{photo}")).Content.ReadAsByteArrayAsync();
        Assert.Equal(new byte[] { 0xFF, 0xD8, 0xFF, 0xD9 }, served);
    }

    [Fact]
    public async Task Sample_matches_and_rsa_manual_matches_are_never_held()
    {
        var admin = await Admin();
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync("/api/admin/sample", null)).StatusCode);
        await using (var db = app.Db())
        {
            var sample = await db.Matches.Where(m => m.Lost!.User!.Email.EndsWith(Zarqa.Api.Admin.SampleData.EmailSuffix)).ToListAsync();
            Assert.Contains(sample, m => m.FinalScore < HeldMatches.HoldBelow && m.Status == MatchStatus.Suggested);
            Assert.DoesNotContain(sample, m => m.Status == MatchStatus.Held);
            // The sample "small chance" suggestion keeps its label under the moved band.
            Assert.Equal("small", MatchEndpoints.Confidence(sample.Where(m => m.Status == MatchStatus.Suggested).Min(m => m.FinalScore)));
        }

        // The desk sends a found item to someone by hand: a suggestion straight away, score 1.
        var finder = await app.SignedIn("finder.manual@gutech.edu.om", "Omar");
        var found = await Post(finder, Form("found", "Silver manual ring", "Accessories"));
        var sent = await admin.PostAsJsonAsync($"/api/rsa/found/{found}/match", new { email = "asker.manual@gutech.edu.om", handOver = false });
        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        await using (var db = app.Db())
        {
            var m = await db.Matches.SingleAsync(x => x.FoundId == found);
            Assert.Equal(MatchDecider.RsaStaff, m.DecidedBy);
            Assert.Equal(MatchStatus.Suggested, m.Status);
        }
        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync("/api/admin/sample")).StatusCode);
    }
}
