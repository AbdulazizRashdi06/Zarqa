using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Zarqa.Api.Admin;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>The rendering call on its own, and what the ranking does with it. No database.</summary>
public class ReportNormalizerTests
{
    private const string Arabic = "قارورة ماء زرقاء عليها ملصق قطة";
    private static readonly AliasIndex Aliases = new(Seeder.LoadLocations().Select(kv => (kv.Key, kv.Value)));

    private static MatchInput Input(string type, string description, string location = "GU1 Library", string? rankText = null, string? rankLocation = null) =>
        new(Guid.NewGuid(), type, "", "", "", description, location, "", "2026-11-14", false, [typeof(ReportNormalizerTests).Assembly.Location], rankText, rankLocation);

    private static ReportNormalizer Normalizer(FakeModels models, bool terra = true) =>
        new(models.Luna, models.DeepSeek, Options.Create(new ModelOptions { UseTerraJudge = terra }), NullLogger<ReportNormalizer>.Instance);

    [Fact]
    public void System_prompt_is_the_benchmarks_word_for_word()
    {
        // The measured gain belongs to this exact prompt; a reworded copy would be an unmeasured one.
        var js = File.ReadAllText(Path.Combine(RepoRoot(), "benchmark", "src", "normalize.js"));
        var benchmark = Regex.Match(js, "NORMALIZE_SYSTEM = `([^`]+)`").Groups[1].Value.ReplaceLineEndings("\n");
        Assert.StartsWith("You prepare lost-and-found reports for search.", benchmark);
        Assert.Equal(benchmark, ReportNormalizer.SystemPrompt);
        Assert.Equal(5, ReportNormalizer.SystemPrompt.Split('\n').Length);
        Assert.Contains("schemaName: \"normalize\"", js);
        Assert.Equal("normalize", ReportNormalizer.SchemaName);
    }

    [Fact]
    public void Text_is_built_like_the_benchmarks()
    {
        // Arabic and quotes as JSON.stringify writes them; the whole text, not cut.
        Assert.Equal("LOST report: {\"description\":\"" + Arabic + " \\\"Stanley\\\"\",\"place\":\"المكتبة\"}",
            ReportNormalizer.Text(Input("lost", Arabic + " \"Stanley\"", "المكتبة")));
        Assert.Equal("FOUND report: {\"description\":\"" + new string('a', 600) + "\",\"place\":\"\"}",
            ReportNormalizer.Text(Input("found", new string('a', 600), "")));
    }

    [Fact]
    public void The_hash_is_sha256_of_the_text_and_the_place()
    {
        var expected = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Arabic + "\nالمكتبة")));
        Assert.Equal(expected, ReportNormalizer.Hash(Input("lost", Arabic, "المكتبة")));
        Assert.Equal(64, expected.Length);
        Assert.NotEqual(expected, ReportNormalizer.Hash(Input("lost", Arabic + ".", "المكتبة")));
        Assert.NotEqual(expected, ReportNormalizer.Hash(Input("lost", Arabic, "")));
        // Kind, date and photos are not part of it.
        Assert.Equal(expected, ReportNormalizer.Hash(Input("found", Arabic, "المكتبة")));
    }

    [Theory]
    [InlineData("""{"english":" Blue bottle. ","place":" library "}""", "Blue bottle.", "library")]
    [InlineData("""{"english":"Blue bottle.","place":""}""", "Blue bottle.", "")]
    [InlineData("""{"english":"","place":"library"}""", null, null)]      // no rendering at all: a broken answer
    [InlineData("""{"english":"   ","place":""}""", null, null)]
    [InlineData("""{"english":"Blue bottle."}""", null, null)]
    [InlineData("""{"english":5,"place":""}""", null, null)]
    [InlineData("""{"english":"Blue bottle.","place":null}""", null, null)]
    [InlineData("""{}""", null, null)]
    [InlineData("""["Blue bottle."]""", null, null)]
    public void Reads_the_rendering(string json, string? english, string? place)
    {
        var read = ReportNormalizer.Read(JsonDocument.Parse(json).RootElement);
        Assert.Equal((english, place), (read?.English, read?.Place));
    }

    [Fact]
    public void An_overlong_answer_is_cut_to_what_the_columns_hold()
    {
        var read = ReportNormalizer.Read(JsonSerializer.SerializeToElement(new { english = new string('e', 5000), place = new string('p', 5000) }))!;
        Assert.Equal((ReportNormalizer.MaxEnglish, ReportNormalizer.MaxPlace), (read.English.Length, read.Place.Length));
    }

    [Theory]
    [InlineData("Blue bottle", "Blue water bottle.", "Blue bottle Blue water bottle.")]
    [InlineData("Blue bottle", "blue BOTTLE", null)] // the same words: nothing to add
    [InlineData("Blue bottle", "", null)]
    [InlineData("Blue bottle", null, null)]
    public void Rank_text_is_the_persons_words_plus_the_rendering(string description, string? english, string? expected) =>
        Assert.Equal(expected, ReportNormalizer.RankText(description, english));

    [Theory]
    [InlineData("المكتبة", "library", "المكتبة library")]
    [InlineData("", "library", "library")]
    [InlineData("Library", "library", null)]
    [InlineData("Library", "", null)]
    [InlineData("Library", null, null)]
    public void Rank_location_is_the_persons_place_plus_the_rendering(string location, string? place, string? expected) =>
        Assert.Equal(expected, ReportNormalizer.RankLocation(location, place));

    [Fact]
    public void The_embedded_text_and_the_prescore_use_the_rendering()
    {
        var plain = Input("lost", Arabic, "المكتبة");
        var lost = plain with { RankText = Arabic + " Blue water bottle with a cat sticker.", RankLocation = "المكتبة library" };
        var found = Input("found", "blue water bottle, cat sticker") with { CategoryKey = "Bottles" };

        var embedded = TextRules.EmbeddingText(lost, Aliases).Split('\n');
        Assert.Contains($"description: {Arabic} Blue water bottle with a cat sticker.", embedded);
        Assert.Contains("location: المكتبة library", embedded);
        Assert.Contains(embedded, l => l.StartsWith("location aliases: GU1 Library, library"));
        Assert.DoesNotContain(TextRules.EmbeddingText(plain, Aliases).Split('\n'), l => l.StartsWith("location aliases:"));
        Assert.Contains("gu1", TextRules.ExpandedLocationTokens(lost, Aliases));
        Assert.DoesNotContain("gu1", TextRules.ExpandedLocationTokens(plain, Aliases));

        var before = Prescore.Score(plain, found, 0, Aliases);
        Assert.Equal((0d, 0d, 0d), (before.Text, before.Location, before.Category));
        // Each side on its own: the found report has no rendering and is scored on its own words.
        var after = Prescore.Score(lost, found, 0, Aliases);
        Assert.Equal(0.24, after.Text, 9);        // all five of the found report's words are in the rendering
        Assert.True(after.Location > 0);
        Assert.Equal(0.05, after.Category, 9);    // both read as bottles now
        Assert.Equal(after, Prescore.Score(found, lost, 0, Aliases));
        // The stored category is not replaced: the Match screen's "Same kind of item" line comes from it.
        Assert.Equal(("", "Bottles"), (lost.CategoryKey, lost.RankCategoryKey));
        Assert.Equal("bottles", (Input("lost", "x") with { CategoryKey = "bottles" }).RankCategoryKey);
    }

    [Fact]
    public void The_screen_and_the_reasons_keep_the_persons_own_words()
    {
        var plain = Input("lost", Arabic, "المكتبة");
        var lost = plain with { RankText = Arabic + " Blue water bottle with a zigzag scratch.", RankLocation = "المكتبة library" };
        var found = Input("found", "blue water bottle");

        Assert.Equal(ScreenReviewer.Text(plain, [found]), ScreenReviewer.Text(lost, [found]));
        Assert.Equal(ScreenReviewer.Text(found, [plain]), ScreenReviewer.Text(found, [lost]));
        Assert.Equal(ReasonWriter.Facts(plain, found, null, null, Aliases), ReasonWriter.Facts(lost, found, null, null, Aliases));
        // And the rendering is made from the original, never from an earlier rendering.
        Assert.Equal(ReportNormalizer.Text(plain), ReportNormalizer.Text(lost));
        Assert.Equal(ReportNormalizer.Hash(plain), ReportNormalizer.Hash(lost));
    }

    [Fact]
    public async Task The_alias_line_comes_from_the_places_as_typed()
    {
        var plain = Input("lost", Arabic, "المكتبة");
        var lost = plain with { RankText = Arabic + " Blue water bottle with a zigzag scratch.", RankLocation = "المكتبة library" };

        async Task<string> AliasLine(MatchInput l, MatchInput f)
        {
            var models = new FakeModels();
            await new LunaReviewer(models.Luna, Aliases).ReviewAsync(l, f, [], default);
            return Assert.Single(models.Prompts).Text.Split('\n')[2];
        }

        // The rendered place would name the library; the typed one names nothing.
        Assert.Equal("Location aliases: none", await AliasLine(lost, Input("found", "blue water bottle", "")));
        Assert.Equal("Location aliases: none", await AliasLine(Input("lost", "blue water bottle", "") with { RankLocation = "library" }, Input("found", Arabic, "المكتبة", rankLocation: "المكتبة library")));
        // And a place the other side names is not listed a second time through the rendering.
        Assert.Equal("Location aliases: GU1 Main Building: GU1 Main Building, GU1, main building, main campus building | GU1 Library: GU1 Library, library, 6th floor, sixth floor, gu1 library", await AliasLine(lost, Input("found", "blue water bottle")));
    }

    [Fact]
    public async Task The_plain_luna_fallback_reads_the_persons_own_words()
    {
        var plain = Input("lost", Arabic, "المكتبة");
        var lost = plain with { RankText = Arabic + " Blue water bottle with a zigzag scratch.", RankLocation = "المكتبة library" };
        var found = Input("found", "blue water bottle", "") with { RankText = "blue water bottle Blue flask, zigzag scratch.", RankLocation = "library" };

        var models = new FakeModels();
        Assert.NotNull(await new LunaReviewer(models.Luna, Aliases).ReviewAsync(lost, found, [], default));
        var prompt = Assert.Single(models.Prompts);
        Assert.Equal("match_review", prompt.SchemaName);
        var lines = prompt.Text.Split('\n');
        Assert.Equal($"LOST report: {{\"description\":\"{Arabic}\",\"location\":\"المكتبة\",\"campusZone\":\"\",\"eventDate\":\"2026-11-14\"}}", lines[0]);
        Assert.Equal("FOUND report: {\"description\":\"blue water bottle\",\"location\":\"\",\"campusZone\":\"\",\"eventDate\":\"2026-11-14\"}", lines[1]);
        Assert.Equal("Location aliases: none", lines[2]);
        Assert.DoesNotContain("zigzag", prompt.Text + prompt.System);
        Assert.DoesNotContain("library", prompt.Text);

        // Word for word what it reads without a rendering.
        var before = new FakeModels();
        await new LunaReviewer(before.Luna, Aliases).ReviewAsync(plain, Input("found", "blue water bottle", ""), [], default);
        Assert.Equal(Assert.Single(before.Prompts).Text, prompt.Text);
    }

    [Fact]
    public async Task One_text_only_luna_call()
    {
        var models = new FakeModels { NormalizeAnswer = _ => """{"english":"Blue water bottle with a cat sticker.","place":"library"}""" };
        var result = await Normalizer(models).RenderAsync(Input("lost", Arabic, "المكتبة"), default);

        Assert.Equal(new Rendering("Blue water bottle with a cat sticker.", "library"), result.Rendering);
        var call = Assert.Single(models.NormalizeCalls);
        Assert.Equal(("gpt-6-luna", ReportNormalizer.SystemPrompt, 0), (call.Model, call.System, call.Images));
        Assert.StartsWith("LOST report: {\"description\":\"" + Arabic, call.Text);
        Assert.Empty(models.LunaImages); // the report has a photo; the rendering never gets it
        Assert.Equal(Prices.Luna(300, 0, 60), result.Call!.CostUsd);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task With_the_terra_judge_a_failed_or_unusable_luna_answer_goes_to_deepseek(bool unusable)
    {
        var models = new FakeModels
        {
            NormalizeFails = !unusable,
            NormalizeAnswer = _ => """{"english":"","place":""}""",
            DeepSeekNormalizeAnswer = """{"english":"Blue bottle.","place":""}""",
        };
        var result = await Normalizer(models).RenderAsync(Input("found", Arabic), default);

        Assert.Equal(new Rendering("Blue bottle.", ""), result.Rendering);
        Assert.Equal(DeepSeekChat.Model, result.Call!.Model);
        Assert.Equal(["gpt-6-luna", DeepSeekChat.Model], models.NormalizeCalls.Select(c => c.Model));
        Assert.Equal(ReportNormalizer.SystemPrompt + "\nExample JSON response (illustrative values only): {\"english\":\"Black leather wallet with two cards.\",\"place\":\"library\"}",
            models.NormalizeCalls.Last().System);
        Assert.All(models.NormalizeCalls, c => Assert.Equal(0, c.Images));
    }

    [Fact]
    public async Task When_both_models_fail_there_is_no_rendering_instead_of_an_exception()
    {
        var models = new FakeModels { NormalizeFails = true };
        var result = await Normalizer(models).RenderAsync(Input("lost", Arabic), default);
        Assert.Null(result.Rendering);
        Assert.Null(result.Call);
        Assert.Equal(2, models.NormalizeCalls.Count);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Without_the_terra_judge_it_is_plain_luna(bool fails)
    {
        var models = new FakeModels { NormalizeFails = fails, NormalizeAnswer = _ => """{"english":7}""", DeepSeekNormalizeAnswer = """{"english":"Blue bottle.","place":""}""" };
        var result = await Normalizer(models, terra: false).RenderAsync(Input("lost", Arabic), default);
        Assert.Null(result.Rendering);
        // An unusable answer was still paid for; a failed call was not.
        Assert.Equal(fails, result.Call is null);
        Assert.Equal(["gpt-6-luna"], models.NormalizeCalls.Select(c => c.Model));
    }

    [Fact]
    public async Task Cancellation_is_not_swallowed_as_a_failure()
    {
        using var stop = new CancellationTokenSource();
        stop.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => Normalizer(new FakeModels()).RenderAsync(Input("lost", Arabic), stop.Token));
    }

    [Fact]
    public void The_switch_is_on_unless_configured_off() => Assert.True(new ModelOptions().UseNormalize);

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "benchmark"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }
}

/// <summary>The rendering inside the matching pipeline, on a real database with scripted models.</summary>
public class NormalizeMatchingTests : IClassFixture<TestApp>, IAsyncLifetime
{
    private const string Arabic = "قارورة ماء زرقاء عليها ملصق قطة";
    private const string ArabicPlace = "المكتبة";
    /// <summary>"zigzag" is in no report: it can only come from the rendering.</summary>
    private const string English = "Blue water bottle with a cat sticker and a zigzag scratch.";

    private readonly TestApp app;
    private readonly decimal cap;

    public NormalizeMatchingTests(TestApp app)
    {
        this.app = app;
        cap = Options.DailySpendCapUsd;
    }

    private ModelOptions Options => app.Services.GetRequiredService<IOptions<ModelOptions>>().Value;

    public async Task InitializeAsync()
    {
        app.Models.Reset();
        Options.UseNormalize = true;
        // Arabic reports get the scripted rendering; everything else is answered with its own words.
        app.Models.NormalizeAnswer = text => text.Contains(Arabic) ? Answer(English, "library") : null;
        // Each test looks at its own pair: take the earlier tests' reports out of the pool.
        await using var db = app.Db();
        await db.Reports.ExecuteUpdateAsync(r => r.SetProperty(x => x.Status, ReportStatus.Closed));
    }

    public Task DisposeAsync()
    {
        Options.UseNormalize = true;
        Options.DailySpendCapUsd = cap;
        return Task.CompletedTask;
    }

    private static string Today => DateTime.UtcNow.ToString("yyyy-MM-dd");

    private static string Answer(string english, string place) => JsonSerializer.Serialize(new { english, place });

    private static string Sha(string text, string place) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes($"{text}\n{place}")));

    /// <summary>The Home form: one text box, with a typed place or one picked from the campus list.</summary>
    private static MultipartFormDataContent OneText(string kind, string text, string? typedPlace = null, string? pickedPlace = null, int photos = 0)
    {
        var form = new MultipartFormDataContent { { new StringContent(kind), "kind" }, { new StringContent(text), "text" }, { new StringContent(Today), "eventDate" } };
        if (typedPlace is not null) form.Add(new StringContent(typedPlace), "locationText");
        if (pickedPlace is not null) form.Add(new StringContent(pickedPlace), "locationName");
        for (var i = 0; i < photos; i++)
        {
            var file = new ByteArrayContent(PhotoStoreTests.PhoneJpeg(800, 600));
            file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(file, "photos", $"p{i}.jpg");
        }
        return form;
    }

    private async Task<Guid> Post(HttpClient who, MultipartFormDataContent form)
    {
        var posted = await who.PostAsync("/api/reports", form);
        posted.EnsureSuccessStatusCode();
        return (await Json(posted)).GetProperty("id").GetGuid();
    }

    private async Task<Guid> PostArabicLost(string tag, int photos = 0) =>
        await Post(await app.SignedIn($"owner.{tag}@gutech.edu.om"), OneText("lost", Arabic, typedPlace: ArabicPlace, photos: photos));

    private async Task<Guid> PostEnglishFound(string tag, int photos = 0) =>
        await Post(await app.SignedIn($"finder.{tag}@gutech.edu.om"), OneText("found", "blue water bottle with a cat sticker", pickedPlace: "GU1 Library", photos: photos));

    private async Task Requeue(Guid report)
    {
        using var scope = app.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<MatchQueue>().EnqueueAsync(report, default);
        await app.DrainMatchingAsync();
    }

    /// <summary>The report as the matcher would rank it right now.</summary>
    private async Task<MatchInput> AsRanked(Guid report)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ZarqaDb>();
        return scope.ServiceProvider.GetRequiredService<Matcher>().ToInput(await db.Reports.Include(r => r.Photos).SingleAsync(r => r.Id == report));
    }

    private async Task<List<(JsonElement Payload, ReviewLog Row)>> Rows(Guid report, string step)
    {
        await using var db = app.Db();
        var rows = await db.ReviewLogs.Where(l => l.ReportId == report && l.Step == step).OrderBy(l => l.Id).ToListAsync();
        return [.. rows.Select(r => (JsonDocument.Parse(r.Payload).RootElement, r))];
    }

    private async Task<JsonElement?> Candidate(Guid report, Guid counterpart) =>
        (await Rows(report, "shortlist")).Last().Payload.GetProperty("candidates").EnumerateArray()
            .Where(c => c.GetProperty("id").GetGuid() == counterpart).Select(c => (JsonElement?)c).SingleOrDefault();

    private async Task<bool> Completed(Guid report)
    {
        await using var db = app.Db();
        return await db.MatchJobs.Where(j => j.ReportId == report).AllAsync(j => j.CompletedAt != null && j.LastError == null);
    }

    [Fact]
    public async Task An_arabic_report_is_found_through_its_rendering_while_the_reviewers_read_only_its_own_words()
    {
        var lost = await PostArabicLost("render", photos: 1);
        await app.DrainMatchingAsync();

        // Stored on the report, with the hash of the text and place it was made from.
        string text;
        await using (var db = app.Db())
        {
            var report = await db.Reports.SingleAsync(r => r.Id == lost);
            text = Matcher.MatchText(report);
            Assert.Contains(Arabic, text);
            Assert.Null(report.CategoryNorm); // the keyword category does not read Arabic
            Assert.Equal((English, "library", Sha(text, ArabicPlace)), (report.SearchEnglish, report.SearchPlace, report.SearchHash));
        }
        // The embedded text carries both: the person's words, then the rendering. The place too, and its aliases.
        var embedded = Assert.Single(app.Models.EmbeddedTexts).Split('\n');
        Assert.Contains($"description: {text} {English}", embedded);
        Assert.Contains($"location: {ArabicPlace} library", embedded);
        Assert.Contains(embedded, l => l.StartsWith("location aliases: GU1 Library, library"));

        // An English counterpart now finds it: the stored rendering is used when the Arabic report is the candidate.
        var found = await PostEnglishFound("render", photos: 1);
        await app.DrainMatchingAsync();
        var candidate = await Candidate(found, lost);
        Assert.NotNull(candidate);
        Assert.Equal(0.24, candidate.Value.GetProperty("text").GetDouble(), 9);
        Assert.Equal(0.05, candidate.Value.GetProperty("category").GetDouble(), 9);
        Assert.True(candidate.Value.GetProperty("location").GetDouble() > 0);
        Assert.True(candidate.Value.GetProperty("cosine").GetDouble() > 0.4);
        Assert.True(await Completed(lost) && await Completed(found));

        // One text-only call per report, each on that report's own words.
        Assert.Equal(2, app.Models.NormalizeCalls.Count);
        Assert.All(app.Models.NormalizeCalls, c => Assert.Equal(("gpt-6-luna", ReportNormalizer.SystemPrompt, 0), (c.Model, c.System, c.Images)));
        Assert.Equal("LOST report: " + JsonSerializer.Serialize(new { description = text, place = ArabicPlace }, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }),
            app.Models.NormalizeCalls.First().Text);
        Assert.StartsWith("FOUND report: {\"description\":\"", app.Models.NormalizeCalls.Last().Text);
        Assert.EndsWith(",\"place\":\"GU1 Library\"}", app.Models.NormalizeCalls.Last().Text);

        // The advocates (with the photos), the judge and the reasons got the original words only.
        var reviewing = app.Models.Prompts.Where(p => p.SchemaName != ReportNormalizer.SchemaName).ToList();
        foreach (var name in new[] { "advocate_for", "advocate_against", "debate_judge", "match_reasons" })
        {
            var prompt = Assert.Single(reviewing, p => p.SchemaName == name);
            Assert.Contains(JsonEncodedText.Encode(text, System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping).ToString(), prompt.Text);
            Assert.Contains($"\"location\":\"{ArabicPlace}\"", prompt.Text);
        }
        Assert.All(reviewing, p => Assert.DoesNotContain("zigzag", p.Text + p.System));
        Assert.All(reviewing, p => Assert.DoesNotContain($"{ArabicPlace} library", p.Text));
        // The alias line names the found report's place only ("GU1" is also the main building): the Arabic one has no alias of its own.
        foreach (var name in new[] { "advocate_for", "advocate_against" })
            Assert.Equal("Location aliases: GU1 Main Building: GU1 Main Building, GU1, main building, main campus building | GU1 Library: GU1 Library, library, 6th floor, sixth floor, gu1 library", reviewing.Single(p => p.SchemaName == name).Text.Split('\n')[2]);
        Assert.Contains(app.Models.LunaCalls, c => c.SchemaName.StartsWith("advocate_") && c.Images == 2);

        // Matched, and nothing a person sees carries the rendering.
        await using var check = app.Db();
        var match = await check.Matches.SingleAsync(m => m.LostId == lost && m.FoundId == found);
        Assert.DoesNotContain(match.Reasons, r => r.StartsWith("Same kind of item") || r.StartsWith("Same spot") || r.Contains("zigzag"));
        var owner = await app.SignedIn("owner.render@gutech.edu.om");
        foreach (var url in new[] { "/api/reports/mine", $"/api/reports/{lost}", $"/api/matches/{match.Id}", "/api/home" })
        {
            var body = await (await owner.GetAsync(url)).Content.ReadAsStringAsync();
            Assert.DoesNotContain("zigzag", body);
            Assert.DoesNotContain("searchEnglish", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("searchPlace", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("searchHash", body, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task The_screen_reads_the_original_words_too_and_the_rendering_ranks_a_new_arabic_report()
    {
        // Eleven finders, so the screen runs when the Arabic report comes in.
        var found = new Guid[11];
        for (var i = 0; i < found.Length; i++)
            found[i] = await Post(await app.SignedIn($"finder.crowd.{i}@gutech.edu.om"),
                OneText("found", $"blue water bottle with a cat sticker, mark{i:00}", pickedPlace: "GU1 Library"));
        await app.DrainMatchingAsync();
        app.Models.ScreenCalls.Clear();
        app.Models.Prompts.Clear();

        var lost = await PostArabicLost("crowd");
        await app.DrainMatchingAsync();

        var shortlist = (await Rows(lost, "shortlist")).Single().Payload;
        Assert.Equal(11, shortlist.GetProperty("passed").GetInt32());
        Assert.All(shortlist.GetProperty("candidates").EnumerateArray(), c => Assert.True(c.GetProperty("text").GetDouble() > 0.19));
        var screen = Assert.Single(app.Models.ScreenCalls);
        Assert.Equal(0, screen.Images);
        Assert.StartsWith("LOST report: {\"description\":\"" + Arabic, screen.Text);
        Assert.Contains($"\"location\":\"{ArabicPlace}\"", screen.Text);
        Assert.DoesNotContain("zigzag", screen.Text);
        Assert.All(app.Models.Prompts.Where(p => p.SchemaName != ReportNormalizer.SchemaName), p => Assert.DoesNotContain("zigzag", p.Text));
        Assert.Equal(20, app.Models.Prompts.Count(p => p.SchemaName.StartsWith("advocate_")));
    }

    [Fact]
    public async Task Rendered_once_and_again_only_after_the_text_or_the_place_is_edited()
    {
        var n = 0;
        app.Models.NormalizeAnswer = _ => Answer($"Grey umbrella, rendering {++n}.", "canteen");
        var owner = await app.SignedIn("owner.edit@gutech.edu.om");
        var lost = await Post(owner, OneText("lost", "مظلة رمادية", typedPlace: "المقصف"));
        await app.DrainMatchingAsync();
        Assert.Single(app.Models.NormalizeCalls);
        var first = await AsRanked(lost);
        Assert.Equal($"{first.Description} Grey umbrella, rendering 1.", first.RankText);
        Assert.Equal("المقصف canteen", first.RankLocation);

        // Nothing changed: later runs make no call.
        await Requeue(lost);
        await Requeue(lost);
        Assert.Single(app.Models.NormalizeCalls);
        Assert.Single(await Rows(lost, "normalize"));
        Assert.Equal(3, (await Rows(lost, "embed")).Count);

        // An edited text: the old rendering is ignored at once, and the next run renders again.
        var edited = await owner.PatchAsync($"/api/reports/{lost}", JsonContent.Create(new { text = "مظلة رمادية بيد خشبية" }));
        edited.EnsureSuccessStatusCode();
        Assert.DoesNotContain("rendering", await edited.Content.ReadAsStringAsync());
        var stale = await AsRanked(lost);
        Assert.Null(stale.RankText);
        Assert.Null(stale.RankLocation);
        await app.DrainMatchingAsync();
        Assert.Equal(2, app.Models.NormalizeCalls.Count);
        Assert.Contains("بيد خشبية", app.Models.NormalizeCalls.Last().Text);
        var second = await AsRanked(lost);
        Assert.Equal($"{second.Description} Grey umbrella, rendering 2.", second.RankText);
        await using (var db = app.Db())
        {
            var report = await db.Reports.SingleAsync(r => r.Id == lost);
            Assert.Equal(("Grey umbrella, rendering 2.", "canteen", Sha(second.Description, "المقصف")), (report.SearchEnglish, report.SearchPlace, report.SearchHash));
        }

        // An edited place counts as well.
        (await owner.PatchAsync($"/api/reports/{lost}", JsonContent.Create(new { locationText = "الكافتيريا" }))).EnsureSuccessStatusCode();
        await app.DrainMatchingAsync();
        Assert.Equal(3, app.Models.NormalizeCalls.Count);
        Assert.EndsWith(",\"place\":\"الكافتيريا\"}", app.Models.NormalizeCalls.Last().Text);
        Assert.Equal("الكافتيريا canteen", (await AsRanked(lost)).RankLocation);

        // A date edit does not: the rendering is about the text and the place.
        (await owner.PatchAsync($"/api/reports/{lost}", JsonContent.Create(new { eventDate = DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-dd") }))).EnsureSuccessStatusCode();
        await app.DrainMatchingAsync();
        Assert.Equal(3, app.Models.NormalizeCalls.Count);
        Assert.True(await Completed(lost));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_failed_or_unusable_rendering_stores_nothing_and_the_job_completes_on_the_original_text(bool unusable)
    {
        // Luna and the DeepSeek fallback both fail, or both answer without a rendering.
        app.Models.NormalizeFails = !unusable;
        app.Models.NormalizeAnswer = _ => """{"english":"","place":"library"}""";
        if (unusable) app.Models.DeepSeekNormalizeAnswer = """{"english":42,"place":"library"}""";
        var tag = unusable ? "unusable" : "down";
        var lost = await Post(await app.SignedIn($"owner.{tag}@gutech.edu.om"), OneText("lost", "blue water bottle, cat sticker, small dent", pickedPlace: "GU1 Library"));
        var found = await PostEnglishFound(tag);
        await app.DrainMatchingAsync();

        Assert.Equal(["gpt-6-luna", DeepSeekChat.Model, "gpt-6-luna", DeepSeekChat.Model], app.Models.NormalizeCalls.Select(c => c.Model));
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(),
                r => Assert.Null(r.SearchEnglish ?? r.SearchPlace ?? r.SearchHash));
            // Not retried because of the rendering: one attempt each, done, and the pair was reviewed on the original text.
            Assert.All(await db.MatchJobs.Where(j => j.ReportId == lost || j.ReportId == found).ToListAsync(),
                j => Assert.True(j is { CompletedAt: not null, Attempts: 1, LastError: null }));
            Assert.True(await db.Matches.AnyAsync(m => m.LostId == lost && m.FoundId == found));
        }
        Assert.All(app.Models.EmbeddedTexts, t => Assert.Contains("description: blue water bottle", t));
        var row = Assert.Single(await Rows(lost, "normalize"));
        Assert.False(row.Payload.GetProperty("rendered").GetBoolean());
        Assert.Equal(JsonValueKind.Null, row.Payload.GetProperty("model").ValueKind);
        Assert.Equal(0m, row.Row.CostUsd);

        // Nothing was stored, so a later run tries again.
        app.Models.NormalizeFails = false;
        app.Models.NormalizeAnswer = _ => Answer("Blue water bottle with a cat sticker and a small dent.", "GU1 Library");
        await Requeue(lost);
        Assert.Equal(5, app.Models.NormalizeCalls.Count);
        await using var later = app.Db();
        Assert.Equal("Blue water bottle with a cat sticker and a small dent.", (await later.Reports.SingleAsync(r => r.Id == lost)).SearchEnglish);
        Assert.True((await Rows(lost, "normalize")).Last().Payload.GetProperty("rendered").GetBoolean());
    }

    [Fact]
    public async Task When_luna_fails_the_deepseek_rendering_is_stored()
    {
        app.Models.NormalizeFails = true;
        app.Models.DeepSeekNormalizeAnswer = Answer(English, "library");
        var lost = await PostArabicLost("deepseek");
        await app.DrainMatchingAsync();

        await using var db = app.Db();
        Assert.Equal(English, (await db.Reports.SingleAsync(r => r.Id == lost)).SearchEnglish);
        var row = Assert.Single(await Rows(lost, "normalize"));
        Assert.Equal(DeepSeekChat.Model, row.Payload.GetProperty("model").GetString());
        Assert.Equal(Prices.DeepSeek(300, 0, 60), row.Row.CostUsd);
    }

    [Fact]
    public async Task Switched_off_nothing_is_called_and_stored_renderings_are_ignored()
    {
        Options.UseNormalize = false;
        var lost = await PostArabicLost("off");
        var found = await PostEnglishFound("off");
        await app.DrainMatchingAsync();

        Assert.Empty(app.Models.NormalizeCalls);
        Assert.Empty(await Rows(lost, "normalize"));
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(),
                r => Assert.Null(r.SearchEnglish ?? r.SearchPlace ?? r.SearchHash));
            // As before the rendering: the two share no word, so the pair never reaches a reviewer.
            Assert.False(await db.ReviewLogs.AnyAsync(l => l.Step == "review" && (l.ReportId == lost || l.ReportId == found)));
        }
        Assert.True(await Completed(lost) && await Completed(found));
        Assert.Null(await Candidate(found, lost));

        // Switched on, the next run renders it and the pair is reviewed.
        Options.UseNormalize = true;
        await Requeue(lost);
        Assert.Single(app.Models.NormalizeCalls);
        Assert.NotNull(await Candidate(lost, found));
        Assert.NotNull((await AsRanked(lost)).RankText);
        await using (var db = app.Db())
            Assert.True(await db.Matches.AnyAsync(m => m.LostId == lost && m.FoundId == found));

        // Off again: the stored rendering stays in the database but is not used.
        Options.UseNormalize = false;
        app.Models.EmbeddedTexts.Clear();
        var ranked = await AsRanked(lost);
        Assert.Null(ranked.RankText ?? ranked.RankLocation);
        Assert.Equal("", ranked.RankCategoryKey);
        await Requeue(lost);
        Assert.Single(app.Models.NormalizeCalls);
        Assert.DoesNotContain("zigzag", Assert.Single(app.Models.EmbeddedTexts));
        await using var kept = app.Db();
        Assert.Equal(English, (await kept.Reports.SingleAsync(r => r.Id == lost)).SearchEnglish);
    }

    [Fact]
    public async Task The_call_is_logged_with_its_cost_and_counts_towards_the_daily_spend_cap()
    {
        await using (var db = app.Db())
            await db.ReviewLogs.ExecuteDeleteAsync();
        var first = await PostArabicLost("cost", photos: 1);
        await app.DrainMatchingAsync();

        var row = Assert.Single(await Rows(first, "normalize"));
        Assert.Equal(Prices.Luna(300, 0, 60), row.Row.CostUsd);
        Assert.Equal(3, row.Row.LatencyMs);
        Assert.Null(row.Row.CounterpartId);
        Assert.True(row.Payload.GetProperty("rendered").GetBoolean());
        Assert.Equal("gpt-6-luna", row.Payload.GetProperty("model").GetString());
        Assert.Equal((300, 60), (row.Payload.GetProperty("tokens").GetProperty("in").GetInt32(), row.Payload.GetProperty("tokens").GetProperty("out").GetInt32()));
        // The log keeps the numbers, not the person's text: that lives on the report and is deleted with it.
        Assert.DoesNotContain("zigzag", row.Row.Payload);
        Assert.Empty(app.Models.LunaImages);
        Assert.Equal(0, Assert.Single(app.Models.NormalizeCalls).Images);

        // With the cap at exactly what the rendering cost, the next report waits and nothing more is spent.
        Options.DailySpendCapUsd = Prices.Luna(300, 0, 60);
        var second = await PostArabicLost("cost2");
        await app.DrainMatchingAsync();
        Assert.Single(app.Models.NormalizeCalls);
        await using var check = app.Db();
        Assert.Null((await check.MatchJobs.SingleAsync(j => j.ReportId == second)).CompletedAt);
        Assert.Null((await check.Reports.SingleAsync(r => r.Id == second)).SearchHash);
    }

    [Fact]
    public async Task Sample_data_is_never_rendered_and_a_rendered_report_deletes_cleanly()
    {
        var admin = await app.SignedIn("admin@gutech.edu.om");
        (await admin.PostAsync("/api/admin/sample", null)).EnsureSuccessStatusCode();
        Guid sample;
        await using (var db = app.Db())
            sample = await db.Reports.Where(r => r.User!.Email.EndsWith(SampleData.EmailSuffix) && r.Status == ReportStatus.Open).Select(r => r.Id).FirstAsync();
        await Requeue(sample);
        Assert.Empty(app.Models.NormalizeCalls);
        await using (var db = app.Db())
            Assert.False(await db.Reports.AnyAsync(r => r.User!.Email.EndsWith(SampleData.EmailSuffix) && r.SearchHash != null));

        // A rendered report is deleted like any other, rendering included.
        var lost = await PostArabicLost("leaving");
        await app.DrainMatchingAsync();
        await using (var db = app.Db())
            Assert.NotNull((await db.Reports.SingleAsync(r => r.Id == lost)).SearchEnglish);
        var owner = await app.SignedIn("owner.leaving@gutech.edu.om");
        (await owner.DeleteAsync($"/api/reports/{lost}")).EnsureSuccessStatusCode();
        await using var gone = app.Db();
        Assert.False(await gone.Reports.AnyAsync(r => r.Id == lost));
    }
}
