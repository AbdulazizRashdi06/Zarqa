using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using Zarqa.Api.Rsa;

using Zarqa.Api.Reports;

namespace Zarqa.Api.Chat;

/// <summary>The lost owner's decision on a suggested match (design: Match screen).</summary>
public static class MatchEndpoints
{
    /// <summary>Fixed display rule (decisions.md), not tuned.</summary>
    public const double StrongAt = 0.80;

    public const string Opening = "You two matched. Ask a question only the owner would know, and meet somewhere public.";

    public record SideDto(Guid Id, string Title, string Description, string? CategoryKey, string LocationText, string? EventDate, string? EventTime, Guid[] PhotoIds, DateTimeOffset CreatedAt,
        bool IsSensitive);
    /// <summary>AtRsa: the finder handed it to the RSA desk, so "It's mine" gives a pickup code instead of a chat.</summary>
    public record MatchDto(Guid Id, string Status, double FinalScore, string Strength, string[] Reasons, DateTimeOffset CreatedAt, SideDto Lost, SideDto Found,
        Guid? ConversationId, bool AtRsa, bool RsaReceived, string? PickupCode, bool Collected);

    public static void MapMatches(this RouteGroupBuilder api)
    {
        var matches = api.MapGroup("/matches").RequireAuthorization();

        matches.MapGet("/{id:guid}", async (Guid id, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var m = await Load(db, id, http.User.Id(), ct);
            if (m is null) return Errors.NotFound();
            var conversation = await db.Conversations.Where(c => c.MatchId == m.Id).Select(c => (Guid?)c.Id).FirstOrDefaultAsync(ct);
            return Results.Ok(new MatchDto(m.Id, m.Status.ToString(), m.FinalScore, m.FinalScore >= StrongAt ? "strong" : "likely", m.Reasons, m.CreatedAt,
                Side(m.Lost!), Side(m.Found!), conversation, m.Found!.DropAtRsa, m.Found.RsaReceivedAt is not null,
                m.Status == MatchStatus.Confirmed ? RsaCodes.Format(m.PickupCode) : null, m.CollectedAt is not null));
        });

        matches.MapPost("/{id:guid}/confirm", async (Guid id, HttpContext http, ZarqaDb db, TimeProvider clock, INotifier notifier, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var m = await Load(db, id, me, ct);
            if (m is null) return Errors.NotFound();
            var existing = await db.Conversations.FirstOrDefaultAsync(c => c.MatchId == m.Id, ct);
            if (existing is not null) return Results.Ok(new { conversationId = existing.Id });
            if (m.Status == MatchStatus.Confirmed && m.PickupCode is not null) return Results.Ok(new { pickupCode = RsaCodes.Format(m.PickupCode) });
            if (m.Status != MatchStatus.Suggested) return Errors.BadRequest("This match isn't open any more.");
            if (m.Found!.Status != ReportStatus.Open)
                return Errors.BadRequest(m.Found.DropAtRsa
                    ? "Someone else has already claimed this one at the RSA desk. Zarqa will tell you if it frees up."
                    : "Someone else is already talking to the finder about this one. Zarqa will tell you if it frees up.");

            var now = clock.GetUtcNow();
            if (m.Found.DropAtRsa)
            {
                // Held for the RSA desk: no chat. The owner collects it there with a pickup code.
                m.Status = MatchStatus.Confirmed;
                m.ResolvedAt = now;
                m.PickupCode = await RsaCodes.NewAsync(db, ct);
                m.Lost!.Status = ReportStatus.Pickup;
                m.Found.Status = ReportStatus.Pickup;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { pickupCode = RsaCodes.Format(m.PickupCode) });
            }

            m.Status = MatchStatus.Confirmed;
            m.ResolvedAt = now;
            m.Lost!.Status = ReportStatus.InChat;
            m.Found.Status = ReportStatus.InChat;
            var conversation = new Conversation { MatchId = m.Id, LostUserId = me, FoundUserId = m.Found.UserId, CreatedAt = now };
            db.Conversations.Add(conversation);
            await db.SaveChangesAsync(ct);
            db.Messages.Add(new Message { ConversationId = conversation.Id, Kind = MessageKind.System, Body = Opening, CreatedAt = now });
            await db.SaveChangesAsync(ct);
            await notifier.ClaimedAsync(conversation.Id, ct);
            return Results.Ok(new { conversationId = conversation.Id });
        });

        matches.MapPost("/{id:guid}/reject", async (Guid id, HttpContext http, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var m = await Load(db, id, http.User.Id(), ct);
            if (m is null) return Errors.NotFound();
            if (m.Status != MatchStatus.Suggested) return Errors.BadRequest("This match isn't open any more.");
            m.Status = MatchStatus.Rejected;
            m.ResolvedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    /// <summary>Only the lost owner ever sees a match: the finder never browses lost reports.</summary>
    private static Task<Match?> Load(ZarqaDb db, Guid id, Guid me, CancellationToken ct) =>
        db.Matches.Include(m => m.Lost).ThenInclude(r => r!.Photos).Include(m => m.Found).ThenInclude(r => r!.Photos)
            .FirstOrDefaultAsync(m => m.Id == id && m.Lost!.UserId == me, ct);

    private static SideDto Side(Report r) => new(r.Id, r.Title, r.Description, r.CategoryNorm, r.LocationText, r.EventDate?.ToString("yyyy-MM-dd"),
        r.EventTime?.ToString("HH:mm"), PhotoAccess.SharedIds(r), r.CreatedAt, r.IsSensitive);
}
