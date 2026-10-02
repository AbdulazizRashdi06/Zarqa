using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Reports;

namespace Zarqa.Api.Admin;

/// <summary>Pilot admin: metrics, moderation, bans and the match log. Admins come from Admin:Emails.</summary>
public static class AdminEndpoints
{
    public const string Policy = "admin";

    public static void MapAdmin(this RouteGroupBuilder api)
    {
        var admin = api.MapGroup("/admin").RequireAuthorization(Policy);

        admin.MapGet("/stats", async (ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var now = clock.GetUtcNow();
            var monthAgo = now.AddDays(-30);
            var matches = await db.Matches.GroupBy(m => m.Status).Select(g => new { Status = g.Key.ToString(), Count = g.Count() }).ToListAsync(ct);
            var reports = await db.Reports.GroupBy(r => new { r.Kind, r.Status }).Select(g => new { Kind = g.Key.Kind.ToString(), Status = g.Key.Status.ToString(), Count = g.Count() }).ToListAsync(ct);
            var decided = await db.Matches.GroupBy(m => m.DecidedBy).Select(g => new { By = g.Key.ToString(), Count = g.Count() }).ToListAsync(ct);
            return Results.Ok(new
            {
                users = await db.Users.CountAsync(ct),
                newUsers30d = await db.Users.CountAsync(u => u.CreatedAt > monthAgo, ct),
                reports,
                matches,
                decidedBy = decided,
                returned = await db.Conversations.CountAsync(c => c.Status == ConversationStatus.Returned, ct),
                pendingJobs = await db.MatchJobs.CountAsync(j => j.CompletedAt == null, ct),
                failedJobs = await db.MatchJobs.CountAsync(j => j.CompletedAt != null && j.LastError != null, ct),
                spendTodayUsd = await db.ReviewLogs.Where(l => l.CreatedAt >= new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero)).SumAsync(l => l.CostUsd ?? 0, ct),
                spend30dUsd = await db.ReviewLogs.Where(l => l.CreatedAt >= monthAgo).SumAsync(l => l.CostUsd ?? 0, ct),
            });
        });

        admin.MapGet("/reports", async (string? status, ZarqaDb db, CancellationToken ct) =>
        {
            var q = db.Reports.AsNoTracking().Include(r => r.User).Include(r => r.Photos).AsQueryable();
            if (Enum.TryParse<ReportStatus>(status, true, out var s)) q = q.Where(r => r.Status == s);
            var list = await q.OrderByDescending(r => r.CreatedAt).Take(200).ToListAsync(ct);
            return list.Select(r => new
            {
                r.Id,
                kind = r.Kind.ToString().ToLowerInvariant(),
                r.Title,
                category = r.CategoryText,
                r.Description,
                location = r.LocationText,
                status = r.Status.ToString(),
                r.IsSensitive,
                owner = r.User!.Email,
                ownerId = r.UserId,
                ownerBanned = r.User.IsBanned,
                photoIds = r.IsSensitive ? [] : r.Photos.OrderBy(p => p.Position).Select(p => p.Id).ToArray(),
                r.CreatedAt,
            });
        });

        admin.MapPost("/reports/{id:guid}/close", async (Guid id, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var r = await db.Reports.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (r is null) return Errors.NotFound();
            r.Status = ReportStatus.Closed;
            r.UpdatedAt = clock.GetUtcNow();
            await ReportEndpoints.ExpireOpenMatches(db, id, clock.GetUtcNow(), ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        admin.MapPost("/users/{id:guid}/ban", (Guid id, ZarqaDb db, CancellationToken ct) => SetBanned(db, id, true, ct));
        admin.MapPost("/users/{id:guid}/unban", (Guid id, ZarqaDb db, CancellationToken ct) => SetBanned(db, id, false, ct));

        admin.MapGet("/log", async (Guid? reportId, ZarqaDb db, CancellationToken ct) =>
        {
            var q = db.ReviewLogs.AsNoTracking().AsQueryable();
            if (reportId is { } rid) q = q.Where(l => l.ReportId == rid || l.CounterpartId == rid);
            return await q.OrderByDescending(l => l.Id).Take(100)
                .Select(l => new { l.Id, l.ReportId, l.CounterpartId, l.Step, l.Payload, l.CostUsd, l.CreatedAt })
                .ToListAsync(ct);
        });
    }

    private static async Task<IResult> SetBanned(ZarqaDb db, Guid id, bool banned, CancellationToken ct)
    {
        var u = await db.Users.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (u is null) return Errors.NotFound();
        if (u.IsAdmin && banned) return Errors.BadRequest("Admins can't be banned here.");
        u.IsBanned = banned;
        if (banned)
            foreach (var r in await db.Reports.Where(r => r.UserId == id && r.Status == ReportStatus.Open).ToListAsync(ct))
                r.Status = ReportStatus.Closed;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
