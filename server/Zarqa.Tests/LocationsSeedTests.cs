using Zarqa.Api.Data;

namespace Zarqa.Tests;

public class LocationsSeedTests
{
    [Fact]
    public void Seed_copy_matches_the_benchmark_campus_map()
    {
        var repoRoot = FindRepoRoot();
        var benchmark = File.ReadAllText(Path.Combine(repoRoot, "benchmark", "data", "campus", "locations.json"));
        var seed = File.ReadAllText(Path.Combine(repoRoot, "server", "Zarqa.Api", "Data", "Seed", "locations.json"));
        Assert.Equal(benchmark.ReplaceLineEndings(), seed.ReplaceLineEndings());
    }

    [Fact]
    public void Loads_locations_and_skips_the_note()
    {
        var locations = Seeder.LoadLocations();
        Assert.DoesNotContain("_note", locations.Keys);
        Assert.Contains("library", locations["GU1 Library"]);
        // Bare floor names are excluded on purpose: several places share them.
        Assert.DoesNotContain(locations.Values.SelectMany(a => a), a => a == "2nd floor");
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "benchmark"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root not found");
    }
}
