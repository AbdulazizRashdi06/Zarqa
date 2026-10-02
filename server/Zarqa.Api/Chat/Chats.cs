using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Chat;

public static class Chats
{
    /// <summary>Messages from the other person (or Zarqa) that this user hasn't read yet, across all chats.</summary>
    public static async Task<int> UnreadCountAsync(ZarqaDb db, Guid me, CancellationToken ct) =>
        await (from c in db.Conversations
               where c.LostUserId == me || c.FoundUserId == me
               from m in db.Messages.Where(m => m.ConversationId == c.Id && m.SenderId != me)
               let read = db.ConversationReads.Where(r => r.UserId == me && r.ConversationId == c.Id).Select(r => (long?)r.LastReadMessageId).FirstOrDefault() ?? 0
               where m.Id > read
               select m.Id).CountAsync(ct);
}
