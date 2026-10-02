using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pgvector;
using Pgvector.EntityFrameworkCore;
using Zarqa.Api.Data;
using Zarqa.Api.Photos;

namespace Zarqa.Api.Matching;

public enum MatchOutcome { Done, Retry, Postponed, NotConfigured }

/// <summary>
/// luna-debate for one report (decisions.md): embed → vector top 25 → prescore shortlist (≥ 0.56, top 10)
/// → two Luna advocates + Jev (≥ 0.65), or a plain Luna review (≥ 0.72) when Jev is unavailable.
/// Runs in both directions: a new found report is checked against open lost reports and vice versa.
/// </summary>
public sealed class Matcher(
    ZarqaDb db,
    IEmbedder embedder,
    ILuna luna,
    IJev jev,
    DebateReviewer debate,
    LunaReviewer lunaReviewer,
    ReasonWriter reasons,
    AliasIndex aliases,
    PhotoStore photos,
    INotifier notifier,
    IOptions<ModelOptions> models,
    TimeProvider clock,
    ILogger<Matcher> log)
{
    public const int VectorLimit = 25;
    public const int MaxCandidates = 10;
    /// <summary>max(floor 0.55, 0.72 − 0.16): the shortlist luna-debate was benchmarked with.</summary>
    public const double ShortlistThreshold = 0.56;

    public bool IsConfigured => embedder.IsConfigured && luna.IsConfigured;

    public async Task<MatchOutcome> ProcessAsync(Guid reportId, CancellationToken ct)
    {
        if (!IsConfigured) return MatchOutcome.NotConfigured;
        var report = await db.Reports.Include(r => r.Photos).FirstOrDefaultAsync(r => r.Id == reportId, ct);
        if (report is null || report.Status != ReportStatus.Open) return MatchOutcome.Done;
        if (await SpentTodayAsync(ct) >= models.Value.DailySpendCapUsd)
        {
            log.LogWarning("Daily model spend cap reached; matching for report {Report} postponed", reportId);
            return MatchOutcome.Postponed;
        }

        // 1. Embed (again on every run: edits change the text).
        var input = ToInput(report);
        EmbedResult embedded;
        try
        {
            embedded = await embedder.EmbedAsync([TextRules.EmbeddingText(input, aliases)], ct);
        }
        catch (Exception e) when (e is ModelCallException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            log.LogWarning("Embedding failed for report {Report}: {Message}", reportId, e.Message);
            return MatchOutcome.Retry;
        }
        report.Embedding = new Vector(embedded.Vectors[0]);
        Log(report.Id, null, "embed", new JsonObject { ["tokens"] = embedded.InputTokens }, embedded.InputTokens * Prices.EmbeddingInput / 1_000_000m);
        await db.SaveChangesAsync(ct);

        // 2. Vector search over open counterparts of other people.
        var other = report.Kind == ReportKind.Lost ? ReportKind.Found : ReportKind.Lost;
        var pool = await db.Reports.Include(r => r.Photos)
            .Where(r => r.Kind == other && r.UserId != report.UserId && r.Embedding != null
                        && (r.Status == ReportStatus.Open || r.Status == ReportStatus.InChat))
            .OrderBy(r => r.Embedding!.CosineDistance(report.Embedding))
            .Take(VectorLimit)
            .ToListAsync(ct);

        // Never review a pair twice: suggested, confirmed and rejected pairs all stay as they are.
        var poolIds = pool.Select(r => r.Id).ToList();
        var decided = await db.Matches
            .Where(m => (m.LostId == report.Id && poolIds.Contains(m.FoundId)) || (m.FoundId == report.Id && poolIds.Contains(m.LostId)))
            .Select(m => report.Kind == ReportKind.Lost ? m.FoundId : m.LostId)
            .ToListAsync(ct);

        // 3. Preliminary score shortlist.
        var shortlist = pool.Where(c => !decided.Contains(c.Id))
            .Select(c =>
            {
                var ci = ToInput(c);
                var p = Prescore.Score(input, ci, Prescore.Cosine(report.Embedding.ToArray(), c.Embedding!.ToArray()), aliases);
                return (Counterpart: c, Input: ci, Prescore: p);
            })
            .Where(x => x.Prescore.Score >= ShortlistThreshold)
            .OrderByDescending(x => x.Prescore.Score)
            .Take(MaxCandidates)
            .ToList();
        Log(report.Id, null, "shortlist", new JsonObject
        {
            ["pool"] = pool.Count,
            ["candidates"] = new JsonArray(shortlist.Select(x => (JsonNode)new JsonObject
            {
                ["id"] = x.Counterpart.Id.ToString(),
                ["score"] = x.Prescore.Score,
                ["cosine"] = x.Prescore.Cosine,
                ["category"] = x.Prescore.Category,
                ["text"] = x.Prescore.Text,
                ["location"] = x.Prescore.Location,
                ["date"] = x.Prescore.Date,
            }).ToArray()),
        }, 0);
        await db.SaveChangesAsync(ct);

        // 4. Review each shortlisted pair (a few at a time, like the benchmark's parallel batches).
        var retry = false;
        foreach (var batch in shortlist.Chunk(5))
        {
            var reviews = await Task.WhenAll(batch.Select(async x =>
            {
                var (lost, found) = report.Kind == ReportKind.Lost ? (input, x.Input) : (x.Input, input);
                return (x, lost, found, review: await ReviewAsync(lost, found, ct));
            }));
            foreach (var (x, lost, found, review) in reviews)
            {
                if (review is null) { retry = true; continue; }
                review.Log["prescore"] = x.Prescore.Score;
                Log(report.Id, x.Counterpart.Id, "review", review.Log, review.CostUsd);
                if (!review.IsMatch) continue;

                var (lostReport, foundReport) = report.Kind == ReportKind.Lost ? (report, x.Counterpart) : (x.Counterpart, report);
                var why = await reasons.WriteAsync(lost, found, lostReport.EventTime, foundReport.EventTime, ct);
                Log(report.Id, x.Counterpart.Id, "reasons", new JsonObject { ["reasons"] = new JsonArray(why.Reasons.Select(r => (JsonNode)r).ToArray()) }, why.CostUsd);
                var match = new Match
                {
                    LostId = lostReport.Id,
                    FoundId = foundReport.Id,
                    Prescore = x.Prescore.Score,
                    SameItem = review.SameItem,
                    Overall = review.Overall,
                    FinalScore = review.FinalScore,
                    DecidedBy = review.Decider == "debate" ? MatchDecider.Debate : MatchDecider.LunaFallback,
                    Reasons = why.Reasons,
                    CreatedAt = clock.GetUtcNow(),
                };
                db.Matches.Add(match);
                await db.SaveChangesAsync(ct);
                await notifier.MatchCreatedAsync(match.Id, ct);
            }
            await db.SaveChangesAsync(ct);
        }
        return retry ? MatchOutcome.Retry : MatchOutcome.Done;
    }

    /// <summary>The debate when Jev is available; otherwise (or if Jev fails) the plain Luna review.</summary>
    private async Task<Review?> ReviewAsync(MatchInput lost, MatchInput found, CancellationToken ct)
    {
        var images = Photos.DataUrls(lost, found);
        if (jev.IsConfigured)
        {
            try
            {
                return await debate.ReviewAsync(lost, found, images, ct);
            }
            catch (Exception e) when (e is ModelCallException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
            {
                log.LogWarning("Jev failed, using the plain Luna review: {Message}", e.Message);
            }
        }
        return await lunaReviewer.ReviewAsync(lost, found, images, ct);
    }

    public MatchInput ToInput(Report r) => new(
        r.Id,
        r.Kind == ReportKind.Lost ? "lost" : "found",
        r.Title,
        r.CategoryText,
        r.CategoryNorm ?? "",
        r.Description,
        r.LocationText,
        "",
        r.EventDate?.ToString("yyyy-MM-dd"),
        r.IsSensitive,
        r.Photos.OrderBy(p => p.Position).Select(p => photos.PathFor(p.StorageKey)).ToList());

    private void Log(Guid reportId, Guid? counterpart, string step, JsonObject payload, decimal cost) =>
        db.ReviewLogs.Add(new ReviewLog
        {
            ReportId = reportId,
            CounterpartId = counterpart,
            Step = step,
            Payload = payload.ToJsonString(),
            CostUsd = cost,
            LatencyMs = payload["latencyMs"]?.GetValue<long>() is long ms ? (int)ms : null,
            CreatedAt = clock.GetUtcNow(),
        });

    private async Task<decimal> SpentTodayAsync(CancellationToken ct)
    {
        var today = new DateTimeOffset(clock.GetUtcNow().UtcDateTime.Date, TimeSpan.Zero);
        return await db.ReviewLogs.Where(l => l.CreatedAt >= today).SumAsync(l => l.CostUsd ?? 0, ct);
    }
}

/// <summary>Hooks for push and email notifications (step 7).</summary>
public interface INotifier
{
    Task MatchCreatedAsync(Guid matchId, CancellationToken ct);
}

public sealed class NoopNotifier : INotifier
{
    public Task MatchCreatedAsync(Guid matchId, CancellationToken ct) => Task.CompletedTask;
}
