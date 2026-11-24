using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>
/// The one-model review (owner decision, decisions.md 2026-11-16): Opus alone through the private Claude Code gateway
/// in place of the debate. Off by default; a failed call falls back to the debate; its own line and held band.
/// </summary>
public class OpusAloneTests : IClassFixture<TestApp>, IAsyncLifetime
{
    private readonly TestApp app;

    public OpusAloneTests(TestApp app) => this.app = app;

    public Task InitializeAsync()
    {
        app.Models.Reset();
        Settings.OpusFallback = "debate";
        Settings.OpusDateNotes = false;
        return Task.CompletedTask;
    }

    private ModelOptions Settings => app.Services.GetRequiredService<IOptions<ModelOptions>>().Value;

    public Task DisposeAsync() => Task.CompletedTask;

    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    private async Task<(Guid Lost, Guid Found)> PostPair(string tag)
    {
        var owner = await app.SignedIn($"owner.{tag}@gutech.edu.om");
        var finder = await app.SignedIn($"finder.{tag}@gutech.edu.om");
        var lost = await Json(await owner.PostAsync("/api/reports",
            Form("lost", $"Blue {tag} water bottle", "Bottles", "GU1 Library", Today, "10:00", 1, "blue metal bottle, cat sticker, small dent")));
        var found = await Json(await finder.PostAsync("/api/reports",
            Form("found", $"Blue {tag} bottle", "Bottles", "GU1 Library", Today, "13:00", 1, "blue metal water bottle with a cat sticker")));
        return (lost.GetProperty("id").GetGuid(), found.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Off_by_default_the_debate_decides_and_the_gateway_is_never_called()
    {
        var (lost, found) = await PostPair("opal");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Debate, match.DecidedBy);
        Assert.Empty(app.Models.OpusCalls);
    }

    [Fact]
    public async Task Switched_on_one_call_decides_and_no_advocate_or_judge_runs()
    {
        app.Models.OpusConfigured = true;
        var (lost, found) = await PostPair("topaz");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Opus, match.DecidedBy);
        Assert.Equal(0.95, match.FinalScore, 3); // 0.5·0.9 + 0.5·1.0
        Assert.Equal(MatchStatus.Suggested, match.Status);
        Assert.DoesNotContain(app.Models.LunaCalls, c => c.SchemaName.StartsWith("advocate_"));
        Assert.Empty(app.Models.JudgeModels);
        // Other tests' bottles share this database, so pick this pair's own call.
        var call = app.Models.OpusCalls.First(c => c.Text.Contains("Blue topaz water bottle") && c.Text.Contains("Blue topaz bottle"));
        Assert.Equal("solo_review", call.SchemaName);
        Assert.Equal(SoloReviewer.System, call.System);
        Assert.Equal(2, call.Images); // one photo from each report, the same the advocates would have got
        Assert.StartsWith("LOST report: {", call.Text);
        Assert.Contains("\nLocation aliases: ", call.Text);
        Assert.EndsWith("\nAttached photos: 2. The first 1 are from the owner and show the LOST item; the next 1 were taken by the finder and show the FOUND item.", call.Text);
        var log = await db.ReviewLogs.Where(l => l.Step == "review" && (l.ReportId == lost || l.ReportId == found)).ToListAsync();
        Assert.Contains(log, l => l.CostUsd == Prices.Opus(4000, 0, 300));
    }

    [Fact]
    public async Task Its_line_is_045_and_its_weakest_matches_wait_for_an_admin()
    {
        app.Models.OpusConfigured = true;
        app.Models.OpusSameItem = 0.45;
        app.Models.OpusOverallLevel = 2; // 0.5·0.45 + 0.5·0.5 = 0.475: over the line, under the hold
        var (lost, found) = await PostPair("jasper");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Opus, match.DecidedBy);
        Assert.Equal(0.475, match.FinalScore, 3);
        Assert.Equal(MatchStatus.Held, match.Status);
    }

    [Fact]
    public async Task Under_its_line_nothing_is_shown_and_the_debate_is_not_asked()
    {
        app.Models.OpusConfigured = true;
        app.Models.OpusSameItem = 0.3;
        app.Models.OpusOverallLevel = 2; // 0.5·0.3 + 0.5·0.5 = 0.40 < 0.45
        var (lost, found) = await PostPair("onyx");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        Assert.False(await db.Matches.AnyAsync(m => m.LostId == lost && m.FoundId == found));
        Assert.Empty(app.Models.JudgeModels);
    }

    [Fact]
    public async Task A_failed_call_sends_the_pair_through_the_debate()
    {
        app.Models.OpusConfigured = true;
        app.Models.OpusFails = true; // gateway down, signed out or at its plan limit
        var (lost, found) = await PostPair("beryl");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Debate, match.DecidedBy);
        Assert.NotEmpty(app.Models.OpusCalls);
        Assert.Contains("gpt-6.1-terra", app.Models.JudgeModels);
        // The default: the stand-in's match is shown like any debate match, and nothing is held.
        Assert.Equal(MatchStatus.Suggested, match.Status);
        Assert.False(await db.ReviewLogs.AnyAsync(l => l.ReportId == lost && l.CounterpartId == found && l.Step == HeldMatches.HeldStep));
    }

    [Fact]
    public async Task With_the_fallback_set_to_hold_a_stand_in_match_waits_for_an_admin_whatever_its_score()
    {
        app.Models.OpusConfigured = true;
        app.Models.OpusFails = true;
        Settings.OpusFallback = "hold";
        var (lost, found) = await PostPair("garnet");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Debate, match.DecidedBy);
        // The fake debate scores this pair far above the debate's own held band (under 0.60), so only the setting holds it.
        Assert.True(match.FinalScore >= HeldMatches.HoldBelow);
        Assert.Equal(MatchStatus.Held, match.Status);
        var step = await db.ReviewLogs.SingleAsync(l => l.ReportId == lost && l.CounterpartId == found && l.Step == HeldMatches.HeldStep);
        Assert.Contains(HeldMatches.OpusUnavailable, step.Payload);

        // The admin page is told why a strong match is waiting, and what the owner will see once it is shown.
        var admin = await app.SignedIn("admin@gutech.edu.om");
        var row = (await Json(await admin.GetAsync("/api/admin/held"))).EnumerateArray().Single(m => m.GetProperty("id").GetGuid() == match.Id);
        Assert.True(row.GetProperty("standIn").GetBoolean());
        Assert.Equal(Zarqa.Api.Chat.MatchEndpoints.Confidence(match.FinalScore), row.GetProperty("confidence").GetString());
    }

    [Fact]
    public async Task With_the_fallback_set_to_hold_a_match_the_one_model_review_made_itself_is_shown_as_usual()
    {
        app.Models.OpusConfigured = true;
        Settings.OpusFallback = "hold";
        var (lost, found) = await PostPair("topaz");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Opus, match.DecidedBy);
        Assert.Equal(MatchStatus.Suggested, match.Status);
    }

    [Fact]
    public async Task With_the_one_model_review_off_the_fallback_setting_changes_nothing()
    {
        Settings.OpusFallback = "hold";
        var (lost, found) = await PostPair("onyx");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        var match = await db.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.Equal(MatchDecider.Debate, match.DecidedBy);
        Assert.Equal(MatchStatus.Suggested, match.Status);
    }

    // ---- Date notes (loop O2, accepted on outside set 5; decisions.md 2026-11-19) ----

    private static MatchInput Dated(string type, string text, string? date, DateTimeOffset? posted = null) =>
        new(Guid.NewGuid(), type, "", "", "", text, "bus", "", date, false, [], CreatedAt: posted);

    private static readonly DateTimeOffset PostedSunday = new(2026, 11, 8, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Date_notes_are_off_by_default_and_then_every_prompt_is_as_before()
    {
        Assert.False(new ModelOptions().OpusDateNotes);
        var lost = Dated("lost", "Xiaomi power bank silver, lost on the bus", "2026-11-08", PostedSunday);
        var found = Dated("found", "Mi power bank", "2026-11-07");
        var (system, text) = SoloReviewer.Prompt(lost, found, new ModelOptions(), new AliasIndex([]));
        Assert.Same(SoloReviewer.System, system);
        Assert.Contains(SoloReviewer.TimingClause, system);
        Assert.DoesNotContain("Dates:", text);
        Assert.DoesNotContain("posted on", text);
    }

    [Theory]
    [InlineData("2026-11-08", "2026-11-08")] // same day
    [InlineData("2026-11-07", "2026-11-08")] // found after it was lost
    [InlineData("2026-11-08", "2026-11-05")] // three days: the note is not proven there, so the old sentence stays
    [InlineData("2026-11-08", "2026-10-30")] // nine days
    [InlineData(null, "2026-11-07")] // a date missing
    [InlineData("2026-11-08", null)]
    [InlineData(null, null)]
    public void With_date_notes_on_a_pair_outside_the_gate_is_sent_exactly_as_before(string? lostDate, string? foundDate)
    {
        var lost = Dated("lost", "Xiaomi power bank silver, lost on the bus", lostDate, PostedSunday);
        var found = Dated("found", "Mi power bank", foundDate);
        var off = SoloReviewer.Prompt(lost, found, new ModelOptions(), new AliasIndex([]));
        var on = SoloReviewer.Prompt(lost, found, new ModelOptions { OpusDateNotes = true }, new AliasIndex([]));
        Assert.Equal(off, on);
        Assert.Same(SoloReviewer.System, on.System);
    }

    [Fact]
    public void One_day_before_gets_the_owners_one_day_note_the_posting_day_and_no_cannot_be_found_sentence()
    {
        var lost = Dated("lost", "Xiaomi power bank silver, lost on the bus", "2026-11-08", PostedSunday);
        var found = Dated("found", "Mi power bank", "2026-11-07");
        var off = SoloReviewer.Prompt(lost, found, new ModelOptions(), new AliasIndex([]));
        var on = SoloReviewer.Prompt(lost, found, new ModelOptions { OpusDateNotes = true }, new AliasIndex([]));

        Assert.Equal(SoloReviewer.DatedSystem, on.System);
        Assert.DoesNotContain("cannot be found before it was lost", on.System);
        Assert.Contains(SoloReviewer.DatedTimingClause, on.System);
        // Only the timing clause differs between the two system texts.
        Assert.Equal(SoloReviewer.System.Replace(SoloReviewer.TimingClause, "X"), on.System.Replace(SoloReviewer.DatedTimingClause, "X"));
        // 09:00 UTC on Sunday 8 November is 13:00 the same day on campus.
        Assert.Equal($"{off.Text}\n{TextRules.OneDayText}\nThe LOST report was posted on 2026-11-08 Sunday.", on.Text);
    }

    [Fact]
    public void Two_days_before_gets_the_owners_longer_gap_note_with_the_days_counted_in_code()
    {
        var lost = Dated("lost", "jacket grey north face, left on a chair", "2026-11-13");
        var found = Dated("found", "grey north face fleece", "2026-11-11");
        var off = SoloReviewer.Prompt(lost, found, new ModelOptions(), new AliasIndex([]));
        var on = SoloReviewer.Prompt(lost, found, new ModelOptions { OpusDateNotes = true }, new AliasIndex([]));
        Assert.Equal(SoloReviewer.DatedSystem, on.System);
        // No posting time on the report: the line is left out rather than guessed.
        Assert.Equal($"{off.Text}\n{TextRules.EarlyText(2)}", on.Text);
        Assert.StartsWith("Dates: the FOUND date is 2 calendar days before the LOST date.", TextRules.EarlyText(2));
    }

    [Fact]
    public void A_lost_report_edited_to_a_later_lost_date_does_not_get_its_old_posting_day()
    {
        // Posted on Monday 2 November; a week later the owner edits the words and sets the lost date to the 9th.
        var lost = Dated("lost", "had it this morning in the lab, gone now", "2026-11-09", new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero));
        var found = Dated("found", "black calculator", "2026-11-08");
        var on = SoloReviewer.Prompt(lost, found, new ModelOptions { OpusDateNotes = true }, new AliasIndex([]));
        Assert.EndsWith(TextRules.OneDayText, on.Text);
        Assert.DoesNotContain("posted on", on.Text);
    }

    [Fact]
    public void With_the_posting_switch_on_the_day_is_already_in_the_report_and_is_not_repeated()
    {
        var lost = Dated("lost", "Xiaomi power bank silver, lost on the bus", "2026-11-08", PostedSunday);
        var found = Dated("found", "Mi power bank", "2026-11-07", PostedSunday);
        var on = SoloReviewer.Prompt(lost, found, new ModelOptions { OpusDateNotes = true, PostedOn = true }, new AliasIndex([]));
        Assert.EndsWith(TextRules.OneDayText, on.Text);
        Assert.DoesNotContain("The LOST report was posted on", on.Text);
        Assert.Contains("\"postedOn\":\"2026-11-08 Sunday\"", on.Text);
    }

    [Fact]
    public void The_date_note_wording_is_the_benchmarks_word_for_word()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "benchmark"))) dir = dir.Parent;
        var text = File.ReadAllText(Path.Combine(dir!.FullName, "benchmark", "src", "text.js"));
        var debate = File.ReadAllText(Path.Combine(dir.FullName, "benchmark", "src", "reviewers", "debate.js"));

        var early = System.Text.RegularExpressions.Regex.Match(text, "export const earlyText = \\(days\\) => `([^`]+)`;").Groups[1].Value;
        Assert.StartsWith("Dates: the FOUND date is ${days} calendar days", early);
        Assert.Equal(early.Replace("${days}", "2"), TextRules.EarlyText(2));

        var oneDay = System.Text.RegularExpressions.Regex.Match(text, "export const ONE_DAY_TEXT = '((?:[^'\\\\]|\\\\.)+)';").Groups[1].Value.Replace("\\'", "'");
        Assert.Equal(oneDay, TextRules.OneDayText);

        var pointer = System.Text.RegularExpressions.Regex.Match(debate, "const A2_TIMING = '([^']+)';").Groups[1].Value;
        Assert.Equal($"timing ({pointer})", SoloReviewer.DatedTimingClause);
        Assert.Contains("`\\nThe LOST report was posted on ${posted}.`", debate);
    }

    [Fact]
    public async Task With_date_notes_on_the_matcher_sends_the_note_to_the_gateway_for_a_one_day_pair()
    {
        app.Models.OpusConfigured = true;
        Settings.OpusDateNotes = true;
        try
        {
            var owner = await app.SignedIn("owner.opal@gutech.edu.om");
            var finder = await app.SignedIn("finder.opal@gutech.edu.om");
            var yesterday = DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd");
            await owner.PostAsync("/api/reports", Form("lost", "Blue opal water bottle", "Bottles", "GU1 Library", Today, "10:00", 1, "blue metal bottle, cat sticker, small dent"));
            await finder.PostAsync("/api/reports", Form("found", "Blue opal bottle", "Bottles", "GU1 Library", yesterday, "13:00", 1, "blue metal water bottle with a cat sticker"));
            await app.DrainMatchingAsync();

            var call = app.Models.OpusCalls.First(c => c.Text.Contains("Blue opal water bottle") && c.Text.Contains("Blue opal bottle"));
            Assert.Equal(SoloReviewer.DatedSystem, call.System);
            Assert.Contains(TextRules.OneDayText, call.Text);
            Assert.Contains("The LOST report was posted on ", call.Text);
        }
        finally { Settings.OpusDateNotes = false; }
    }

    [Fact]
    public void The_fallback_is_the_debate_unless_set_to_hold()
    {
        Assert.False(new ModelOptions().HoldsOpusFallback);
        foreach (var off in new[] { "debate", " Debate ", "false", "off", "no", "0", "" })
            Assert.False(new ModelOptions { OpusFallback = off }.HoldsOpusFallback);
        // A typo must not quietly show the stand-in's matches: anything that is not a plain "off" holds.
        foreach (var on in new[] { "hold", " Hold ", "true", "on", "held", "retry" })
            Assert.True(new ModelOptions { OpusFallback = on }.HoldsOpusFallback);
    }

    [Theory]
    [InlineData(0.45, true)]
    [InlineData(0.499, true)]
    [InlineData(0.50, false)]
    [InlineData(0.95, false)]
    public void Only_one_model_matches_under_050_are_held(double score, bool held) =>
        Assert.Equal(held, HeldMatches.ShouldHold(MatchDecider.Opus, score));

    [Fact]
    public void The_gateway_counts_as_configured_only_with_the_switch_and_an_address()
    {
        using var http = new HttpClient();
        bool Configured(ModelOptions o) => new ClaudeGatewayOpus(http, Options.Create(o)).IsConfigured;
        Assert.False(Configured(new ModelOptions()));
        Assert.False(Configured(new ModelOptions { UseOpusAlone = true }));
        Assert.False(Configured(new ModelOptions { OpusBaseUrl = "http://claude:8091/v1" }));
        Assert.True(Configured(new ModelOptions { UseOpusAlone = true, OpusBaseUrl = "http://claude:8091/v1" }));
    }

    [Fact]
    public async Task The_request_goes_to_the_gateway_with_the_model_the_reasoning_level_and_no_key()
    {
        HttpRequestMessage? sent = null;
        JsonObject? body = null;
        using var http = new HttpClient(new Capture(async request =>
        {
            sent = request;
            body = JsonNode.Parse(await request.Content!.ReadAsStringAsync())!.AsObject();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(new
                {
                    choices = new[] { new { message = new { content = """{"same_item_probability":0.8,"stronger_case":"for","overall_probabilities":{"clearly_different":0,"probably_different":0,"unclear":0,"probably_same":1,"almost_certainly_same":0}}""" } } },
                    usage = new { prompt_tokens = 4000, completion_tokens = 300, prompt_tokens_details = new { cached_tokens = 1000 } },
                }),
            };
        }));
        var options = Options.Create(new ModelOptions { UseOpusAlone = true, OpusBaseUrl = "http://claude:8091/v1/", OpenAiApiKey = "must-not-leave" });
        var reviewer = new SoloReviewer(new ClaudeGatewayOpus(http, options), new AliasIndex([]), options);
        var lost = new MatchInput(Guid.NewGuid(), "lost", "", "", "", "Lost blue bottle", "Library", "", null, false, []);
        var found = new MatchInput(Guid.NewGuid(), "found", "", "", "", "Blue bottle with sticker", "Library", "", null, false, []);

        var review = await reviewer.ReviewAsync(lost, found, ["data:image/jpeg;base64,cGhvdG8="], default);

        Assert.Equal("http://claude:8091/v1/chat/completions", sent!.RequestUri!.ToString());
        Assert.Null(sent.Headers.Authorization);
        Assert.Equal("opus", body!["model"]!.GetValue<string>());
        Assert.Equal("high", body["reasoning_effort"]!.GetValue<string>());
        Assert.Equal(SoloReviewer.System, body["messages"]![0]!["content"]!.GetValue<string>());
        Assert.Equal(2, body["messages"]![1]!["content"]!.AsArray().Count); // the text and one photo
        Assert.Equal("opus", review.Decider);
        Assert.True(review.IsMatch);
        Assert.Equal(0.775, review.FinalScore, 3); // 0.5·0.8 + 0.5·0.75
        Assert.Equal(Prices.Opus(4000, 1000, 300), review.CostUsd);
    }

    [Fact]
    public async Task An_unusable_answer_is_a_model_failure_so_the_matcher_falls_back()
    {
        using var http = new HttpClient(new Capture(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { choices = new[] { new { message = new { content = """{"same_item_probability":"high"}""" } } } }),
        })));
        var options = Options.Create(new ModelOptions { UseOpusAlone = true, OpusBaseUrl = "http://claude:8091/v1" });
        var reviewer = new SoloReviewer(new ClaudeGatewayOpus(http, options), new AliasIndex([]), options);
        var input = new MatchInput(Guid.NewGuid(), "lost", "", "", "", "Blue bottle", "Library", "", null, false, []);
        var e = await Assert.ThrowsAsync<ModelCallException>(() => reviewer.ReviewAsync(input, input with { Type = "found" }, [], default));
        Assert.True(DebateReviewer.IsModelFailure(e, default));
    }

    [Fact]
    public void Wording_is_the_benchmarks_word_for_word()
    {
        var dir = AppContext.BaseDirectory;
        while (!File.Exists(Path.Combine(dir, "decisions.md"))) dir = Path.GetDirectoryName(dir) ?? throw new InvalidOperationException("repo root not found");
        var debate = File.ReadAllText(Path.Combine(dir, "benchmark", "src", "reviewers", "debate.js"));
        // The benchmark builds the text from a template whose timing clause and last line can be switched for tests;
        // with no switch set they are the app's clause and nothing.
        const string opening = "const soloSystem = (timing) => `";
        var start = debate.IndexOf(opening, StringComparison.Ordinal);
        Assert.True(start >= 0);
        start += opening.Length;
        var template = debate[start..debate.IndexOf("`;", start, StringComparison.Ordinal)];
        Assert.Contains("export const SOLO_SYSTEM = soloSystem(SOLO_TIMING);", debate);
        var appTiming = System.Text.RegularExpressions.Regex.Match(debate, "const APP_TIMING = \"([^\"]+)\";").Groups[1].Value;
        Assert.Equal($"timing ({appTiming})", SoloReviewer.TimingClause);
        // Fill the template's placeholders the way the benchmark does.
        var levels = string.Join("; ", DebateReviewer.LevelKeys.Zip(DebateReviewer.Levels, (key, label) => $"{key} = \"{label}\""));
        var filled = template
            .Replace("${timing}", appTiming)
            .Replace("${SOLO_EXTRA_LINE}", "")
            .Replace("${SOLO_FACTS_LINES}", "")
            .Replace("${SIMILARITY_RULE}", DebateReviewer.SimilarityRule)
            .Replace("${QUESTIONS.overall.instructions}", DebateReviewer.OverallQuestion)
            .Replace("${LEVEL_KEYS.map((k, i) => `${k} = \"${DEBATE_LEVELS[i]}\"`).join(\"; \")}", levels);
        Assert.DoesNotContain("${", filled);
        Assert.Equal(filled, SoloReviewer.System);
    }

    private sealed class Capture(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => respond(request);
    }
}
