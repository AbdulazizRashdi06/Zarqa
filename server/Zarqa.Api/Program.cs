using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Email;
using Zarqa.Api.Users;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ZarqaDb>(o => o
    .UseNpgsql(builder.Configuration.GetConnectionString("Zarqa"), npgsql => npgsql.UseVector())
    .UseSnakeCaseNamingConvention());
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<EmailOptions>(builder.Configuration.GetSection("Email"));
var email = builder.Configuration.GetSection("Email").Get<EmailOptions>() ?? new EmailOptions();
if (email.Provider == "resend")
{
    if (string.IsNullOrWhiteSpace(email.ResendApiKey) || string.IsNullOrWhiteSpace(email.From))
        throw new InvalidOperationException("Email:Provider is 'resend' but Email:ResendApiKey or Email:From is missing.");
    builder.Services.AddHttpClient<IEmailSender, ResendEmailSender>(c => c.Timeout = TimeSpan.FromSeconds(15));
}
else
{
    builder.Services.AddSingleton<IEmailSender, LogEmailSender>();
}

builder.Services.AddDataProtection().SetApplicationName("Zarqa").PersistKeysToDbContext<ZarqaDb>();

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "zarqa.auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        o.ExpireTimeSpan = TimeSpan.FromDays(30);
        o.SlidingExpiration = true;
        // An API: answer 401/403 instead of redirecting to a login page.
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
        // A deleted or banned user loses access on the next request, not when the cookie expires.
        o.Events.OnValidatePrincipal = async ctx =>
        {
            var db = ctx.HttpContext.RequestServices.GetRequiredService<ZarqaDb>();
            var id = ctx.Principal!.Id();
            var ok = await db.Users.AnyAsync(u => u.Id == id && !u.IsBanned);
            if (!ok)
            {
                ctx.RejectPrincipal();
                await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            }
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, ct) => new ValueTask(ctx.HttpContext.Response.WriteAsJsonAsync(
        new { error = "Slow down a little and try again in a few minutes." }, ct));
    static RateLimitPartition<string> PerIp(HttpContext http, int permits) =>
        RateLimitPartition.GetFixedWindowLimiter(http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(15) });
    o.AddPolicy(AuthEndpoints.RequestCodeLimit, http => PerIp(http, 10));
    o.AddPolicy(AuthEndpoints.VerifyLimit, http => PerIp(http, 30));
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    // Behind Caddy on the Docker network: trust its X-Forwarded-For/Proto.
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

if (!app.Environment.IsEnvironment("Testing"))
    await Seeder.MigrateAndSeedAsync(app.Services);

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

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

api.MapAuth();
api.MapMe();

// Unknown /api paths are 404s; everything else is the PWA's client-side routing.
api.MapFallback(() => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
