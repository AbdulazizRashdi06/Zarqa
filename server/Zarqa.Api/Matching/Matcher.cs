using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Pgvector;
using Pgvector.EntityFrameworkCore;
using Zarqa.Api.Admin;
using Zarqa.Api.Data;
using Zarqa.Api.Photos;

using Zarqa.Api.Reports;

namespace Zarqa.Api.Matching;

public enum MatchOutcome { Done, Retry, Postponed, NotConfigured }

/// <summary>
/// Embed → every open counterpart, nearest first → prescore shortlist (≥ 0.56) → when more than 10 pass, one
/// text-only Luna screen of the best 30 → Luna advocates and Terra judge (≥ 0.55) on at most 10.
/// The screen and each debate stage can fall back to DeepSeek. Jev remains available as a rollout switch.
/// Runs in both directions: a new found report is checked against open lost reports and vice versa.
/// </summary>
public sealed class Matcher(
    ZarqaDb db,
    IEmbedder embedder,
    IJev jev,
    DebateReviewer debate,
    LunaReviewer lunaReviewer,
    ScreenReviewer screen,
    ReasonWriter reasons,
    AliasIndex aliases,
    PhotoStore photos,
    INotifier notifier,
    IOptions<ModelOptions> models,
    TimeProvider clock,
    ILogger<Matcher> log)
{
    /// <summary>
    /// Counterparts loaded for the prescore: in effect all of them (the app is built for 100–1,000 active reports).
    /// The old vector top 25 kept true pairs from ever being scored.
    /// </summary>
    public const int PoolLimit = 1000;
    /// <summary>Pairs that get the full debate, per report and run.</summary>
    public const int MaxCandidates = 10;
    /// <summary>How many of the shortlist the screen reads when more than MaxCandidates pass (benchmark, 2026-11-14).</summary>
    public const int ScreenSize = 30;
    /// <summary>max(floor 0.55, 0.72 − 0.16): the shortlist luna-debate was benchmarked with.</summary>
    public const double ShortlistThreshold = 0.56;

    public bool IsConfigured => embedder.IsConfigured && debate.IsConfigured;

    public async Task<MatchOutcome> ProcessAsync(Guid reportId, CancellationToken ct)
    {
        if (!IsConfigured) return MatchOutcome.NotConfigured;
        var report = await db.Reports.Include(r => r.Photos).FirstOrDefaultAsync(r => r.Id == reportId, ct);
        if (report is null || report.Status != ReportStatus.Open) return MatchOutcome.Done;
        // Sample data (admin demo) is never matched, in either direction.
        if (await db.Users.AnyAsync(u => u.Id == report.UserId && u.Email.EndsWith(SampleData.EmailSuffix), ct)) return MatchOutcome.Done;
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

        // 2. Open counterparts of other people, nearest vector first.
        var other = report.Kind == ReportKind.Lost ? ReportKind.Found : ReportKind.Lost;
        var pool = await db.Reports.Include(r => r.Photos)
            .Where(r => r.Kind == other && r.UserId != report.UserId && r.Embedding != null && !r.User!.Email.EndsWith(SampleData.EmailSuffix)
                        && (r.Status == ReportStatus.Open || r.Status == ReportStatus.InChat || r.Status == ReportStatus.Pickup))
            .OrderBy(r => r.Embedding!.CosineDistance(report.Embedding))
            .Take(PoolLimit)
            .ToListAsync(ct);

        // Never review a pair twice: suggested, confirmed and rejected pairs all stay as they are.
        var poolIds = pool.Select(r => r.Id).ToList();
        var decided = await db.Matches
            .Where(m => (m.LostId == report.Id && poolIds.Contains(m.FoundId)) || (m.FoundId == report.Id && poolIds.Contains(m.LostId)))
            .Select(m => report.Kind == ReportKind.Lost ? m.FoundId : m.LostId)
            .ToListAsync(ct);

        // 3. Preliminary score shortlist: everything in the pool that scores high enough, best first.
        var passed = pool.Where(c => !decided.Contains(c.Id))
            .Select(c =>
            {
                var ci = ToInput(c);
                var p = Prescore.Score(input, ci, Prescore.Cosine(report.Embedding.ToArray(), c.Embedding!.ToArray()), aliases);
                return (Counterpart: c, Input: ci, Prescore: p);
            })
            .Where(x => x.Prescore.Score >= ShortlistThreshold)
            .OrderByDescending(x => x.Prescore.Score)
            .ToList();
        var shortlist = passed.Take(MaxCandidates).ToList();
        Log(report.Id, null, "shortlist", new JsonObject
        {
            ["pool"] = pool.Count,
            ["passed"] = passed.Count,
            // The part of the list anything downstream can see: the screen reads at most this many.
            ["candidates"] = new JsonArray(passed.Take(ScreenSize).Select(x => (JsonNode)new JsonObject
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

        // 4. Screen. Only when more passed than can be reviewed: with 10 or fewer it could only lose pairs.
        if (models.Value.UseScreen && passed.Count > MaxCandidates)
        {
            var screened = passed.Take(ScreenSize).ToList();
            var result = await screen.ScreenAsync(input, screened.Select(x => x.Input).ToList(), ct);
            // A failed or unusable screen changes nothing: the best 10 by prescore are reviewed, as before.
            if (!result.FellBack) shortlist = result.Kept.Select(i => screened[i]).Take(MaxCandidates).ToList();
            var payload = new JsonObject
            {
                ["screened"] = Ids(screened.Select(x => x.Counterpart.Id)),
                ["kept"] = Ids(result.FellBack ? [] : result.Kept.Select(i => screened[i].Counterpart.Id)),
                ["reviewed"] = Ids(shortlist.Select(x => x.Counterpart.Id)),
                ["fellBack"] = result.FellBack,
                ["model"] = result.Call is null ? null : result.Call.Model ?? models.Value.LunaModel,
                ["tokens"] = new JsonObject { ["in"] = result.Call?.InputTokens ?? 0, ["out"] = result.Call?.OutputTokens ?? 0 },
            };
            if (result.Call is not null) payload["latencyMs"] = result.Call.LatencyMs;
            // The call is paid for even when its answer was unusable, so the spend cap counts it.
            Log(report.Id, null, "screen", payload, result.Call?.CostUsd ?? 0);
            await db.SaveChangesAsync(ct);
        }

        // 5. Review each shortlisted pair (a few at a time, like the benchmark's parallel batches).
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

    private async Task<Review?> ReviewAsync(MatchInput lost, MatchInput found, CancellationToken ct)
    {
        var images = Photos.DataUrls(lost, found);
        if (models.Value.UseTerraJudge || jev.IsConfigured)
        {
            try
            {
                return await debate.ReviewAsync(lost, found, images, ct);
            }
            catch (Exception e) when (DebateReviewer.IsModelFailure(e, ct))
            {
                if (models.Value.UseTerraJudge)
                {
                    log.LogWarning("Debate judge unavailable; matching will retry");
                    return null;
                }
                log.LogWarning("Jev failed, using the plain Luna review: {Message}", e.Message);
            }
        }
        return await lunaReviewer.ReviewAsync(lost, found, images, ct);
    }

    /// <summary>
    /// The app matches on one text per report (decisions.md, 2026-10-02): no separate item name.
    /// Reports from the older two-field form fold their name into the text.
    /// </summary>
    public MatchInput ToInput(Report r) => new(
        r.Id,
        r.Kind == ReportKind.Lost ? "lost" : "found",
        "",
        r.CategoryText,
        r.CategoryNorm ?? "",
        MatchText(r),
        r.LocationText,
        "",
        r.EventDate?.ToString("yyyy-MM-dd"),
        r.IsSensitive,
        // Card/ID photos only as their covered copy, never the original (owner decision 2026-10-27).
        r.Photos.OrderBy(p => p.Position).Select(PhotoAccess.SharedKey).OfType<string>().Select(photos.PathFor).ToList());

    // An app report's name is cut from its one text: it is the start of that text (older reports), or what
    // ReportText.Split names it today (greetings and "I lost my" skipped). Those match on the text alone, as they
    // always have. Only a report whose name was typed separately gets the name put in front.
    public static string MatchText(Report r) =>
        r.Description.StartsWith(r.Title, StringComparison.OrdinalIgnoreCase)
            || string.Equals(ReportText.Split(r.Description)?.Title, r.Title, StringComparison.Ordinal) ? r.Description
        : r.Description.Length == 0 ? r.Title
        : $"{r.Title}. {r.Description}";

    private static JsonArray Ids(IEnumerable<Guid> ids) => new(ids.Select(id => (JsonNode)id.ToString()).ToArray());

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
