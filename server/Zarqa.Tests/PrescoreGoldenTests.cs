using System.Text.Json;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;

namespace Zarqa.Tests;

/// <summary>
/// The C# matcher must compute exactly what the benchmark computed, or the benchmark's recall
/// numbers don't apply to the app. Fixture: benchmark/scripts/export-prescore-fixture.js.
/// </summary>
public class PrescoreGoldenTests
{
    private static readonly JsonElement Fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "prescore-golden.json"))).RootElement;
    private static readonly AliasIndex Aliases = new(Seeder.LoadLocations().Select(kv => (kv.Key, kv.Value)));

    private static readonly Dictionary<string, (MatchInput Input, double[] Vector, JsonElement Raw)> Reports =
        Fixture.GetProperty("reports").EnumerateArray().ToDictionary(r => r.GetProperty("id").GetString()!, r =>
        {
            var category = r.GetProperty("category").GetString() ?? "";
            var input = new MatchInput(Guid.NewGuid(), r.GetProperty("type").GetString()!, r.GetProperty("title").GetString() ?? "", category, category,
                r.GetProperty("description").GetString() ?? "", r.GetProperty("location").GetString() ?? "", r.GetProperty("campusZone").GetString() ?? "",
                r.GetProperty("eventDate").GetString(), false, []);
            return (input, r.GetProperty("vector").EnumerateArray().Select(v => v.GetDouble()).ToArray(), r);
        });

    private static string[] Strings(JsonElement e) => e.EnumerateArray().Select(x => x.GetString()!).ToArray();

    [Fact]
    public void Tokens_location_tokens_and_embedding_text_match_the_benchmark()
    {
        foreach (var (id, (input, _, raw)) in Reports)
        {
            Assert.True(Strings(raw.GetProperty("tokens")).SequenceEqual(TextRules.Tokens($"{input.Title} {input.Description}")), $"tokens {id}");
            Assert.True(Strings(raw.GetProperty("locationTokens")).SequenceEqual(TextRules.ExpandedLocationTokens(input, Aliases)), $"location tokens {id}");
            Assert.Equal(raw.GetProperty("embeddingText").GetString(), TextRules.EmbeddingText(input, Aliases));
        }
    }

    [Fact]
    public void Preliminary_scores_match_the_benchmark()
    {
        var pairs = Fixture.GetProperty("pairs").EnumerateArray().ToList();
        Assert.True(pairs.Count > 300);
        foreach (var p in pairs)
        {
            var (lost, lv, _) = Reports[p.GetProperty("lostId").GetString()!];
            var (found, fv, _) = Reports[p.GetProperty("foundId").GetString()!];
            var r = Prescore.Score(lost, found, Prescore.Cosine(lv, fv), Aliases);
            var parts = p.GetProperty("parts");
            var label = $"{p.GetProperty("lostId")}×{p.GetProperty("foundId")}";
            Assert.True(Math.Abs(p.GetProperty("cosine").GetDouble() - r.Cosine) < 1e-9, $"cosine {label}");
            Assert.True(Math.Abs(parts.GetProperty("category").GetDouble() - r.Category) < 1e-9, $"category {label}");
            Assert.True(Math.Abs(parts.GetProperty("text").GetDouble() - r.Text) < 1e-9, $"text {label}");
            Assert.True(Math.Abs(parts.GetProperty("location").GetDouble() - r.Location) < 1e-9, $"location {label}");
            Assert.True(Math.Abs(parts.GetProperty("date").GetDouble() - r.Date) < 1e-9, $"date {label}");
            Assert.True(Math.Abs(p.GetProperty("score").GetDouble() - r.Score) < 1e-9, $"score {label}");
            Assert.Equal(p.GetProperty("dateRelation").GetString(), TextRules.DateRelation(lost, found));
        }
    }
}

public class OneTextPrescoreTests
{
    private static readonly AliasIndex Aliases = new(Zarqa.Api.Data.Seeder.LoadLocations().Select(kv => (kv.Key, kv.Value)));

    private static MatchInput One(string text, string category = "") =>
        new(Guid.NewGuid(), "lost", "", category, category, text, "GU1 Library", "", "2026-09-01", false, []);

    [Fact]
    public void One_text_reports_put_the_whole_text_weight_on_the_text()
    {
        var a = One("blue metal bottle with a cat sticker", "Bottles");
        var b = One("blue metal bottle, cat sticker", "Bottles");
        var r = Prescore.Score(a, b, 0.5, Aliases);
        // Every token of the shorter text is shared, so the overlap is 1 and the text term is the full 0.24.
        Assert.Equal(0.24, r.Text, 10);
        Assert.Equal(0.05, r.Category, 10);
        Assert.Equal(Math.Min(1, 0.5 + 0.05 + 0.24 + 0.08 + 0.04), r.Score, 10);
    }

    [Fact]
    public void Older_reports_fold_their_name_into_the_match_text()
    {
        var report = new Zarqa.Api.Data.Report { Title = "Blue bottle", CategoryText = "Bottles", LocationText = "", Description = "metal, cat sticker" };
        Assert.Equal("Blue bottle. metal, cat sticker", Matcher.MatchText(report));
        report.Description = "Blue bottle, metal, cat sticker";
        Assert.Equal("Blue bottle, metal, cat sticker", Matcher.MatchText(report));
    }
}
