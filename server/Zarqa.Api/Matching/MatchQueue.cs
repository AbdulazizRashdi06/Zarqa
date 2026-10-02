using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Matching;

/// <summary>Postgres-backed queue: one pending job per report; the matching worker picks them up.</summary>
public sealed class MatchQueue(ZarqaDb db, TimeProvider clock)
{
    public async Task EnqueueAsync(Guid reportId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var pending = await db.MatchJobs.FirstOrDefaultAsync(j => j.ReportId == reportId && j.CompletedAt == null, ct);
        if (pending is not null)
        {
            pending.RunAfter = now;
            pending.Attempts = 0;
            pending.LastError = null;
        }
        else
        {
            db.MatchJobs.Add(new MatchJob { ReportId = reportId, RunAfter = now, CreatedAt = now });
        }
        await db.SaveChangesAsync(ct);
    }
}
