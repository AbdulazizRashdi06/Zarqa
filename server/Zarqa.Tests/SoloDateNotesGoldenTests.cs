using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;

namespace Zarqa.Tests;

/// <summary>
/// The date notes were accepted on outside set 5 as the benchmark sent them (decisions.md, 2026-11-19). The app must
/// send the same bytes, or that result does not apply to it. Fixture: benchmark/scripts/export-solo-dates-fixture.mjs,
/// which records the accepted arm's system text and pair text for every found-first pair of set 5 and for forty
/// pairs outside the gate.
/// </summary>
public class SoloDateNotesGoldenTests : IDisposable
{
    private static readonly JsonElement Fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "solo-date-notes-golden.json"))).RootElement;
    // The benchmark matches place names as whole words (ModelOptions.WholeWordPlaces); so does this comparison.
    private static readonly AliasIndex Aliases = new(Seeder.LoadLocations().Select(kv => (kv.Key, kv.Value)), wholeWords: true);
    private readonly string photo = Path.GetTempFileName(); // the set's photos are not in the repository; only their number matters here

    public void Dispose() => File.Delete(photo);

    private static string Sha(string s) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(s)));

    private MatchInput Input(string type, JsonElement r) => new(
        Guid.NewGuid(), type, "", "", "", r.GetProperty("description").GetString()!, r.GetProperty("location").GetString() ?? "", "",
        r.GetProperty("eventDate").GetString(), false, Enumerable.Repeat(photo, r.GetProperty("photos").GetInt32()).ToList(),
        CreatedAt: r.GetProperty("createdAt").GetString() is { } t ? DateTimeOffset.Parse(t, System.Globalization.CultureInfo.InvariantCulture) : null);

    [Fact]
    public void Whole_word_places_stop_the_girls_residence_from_also_matching_the_boys_dorms()
    {
        var seed = Seeder.LoadLocations().Select(kv => (kv.Key, kv.Value)).ToList();
        Assert.Contains(new AliasIndex(seed).Match("Female Residences"), g => g.Canonical == "Boys Dorms"); // the older rule, still the default
        Assert.Equal(["Female Residences"], Aliases.Match("Female Residences").Select(g => g.Canonical));
        Assert.Equal(["Boys Dorms"], Aliases.Match("male residences").Select(g => g.Canonical));
    }

    [Fact]
    public void Both_system_texts_are_the_benchmarks_byte_for_byte()
    {
        Assert.Equal(Fixture.GetProperty("baseSystemSha256").GetString(), Sha(SoloReviewer.System));
        Assert.Equal(Fixture.GetProperty("datedSystem").GetString(), SoloReviewer.DatedSystem);
        Assert.Equal(Fixture.GetProperty("datedSystemSha256").GetString(), Sha(SoloReviewer.DatedSystem));
    }

    [Fact]
    public void Every_recorded_pair_is_sent_exactly_as_the_accepted_arm_sent_it()
    {
        var on = new ModelOptions { OpusDateNotes = true };
        int dated = 0, threeOrMore = 0, others = 0;
        foreach (var c in Fixture.GetProperty("cases").EnumerateArray())
        {
            var lost = Input("lost", c.GetProperty("lost"));
            var found = Input("found", c.GetProperty("found"));
            var (system, text) = SoloReviewer.Prompt(lost, found, on, Aliases);
            Assert.Equal(c.GetProperty("text").GetString(), text);
            var isDated = c.GetProperty("dated").GetBoolean();
            Assert.Equal(isDated ? SoloReviewer.DatedSystem : SoloReviewer.System, system);
            // A prompt never holds both the old sentence and a note.
            Assert.NotEqual(system.Contains("cannot be found before it was lost"), text.Contains("\nDates: the FOUND date is "));
            if (isDated) dated++;
            else
            {
                // Outside the gate the switch changes nothing.
                Assert.Equal(SoloReviewer.Prompt(lost, found, new ModelOptions(), Aliases), (system, text));
                if (c.GetProperty("gapDays").ValueKind == JsonValueKind.Number && c.GetProperty("gapDays").GetInt32() >= 3) threeOrMore++; else others++;
            }
        }
        // Set 5 holds 64 found-first pairs: 39 at one or two days, 25 at three days or more.
        Assert.Equal((39, 25, 40), (dated, threeOrMore, others));
    }
}
