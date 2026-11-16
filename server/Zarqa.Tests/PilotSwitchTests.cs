using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Zarqa.Api.Matching;

namespace Zarqa.Tests;

/// <summary>
/// The three matching switches from the 2026-11-15/16 benchmark work: the judge sees the photos, the one-day date
/// note, and the posting day. All are off by default; these tests pin what each one adds and that the wording is
/// the benchmark's, word for word (the measured results belong to that exact text).
/// </summary>
public class PilotSwitchTests
{
    private const string Image = "data:image/jpeg;base64,cGhvdG8=";

    private sealed record Call(string Stage, string System, string Text, int Images);

    private static async Task<List<Call>> DebateAsync(ModelOptions settings, MatchInput lost, MatchInput found)
    {
        settings.OpenAiApiKey = "fake-key";
        var options = Options.Create(settings);
        var calls = new ConcurrentBag<Call>();
        using var http = new HttpClient(new Scripted(body =>
        {
            var system = body["messages"]![0]!["content"]!.GetValue<string>();
            var content = body["messages"]![1]!["content"]!.AsArray();
            var judge = system.StartsWith("You are the judge");
            calls.Add(new Call(judge ? "judge" : system.StartsWith("You are the advocate FOR") ? "for" : "against",
                system, content[0]!["text"]!.GetValue<string>(), content.Count - 1));
            return judge
                ? """{"same_item_probability":0.6,"stronger_case":"for","overall_probabilities":{"clearly_different":0,"probably_different":0,"unclear":0.2,"probably_same":0.6,"almost_certainly_same":0.2}}"""
                : """{"argument":"Photo clue","strength":"moderate"}""";
        }));
        var reviewer = new DebateReviewer(new OpenAiLuna(http, options), new OpenAiTerra(http, options), new DeepSeekChat(http, options),
            new TypeSafeJev(http, options), new AliasIndex([]), options, NullLogger<DebateReviewer>.Instance);
        Assert.NotNull(await reviewer.ReviewAsync(lost, found, [Image], default));
        return [.. calls];
    }

    private static MatchInput Lost(string? date = null, DateTimeOffset? posted = null) =>
        new(Guid.NewGuid(), "lost", "", "", "", "Lost blue bottle today", "Library", "", date, false, [], CreatedAt: posted);

    private static MatchInput Found(string? date = null, DateTimeOffset? posted = null) =>
        new(Guid.NewGuid(), "found", "", "", "", "Blue bottle with sticker", "Library", "", date, false, [typeof(PilotSwitchTests).Assembly.Location], CreatedAt: posted);

    [Fact]
    public async Task With_every_switch_off_nothing_is_added()
    {
        var calls = await DebateAsync(new ModelOptions(), Lost("2026-11-06", DateTimeOffset.Parse("2026-11-06T08:00:00Z")), Found("2026-11-05", DateTimeOffset.Parse("2026-11-05T08:00:00Z")));
        var judge = calls.Single(c => c.Stage == "judge");
        Assert.Equal(0, judge.Images);
        Assert.DoesNotContain("photos are attached", judge.System);
        Assert.EndsWith("}", judge.Text); // the state object and nothing after it
        foreach (var c in calls)
        {
            Assert.DoesNotContain("postedOn", c.Text);
            Assert.DoesNotContain("Dates:", c.Text);
        }
    }

    [Fact]
    public async Task Judge_sees_the_same_photos_as_the_advocates_when_switched_on()
    {
        var calls = await DebateAsync(new ModelOptions { JudgeSeesPhotos = true }, Lost(), Found());
        var judge = calls.Single(c => c.Stage == "judge");
        Assert.Equal(1, judge.Images);
        Assert.Equal(calls.Single(c => c.Stage == "for").Images, judge.Images);
        Assert.EndsWith(DebateReviewer.PhotosForJudge, judge.System);
        Assert.EndsWith("\nAttached photos: 1, all taken by the finder of the FOUND item. The LOST report has no photo: what the owner lost is known only from the LOST report's words.", judge.Text);
        // The advocates are untouched by this switch.
        Assert.All(calls.Where(c => c.Stage != "judge"), c => Assert.EndsWith("Attached photos: 0 from the LOST report first, then 1 from the FOUND report.", c.Text));
    }

    [Theory]
    [InlineData("2026-11-06", "2026-11-05", true)]  // found exactly one calendar day before lost
    [InlineData("2026-11-06", "2026-11-04", false)] // two days: the owner's open question, left as it is
    [InlineData("2026-11-06", "2026-11-06", false)]
    [InlineData("2026-11-05", "2026-11-06", false)] // found the day after
    [InlineData(null, "2026-11-05", false)]
    [InlineData("2026-11-06", null, false)]
    public async Task One_day_note_is_added_only_for_a_found_date_exactly_one_day_early(string? lostDate, string? foundDate, bool expected)
    {
        Assert.Equal(expected, TextRules.FoundOneDayBeforeLost(Lost(lostDate), Found(foundDate)));
        var calls = await DebateAsync(new ModelOptions { OneDayNote = true }, Lost(lostDate), Found(foundDate));
        foreach (var advocate in calls.Where(c => c.Stage != "judge"))
        {
            if (expected) Assert.EndsWith("\n" + TextRules.OneDayText, advocate.Text);
            else Assert.DoesNotContain("Dates:", advocate.Text);
        }
        Assert.DoesNotContain("Dates:", calls.Single(c => c.Stage == "judge").Text); // the judge is unchanged
    }

    [Fact]
    public async Task Posting_day_reaches_the_advocates_the_judge_and_the_screen()
    {
        // 21:30 UTC on Thursday is already Friday in Oman (UTC+4).
        var lost = Lost(posted: DateTimeOffset.Parse("2026-11-12T08:41:08Z"));
        var found = Found("2026-11-12", DateTimeOffset.Parse("2026-11-12T21:30:00Z"));
        Assert.Equal("2026-11-12 Thursday", TextRules.PostedOn(lost));
        Assert.Equal("2026-11-13 Friday", TextRules.PostedOn(found));
        Assert.Null(TextRules.PostedOn(Lost()));

        var calls = await DebateAsync(new ModelOptions { PostedOn = true }, lost, found);
        foreach (var advocate in calls.Where(c => c.Stage != "judge"))
        {
            Assert.Contains("\"eventDate\":null,\"postedOn\":\"2026-11-12 Thursday\"}", advocate.Text);
            Assert.Contains("\"eventDate\":\"2026-11-12\",\"postedOn\":\"2026-11-13 Friday\"}\n" + TextRules.PostedNote + "\nLocation aliases: ", advocate.Text);
        }
        var judge = calls.Single(c => c.Stage == "judge");
        Assert.EndsWith("}\n" + TextRules.PostedNote, judge.Text);
        Assert.Equal("2026-11-13 Friday", JsonNode.Parse(judge.Text[..judge.Text.LastIndexOf('\n')])!["found"]!["postedOn"]!.GetValue<string>());

        var screen = ScreenReviewer.Text(lost, [found], postedOn: true);
        Assert.Contains("\"postedOn\":\"2026-11-12 Thursday\"}", screen);
        Assert.EndsWith("\"postedOn\":\"2026-11-13 Friday\"}\n" + TextRules.PostedNote, screen);
        Assert.DoesNotContain("postedOn", ScreenReviewer.Text(lost, [found]));
    }

    [Fact]
    public void Wording_is_the_benchmarks_word_for_word()
    {
        var root = RepoRoot();
        var text = File.ReadAllText(Path.Combine(root, "benchmark", "src", "text.js"));
        Assert.Equal(TextRules.PostedNote, JsString(text, "POSTED_NOTE"));
        Assert.Equal(TextRules.OneDayText, JsString(text, "ONE_DAY_TEXT"));

        var debate = File.ReadAllText(Path.Combine(root, "benchmark", "src", "reviewers", "debate.js"));
        Assert.Contains($"const PHOTOS_FOR_JUDGE = JUDGE_PHOTOS ? \"{DebateReviewer.PhotosForJudge.Replace("\n", "\\n")}\" : \"\";", debate);
        // ownerLine's four cases, with the counts filled in the way the template literals do.
        foreach (var (l, f) in new[] { (0, 0), (0, 1), (2, 0), (1, 2) })
        {
            var line = Photos.OwnerLine(l, f);
            var template = line.Replace((l + f).ToString(), "${lostCount + foundCount}");
            if (l == 0 && f == 0) Assert.Contains($"\"{line}\"", debate);
            else if (l == 0) Assert.Contains("`" + line.Replace("1,", "${foundCount},") + "`", debate);
            else if (f == 0) Assert.Contains("`" + line.Replace("2,", "${lostCount},") + "`", debate);
            else Assert.Contains("`Attached photos: ${lostCount + foundCount}. The first ${lostCount} are from the owner and show the LOST item; the next ${foundCount} were taken by the finder and show the FOUND item.`", debate);
            _ = template;
        }
        Assert.Equal("Attached photos: 3. The first 1 are from the owner and show the LOST item; the next 2 were taken by the finder and show the FOUND item.", Photos.OwnerLine(1, 2));
    }

    /// <summary>The value of `export const NAME = '…';` in a benchmark file, with \' unescaped.</summary>
    private static string JsString(string js, string name)
    {
        var m = Regex.Match(js, $@"export const {name} =\s*'((?:\\'|[^'])*)';");
        Assert.True(m.Success, $"{name} not found in the benchmark");
        return m.Groups[1].Value.Replace("\\'", "'");
    }

    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "benchmark"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }

    private sealed class Scripted(Func<JsonObject, string> answer) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!.AsObject();
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { choices = new[] { new { message = new { content = answer(body) } } } }) };
        }
    }
}
