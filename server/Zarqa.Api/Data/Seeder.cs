using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Zarqa.Api.Data;

public static class Seeder
{
    /// <summary>Applies migrations and upserts the campus locations. Runs once at startup.</summary>
    public static async Task MigrateAndSeedAsync(IServiceProvider services, CancellationToken ct = default)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ZarqaDb>();
        await db.Database.MigrateAsync(ct);
        await SeedLocationsAsync(db, ct);
    }

    /// <summary>Upserts the campus-map locations.</summary>
    public static async Task SeedLocationsAsync(ZarqaDb db, CancellationToken ct = default)
    {
        var seed = LoadLocations();
        var existing = await db.Locations.ToDictionaryAsync(x => x.Name, ct);
        foreach (var (name, aliases) in seed)
        {
            if (existing.TryGetValue(name, out var loc)) loc.Aliases = aliases;
            else db.Locations.Add(new Location { Name = name, Aliases = aliases });
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Campus map locations: a copy of benchmark/data/campus/locations.json (a test keeps them in sync).</summary>
    public static Dictionary<string, string[]> LoadLocations()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "Seed", "locations.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        return doc.RootElement.EnumerateObject()
            .Where(p => p.Value.ValueKind == JsonValueKind.Array)
            .ToDictionary(p => p.Name, p => p.Value.EnumerateArray().Select(a => a.GetString()!).ToArray());
    }
}
