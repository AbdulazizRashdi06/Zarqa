using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using Zarqa.Api.Reports;
using Zarqa.Api.Users;

namespace Zarqa.Api.Chat;

/// <summary>Chats between the owner and the finder (design: Chats, Chat, Returned).</summary>
public static class ChatEndpoints
{
    public const int MaxMessage = 2000;

    public record ConversationDto(Guid Id, string OtherName, string? OtherAvatarUrl, string ItemTitle, string MyRole, string Status,
        string? LastMessage, DateTimeOffset LastAt, int Unread);

    public record MessageDto(long Id, string Kind, bool Mine, string Text, DateTimeOffset At,
        string? HandoverAt, string? HandoverPlace, string? HandoverStatus, bool CanConfirm);

    public record ThreadDto(Guid Id, string OtherName, string? OtherAvatarUrl, string ItemTitle, string MyRole, string Status, List<MessageDto> Messages);

    public record SendBody(string? Text);
    public record HandoverBody(string? Date, string? Time, string? Place);

    public static void MapChats(this RouteGroupBuilder api)
    {
        var chats = api.MapGroup("/conversations").RequireAuthorization();

        chats.MapGet("", async (HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var list = await db.Conversations.AsNoTracking()
                .Include(c => c.Match).ThenInclude(m => m!.Lost)
                .Where(c => c.LostUserId == me || c.FoundUserId == me)
                .ToListAsync(ct);
            var others = await OtherUsers(db, list, me, ct);
            var result = new List<ConversationDto>();
            foreach (var c in list)
            {
                var last = await db.Messages.AsNoTracking().Where(m => m.ConversationId == c.Id).OrderByDescending(m => m.Id).FirstOrDefaultAsync(ct);
                var read = await db.ConversationReads.Where(r => r.UserId == me && r.ConversationId == c.Id).Select(r => (long?)r.LastReadMessageId).FirstOrDefaultAsync(ct) ?? 0;
                var unread = await db.Messages.CountAsync(m => m.ConversationId == c.Id && m.Id > read && m.SenderId != me, ct);
                var other = others[c.LostUserId == me ? c.FoundUserId : c.LostUserId];
                result.Add(new ConversationDto(c.Id, MeEndpoints.DisplayName(other), MeEndpoints.AvatarUrl(other), c.Match!.Lost!.Title,
                    c.LostUserId == me ? "lost" : "found", c.Status.ToString(), last is null ? null : Preview(last, me), last?.CreatedAt ?? c.CreatedAt, unread));
            }
            return result.OrderByDescending(c => c.Status == "Active").ThenByDescending(c => c.LastAt);
        });

        chats.MapGet("/{id:guid}", async (Guid id, long? after, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var c = await Mine(db, id, me, ct);
            if (c is null) return Errors.NotFound();
            var other = await db.Users.AsNoTracking().FirstAsync(u => u.Id == (c.LostUserId == me ? c.FoundUserId : c.LostUserId), ct);
            var lostTitle = await db.Reports.Where(r => r.Id == c.Match!.LostId).Select(r => r.Title).FirstAsync(ct);
            var messages = await db.Messages.AsNoTracking().Where(m => m.ConversationId == id && m.Id > (after ?? 0)).OrderBy(m => m.Id).ToListAsync(ct);
            return Results.Ok(new ThreadDto(c.Id, MeEndpoints.DisplayName(other), MeEndpoints.AvatarUrl(other), lostTitle,
                c.LostUserId == me ? "lost" : "found", c.Status.ToString(), messages.Select(m => ToDto(m, me)).ToList()));
        });

        chats.MapPost("/{id:guid}/messages", async (Guid id, SendBody body, HttpContext http, ZarqaDb db, TimeProvider clock, INotifier notifier, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var c = await Mine(db, id, me, ct);
            if (c is null) return Errors.NotFound();
            if (c.Status != ConversationStatus.Active) return Errors.BadRequest("This chat is closed.");
            var text = body.Text?.Trim();
            if (string.IsNullOrEmpty(text)) return Errors.BadRequest("Type a message first.");
            if (text.Length > MaxMessage) return Errors.BadRequest("That message is too long.");
            var m = new Message { ConversationId = id, SenderId = me, Kind = MessageKind.Text, Body = text, CreatedAt = clock.GetUtcNow() };
            db.Messages.Add(m);
            await db.SaveChangesAsync(ct);
            await MarkRead(db, me, id, m.Id, ct);
            await notifier.MessageAsync(m.Id, ct);
            return Results.Ok(ToDto(m, me));
        });

        chats.MapPost("/{id:guid}/handover", async (Guid id, HandoverBody body, HttpContext http, ZarqaDb db, TimeProvider clock, INotifier notifier, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var c = await Mine(db, id, me, ct);
            if (c is null) return Errors.NotFound();
            if (c.Status != ConversationStatus.Active) return Errors.BadRequest("This chat is closed.");
            var place = body.Place?.Trim();
            if (string.IsNullOrEmpty(place) || place.Length > 120) return Errors.BadRequest("Where should you meet?");
            if (!DateOnly.TryParseExact(body.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                || !TimeOnly.TryParseExact(body.Time, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
                return Errors.BadRequest("Pick a day and a time.");
            // Typed in campus time; Postgres stores UTC.
            var at = new DateTimeOffset(date.ToDateTime(time), ReportEndpoints.Campus.GetUtcOffset(date.ToDateTime(time))).ToUniversalTime();
            if (at < clock.GetUtcNow().AddMinutes(-30)) return Errors.BadRequest("That time has already passed.");

            var now = clock.GetUtcNow();
            foreach (var old in await db.Messages.Where(x => x.ConversationId == id && x.Kind == MessageKind.Handover && x.HandoverStatus == HandoverStatus.Suggested).ToListAsync(ct))
                old.HandoverStatus = HandoverStatus.Replaced;
            var m = new Message
            {
                ConversationId = id, SenderId = me, Kind = MessageKind.Handover, Body = "",
                HandoverAt = at, HandoverPlace = place, HandoverStatus = HandoverStatus.Suggested, CreatedAt = now,
            };
            db.Messages.Add(m);
            await db.SaveChangesAsync(ct);
            await MarkRead(db, me, id, m.Id, ct);
            await notifier.HandoverAsync(m.Id, ct);
            return Results.Ok(ToDto(m, me));
        });

        api.MapPost("/handovers/{messageId:long}/confirm", async (long messageId, HttpContext http, ZarqaDb db, INotifier notifier, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var m = await db.Messages.FirstOrDefaultAsync(x => x.Id == messageId && x.Kind == MessageKind.Handover, ct);
            if (m is null || await Mine(db, m.ConversationId, me, ct) is null) return Errors.NotFound();
            if (m.SenderId == me) return Errors.BadRequest("The other person confirms your suggestion.");
            if (m.HandoverStatus != HandoverStatus.Suggested) return Errors.BadRequest("That suggestion was replaced. Check the newest one.");
            m.HandoverStatus = HandoverStatus.Confirmed;
            await db.SaveChangesAsync(ct);
            await notifier.HandoverAsync(m.Id, ct);
            return Results.Ok(ToDto(m, me));
        }).RequireAuthorization();

        chats.MapPost("/{id:guid}/read", async (Guid id, ReadBody body, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var me = http.User.Id();
            if (await Mine(db, id, me, ct) is null) return Errors.NotFound();
            await MarkRead(db, me, id, body.LastMessageId, ct);
            return Results.NoContent();
        });

        // Returned is a handshake: one person asks, the other confirms. Nothing closes on a single tap.
        chats.MapPost("/{id:guid}/returned", async (Guid id, HttpContext http, ZarqaDb db, TimeProvider clock, INotifier notifier, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var c = await Mine(db, id, me, ct);
            if (c is null) return Errors.NotFound();
            if (c.Status != ConversationStatus.Active) return Errors.BadRequest("This chat is closed.");
            var pending = await PendingReturn(db, id, ct);
            if (pending is not null)
                return pending.SenderId == me ? Results.Ok(ToDto(pending, me)) : Errors.BadRequest("They already asked. Confirm their ticket instead.");
            var body = c.LostUserId == me ? "I got it back. Can you confirm?" : "I handed it over. Did you get it back?";
            var m = new Message { ConversationId = id, SenderId = me, Kind = MessageKind.Return, Body = body, HandoverStatus = HandoverStatus.Suggested, CreatedAt = clock.GetUtcNow() };
            db.Messages.Add(m);
            await db.SaveChangesAsync(ct);
            await MarkRead(db, me, id, m.Id, ct);
            await notifier.MessageAsync(m.Id, ct);
            return Results.Ok(ToDto(m, me));
        });

        api.MapPost("/returns/{messageId:long}/confirm", async (long messageId, HttpContext http, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var m = await db.Messages.FirstOrDefaultAsync(x => x.Id == messageId && x.Kind == MessageKind.Return, ct);
            var c = m is null ? null : await Mine(db, m.ConversationId, me, ct);
            if (m is null || c is null) return Errors.NotFound();
            if (m.SenderId == me) return Errors.BadRequest("The other person confirms this.");
            if (m.HandoverStatus != HandoverStatus.Suggested || c.Status != ConversationStatus.Active) return Errors.BadRequest("That request isn't open any more.");
            var now = clock.GetUtcNow();
            m.HandoverStatus = HandoverStatus.Confirmed;
            c.Status = ConversationStatus.Returned;
            c.ReturnedAt = now;
            foreach (var r in await db.Reports.Where(r => r.Id == c.Match!.LostId || r.Id == c.Match!.FoundId).ToListAsync(ct))
            {
                r.Status = ReportStatus.Returned;
                r.UpdatedAt = now;
                await ReportEndpoints.ExpireOpenMatches(db, r.Id, now, ct);
            }
            db.Messages.Add(new Message { ConversationId = c.Id, Kind = MessageKind.System, Body = "Returned. Back where it belongs. Thank you both!", CreatedAt = now });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(m, me));
        }).RequireAuthorization();

        // The asker withdraws it, or the other person says it isn't back yet. The chat stays open.
        api.MapPost("/returns/{messageId:long}/decline", async (long messageId, HttpContext http, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var m = await db.Messages.FirstOrDefaultAsync(x => x.Id == messageId && x.Kind == MessageKind.Return, ct);
            if (m is null || await Mine(db, m.ConversationId, me, ct) is null) return Errors.NotFound();
            if (m.HandoverStatus != HandoverStatus.Suggested) return Errors.BadRequest("That request isn't open any more.");
            m.HandoverStatus = HandoverStatus.Replaced;
            if (m.SenderId != me)
                db.Messages.Add(new Message { ConversationId = m.ConversationId, Kind = MessageKind.System, Body = "Not back yet. Keep chatting and sort out the handover.", CreatedAt = clock.GetUtcNow() });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(m, me));
        }).RequireAuthorization();

        chats.MapPost("/{id:guid}/not-it", async (Guid id, HttpContext http, ZarqaDb db, TimeProvider clock, MatchQueue queue, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var c = await Mine(db, id, me, ct);
            if (c is null) return Errors.NotFound();
            if (c.Status != ConversationStatus.Active) return Errors.BadRequest("This chat is closed.");
            var now = clock.GetUtcNow();
            c.Status = ConversationStatus.Closed;
            var match = await db.Matches.FirstAsync(m => m.Id == c.MatchId, ct);
            match.Status = MatchStatus.Rejected;
            match.ResolvedAt = now;
            var reports = await db.Reports.Where(r => r.Id == match.LostId || r.Id == match.FoundId).ToListAsync(ct);
            foreach (var r in reports.Where(r => r.Status == ReportStatus.InChat))
            {
                r.Status = ReportStatus.Open;
                r.UpdatedAt = now;
            }
            db.Messages.Add(new Message { ConversationId = id, Kind = MessageKind.System, Body = "Not the same item after all. I'll keep looking for both of you.", CreatedAt = now });
            await db.SaveChangesAsync(ct);
            foreach (var r in reports) await queue.EnqueueAsync(r.Id, ct);
            return Results.NoContent();
        });
    }

    public record ReadBody(long LastMessageId);

    private static async Task<Conversation?> Mine(ZarqaDb db, Guid id, Guid me, CancellationToken ct) =>
        await db.Conversations.Include(c => c.Match).FirstOrDefaultAsync(c => c.Id == id && (c.LostUserId == me || c.FoundUserId == me), ct);

    private static Task<Message?> PendingReturn(ZarqaDb db, Guid conversationId, CancellationToken ct) =>
        db.Messages.FirstOrDefaultAsync(m => m.ConversationId == conversationId && m.Kind == MessageKind.Return && m.HandoverStatus == HandoverStatus.Suggested, ct);

    private static async Task<Dictionary<Guid, User>> OtherUsers(ZarqaDb db, List<Conversation> list, Guid me, CancellationToken ct)
    {
        var ids = list.Select(c => c.LostUserId == me ? c.FoundUserId : c.LostUserId).Distinct().ToList();
        return await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
    }

    private static async Task MarkRead(ZarqaDb db, Guid me, Guid conversationId, long messageId, CancellationToken ct)
    {
        var read = await db.ConversationReads.FirstOrDefaultAsync(r => r.UserId == me && r.ConversationId == conversationId, ct);
        if (read is null) db.ConversationReads.Add(new ConversationRead { UserId = me, ConversationId = conversationId, LastReadMessageId = messageId });
        else if (messageId > read.LastReadMessageId) read.LastReadMessageId = messageId;
        await db.SaveChangesAsync(ct);
    }

    private static string Preview(Message m, Guid me) => m.Kind switch
    {
        MessageKind.System => m.Body,
        MessageKind.Handover => $"Handover: {Local(m.HandoverAt!.Value):ddd h:mm tt} · {m.HandoverPlace}",
        _ => (m.SenderId == me ? "You: " : "") + m.Body,
    };

    private static DateTime Local(DateTimeOffset at) => TimeZoneInfo.ConvertTime(at, ReportEndpoints.Campus).DateTime;

    private static MessageDto ToDto(Message m, Guid me) => new(
        m.Id,
        m.Kind.ToString().ToLowerInvariant(),
        m.SenderId == me,
        m.Body,
        m.CreatedAt,
        m.HandoverAt is { } at ? Local(at).ToString("yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture) : null,
        m.HandoverPlace,
        m.HandoverStatus?.ToString().ToLowerInvariant(),
        m.Kind is MessageKind.Handover or MessageKind.Return && m.HandoverStatus == HandoverStatus.Suggested && m.SenderId != me);
}
