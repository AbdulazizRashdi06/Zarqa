using System.Collections.Concurrent;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Testcontainers.PostgreSql;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;

namespace Zarqa.Tests;

/// <summary>
/// The real app on a throwaway Postgres database. Uses ZARQA_TEST_DB (a server connection string,
/// e.g. the dev database) when set; otherwise starts a pgvector container with Testcontainers.
/// </summary>
public sealed class TestApp : WebApplicationFactory<Program>, IAsyncLifetime
{
    private PostgreSqlContainer? _container;
    private string _adminConnection = "";
    private readonly string _database = $"zarqa_test_{Guid.NewGuid():N}";

    public string ConnectionString { get; private set; } = "";
    public CapturingEmailSender Emails { get; } = new();
    public FakeModels Models { get; } = new();
    public FakePush Push { get; } = new();
    public string PhotoRoot { get; } = Path.Combine(Path.GetTempPath(), $"zarqa-photos-{Guid.NewGuid():N}");

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("ZARQA_TEST_DB");
        if (string.IsNullOrEmpty(external))
        {
            _container = new PostgreSqlBuilder("pgvector/pgvector:pg17").Build();
            await _container.StartAsync();
            external = _container.GetConnectionString();
        }
        _adminConnection = external;
        await using (var admin = new NpgsqlConnection(_adminConnection))
        {
            await admin.OpenAsync();
            await new NpgsqlCommand($"CREATE DATABASE \"{_database}\"", admin).ExecuteNonQueryAsync();
        }
        ConnectionString = new NpgsqlConnectionStringBuilder(_adminConnection) { Database = _database }.ConnectionString;

        // Migrate before the host starts: its hosted services (e.g. the cookie key ring) read the tables.
        await using var db = Db();
        await db.Database.MigrateAsync();
        await Seeder.SeedLocationsAsync(db);
    }

    /// <summary>A context on the test database, outside the app, for checking what the app wrote.</summary>
    public ZarqaDb Db() => new(new DbContextOptionsBuilder<ZarqaDb>()
        .UseNpgsql(ConnectionString, o => o.UseVector())
        .UseSnakeCaseNamingConvention()
        .Options);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Zarqa", ConnectionString);
        builder.UseSetting("Photos:Root", PhotoRoot);
        builder.UseSetting("Auth:RequestCodePerIp", "1000");
        builder.UseSetting("Auth:VerifyPerIp", "1000");
        // Tests drive the matching worker step by step (MatchWorker.RunOneAsync).
        builder.UseSetting("Matching:Worker", "false");
        builder.ConfigureServices(s =>
        {
            s.Replace(ServiceDescriptor.Singleton<IEmailSender>(Emails));
            s.Replace(ServiceDescriptor.Transient<Zarqa.Api.Matching.IEmbedder>(_ => Models.Embedder));
            s.Replace(ServiceDescriptor.Transient<Zarqa.Api.Matching.ILuna>(_ => Models.Luna));
            s.Replace(ServiceDescriptor.Transient<Zarqa.Api.Matching.IJev>(_ => Models.Jev));
            s.Replace(ServiceDescriptor.Singleton<Zarqa.Api.Notifications.IPushSender>(Push));
        });
    }

    /// <summary>A signed-in client for a fresh user with a first name.</summary>
    public async Task<HttpClient> SignedIn(string email, string firstName = "Tester")
    {
        var http = Client();
        (await http.PostAsJsonAsync("/api/auth/request-code", new { email })).EnsureSuccessStatusCode();
        (await http.PostAsJsonAsync("/api/auth/verify", new { email, code = Emails.LastCodeFor(email.ToLowerInvariant()) })).EnsureSuccessStatusCode();
        (await http.PatchAsJsonAsync("/api/me", new { firstName })).EnsureSuccessStatusCode();
        return http;
    }

    /// <summary>Runs the matching worker until no job is due.</summary>
    public async Task DrainMatchingAsync()
    {
        var worker = Services.GetRequiredService<Zarqa.Api.Matching.MatchWorker>();
        for (var i = 0; i < 50 && await worker.RunOneAsync(CancellationToken.None); i++) { }
    }

    /// <summary>A client that keeps cookies; https so the Secure auth cookie is sent back.</summary>
    public HttpClient Client() => CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        try { Directory.Delete(PhotoRoot, recursive: true); } catch (DirectoryNotFoundException) { }
        NpgsqlConnection.ClearAllPools();
        if (_container is not null)
        {
            await _container.DisposeAsync();
            return;
        }
        await using var admin = new NpgsqlConnection(_adminConnection);
        await admin.OpenAsync();
        await new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_database}\" WITH (FORCE)", admin).ExecuteNonQueryAsync();
    }
}

public sealed class CapturingEmailSender : IEmailSender
{
    private readonly ConcurrentDictionary<string, string> _last = new();

    /// <summary>Makes the next send fail like a provider outage.</summary>
    public bool FailNext { get; set; }

    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        if (FailNext)
        {
            FailNext = false;
            throw new Zarqa.Api.Email.EmailNotSentException();
        }
        _last[email] = code;
        return Task.CompletedTask;
    }

    public string LastCodeFor(string email) => _last[email];

    public ConcurrentQueue<(string To, string Subject)> Sent { get; } = new();

    public Task SendAsync(string to, string subject, string html, string text, CancellationToken ct)
    {
        Sent.Enqueue((to, subject));
        return Task.CompletedTask;
    }
}

public sealed class FakePush : Zarqa.Api.Notifications.IPushSender
{
    public ConcurrentQueue<(string Endpoint, Zarqa.Api.Notifications.PushPayload Payload)> Sent { get; } = new();
    /// <summary>Endpoints the "browser" has unsubscribed: sending to them reports Gone.</summary>
    public ConcurrentDictionary<string, bool> Gone { get; } = new();

    public Task<bool> SendAsync(Zarqa.Api.Data.PushSubscription s, Zarqa.Api.Notifications.PushPayload p, CancellationToken ct)
    {
        if (Gone.ContainsKey(s.Endpoint)) return Task.FromResult(false);
        Sent.Enqueue((s.Endpoint, p));
        return Task.FromResult(true);
    }
}
