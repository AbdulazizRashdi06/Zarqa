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
                // Breakdown of `users`, so the page can leave made-up people out of the tiles and say what a wipe removes.
                admins = await db.Users.CountAsync(u => u.IsAdmin, ct),
                sampleUsers = await db.Users.CountAsync(u => u.Email.EndsWith(SampleData.EmailSuffix), ct),
                sampleReports = await db.Reports.CountAsync(r => r.User!.Email.EndsWith(SampleData.EmailSuffix), ct),
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

        // q searches title, description and owner email, so the 200 limit applies after filtering.
        admin.MapGet("/reports", async (string? status, string? q, ZarqaDb db, CancellationToken ct) =>
        {
            var query = db.Reports.AsNoTracking().Include(r => r.User).Include(r => r.Photos).AsQueryable();
            if (Enum.TryParse<ReportStatus>(status, true, out var s)) query = query.Where(r => r.Status == s);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var like = "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
                query = query.Where(r => EF.Functions.ILike(r.Title, like, "\\") || EF.Functions.ILike(r.Description, like, "\\") || EF.Functions.ILike(r.User!.Email, like, "\\"));
            }
            var list = await query.OrderByDescending(r => r.CreatedAt).Take(200).ToListAsync(ct);
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
                ownerIsAdmin = r.User.IsAdmin,
                photoIds = PhotoAccess.SharedIds(r),
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

        // After a matching change: review every open report again. Pairs already suggested, confirmed or rejected stay as they are.
        admin.MapPost("/rematch", async (ZarqaDb db, Matching.MatchQueue queue, CancellationToken ct) =>
        {
            var ids = await db.Reports.Where(r => r.Status == ReportStatus.Open && !r.User!.Email.EndsWith(SampleData.EmailSuffix)).Select(r => r.Id).ToListAsync(ct);
            foreach (var id in ids) await queue.EnqueueAsync(id, ct);
            return Results.Ok(new { queued = ids.Count });
        });

        // Sends the admin one email through each configured provider on its own, so the backup sender is proven to
        // work (key, verified domain, this server's address allowed) before the day the first one runs out.
        admin.MapPost("/email-test", async (HttpContext http, ZarqaDb db, Email.EmailProbe probe, CancellationToken ct) =>
        {
            var to = await db.Users.Where(u => u.Id == http.User.Id()).Select(u => u.Email).FirstAsync(ct);
            var results = new List<object>();
            foreach (var route in probe.Routes)
            {
                string? error = null;
                try
                {
                    var (html, text) = Notifications.NoticeEmail.Build("TEST", $"{route.Name} can send",
                        $"An admin asked for this test email. It went through {route.Name}.", footer: "Sent from the admin page.");
                    await route.Sender.SendAsync(to, $"Zarqa test email ({route.Name})", html, text, ct);
                }
                catch (Exception e) when (e is Email.EmailNotSentException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
                {
                    error = e switch
                    {
                        Email.EmailNotSentException { Status: { } status } => $"refused ({status})",
                        Email.EmailNotSentException => "sender address not valid",
                        TaskCanceledException => "timed out",
                        _ => "unreachable",
                    };
                }
                results.Add(new { provider = route.Name, ok = error is null, error });
            }
            return Results.Ok(new { to, results });
        });

        // Sample data for demos (SampleData): fill replaces any earlier set; delete removes only sample people and their posts.
        admin.MapPost("/sample", async (ZarqaDb db, Retention retention, TimeProvider clock, CancellationToken ct) =>
            Results.Ok(await SampleData.FillAsync(db, retention, clock, ct)));
        admin.MapDelete("/sample", async (ZarqaDb db, Retention retention, CancellationToken ct) =>
            Results.Ok(new { users = await SampleData.DeleteAsync(db, retention, ct) }));

        // Wipes every report, chat, photo and non-admin account. Admins, RSA staff emails, settings and the campus map stay.
        admin.MapPost("/delete-everything", async (DeleteEverything body, ZarqaDb db, Retention retention, ILogger<Retention> log, CancellationToken ct) =>
        {
            if (body.Confirm != DeleteEverything.Word) return Errors.BadRequest($"Type {DeleteEverything.Word} to confirm.");
            var reportIds = await db.Reports.Select(r => r.Id).ToListAsync(ct);
            await retention.DeleteReportsAsync(reportIds, ct);
            var userIds = await db.Users.Where(u => !u.IsAdmin).Select(u => u.Id).ToListAsync(ct);
            foreach (var id in userIds) await retention.DeleteUserAsync(id, ct);
            await db.ConversationReads.ExecuteDeleteAsync(ct);
            await db.ReviewLogs.ExecuteDeleteAsync(ct);
            await db.MatchJobs.ExecuteDeleteAsync(ct);
            await db.LoginCodes.ExecuteDeleteAsync(ct);
            log.LogWarning("Admin deleted everything: {Reports} reports, {Users} accounts", reportIds.Count, userIds.Count);
            return Results.Ok(new { reports = reportIds.Count, users = userIds.Count });
        });

        admin.MapGet("/log", async (Guid? reportId, ZarqaDb db, CancellationToken ct) =>
        {
            var q = db.ReviewLogs.AsNoTracking().AsQueryable();
            if (reportId is { } rid) q = q.Where(l => l.ReportId == rid || l.CounterpartId == rid);
            var logs = await q.OrderByDescending(l => l.Id).Take(100)
                .Select(l => new { l.Id, l.ReportId, l.CounterpartId, l.Step, l.Payload, l.CostUsd, l.CreatedAt })
                .ToListAsync(ct);
            // Name the other report in each entry (its title and kind are already on the admin reports list).
            var otherIds = logs.Select(l => reportId is { } id && l.CounterpartId == id ? l.ReportId : l.CounterpartId).OfType<Guid>().Distinct().ToList();
            var others = await db.Reports.AsNoTracking().Where(r => otherIds.Contains(r.Id))
                .ToDictionaryAsync(r => r.Id, r => new { r.Title, Kind = r.Kind.ToString().ToLowerInvariant() }, ct);
            return logs.Select(l =>
            {
                var other = reportId is { } id && l.CounterpartId == id ? l.ReportId : l.CounterpartId;
                var o = other is { } oid && others.TryGetValue(oid, out var found) ? found : null;
                return new { l.Id, l.ReportId, l.CounterpartId, l.Step, l.Payload, l.CostUsd, l.CreatedAt, counterpartTitle = o?.Title, counterpartKind = o?.Kind };
            }).ToList();
        });
    }

    public sealed record DeleteEverything(string? Confirm)
    {
        public const string Word = "DELETE";
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
