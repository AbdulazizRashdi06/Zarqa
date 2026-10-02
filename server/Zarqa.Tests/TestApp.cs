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
        builder.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IEmailSender>(Emails)));
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
}
