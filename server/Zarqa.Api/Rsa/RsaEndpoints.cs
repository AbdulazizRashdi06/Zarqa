using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using Zarqa.Api.Reports;
using Zarqa.Api.Users;

namespace Zarqa.Api.Rsa;

/// <summary>
/// The RSA desk (decisions.md, 2026-10-26): finders may hand found items to the RSA, the RSA marks them received
/// by drop code, owners collect them with a pickup code (no chat), and staff can read chats without writing.
/// Staff are listed in rsa_members; admins always have access.
/// </summary>
public static class RsaEndpoints
{
    public const string Policy = "rsa";

    public record ItemDto(Guid Id, string? Code, string Title, string Description, string? CategoryKey, string LocationText, string? EventDate,
        bool IsSensitive, Guid[] PhotoIds, string State, string FinderName, DateTimeOffset CreatedAt, DateTimeOffset? ReceivedAt);

    public record ClaimDto(string Code, string OwnerName, string Title, string Description, string LocationText, string? EventDate, DateTimeOffset ClaimedAt);

    public record DeskDto(string Type, ItemDto Item, ClaimDto? Claim);

    public record ChatSummaryDto(Guid Id, string ItemTitle, string LostName, string FoundName, string Status, string? LastMessage, DateTimeOffset LastAt, int Messages);

    public record ChatMessageDto(long Id, string Kind, string? From, string Text, DateTimeOffset At, string? HandoverAt, string? HandoverPlace, string? HandoverStatus);

    public record ChatThreadDto(Guid Id, string ItemTitle, string LostName, string FoundName, string Status, List<ChatMessageDto> Messages);

    public record TeamBody(string? Email);

    public static void MapRsa(this RouteGroupBuilder api)
    {
        var rsa = api.MapGroup("/rsa").RequireAuthorization(Policy);

        // One box at the desk: a drop code (finder hands an item in) or a pickup code (owner collects).
        rsa.MapGet("/desk/{code}", async (string code, ZarqaDb db, CancellationToken ct) =>
        {
            var c = RsaCodes.Normalize(code);
            if (c is null) return Errors.BadRequest("Codes look like K7P-4QM.");
            var dropped = await Items(db).FirstOrDefaultAsync(r => r.DropCode == c, ct);
            if (dropped is not null)
            {
                var claim = await ActiveClaim(db, dropped.Id, ct);
                return Results.Ok(new DeskDto("drop", ToItem(dropped), claim is null ? null : ToClaim(claim)));
            }
            var m = await Claims(db).FirstOrDefaultAsync(x => x.PickupCode == c, ct);
            if (m is null) return Errors.NotFound("No item with that code. Check it with them again.");
            if (m.Status != MatchStatus.Confirmed) return Errors.BadRequest("That pickup code isn't active any more.");
            return Results.Ok(new DeskDto("pickup", ToItem(m.Found!), ToClaim(m)));
        });

        rsa.MapPost("/drop/{code}/receive", async (string code, HttpContext http, ZarqaDb db, TimeProvider clock, INotifier notifier, CancellationToken ct) =>
        {
            var c = RsaCodes.Normalize(code);
            var r = c is null ? null : await Items(db).FirstOrDefaultAsync(x => x.DropCode == c, ct);
            if (r is null) return Errors.NotFound("No item with that code.");
            if (r.Status is not (ReportStatus.Open or ReportStatus.Pickup)) return Errors.BadRequest("This report is already finished.");
            if (r.RsaReceivedAt is null)
            {
                r.RsaReceivedAt = clock.GetUtcNow();
                r.RsaReceivedBy = http.User.Id();
                r.UpdatedAt = r.RsaReceivedAt.Value;
                await db.SaveChangesAsync(ct);
                await notifier.RsaReceivedAsync(r.Id, ct);
            }
            return Results.Ok(ToItem(r));
        });

        rsa.MapPost("/pickup/{code}/handover", async (string code, HttpContext http, ZarqaDb db, TimeProvider clock, INotifier notifier, CancellationToken ct) =>
        {
            var m = await ActivePickup(db, code, ct);
            if (m is null) return Errors.NotFound("That pickup code isn't active.");
            var now = clock.GetUtcNow();
            m.CollectedAt = now;
            m.CollectedBy = http.User.Id();
            // Handed over at the desk counts as received, even if nobody scanned the drop code.
            m.Found!.RsaReceivedAt ??= now;
            m.Found.RsaReceivedBy ??= m.CollectedBy;
            foreach (var r in new[] { m.Lost!, m.Found })
            {
                r.Status = ReportStatus.Returned;
                r.UpdatedAt = now;
                await ReportEndpoints.ExpireOpenMatches(db, r.Id, now, ct);
            }
            await db.SaveChangesAsync(ct);
            await notifier.CollectedAsync(m.Id, ct);
            return Results.NoContent();
        });

        // "Not theirs": the description didn't fit the item. Both reports go back to searching.
        rsa.MapPost("/pickup/{code}/reject", async (string code, ZarqaDb db, TimeProvider clock, MatchQueue queue, CancellationToken ct) =>
        {
            var m = await ActivePickup(db, code, ct);
            if (m is null) return Errors.NotFound("That pickup code isn't active.");
            var now = clock.GetUtcNow();
            m.Status = MatchStatus.Rejected;
            m.ResolvedAt = now;
            foreach (var r in new[] { m.Lost!, m.Found! }.Where(r => r.Status == ReportStatus.Pickup))
            {
                r.Status = ReportStatus.Open;
                r.UpdatedAt = now;
            }
            await db.SaveChangesAsync(ct);
            await queue.EnqueueAsync(m.LostId, ct);
            await queue.EnqueueAsync(m.FoundId, ct);
            return Results.NoContent();
        });

        // The shelf: items on their way, held and claimed; ?done=true for recently finished ones.
        rsa.MapGet("/items", async (bool? done, ZarqaDb db, CancellationToken ct) =>
        {
            var q = Items(db).AsNoTracking().Where(r => r.DropAtRsa);
            q = done == true
                ? q.Where(r => r.Status == ReportStatus.Returned || r.Status == ReportStatus.Closed || r.Status == ReportStatus.Expired)
                : q.Where(r => r.Status == ReportStatus.Open || r.Status == ReportStatus.Pickup);
            var list = await q.OrderByDescending(r => r.UpdatedAt).Take(300).ToListAsync(ct);
            return list.Select(ToItem);
        });

        // An item the RSA gives away or passes on after nobody claimed it.
        rsa.MapPost("/items/{id:guid}/close", async (Guid id, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var r = await db.Reports.FirstOrDefaultAsync(x => x.Id == id && x.DropAtRsa, ct);
            if (r is null) return Errors.NotFound();
            if (r.Status == ReportStatus.Pickup) return Errors.BadRequest("Someone has claimed it. Hand it over or mark it not theirs first.");
            if (r.Status != ReportStatus.Open) return Errors.BadRequest("This one is already finished.");
            var now = clock.GetUtcNow();
            r.Status = ReportStatus.Closed;
            r.UpdatedAt = now;
            await ReportEndpoints.ExpireOpenMatches(db, r.Id, now, ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Chats, read-only: there is deliberately no way for staff to post or change anything here.
        rsa.MapGet("/conversations", async (ZarqaDb db, CancellationToken ct) =>
        {
            var list = await db.Conversations.AsNoTracking().Include(c => c.Match).ThenInclude(m => m!.Lost)
                .OrderByDescending(c => c.CreatedAt).Take(200).ToListAsync(ct);
            var users = await Users(db, list, ct);
            var ids = list.Select(c => c.Id).ToList();
            var stats = await db.Messages.AsNoTracking().Where(m => ids.Contains(m.ConversationId))
                .GroupBy(m => m.ConversationId).Select(g => new { Id = g.Key, Count = g.Count(), LastId = g.Max(m => m.Id) }).ToListAsync(ct);
            var lastIds = stats.Select(s => s.LastId).ToList();
            var last = await db.Messages.AsNoTracking().Where(m => lastIds.Contains(m.Id)).ToDictionaryAsync(m => m.ConversationId, ct);
            return list.Select(c =>
            {
                last.TryGetValue(c.Id, out var l);
                return new ChatSummaryDto(c.Id, c.Match!.Lost!.Title, Name(users, c.LostUserId), Name(users, c.FoundUserId), c.Status.ToString(),
                    l is null ? null : Preview(l), l?.CreatedAt ?? c.CreatedAt, stats.FirstOrDefault(s => s.Id == c.Id)?.Count ?? 0);
            }).OrderByDescending(c => c.Status == "Active").ThenByDescending(c => c.LastAt);
        });

        rsa.MapGet("/conversations/{id:guid}", async (Guid id, ZarqaDb db, CancellationToken ct) =>
        {
            var c = await db.Conversations.AsNoTracking().Include(x => x.Match).ThenInclude(m => m!.Lost).FirstOrDefaultAsync(x => x.Id == id, ct);
            if (c is null) return Errors.NotFound();
            var users = await Users(db, [c], ct);
            var messages = await db.Messages.AsNoTracking().Where(m => m.ConversationId == id).OrderBy(m => m.Id).ToListAsync(ct);
            return Results.Ok(new ChatThreadDto(c.Id, c.Match!.Lost!.Title, Name(users, c.LostUserId), Name(users, c.FoundUserId), c.Status.ToString(),
                messages.Select(m => new ChatMessageDto(m.Id, m.Kind.ToString().ToLowerInvariant(),
                    m.SenderId is null ? null : m.SenderId == c.LostUserId ? "lost" : "found", m.Body, m.CreatedAt,
                    m.HandoverAt is { } at ? Local(at).ToString("yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture) : null,
                    m.HandoverPlace, m.HandoverStatus?.ToString().ToLowerInvariant())).ToList()));
        });

        // The team: the owner adds the first person, and staff add colleagues.
        rsa.MapGet("/team", async (ZarqaDb db, CancellationToken ct) =>
            await db.RsaMembers.AsNoTracking().OrderBy(m => m.AddedAt).Select(m => new { m.Email, m.AddedAt }).ToListAsync(ct));

        rsa.MapPost("/team", async (TeamBody body, HttpContext http, ZarqaDb db, TimeProvider clock, IConfiguration config, CancellationToken ct) =>
        {
            var email = EmailRules.NormalizeSignInEmail(body.Email, config["Auth:AllowedEmails"]);
            if (email is null) return Errors.BadRequest("Use their GUtech email address.");
            if (!await db.RsaMembers.AnyAsync(m => m.Email == email, ct))
            {
                db.RsaMembers.Add(new RsaMember { Email = email, AddedBy = http.User.Id(), AddedAt = clock.GetUtcNow() });
                await db.SaveChangesAsync(ct);
            }
            return Results.NoContent();
        });

        rsa.MapDelete("/team/{email}", async (string email, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var address = email.Trim().ToLowerInvariant();
            var mine = await db.Users.Where(u => u.Id == http.User.Id()).Select(u => u.Email).FirstAsync(ct);
            if (address == mine) return Errors.BadRequest("You can't remove yourself. Ask a colleague.");
            await db.RsaMembers.Where(m => m.Email == address).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });
    }

    private static IQueryable<Report> Items(ZarqaDb db) => db.Reports.Include(r => r.Photos).Include(r => r.User);

    private static IQueryable<Match> Claims(ZarqaDb db) =>
        db.Matches.Include(m => m.Lost).ThenInclude(r => r!.User).Include(m => m.Found).ThenInclude(r => r!.Photos)
            .Include(m => m.Found).ThenInclude(r => r!.User);

    private static Task<Match?> ActiveClaim(ZarqaDb db, Guid foundId, CancellationToken ct) =>
        Claims(db).FirstOrDefaultAsync(m => m.FoundId == foundId && m.Status == MatchStatus.Confirmed && m.PickupCode != null && m.CollectedAt == null, ct);

    private static async Task<Match?> ActivePickup(ZarqaDb db, string code, CancellationToken ct)
    {
        var c = RsaCodes.Normalize(code);
        return c is null ? null : await Claims(db).FirstOrDefaultAsync(m => m.PickupCode == c && m.Status == MatchStatus.Confirmed && m.CollectedAt == null, ct);
    }

    public static string State(Report r) => r.Status switch
    {
        ReportStatus.Pickup => "claimed",
        ReportStatus.Open => r.RsaReceivedAt is null ? "expected" : "held",
        ReportStatus.Returned => "collected",
        _ => "closed",
    };

    private static ItemDto ToItem(Report r) => new(r.Id, RsaCodes.Format(r.DropCode), r.Title, r.Description, r.CategoryNorm, r.LocationText,
        r.EventDate?.ToString("yyyy-MM-dd"), r.IsSensitive, r.IsSensitive ? [] : r.Photos.OrderBy(p => p.Position).Select(p => p.Id).ToArray(),
        State(r), r.User is null ? "GUtech student" : MeEndpoints.DisplayName(r.User), r.CreatedAt, r.RsaReceivedAt);

    // Staff check the item against what the owner wrote, so they see the owner's own words and first name.
    private static ClaimDto ToClaim(Match m) => new(RsaCodes.Format(m.PickupCode)!, m.Lost!.User?.FirstName ?? "GUtech student", m.Lost.Title,
        m.Lost.Description, m.Lost.LocationText, m.Lost.EventDate?.ToString("yyyy-MM-dd"), m.ResolvedAt ?? m.CreatedAt);

    private static async Task<Dictionary<Guid, User>> Users(ZarqaDb db, List<Conversation> list, CancellationToken ct)
    {
        var ids = list.SelectMany(c => new[] { c.LostUserId, c.FoundUserId }).Distinct().ToList();
        return await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
    }

    private static string Name(Dictionary<Guid, User> users, Guid id) => users.TryGetValue(id, out var u) && u.FirstName is not null ? u.FirstName : "GUtech student";

    private static string Preview(Message m) => m.Kind == MessageKind.Handover
        ? $"Handover: {Local(m.HandoverAt!.Value):ddd h:mm tt} · {m.HandoverPlace}"
        : TextRules.Truncate(m.Body, 120);

    private static DateTime Local(DateTimeOffset at) => TimeZoneInfo.ConvertTime(at, ReportEndpoints.Campus).DateTime;
}
