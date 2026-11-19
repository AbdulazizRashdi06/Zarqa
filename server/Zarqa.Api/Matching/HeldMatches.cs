using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Matching;

/// <summary>
/// Human review of the weakest debate matches (owner decision, 2026-11-14). A debate match that scores at least the
/// cut-off but below <see cref="HoldBelow"/> is stored as <see cref="MatchStatus.Held"/>: the owner and the finder
/// cannot see it anywhere and nobody is notified. An admin approves or rejects it on /admin; if nobody decides within
/// <see cref="ReleaseAfter"/> of the match being made, it is released exactly like an approval.
/// RSA manual matches, the plain Luna fallback and sample data are never held.
/// </summary>
public sealed class HeldMatches(ZarqaDb db, INotifier notifier, TimeProvider clock)
{
    /// <summary>Debate matches below this final score wait for review. Fixed by the owner, not tuned on data.</summary>
    public const double HoldBelow = 0.60;

    /// <summary>How long a held match waits for an admin before it is released by itself. Fixed rule, not a setting.</summary>
    public static readonly TimeSpan ReleaseAfter = TimeSpan.FromHours(48);

    /// <summary>How often the background loop looks for held matches that are due (RetentionWorker).</summary>
    public static readonly TimeSpan CheckEvery = TimeSpan.FromMinutes(15);

    // review_log steps: the audit trail of who decided what, and when.
    public const string HeldStep = "held";
    public const string ApproveStep = "held_approve";
    public const string RejectStep = "held_reject";
    public const string AutoReleaseStep = "held_release";

    /// <summary>The "reason" a held step carries when the match came from the stand-in while the one-model call was failing.</summary>
    public const string OpusUnavailable = "opus_unavailable";

    /// <summary>What review_log records as "who" when the 48 hours ran out.</summary>
    public const string Auto = "auto";

    /// <summary>
    /// The same rule for the one-model review, whose line is lower (ModelOptions.OpusThreshold, 0.45): its weakest
    /// matches, up to this score, wait for review. Fixed beside the line, not tuned on data.
    /// </summary>
    public const double OpusHoldBelow = 0.50;

    public static bool ShouldHold(MatchDecider decidedBy, double finalScore) => decidedBy switch
    {
        MatchDecider.Debate => finalScore < HoldBelow,
        MatchDecider.Opus => finalScore < OpusHoldBelow,
        _ => false,
    };

    /// <summary>An admin lets it through: an ordinary suggestion from now on, and the owner is told now. False when it was no longer held.</summary>
    public Task<bool> ApproveAsync(Guid matchId, Guid adminId, CancellationToken ct) => ReleaseAsync(matchId, ApproveStep, adminId.ToString(), ct);

    /// <summary>
    /// An admin says no: the owner never sees it and the pair is never reviewed or suggested again, as after the owner's
    /// own "Not mine". Both reports stay as they are and nothing is queued. False when it was no longer held.
    /// </summary>
    public async Task<bool> RejectAsync(Guid matchId, Guid adminId, CancellationToken ct)
    {
        var m = await db.Matches.AsNoTracking().FirstOrDefaultAsync(x => x.Id == matchId, ct);
        return m is not null && await DecideAsync(m, MatchStatus.Withheld, RejectStep, adminId.ToString(), "rejected", ct);
    }

    /// <summary>Releases every held match made at least <see cref="ReleaseAfter"/> ago. Returns how many.</summary>
    public async Task<int> ReleaseDueAsync(CancellationToken ct)
    {
        var due = clock.GetUtcNow() - ReleaseAfter;
        var ids = await db.Matches.Where(m => m.Status == MatchStatus.Held && m.CreatedAt <= due).OrderBy(m => m.CreatedAt).Select(m => m.Id).ToListAsync(ct);
        var released = 0;
        foreach (var id in ids)
            if (await ReleaseAsync(id, AutoReleaseStep, Auto, ct)) released++;
        return released;
    }

    private async Task<bool> ReleaseAsync(Guid matchId, string step, string by, CancellationToken ct)
    {
        var m = await db.Matches.AsNoTracking().Include(x => x.Lost).Include(x => x.Found).FirstOrDefaultAsync(x => x.Id == matchId, ct);
        if (m is null) return false;
        // Every way a report leaves the pool also ends its held matches (ReportEndpoints.ExpireOpenMatches). Should one
        // slip through all the same, it ends here instead of sending the owner to a report that is gone.
        var gone = !InPool(m.Lost!) || !InPool(m.Found!);
        if (!await DecideAsync(m, gone ? MatchStatus.Withheld : MatchStatus.Suggested, step, by, gone ? "withheld" : "released", ct)) return false;
        // Only once the decision is stored, and whatever became of the caller: the owner is told at that moment.
        if (!gone) await notifier.MatchCreatedAsync(matchId, CancellationToken.None);
        return true;
    }

    private static bool InPool(Report r) => r.Status is ReportStatus.Open or ReportStatus.InChat or ReportStatus.Pickup;

    /// <summary>
    /// The step out of Held and its review_log row, in one transaction: both are stored or neither is, so a match
    /// never leaves review without its audit row, and one that could not be stored is still held for the next try.
    /// The update only matches a row that is still Held, so an admin's tap and the 48-hour release can never both win
    /// (and notify twice). Once it has matched, a dropped request or a stopping host no longer cancels the rest.
    /// False when the match was no longer held.
    /// </summary>
    private async Task<bool> DecideAsync(Match m, MatchStatus to, string step, string by, string outcome, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        DateTimeOffset? resolvedAt = to == MatchStatus.Suggested ? null : now;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var moved = await db.Matches.Where(x => x.Id == m.Id && x.Status == MatchStatus.Held)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, to).SetProperty(x => x.ResolvedAt, resolvedAt), ct) == 1;
        if (!moved) return false;
        var entry = db.ReviewLogs.Add(new ReviewLog
        {
            ReportId = m.LostId,
            CounterpartId = m.FoundId,
            Step = step,
            Payload = new JsonObject { ["by"] = by, ["outcome"] = outcome, ["matchId"] = m.Id.ToString(), ["finalScore"] = m.FinalScore }.ToJsonString(),
            CreatedAt = now,
        });
        try
        {
            await db.SaveChangesAsync(CancellationToken.None);
            await tx.CommitAsync(CancellationToken.None);
        }
        catch
        {
            // Rolled back with the transaction: the match is still held. Do not leave the row behind for a later save.
            entry.State = EntityState.Detached;
            throw;
        }
        return true;
    }
}
