using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ZarqaDb>(o => o
    .UseNpgsql(builder.Configuration.GetConnectionString("Zarqa"), npgsql => npgsql.UseVector())
    .UseSnakeCaseNamingConvention());
builder.Services.AddProblemDetails();

var app = builder.Build();

if (!app.Environment.IsEnvironment("Testing"))
    await Seeder.MigrateAndSeedAsync(app.Services);

app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");

api.MapGet("/health", async (ZarqaDb db, CancellationToken ct) =>
    await db.Database.CanConnectAsync(ct)
        ? Results.Ok(new { status = "ok" })
        : Results.Json(new { status = "db-unreachable" }, statusCode: 503));

api.MapGet("/locations", async (string? q, ZarqaDb db, CancellationToken ct) =>
{
    var all = await db.Locations.AsNoTracking().OrderBy(l => l.Name).ToListAsync(ct);
    var term = q?.Trim().ToLowerInvariant();
    var hits = string.IsNullOrEmpty(term)
        ? all
        : all.Where(l => l.Name.ToLowerInvariant().Contains(term)
                      || l.Aliases.Any(a => a.ToLowerInvariant().Contains(term))).ToList();
    return hits.Select(l => new { l.Name, l.Aliases });
});

// Unknown /api paths are 404s; everything else is the PWA's client-side routing.
api.MapFallback(() => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
