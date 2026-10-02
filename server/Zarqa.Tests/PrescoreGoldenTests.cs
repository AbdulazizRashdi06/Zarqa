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
