using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>The screening call on its own: prompt, text, answer reading and routes. No database.</summary>
public class ScreenReviewerTests
{
    private static MatchInput Input(string type, string description, string location = "GU1 Library", string? date = "2026-11-14") =>
        new(Guid.NewGuid(), type, "", "Bottles", "bottles", description, location, "", date, false, [typeof(ScreenReviewerTests).Assembly.Location]);

    private static ScreenReviewer Reviewer(FakeModels models, bool terra = true) =>
        new(models.Luna, models.DeepSeek, Options.Create(new ModelOptions { UseTerraJudge = terra }), NullLogger<ScreenReviewer>.Instance);

    [Fact]
    public void System_prompt_is_the_benchmarks_word_for_word()
    {
        // The measured gain belongs to this exact prompt; a reworded copy would be an unmeasured one.
        var js = File.ReadAllText(Path.Combine(RepoRoot(), "benchmark", "src", "reviewers", "triage.js"));
        var benchmark = Regex.Match(js, "TRIAGE_SYSTEM = `([^`]+)`").Groups[1].Value.ReplaceLineEndings("\n");
        Assert.StartsWith("You pre-screen candidates", benchmark);
        Assert.Equal(benchmark, ScreenReviewer.SystemPrompt);
        Assert.Equal(4, ScreenReviewer.SystemPrompt.Split('\n').Length);
        Assert.Contains("schemaName: \"triage\"", js);
        Assert.Equal("triage", ScreenReviewer.SchemaName);
    }

    [Fact]
    public void Text_is_built_like_the_benchmarks()
    {
        var lost = Input("lost", "قارورة ماء زرقاء \"Stanley\"", date: "");
        var found = new[] { Input("found", new string('a', 301), "Canteen"), Input("found", "blue bottle", "GU2", null) };
        Assert.Equal(
            "LOST report: {\"description\":\"قارورة ماء زرقاء \\\"Stanley\\\"\",\"location\":\"GU1 Library\",\"eventDate\":null}\n" +
            "Candidate FOUND reports:\n" +
            "1. {\"description\":\"" + new string('a', 300) + "…\",\"location\":\"Canteen\",\"eventDate\":\"2026-11-14\"}\n" +
            "2. {\"description\":\"blue bottle\",\"location\":\"GU2\",\"eventDate\":null}",
            ScreenReviewer.Text(lost, found));
        Assert.StartsWith("FOUND report: ", ScreenReviewer.Text(found[1], [lost]));
        Assert.Contains("\nCandidate LOST reports:\n1. ", ScreenReviewer.Text(found[1], [lost]));
    }

    [Theory]
    [InlineData("""{"keep":[3,1,2]}""", "2,0,1")]
    [InlineData("""{"keep":[]}""", "")]                    // a real answer: nothing is worth a review
    [InlineData("""{"keep":[2,2,9,0,-1,1,2]}""", "1,0")]   // duplicates and unknown numbers ignored
    [InlineData("""{"keep":[2.0,1.5]}""", "1")]
    [InlineData("""{"keep":[7,8]}""", null)]               // numbers, but none names a candidate
    [InlineData("""{"keep":["1"]}""", null)]
    [InlineData("""{"keep":"1,2"}""", null)]
    [InlineData("""{}""", null)]
    [InlineData("""[1,2]""", null)]
    public void Reads_the_kept_numbers(string json, string? expected)
    {
        var kept = ScreenReviewer.ReadKeep(JsonDocument.Parse(json).RootElement, 3);
        Assert.Equal(expected, kept is null ? null : string.Join(",", kept));
    }

    [Fact]
    public async Task One_text_only_luna_call()
    {
        var models = new FakeModels { ScreenAnswer = """{"keep":[2,1]}""" };
        var result = await Reviewer(models).ScreenAsync(Input("lost", "blue bottle"), [Input("found", "bottle"), Input("found", "flask")], default);

        Assert.False(result.FellBack);
        Assert.Equal([1, 0], result.Kept);
        var call = Assert.Single(models.ScreenCalls);
        Assert.Equal(("gpt-6-luna", ScreenReviewer.SystemPrompt, 0), (call.Model, call.System, call.Images));
        Assert.DoesNotContain("Bottles", call.Text); // no category, no title
        Assert.True(result.Call!.CostUsd > 0);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task With_the_terra_judge_a_failed_or_unusable_luna_answer_goes_to_deepseek(bool unusable)
    {
        var models = new FakeModels { ScreenFails = !unusable, ScreenAnswer = unusable ? """{"keep":[99]}""" : null, DeepSeekScreenAnswer = """{"keep":[2]}""" };
        var result = await Reviewer(models).ScreenAsync(Input("found", "blue bottle"), [Input("lost", "bottle"), Input("lost", "flask")], default);

        Assert.False(result.FellBack);
        Assert.Equal([1], result.Kept);
        Assert.Equal(DeepSeekChat.Model, result.Call!.Model);
        Assert.Equal(["gpt-6-luna", DeepSeekChat.Model], models.ScreenCalls.Select(c => c.Model));
        Assert.StartsWith(ScreenReviewer.SystemPrompt + "\nExample JSON response (illustrative values only): {\"keep\":[2,5]}", models.ScreenCalls.Last().System);
        Assert.All(models.ScreenCalls, c => Assert.Equal(0, c.Images));
    }

    [Fact]
    public async Task When_both_models_fail_it_falls_back_instead_of_throwing()
    {
        var models = new FakeModels { ScreenFails = true };
        var result = await Reviewer(models).ScreenAsync(Input("lost", "blue bottle"), [Input("found", "bottle")], default);
        Assert.True(result.FellBack);
        Assert.Null(result.Call);
        Assert.Equal(2, models.ScreenCalls.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Without_the_terra_judge_it_is_plain_luna(bool fails)
    {
        var models = new FakeModels { ScreenFails = fails, ScreenAnswer = """{"keep":"all"}""", DeepSeekScreenAnswer = """{"keep":[1]}""" };
        var result = await Reviewer(models, terra: false).ScreenAsync(Input("lost", "blue bottle"), [Input("found", "bottle")], default);
        Assert.True(result.FellBack);
        // An unusable answer was still paid for; a failed call was not.
        Assert.Equal(fails, result.Call is null);
        Assert.Equal(["gpt-6-luna"], models.ScreenCalls.Select(c => c.Model));
    }

    [Fact]
    public async Task Cancellation_is_not_swallowed_as_a_fallback()
    {
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            Reviewer(new FakeModels()).ScreenAsync(Input("lost", "blue bottle"), [Input("found", "bottle")], stop.Token));
    }

    [Fact]
    public void The_switch_is_on_unless_configured_off() => Assert.True(new ModelOptions().UseScreen);

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "benchmark"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }
}

/// <summary>The screen inside the matching pipeline, on a real database with scripted models.</summary>
public class ScreenMatchingTests : IClassFixture<TestApp>, IAsyncLifetime
{
    private readonly TestApp app;

    public ScreenMatchingTests(TestApp app) => this.app = app;

    private ModelOptions Options => app.Services.GetRequiredService<IOptions<ModelOptions>>().Value;

    public async Task InitializeAsync()
    {
        app.Models.Reset();
        // The judge says no, so no matches or notifications get in the way of counting reviews.
        app.Models.SameItem = 0.2;
        app.Models.OverallLevel = 1;
        Options.UseScreen = true;
        // Each test counts its own candidates: take the earlier tests' reports out of the pool.
        await using var db = app.Db();
        await db.Reports.ExecuteUpdateAsync(r => r.SetProperty(x => x.Status, ReportStatus.Closed));
    }

    public Task DisposeAsync()
    {
        Options.UseScreen = true;
        return Task.CompletedTask;
    }

    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    /// <summary>
    /// Found reports of the same bottle from different finders (each with a photo), matched and settled, then
    /// one lost report whose matching run is the one under test. Returns the found ids by their mark number.
    /// </summary>
    private async Task<(Guid Lost, Guid[] Found)> PostCrowd(string tag, int count)
    {
        var found = new Guid[count];
        for (var i = 0; i < count; i++)
        {
            var finder = await app.SignedIn($"finder.{tag}.{i}@gutech.edu.om");
            var posted = await Json(await finder.PostAsync("/api/reports",
                Form("found", "Blue bottle", "Bottles", "GU1 Library", Today, "13:00", 1, $"blue metal water bottle with a cat sticker, mark{i:00}")));
            found[i] = posted.GetProperty("id").GetGuid();
        }
        await app.DrainMatchingAsync();
        app.Models.LunaCalls.Clear();
        app.Models.ScreenCalls.Clear();

        var owner = await app.SignedIn($"owner.{tag}@gutech.edu.om");
        var lost = await Json(await owner.PostAsync("/api/reports",
            Form("lost", "Blue water bottle", "Bottles", "GU1 Library", Today, "10:00", 1, "blue metal bottle, cat sticker, small dent")));
        await app.DrainMatchingAsync();
        return (lost.GetProperty("id").GetGuid(), found);
    }

    /// <summary>The found ids in the order the screen was shown them, read back from the prompt text.</summary>
    private static Guid[] Shown(string text, Guid[] found) =>
        [.. text.Split('\n').Skip(2).Select(line => found[int.Parse(Regex.Match(line, @"mark(\d\d)").Groups[1].Value)])];

    private async Task<(JsonElement? Screen, Guid[] BestByPrescore, HashSet<Guid> Reviewed, bool Completed)> Outcome(Guid lost)
    {
        await using var db = app.Db();
        var logs = await db.ReviewLogs.Where(l => l.ReportId == lost).OrderBy(l => l.Id).ToListAsync();
        var screen = logs.Where(l => l.Step == "screen").Select(l => (JsonElement?)JsonDocument.Parse(l.Payload).RootElement).SingleOrDefault();
        var shortlist = JsonDocument.Parse(logs.Single(l => l.Step == "shortlist").Payload).RootElement.GetProperty("candidates");
        var scores = shortlist.EnumerateArray().Select(c => c.GetProperty("score").GetDouble()).ToList();
        Assert.Equal(scores.OrderByDescending(s => s), scores);
        var reviewed = logs.Where(l => l.Step == "review").Select(l => l.CounterpartId!.Value).ToList();
        Assert.Equal(reviewed.Count, reviewed.Distinct().Count());
        var job = await db.MatchJobs.SingleAsync(j => j.ReportId == lost);
        return (screen, [.. shortlist.EnumerateArray().Select(c => c.GetProperty("id").GetGuid())], [.. reviewed], job.CompletedAt != null);
    }

    private static Guid[] Ids(JsonElement screen, string name) => [.. screen.GetProperty(name).EnumerateArray().Select(e => e.GetGuid())];

    [Fact]
    public async Task More_than_ten_candidates_are_screened_once_without_photos_and_only_the_kept_are_reviewed()
    {
        // Duplicates, numbers that name nobody and a reversed order: the screen's order wins.
        app.Models.ScreenAnswer = """{"keep":[12,3,12,99,0,7,1]}""";
        var (lost, found) = await PostCrowd("kept", 12);

        var call = Assert.Single(app.Models.ScreenCalls);
        Assert.Equal(0, call.Images);
        Assert.Equal(ScreenReviewer.SystemPrompt, call.System);
        Assert.StartsWith("LOST report: {\"description\":", call.Text);
        var shown = Shown(call.Text, found);
        Assert.Equal(12, shown.Length);
        Guid[] expected = [shown[11], shown[2], shown[6], shown[0]];

        var (screen, best, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Equal(shown, best); // screened best-first, the same list the shortlist row records
        Assert.Equal(shown, Ids(screen!.Value, "screened"));
        Assert.Equal(expected, Ids(screen.Value, "kept"));
        Assert.Equal(expected, Ids(screen.Value, "reviewed"));
        Assert.Equal(expected.ToHashSet(), reviewed);
        Assert.False(screen.Value.GetProperty("fellBack").GetBoolean());
        Assert.Equal("gpt-6-luna", screen.Value.GetProperty("model").GetString());
        Assert.Equal(2000, screen.Value.GetProperty("tokens").GetProperty("in").GetInt32());
        Assert.Equal(40, screen.Value.GetProperty("tokens").GetProperty("out").GetInt32());
        // Four debates: the advocates still get the photos, the screen never does.
        Assert.Equal(8, app.Models.LunaCalls.Count(c => c.SchemaName.StartsWith("advocate_")));
        Assert.Contains(app.Models.LunaCalls, c => c.SchemaName.StartsWith("advocate_") && c.Images > 0);

        await using var db = app.Db();
        var row = await db.ReviewLogs.SingleAsync(l => l.ReportId == lost && l.Step == "screen");
        Assert.Equal(Prices.Luna(2000, 0, 40), row.CostUsd); // counted by the daily spend cap
        Assert.Equal(7, row.LatencyMs);
    }

    [Fact]
    public async Task At_most_ten_of_the_kept_are_reviewed_in_the_screens_order()
    {
        app.Models.ScreenAnswer = """{"keep":[13,12,11,10,9,8,7,6,5,4,3,2,1]}""";
        var (lost, found) = await PostCrowd("cap", 13);

        var shown = Shown(Assert.Single(app.Models.ScreenCalls).Text, found);
        var (screen, _, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Equal(shown.Reverse(), Ids(screen!.Value, "kept"));
        Assert.Equal(shown.Reverse().Take(10), Ids(screen.Value, "reviewed"));
        Assert.Equal(shown.Reverse().Take(10).ToHashSet(), reviewed);
    }

    [Fact]
    public async Task An_empty_keep_list_means_nothing_is_reviewed()
    {
        app.Models.ScreenAnswer = """{"keep":[]}""";
        var (lost, _) = await PostCrowd("none", 11);

        Assert.Single(app.Models.ScreenCalls);
        var (screen, _, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Empty(reviewed);
        Assert.False(screen!.Value.GetProperty("fellBack").GetBoolean());
    }

    [Fact]
    public async Task Ten_or_fewer_candidates_are_reviewed_without_a_screen()
    {
        var (lost, found) = await PostCrowd("few", 10);

        Assert.Empty(app.Models.ScreenCalls);
        var (screen, best, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Null(screen);
        Assert.Equal(found.ToHashSet(), best.ToHashSet());
        Assert.Equal(found.ToHashSet(), reviewed);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_failed_or_unusable_screen_reviews_the_best_ten_by_prescore_and_the_job_completes(bool unusable)
    {
        // Luna and the DeepSeek fallback both fail, or both answer with numbers that name nobody.
        app.Models.ScreenFails = !unusable;
        if (unusable) app.Models.ScreenAnswer = app.Models.DeepSeekScreenAnswer = """{"keep":[40,41]}""";
        var (lost, _) = await PostCrowd(unusable ? "unusable" : "down", 12);

        Assert.Equal(["gpt-6-luna", DeepSeekChat.Model], app.Models.ScreenCalls.Select(c => c.Model));
        var (screen, best, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Equal(12, best.Length);
        Assert.Equal(best.Take(10).ToHashSet(), reviewed);
        Assert.True(screen!.Value.GetProperty("fellBack").GetBoolean());
        Assert.Empty(Ids(screen.Value, "kept"));
        Assert.Equal(best.Take(10), Ids(screen.Value, "reviewed"));
    }

    [Fact]
    public async Task When_luna_fails_the_deepseek_screen_decides()
    {
        app.Models.ScreenFails = true;
        app.Models.DeepSeekScreenAnswer = """{"keep":[2,11]}""";
        var (lost, found) = await PostCrowd("deepseek", 11);

        Assert.Equal(2, app.Models.ScreenCalls.Count);
        var shown = Shown(app.Models.ScreenCalls.Last().Text, found);
        var (screen, _, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Equal(new[] { shown[1], shown[10] }.ToHashSet(), reviewed);
        Assert.Equal(DeepSeekChat.Model, screen!.Value.GetProperty("model").GetString());
        Assert.False(screen.Value.GetProperty("fellBack").GetBoolean());
    }

    [Fact]
    public async Task Switched_off_the_best_ten_by_prescore_are_reviewed_without_a_screen()
    {
        Options.UseScreen = false;
        var (lost, _) = await PostCrowd("off", 12);

        Assert.Empty(app.Models.ScreenCalls);
        var (screen, best, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Null(screen);
        Assert.Equal(12, best.Length);
        Assert.Equal(best.Take(10).ToHashSet(), reviewed);
    }

    [Fact]
    public async Task The_pool_is_no_longer_cut_at_the_nearest_25()
    {
        // 27 same-item reports: all of them are scored, the best 30 at most reach the screen.
        var (lost, found) = await PostCrowd("pool", 27);

        var shown = Shown(Assert.Single(app.Models.ScreenCalls).Text, found);
        Assert.Equal(27, shown.Length);
        await using var db = app.Db();
        var shortlist = JsonDocument.Parse((await db.ReviewLogs.SingleAsync(l => l.ReportId == lost && l.Step == "shortlist")).Payload).RootElement;
        Assert.Equal(27, shortlist.GetProperty("pool").GetInt32());
        Assert.Equal(27, shortlist.GetProperty("passed").GetInt32());
    }

    [Fact]
    public async Task Only_the_best_thirty_by_prescore_reach_the_screen()
    {
        // 32 pass the prescore; the screen is numbered 1..30, so 31 and 32 name nobody.
        app.Models.ScreenAnswer = """{"keep":[31,2,32,30]}""";
        var (lost, found) = await PostCrowd("thirty", 32);

        Assert.Equal(30, Matcher.ScreenSize);
        var call = Assert.Single(app.Models.ScreenCalls);
        var lines = call.Text.Split('\n').Skip(2).ToArray();
        Assert.Equal(30, lines.Length);
        Assert.Equal(Enumerable.Range(1, 30).Select(n => $"{n}. "), lines.Select(l => l[..(l.IndexOf(' ') + 1)]));
        var shown = Shown(call.Text, found);
        Assert.Equal(30, shown.Distinct().Count());

        var (screen, best, reviewed, completed) = await Outcome(lost);
        Assert.True(completed);
        Assert.Equal(30, best.Length);
        Assert.Equal(best, shown); // the first 30 of the prescore order, best first
        Assert.Equal(best, Ids(screen!.Value, "screened"));
        Guid[] expected = [shown[1], shown[29]];
        Assert.Equal(expected, Ids(screen.Value, "kept"));
        Assert.Equal(expected.ToHashSet(), reviewed);
        Assert.False(screen.Value.GetProperty("fellBack").GetBoolean());

        await using var db = app.Db();
        var shortlist = JsonDocument.Parse((await db.ReviewLogs.SingleAsync(l => l.ReportId == lost && l.Step == "shortlist")).Payload).RootElement;
        Assert.Equal(32, shortlist.GetProperty("pool").GetInt32());
        Assert.Equal(32, shortlist.GetProperty("passed").GetInt32());
    }
}
