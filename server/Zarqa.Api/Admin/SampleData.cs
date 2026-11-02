using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;
using Zarqa.Api.Reports;
using Zarqa.Api.Rsa;

namespace Zarqa.Api.Admin;

/// <summary>
/// Sample data for showing Zarqa off: made-up people on the reserved .invalid domain with reports, matches,
/// chats and RSA items in every state. It is never matched, never emailed (ResendEmailSender skips .invalid)
/// and "Delete sample data" removes all of it. Nobody can sign in as these people: .invalid fails the sign-in rule.
/// </summary>
public static class SampleData
{
    public const string EmailDomain = "sample.invalid";
    public const string EmailSuffix = "@" + EmailDomain;

    public static bool IsSample(string email) => email.EndsWith(EmailSuffix, StringComparison.OrdinalIgnoreCase);

    public sealed record Counts(int Users, int Reports, int Matches, int Chats);

    /// <summary>Replaces any earlier sample data with a fresh set.</summary>
    public static async Task<Counts> FillAsync(ZarqaDb db, Retention retention, TimeProvider clock, CancellationToken ct)
    {
        await DeleteAsync(db, retention, ct);
        var now = clock.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime.AddHours(4));

        var people = new Dictionary<string, User>();
        foreach (var name in new[] { "Wahhaj", "Maryam", "Huda", "Ahmed", "Omar", "Sara", "Khalid", "Salim", "Aisha" })
        {
            var u = new User { Id = Guid.NewGuid(), Email = $"{name.ToLowerInvariant()}{EmailSuffix}", FirstName = name, CreatedAt = now.AddDays(-12), MatchAlerts = false };
            people[name] = u;
            db.Users.Add(u);
        }

        Report R(string who, ReportKind kind, string text, string place, int daysAgo, ReportStatus status = ReportStatus.Open)
        {
            var parts = ReportText.Split(text)!;
            var r = new Report
            {
                Id = Guid.NewGuid(), UserId = people[who].Id, Kind = kind, Title = parts.Title, CategoryText = parts.Category,
                CategoryNorm = Categories.Normalize(parts.Category, parts.Title), Description = parts.Description,
                LocationName = place, LocationText = place, EventDate = today.AddDays(-daysAgo), Status = status,
                CreatedAt = now.AddDays(-daysAgo).AddHours(-2), UpdatedAt = now.AddDays(-daysAgo),
            };
            db.Reports.Add(r);
            return r;
        }
        async Task DropAtRsa(Report r, bool received)
        {
            r.DropAtRsa = true;
            r.DropCode = await RsaCodes.NewAsync(db, ct);
            if (received) r.RsaReceivedAt = r.UpdatedAt.AddHours(1);
        }
        Match M(Report lost, Report found, double score, MatchStatus status, string[] reasons, int hoursAgo)
        {
            var m = new Match
            {
                Id = Guid.NewGuid(), LostId = lost.Id, FoundId = found.Id, Prescore = 0.7, SameItem = score, Overall = score, FinalScore = score,
                DecidedBy = MatchDecider.Debate, Reasons = reasons, Status = status, CreatedAt = now.AddHours(-hoursAgo),
                ResolvedAt = status == MatchStatus.Suggested ? null : now.AddHours(-hoursAgo + 1),
            };
            db.Matches.Add(m);
            return m;
        }
        long nextId = 0;
        Conversation Chat(Match m, Report lost, Report found, ConversationStatus status, params (string? who, MessageKind kind, string body, int minutesAgo)[] lines)
        {
            var c = new Conversation { Id = Guid.NewGuid(), MatchId = m.Id, LostUserId = lost.UserId, FoundUserId = found.UserId, Status = status, CreatedAt = m.ResolvedAt ?? now };
            if (status == ConversationStatus.Returned) c.ReturnedAt = now.AddMinutes(-lines[^1].minutesAgo);
            db.Conversations.Add(c);
            foreach (var (who, kind, body, minutesAgo) in lines)
                db.Messages.Add(new Message
                {
                    ConversationId = c.Id, SenderId = who is null ? null : people[who].Id, Kind = kind, Body = body,
                    CreatedAt = now.AddMinutes(-minutesAgo - ++nextId * 0.01),
                    HandoverAt = kind == MessageKind.Handover ? now.AddHours(2) : null,
                    HandoverPlace = kind == MessageKind.Handover ? "GU1 Library entrance" : null,
                    HandoverStatus = kind == MessageKind.Handover ? HandoverStatus.Suggested : null,
                });
            return c;
        }
        const string hello = "You two matched. Say hi and agree where to meet.";

        // 1. A big-chance suggestion waiting for the owner; the finder handed it to the RSA desk.
        var puffLost = R("Wahhaj", ReportKind.Lost, "Puff bottle, purple and gold, small dent on the lid. My favourite bottle", "GU1 Library", 1);
        var puffFound = R("Maryam", ReportKind.Found, "Purple Puff bottle with gold marble, dent on the lid", "GU1 Library", 1);
        await DropAtRsa(puffFound, received: true);
        M(puffLost, puffFound, 0.86, MatchStatus.Suggested, ["Both are a purple Puff bottle with gold marble", "Both mention a small dent on the lid", "Lost and found in GU1 Library on the same day"], 1);

        // 2. A chat in progress, with a handover time suggested.
        var podsLost = R("Ahmed", ReportKind.Lost, "Black AirPods Pro case with a small cat sticker on the back", "GU1 Library", 0, ReportStatus.InChat);
        var podsFound = R("Huda", ReportKind.Found, "Black AirPods case, sticker on the back", "GU1 Library", 0, ReportStatus.InChat);
        var podsMatch = M(podsLost, podsFound, 0.74, MatchStatus.Confirmed, ["Both are a black AirPods Pro case", "Both mention a sticker on the back", "Same building, same morning"], 3);
        Chat(podsMatch, podsLost, podsFound, ConversationStatus.Active,
            (null, MessageKind.System, hello, 170), ("Huda", MessageKind.Text, "Hi! Sticker on the back?", 160),
            ("Ahmed", MessageKind.Text, "Yes, a small cat sticker", 158), ("Huda", MessageKind.Text, "That's the one. I'm in the library till 1", 150),
            ("Huda", MessageKind.Handover, "", 149));

        // 3. Returned through the chat.
        var watchLost = R("Sara", ReportKind.Lost, "Black Casio watch, cracked strap", "Ground Canteen", 9, ReportStatus.Returned);
        var watchFound = R("Omar", ReportKind.Found, "Casio watch near the canteen", "Ground Canteen", 9, ReportStatus.Returned);
        var watchMatch = M(watchLost, watchFound, 0.91, MatchStatus.Confirmed, ["Both are a black Casio watch", "Found where it was lost", "Same day"], 24 * 9);
        Chat(watchMatch, watchLost, watchFound, ConversationStatus.Returned,
            (null, MessageKind.System, hello, 60 * 24 * 9), ("Omar", MessageKind.Text, "Found your watch near the canteen", 60 * 24 * 9 - 5),
            ("Sara", MessageKind.Text, "Thank you!! Can I get it after class?", 60 * 24 * 9 - 9),
            (null, MessageKind.System, "Returned. Back where it belongs. Thank you both!", 60 * 24 * 8));

        // 4. Claimed at the RSA desk, waiting for pickup.
        var calcLost = R("Khalid", ReportKind.Lost, "Casio fx-991 calculator, name scratched off the back", "Mechatronics Lab", 3, ReportStatus.Pickup);
        var calcFound = R("Salim", ReportKind.Found, "Grey Casio calculator", "Mechatronics Lab", 3, ReportStatus.Pickup);
        await DropAtRsa(calcFound, received: true);
        var calcMatch = M(calcLost, calcFound, 0.83, MatchStatus.Confirmed, ["Both are a Casio fx-991 calculator", "Same lab, same day"], 30);
        calcMatch.PickupCode = await RsaCodes.NewAsync(db, ct);

        // 5. A small-chance suggestion.
        var bagLost = R("Khalid", ReportKind.Lost, "Black backpack with a white logo", "Sports Hall", 2);
        var bagFound = R("Huda", ReportKind.Found, "Dark grey backpack, no name inside", "Sports Hall", 2);
        M(bagLost, bagFound, 0.58, MatchStatus.Suggested, ["Both are a dark backpack", "Both at the Sports Hall"], 20);

        // 6. Still searching, with nothing yet.
        R("Aisha", ReportKind.Lost, "Grey GUtech hoodie, size M", "Sports Hall", 4);
        R("Salim", ReportKind.Lost, "Car keys with a red tag", "Student Parking", 1);
        R("Aisha", ReportKind.Found, "Navy umbrella with a wooden handle", "Oman Hall", 0);
        var phone = R("Omar", ReportKind.Found, "White AirPods case, small scratch on the front", "GU2 UPAD Building", 0);
        await DropAtRsa(phone, received: false);
        var keys = R("Maryam", ReportKind.Found, "Silver house keys on a blue ring", "Main Entrance", 1);
        await DropAtRsa(keys, received: true);

        await db.SaveChangesAsync(ct);
        return new Counts(people.Count, await db.Reports.CountAsync(r => r.User!.Email.EndsWith(EmailSuffix), ct),
            await db.Matches.CountAsync(m => m.Lost!.User!.Email.EndsWith(EmailSuffix), ct),
            await db.Conversations.CountAsync(c => db.Users.Any(u => u.Id == c.LostUserId && u.Email.EndsWith(EmailSuffix)), ct));
    }

    /// <summary>Removes every sample person and everything they posted. Real people's reports matched to them go back to searching.</summary>
    public static async Task<int> DeleteAsync(ZarqaDb db, Retention retention, CancellationToken ct)
    {
        var ids = await db.Users.Where(u => u.Email.EndsWith(EmailSuffix)).Select(u => u.Id).ToListAsync(ct);
        foreach (var id in ids) await retention.DeleteUserAsync(id, ct);
        return ids.Count;
    }
}
