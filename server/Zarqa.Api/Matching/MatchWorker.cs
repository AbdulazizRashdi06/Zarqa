using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Matching;

/// <summary>
/// Drains match_jobs. One job at a time (pilot scale); a job is locked while it runs, retried with
/// backoff on model errors, and given up after <see cref="MaxAttempts"/>. Without model keys it waits.
/// </summary>
public sealed class MatchWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<MatchWorker> log) : BackgroundService
{
    public const int MaxAttempts = 3;
    private static readonly TimeSpan[] Backoff = [TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30)];
    private static readonly TimeSpan Idle = TimeSpan.FromSeconds(5);
    private DateTimeOffset _lastNotConfiguredLog = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            var worked = false;
            try
            {
                worked = await RunOneAsync(stop);
            }
            catch (Exception e) when (!stop.IsCancellationRequested)
            {
                log.LogError(e, "Match worker loop failed");
            }
            if (!worked) await Task.Delay(Idle, clock, stop).ContinueWith(_ => { }, CancellationToken.None);
        }
    }

    /// <summary>Processes the next due job. Public for tests. Returns false when there was nothing to do.</summary>
    public async Task<bool> RunOneAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ZarqaDb>();
        var matcher = scope.ServiceProvider.GetRequiredService<Matcher>();
        var now = clock.GetUtcNow();

        if (!matcher.IsConfigured)
        {
            if (now - _lastNotConfiguredLog > TimeSpan.FromHours(1))
            {
                log.LogWarning("Matching is waiting for model keys (OPENAI_API_KEY or OPENROUTER_API_KEY; TYPESAFE_API_KEY for Jev). Jobs stay queued.");
                _lastNotConfiguredLog = now;
            }
            return false;
        }

        var job = await db.MatchJobs
            .Where(j => j.CompletedAt == null && j.RunAfter <= now && (j.LockedUntil == null || j.LockedUntil < now))
            .OrderBy(j => j.RunAfter)
            .FirstOrDefaultAsync(ct);
        if (job is null) return false;

        job.LockedUntil = now.AddMinutes(10);
        job.Attempts++;
        await db.SaveChangesAsync(ct);

        MatchOutcome outcome;
        try
        {
            outcome = await matcher.ProcessAsync(job.ReportId, ct);
        }
        catch (Exception e) when (!ct.IsCancellationRequested)
        {
            log.LogError(e, "Matching report {Report} failed", job.ReportId);
            job.LastError = e.Message;
            outcome = MatchOutcome.Retry;
        }

        // The matcher may have left tracked changes behind after a failure; start clean for the job update.
        db.ChangeTracker.Clear();
        db.MatchJobs.Attach(job);
        job.LockedUntil = null;
        switch (outcome)
        {
            case MatchOutcome.Done:
                job.CompletedAt = clock.GetUtcNow();
                break;
            case MatchOutcome.Postponed:
                job.Attempts--;
                job.RunAfter = clock.GetUtcNow().AddHours(1);
                break;
            case MatchOutcome.NotConfigured:
                job.Attempts--;
                break;
            case MatchOutcome.Retry when job.Attempts >= MaxAttempts:
                job.CompletedAt = clock.GetUtcNow();
                job.LastError ??= "gave up after retries";
                log.LogError("Gave up matching report {Report} after {Attempts} attempts", job.ReportId, job.Attempts);
                break;
            case MatchOutcome.Retry:
                job.RunAfter = clock.GetUtcNow() + Backoff[Math.Min(job.Attempts - 1, Backoff.Length - 1)];
                break;
        }
        await db.SaveChangesAsync(ct);
        return true;
    }
}
