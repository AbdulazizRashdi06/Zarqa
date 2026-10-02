using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>The matching pipeline end to end on a real database, with scripted models.</summary>
public class MatchingTests : IClassFixture<TestApp>, IAsyncLifetime
{
    private readonly TestApp app;

    public MatchingTests(TestApp app) => this.app = app;

    public Task InitializeAsync()
    {
        app.Models.Reset();
        return Task.CompletedTask;
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    /// <summary>Posts a lost and a found report about the same item; returns their ids.</summary>
    private async Task<(Guid Lost, Guid Found, HttpClient Owner)> PostPair(string tag, string category = "Bottles", int photos = 1)
    {
        var owner = await app.SignedIn($"owner.{tag}@gutech.edu.om");
        var finder = await app.SignedIn($"finder.{tag}@gutech.edu.om");
        var lost = await Json(await owner.PostAsync("/api/reports",
            Form("lost", $"Blue {tag} water bottle", category, "GU1 Library", Today, "10:00", photos, "blue metal bottle, cat sticker, small dent")));
        var found = await Json(await finder.PostAsync("/api/reports",
            Form("found", $"Blue {tag} bottle", category, "GU1 Library", Today, "13:00", photos, "blue metal water bottle with a cat sticker")));
        return (lost.GetProperty("id").GetGuid(), found.GetProperty("id").GetGuid(), owner);
    }

    [Fact]
    public async Task Same_item_becomes_a_match_for_the_lost_owner()
    {
        var (lost, found, owner) = await PostPair("zircon");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Debate, match.DecidedBy);
        Assert.Equal(0.95, match.FinalScore, 3); // 0.5·0.9 + 0.5·1.0
        Assert.Contains("Same kind of item: bottles", match.Reasons);
        Assert.Contains("Same spot: GU1 Library", match.Reasons);
        Assert.Contains("Found about 3 hours later", match.Reasons);
        Assert.Contains("Both mention a cat sticker", match.Reasons);
        Assert.True(await db.ReviewLogs.AnyAsync(l => l.Step == "review" && (l.ReportId == found || l.ReportId == lost)));
        Assert.True(await db.MatchJobs.Where(j => j.ReportId == lost || j.ReportId == found).AllAsync(j => j.CompletedAt != null));

        // The card links to this lost report's best waiting match (other tests' bottles may match it too).
        var mine = await Json(await owner.GetAsync("/api/reports/mine"));
        Assert.Equal("Possible match", mine[0].GetProperty("pill").GetString());
        var shown = mine[0].GetProperty("matchId").GetGuid();
        Assert.True(await db.Matches.AnyAsync(m => m.Id == shown && m.LostId == lost));
        Assert.True((await Json(await owner.GetAsync("/api/home"))).GetProperty("matchesWaiting").GetInt32() >= 1);
    }

    [Fact]
    public async Task Low_jev_score_means_no_match()
    {
        app.Models.SameItem = 0.2;
        app.Models.OverallLevel = 1; // 0.5·0.2 + 0.5·0.25 = 0.225 < 0.65
        var (lost, found, _) = await PostPair("quartz");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        Assert.False(await db.Matches.AnyAsync(m => m.LostId == lost && m.FoundId == found));
        Assert.True(app.Models.JevCalls > 0);
    }

    [Fact]
    public async Task Without_jev_the_plain_luna_review_decides()
    {
        app.Models.JevConfigured = false;
        var (lost, found, _) = await PostPair("garnet");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.LunaFallback, match.DecidedBy);
        Assert.Equal(0, app.Models.JevCalls);
    }

    [Fact]
    public async Task Card_photos_never_reach_a_model()
    {
        var (lost, found, _) = await PostPair("onyx", category: "Cards & IDs", photos: 1);
        await app.DrainMatchingAsync();

        Assert.NotEmpty(app.Models.LunaCalls);
        Assert.All(app.Models.LunaCalls, c => Assert.Equal(0, c.Images));
        await using var db = app.Db();
        Assert.True(await db.Matches.AnyAsync(m => m.LostId == lost && m.FoundId == found));
    }

    [Fact]
    public async Task Ordinary_photos_are_sent_two_per_report_at_most()
    {
        await PostPair("beryl", photos: 3);
        await app.DrainMatchingAsync();
        // Other tests' reports may be compared too; the rule is at most 2 photos per report.
        var advocates = app.Models.LunaCalls.Where(c => c.SchemaName.StartsWith("advocate_")).ToList();
        Assert.NotEmpty(advocates);
        Assert.All(advocates, c => Assert.InRange(c.Images, 0, 4));
        Assert.Contains(advocates, c => c.Images == 4);
    }

    [Fact]
    public async Task Unrelated_reports_are_not_reviewed()
    {
        var owner = await app.SignedIn("owner.unrelated@gutech.edu.om");
        var finder = await app.SignedIn("finder.unrelated@gutech.edu.om");
        var lost = await Json(await owner.PostAsync("/api/reports", Form("lost", "Toyota car key", "Keys", "Student Parking", Today, description: "black remote, two tags")));
        var found = await Json(await finder.PostAsync("/api/reports", Form("found", "Chemistry textbook", "Books", "Copy Centre", Today, description: "Zumdahl ninth edition")));
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var ids = new[] { lost.GetProperty("id").GetGuid(), found.GetProperty("id").GetGuid() };
        Assert.False(await db.ReviewLogs.AnyAsync(l => l.Step == "review" && ids.Contains(l.ReportId) && l.CounterpartId != null && ids.Contains(l.CounterpartId.Value)));
    }

    [Fact]
    public async Task A_rejected_pair_is_never_suggested_again()
    {
        var (lost, found, owner) = await PostPair("topaz");
        await app.DrainMatchingAsync();
        await using (var db = app.Db())
        {
            var m = await db.Matches.SingleAsync(x => x.LostId == lost && x.FoundId == found);
            m.Status = MatchStatus.Rejected;
            await db.SaveChangesAsync();
        }

        // Editing the lost report re-queues it; the rejected pair must not come back.
        await owner.PatchAsync($"/api/reports/{lost}", System.Net.Http.Json.JsonContent.Create(new { description = "blue metal bottle, cat sticker" }));
        await app.DrainMatchingAsync();
        await using var check = app.Db();
        Assert.Equal(1, await check.Matches.CountAsync(x => x.LostId == lost && x.FoundId == found));
        Assert.Equal(MatchStatus.Rejected, (await check.Matches.SingleAsync(x => x.LostId == lost && x.FoundId == found)).Status);
    }

    [Fact]
    public async Task Without_model_keys_jobs_wait()
    {
        app.Models.LunaConfigured = false;
        var (lost, _, _) = await PostPair("jasper");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var job = await db.MatchJobs.SingleAsync(j => j.ReportId == lost);
        Assert.Null(job.CompletedAt);
        Assert.Equal(0, job.Attempts);
        app.Models.LunaConfigured = true;
        await app.DrainMatchingAsync(); // leave the queue clean for the other tests
    }

    [Fact]
    public void Jev_readers_accept_the_documented_shapes()
    {
        static System.Text.Json.JsonElement J(string s) => System.Text.Json.JsonDocument.Parse(s).RootElement;
        Assert.Equal(0.8, JevReaders.Noul(J("0.8")));
        Assert.Equal(0.7, JevReaders.Noul(J("""{"probability":0.7}""")));
        Assert.Equal("against", JevReaders.Choice(J("""{"probabilities":{"for":0.2,"against":0.7,"balanced":0.1}}"""), ["for", "against", "balanced"]));
        Assert.Equal(1.0, JevReaders.Score(J("""{"probabilities":[0,0,0,0,1]}"""), 5));
        Assert.Equal(0.75, JevReaders.Score(J("""{"score":3}"""), 5)); // 0-based level 3 of 0..4
        Assert.Equal(1.0, JevReaders.Score(J("""{"score":5}"""), 5));  // above n-1, so 1-based
        Assert.Equal(0.5, JevReaders.Score(J("""{"probabilities":{"Unclear, could be either":1}}"""), 5));
        Assert.Equal(0.65, DebateReviewer.Score(0.6, 0.7), 10);
    }
}
