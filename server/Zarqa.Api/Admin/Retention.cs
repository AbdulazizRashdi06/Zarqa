using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Notifications;
using Zarqa.Api.Photos;

namespace Zarqa.Api.Admin;

/// <summary>
/// Data retention (decisions.md): open reports expire after 60 days (with a "still looking?" email),
/// finished reports and their chats are deleted after 6 months, old sign-in codes after a day.
/// Also used by "Delete my account".
/// </summary>
public sealed class Retention(ZarqaDb db, PhotoStore photos, IEmailSender email, TimeProvider clock, ILogger<Retention> log)
{
    public static readonly TimeSpan ExpireAfter = TimeSpan.FromDays(60);
    public static readonly TimeSpan DeleteAfter = TimeSpan.FromDays(182);

    public async Task RunAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        // 1. Expire open reports nobody has touched for 60 days, and say so.
        var stale = await db.Reports.Include(r => r.User)
            .Where(r => r.Status == ReportStatus.Open && r.UpdatedAt < now - ExpireAfter).ToListAsync(ct);
        foreach (var r in stale)
        {
            r.Status = ReportStatus.Expired;
            r.UpdatedAt = now;
            await Reports.ReportEndpoints.ExpireOpenMatches(db, r.Id, now, ct);
            var (html, text) = NoticeEmail.Build("STILL LOOKING?", $"Your {r.Kind.ToString().ToLowerInvariant()} report \"{r.Title}\" has expired",
                "It's been 60 days, so Zarqa stopped matching it. If you're still looking, post it again on the home screen and I'll keep watching.");
            try { await email.SendAsync(r.User!.Email, $"Still looking for your {r.Title}?", html, text, ct); }
            catch (Exception e) when (!ct.IsCancellationRequested) { log.LogWarning("Expiry email failed: {Message}", e.Message); }
        }
        await db.SaveChangesAsync(ct);

        // 2. Delete finished reports (and their matches, chats and photos) after 6 months.
        var old = await db.Reports.Where(r => (r.Status == ReportStatus.Returned || r.Status == ReportStatus.Expired || r.Status == ReportStatus.Closed)
                                              && r.UpdatedAt < now - DeleteAfter).Select(r => r.Id).ToListAsync(ct);
        await DeleteReportsAsync(old, ct);

        // 3. Housekeeping.
        await db.LoginCodes.Where(c => c.CreatedAt < now.AddDays(-1)).ExecuteDeleteAsync(ct);
        await db.ReviewLogs.Where(l => l.CreatedAt < now - DeleteAfter).ExecuteDeleteAsync(ct);
        await db.MatchJobs.Where(j => j.CompletedAt != null && j.CompletedAt < now.AddDays(-30)).ExecuteDeleteAsync(ct);

        if (stale.Count > 0 || old.Count > 0) log.LogInformation("Retention: expired {Expired} reports, deleted {Deleted}", stale.Count, old.Count);
    }

    /// <summary>Deletes reports with everything hanging off them: photos on disk, matches, chats and messages.</summary>
    public async Task DeleteReportsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return;
        var matchIds = await db.Matches.Where(m => ids.Contains(m.LostId) || ids.Contains(m.FoundId)).Select(m => m.Id).ToListAsync(ct);
        var chatIds = await db.Conversations.Where(c => matchIds.Contains(c.MatchId)).Select(c => c.Id).ToListAsync(ct);
        await db.Messages.Where(m => chatIds.Contains(m.ConversationId)).ExecuteDeleteAsync(ct);
        await db.ConversationReads.Where(r => chatIds.Contains(r.ConversationId)).ExecuteDeleteAsync(ct);
        await db.Conversations.Where(c => chatIds.Contains(c.Id)).ExecuteDeleteAsync(ct);
        foreach (var key in await db.Photos.Where(p => ids.Contains(p.ReportId)).Select(p => p.StorageKey).ToListAsync(ct)) photos.Delete(key);
        await db.MatchJobs.Where(j => ids.Contains(j.ReportId)).ExecuteDeleteAsync(ct);
        await db.Reports.Where(r => ids.Contains(r.Id)).ExecuteDeleteAsync(ct); // photos and matches cascade
    }

    /// <summary>"Delete my account": every report, chat, photo and push subscription, then the user.</summary>
    public async Task DeleteUserAsync(Guid userId, CancellationToken ct)
    {
        var reportIds = await db.Reports.Where(r => r.UserId == userId).Select(r => r.Id).ToListAsync(ct);
        // Chats the user took part in go too, so the other side's reports return to searching.
        var otherReports = await db.Conversations.Where(c => c.LostUserId == userId || c.FoundUserId == userId)
            .Select(c => c.LostUserId == userId ? c.Match!.FoundId : c.Match!.LostId).ToListAsync(ct);
        await DeleteReportsAsync(reportIds, ct);
        await db.Reports.Where(r => otherReports.Contains(r.Id) && r.Status == ReportStatus.InChat)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, ReportStatus.Open), ct);
        await db.PushSubscriptions.Where(s => s.UserId == userId).ExecuteDeleteAsync(ct);
        await db.ConversationReads.Where(r => r.UserId == userId).ExecuteDeleteAsync(ct);
        var user = await db.Users.FirstAsync(u => u.Id == userId, ct);
        if (user.AvatarPhotoKey is not null) photos.Delete(user.AvatarPhotoKey);
        await db.LoginCodes.Where(c => c.Email == user.Email).ExecuteDeleteAsync(ct);
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
    }
}

/// <summary>Runs <see cref="Retention"/> shortly after start, then daily.</summary>
public sealed class RetentionWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<RetentionWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), clock, stop).ContinueWith(_ => { }, CancellationToken.None);
        while (!stop.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<Retention>().RunAsync(stop);
            }
            catch (Exception e) when (!stop.IsCancellationRequested)
            {
                log.LogError(e, "Retention run failed");
            }
            await Task.Delay(TimeSpan.FromDays(1), clock, stop).ContinueWith(_ => { }, CancellationToken.None);
        }
    }
}
