using System.Collections.Concurrent;
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

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable("ZARQA_TEST_DB");
        if (string.IsNullOrEmpty(external))
        {
            _container = new PostgreSqlBuilder().WithImage("pgvector/pgvector:pg17").Build();
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
        var options = new DbContextOptionsBuilder<ZarqaDb>()
            .UseNpgsql(ConnectionString, o => o.UseVector())
            .UseSnakeCaseNamingConvention()
            .Options;
        await using var db = new ZarqaDb(options);
        await db.Database.MigrateAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Zarqa", ConnectionString);
        builder.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IEmailSender>(Emails)));
    }

    /// <summary>A client that keeps cookies; https so the Secure auth cookie is sent back.</summary>
    public HttpClient Client() => CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), HandleCookies = true });

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
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

    public Task SendSignInCodeAsync(string email, string code, CancellationToken ct)
    {
        _last[email] = code;
        return Task.CompletedTask;
    }

    public string LastCodeFor(string email) => _last[email];
}
