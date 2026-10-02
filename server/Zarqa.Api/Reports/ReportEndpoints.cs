using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Chat;
using Zarqa.Api.Matching;
using Zarqa.Api.Photos;

namespace Zarqa.Api.Reports;

public static class ReportEndpoints
{
    public const int MaxPhotos = 4;
    public const int MaxPostsPerDay = 10;
    public static readonly TimeZoneInfo Campus = TimeZoneInfo.FindSystemTimeZoneById("Asia/Muscat");

    public record ReportDto(
        Guid Id, string Kind, string Title, string Category, string? CategoryKey, string Description,
        string? LocationName, string LocationText, string? EventDate, string? EventTime,
        string Status, string Pill, bool IsSensitive, Guid[] PhotoIds,
        Guid? MatchId, Guid? ConversationId, DateTimeOffset CreatedAt);

    public static void MapReports(this RouteGroupBuilder api)
    {
        var reports = api.MapGroup("/reports").RequireAuthorization();

        reports.MapPost("", async (HttpRequest req, ZarqaDb db, PhotoStore photos, TimeProvider clock, MatchQueue queue, CancellationToken ct) =>
        {
            var me = req.HttpContext.User.Id();
            var now = clock.GetUtcNow();
            var today = await db.Reports.CountAsync(r => r.UserId == me && r.CreatedAt > now.AddDays(-1), ct);
            if (today >= MaxPostsPerDay) return Errors.TooMany("That's a lot of posts for one day. Try again tomorrow.");

            if (!req.HasFormContentType) return Errors.BadRequest("Send the report as a form.");
            var form = await req.ReadFormAsync(ct);
            var kind = form["kind"].ToString() switch { "lost" => ReportKind.Lost, "found" => ReportKind.Found, _ => (ReportKind?)null };
            if (kind is null) return Errors.BadRequest("Is it lost or found?");

            var report = new Report
            {
                UserId = me,
                Kind = kind.Value,
                CategoryText = "",
                Title = "",
                LocationText = "",
                CreatedAt = now,
                UpdatedAt = now,
            };
            // The Home form sends one "text" box; older clients send title/category/description separately.
            var (title, category, description) = ((string?)form["title"], (string?)form["category"], (string?)form["description"]);
            if (form.ContainsKey("text"))
            {
                var parts = ReportText.Split(form["text"]);
                if (parts is null) return Errors.BadRequest("Tell me what it is first.");
                if (parts.Description.Length > 500) return Errors.BadRequest("Keep it under 500 characters.");
                (title, category, description) = (parts.Title, parts.Category, parts.Description);
            }
            var error = await ApplyFields(report, title, category, description, form["locationName"], form["locationText"],
                form["eventDate"], form["eventTime"], db, clock, ct);
            if (error is not null) return error;

            var files = form.Files.GetFiles("photos");
            if (files.Count > MaxPhotos) return Errors.BadRequest($"Up to {MaxPhotos} photos.");
            foreach (var file in files)
            {
                if (file.Length == 0) continue;
                if (file.Length > PhotoStore.MaxUploadBytes) return Errors.BadRequest("One of the photos is too big (15 MB max).");
                await using var stream = file.OpenReadStream();
                var key = await photos.SaveAsync(stream, PhotoStore.MaxEdge, ct);
                if (key is null) return Errors.BadRequest("One of the files isn't a photo we can read.");
                report.Photos.Add(new Photo { StorageKey = key, Position = report.Photos.Count, IsSensitive = report.IsSensitive, CreatedAt = now });
            }

            db.Reports.Add(report);
            await db.SaveChangesAsync(ct);
            await queue.EnqueueAsync(report.Id, ct);
            return Results.Ok(await ToDto(db, report, ct));
        }).DisableAntiforgery();

        reports.MapGet("/mine", async (string? kind, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var q = db.Reports.AsNoTracking().Include(r => r.Photos).Where(r => r.UserId == me);
            if (kind == "lost") q = q.Where(r => r.Kind == ReportKind.Lost);
            if (kind == "found") q = q.Where(r => r.Kind == ReportKind.Found);
            var list = await q.OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
            return await ToDtos(db, list, ct);
        });

        reports.MapGet("/{id:guid}", async (Guid id, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var r = await db.Reports.AsNoTracking().Include(x => x.Photos).FirstOrDefaultAsync(x => x.Id == id && x.UserId == http.User.Id(), ct);
            return r is null ? Errors.NotFound() : Results.Ok(await ToDto(db, r, ct));
        });

        reports.MapPatch("/{id:guid}", async (Guid id, PatchBody body, HttpContext http, ZarqaDb db, TimeProvider clock, MatchQueue queue, CancellationToken ct) =>
        {
            var r = await db.Reports.Include(x => x.Photos).FirstOrDefaultAsync(x => x.Id == id && x.UserId == http.User.Id(), ct);
            if (r is null) return Errors.NotFound();
            if (r.Status is not ReportStatus.Open) return Errors.BadRequest("Only reports that are still searching can be edited.");
            var error = await ApplyFields(r, body.Title ?? r.Title, body.Category ?? r.CategoryText, body.Description ?? r.Description,
                body.LocationName ?? (body.LocationText is null ? r.LocationName : null), body.LocationText ?? r.LocationText,
                body.EventDate, body.EventTime, db, clock, ct, keepWhenMissing: r);
            if (error is not null) return error;
            r.UpdatedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(ct);
            await queue.EnqueueAsync(r.Id, ct);
            return Results.Ok(await ToDto(db, r, ct));
        });

        reports.MapPost("/{id:guid}/close", async (Guid id, HttpContext http, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var r = await db.Reports.FirstOrDefaultAsync(x => x.Id == id && x.UserId == http.User.Id(), ct);
            if (r is null) return Errors.NotFound();
            if (r.Status == ReportStatus.InChat) return Errors.BadRequest("Finish the chat first: mark it returned there.");
            r.Status = ReportStatus.Closed;
            r.UpdatedAt = clock.GetUtcNow();
            await ExpireOpenMatches(db, r.Id, clock.GetUtcNow(), ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        reports.MapDelete("/{id:guid}", async (Guid id, HttpContext http, ZarqaDb db, PhotoStore photos, CancellationToken ct) =>
        {
            var r = await db.Reports.Include(x => x.Photos).FirstOrDefaultAsync(x => x.Id == id && x.UserId == http.User.Id(), ct);
            if (r is null) return Errors.NotFound();
            if (r.Status == ReportStatus.InChat) return Errors.BadRequest("Finish the chat first: mark it returned there.");
            var hasChat = await db.Conversations.AnyAsync(c => c.Match!.LostId == id || c.Match!.FoundId == id, ct);
            if (hasChat) return Errors.BadRequest("This report has a chat, so it stays. You can close it instead.");
            foreach (var p in r.Photos) photos.Delete(p.StorageKey);
            db.Reports.Remove(r);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        api.MapGet("/home", async (HttpContext http, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var me = http.User.Id();
            var since = clock.GetUtcNow().AddDays(-1);
            var postedToday = await db.Reports.CountAsync(r => r.UserId == me && r.CreatedAt > since, ct);
            var active = await db.Reports.CountAsync(r => r.UserId == me && (r.Status == ReportStatus.Open || r.Status == ReportStatus.InChat), ct);
            var waiting = await db.Matches.CountAsync(m => m.Status == MatchStatus.Suggested && m.Lost!.UserId == me, ct);
            var unread = await Chats.UnreadCountAsync(db, me, ct);
            return Results.Ok(new { active, matchesWaiting = waiting, unreadChats = unread, postsLeft = Math.Max(0, MaxPostsPerDay - postedToday) });
        }).RequireAuthorization();

        api.MapGet("/photos/{id:guid}", async (Guid id, HttpContext http, ZarqaDb db, PhotoStore photos, CancellationToken ct) =>
        {
            var photo = await db.Photos.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
            if (photo is null || !await PhotoAccess.CanViewAsync(db, http.User.Id(), photo, ct)) return Errors.NotFound();
            var path = photos.PathFor(photo.StorageKey);
            if (!File.Exists(path)) return Errors.NotFound();
            http.Response.Headers.CacheControl = "private, max-age=86400";
            return Results.File(path, "image/jpeg");
        }).RequireAuthorization();
    }

    public record PatchBody(string? Title, string? Category, string? Description, string? LocationName, string? LocationText, string? EventDate, string? EventTime);

    /// <summary>Validates and copies the editable fields. Null result means OK.</summary>
    private static async Task<IResult?> ApplyFields(Report r, string? title, string? category, string? description, string? locationName,
        string? locationText, string? eventDate, string? eventTime, ZarqaDb db, TimeProvider clock, CancellationToken ct, Report? keepWhenMissing = null)
    {
        title = Clean(title);
        category = Clean(category);
        description = Clean(description) ?? "";
        if (title is null || title.Length > 80) return Errors.BadRequest("Give the item a name (up to 80 characters).");
        // Category may be empty (one-box form, nothing recognised): it then just adds no category term.
        if (category is { Length: > 60 }) return Errors.BadRequest("Keep the category short.");
        category ??= "";
        if (description.Length > 500) return Errors.BadRequest("Keep the description under 500 characters.");

        // A name from the campus list wins; otherwise keep what they typed.
        var picked = Clean(locationName);
        var place = picked is null ? null : await db.Locations.AsNoTracking().FirstOrDefaultAsync(l => l.Name == picked, ct);
        var typed = Clean(locationText) ?? "";
        if (typed.Length > 120) return Errors.BadRequest("Keep the place under 120 characters.");

        DateOnly? date = null;
        TimeOnly? time = null;
        if (keepWhenMissing is not null && eventDate is null) { date = keepWhenMissing.EventDate; time = keepWhenMissing.EventTime; }
        else if (!string.IsNullOrWhiteSpace(eventDate))
        {
            if (!DateOnly.TryParseExact(eventDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
                return Errors.BadRequest("That date doesn't look right.");
            var todayCampus = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), Campus).DateTime);
            if (d > todayCampus) return Errors.BadRequest("That date is in the future.");
            if (d < todayCampus.AddYears(-1)) return Errors.BadRequest("That date is more than a year ago.");
            date = d;
            if (!string.IsNullOrWhiteSpace(eventTime))
            {
                if (!TimeOnly.TryParseExact(eventTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var t))
                    return Errors.BadRequest("That time doesn't look right.");
                time = t;
            }
        }

        r.Title = title;
        r.CategoryText = category;
        r.CategoryNorm = category.Length > 0 ? Categories.Normalize(category, title) : Categories.Normalize(description, title);
        r.Description = description;
        r.LocationName = place?.Name;
        r.LocationText = place?.Name ?? typed;
        r.EventDate = date;
        r.EventTime = time;
        r.IsSensitive = Categories.IsSensitive(category, title, description);
        foreach (var p in r.Photos) p.IsSensitive = r.IsSensitive;
        return null;
    }

    private static string? Clean(string? s)
    {
        var t = s?.Trim();
        return string.IsNullOrEmpty(t) ? null : System.Text.RegularExpressions.Regex.Replace(t, @"\s+", " ");
    }

    public static async Task ExpireOpenMatches(ZarqaDb db, Guid reportId, DateTimeOffset now, CancellationToken ct)
    {
        var open = await db.Matches.Where(m => m.Status == MatchStatus.Suggested && (m.LostId == reportId || m.FoundId == reportId)).ToListAsync(ct);
        foreach (var m in open) { m.Status = MatchStatus.Expired; m.ResolvedAt = now; }
    }

    private static async Task<ReportDto> ToDto(ZarqaDb db, Report r, CancellationToken ct) => (await ToDtos(db, [r], ct))[0];

    private static async Task<List<ReportDto>> ToDtos(ZarqaDb db, List<Report> list, CancellationToken ct)
    {
        var ids = list.Select(r => r.Id).ToList();
        // A lost report's first waiting match; the found side never sees suggestions (only the owner decides).
        var suggested = await db.Matches.AsNoTracking()
            .Where(m => m.Status == MatchStatus.Suggested && ids.Contains(m.LostId))
            .OrderByDescending(m => m.FinalScore)
            .Select(m => new { m.LostId, m.Id })
            .ToListAsync(ct);
        var chats = await db.Conversations.AsNoTracking()
            .Where(c => ids.Contains(c.Match!.LostId) || ids.Contains(c.Match!.FoundId))
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.Id, c.Match!.LostId, c.Match.FoundId })
            .ToListAsync(ct);

        return list.Select(r =>
        {
            var match = suggested.FirstOrDefault(m => m.LostId == r.Id)?.Id;
            var chat = chats.FirstOrDefault(c => c.LostId == r.Id || c.FoundId == r.Id)?.Id;
            var pill = r.Status switch
            {
                ReportStatus.Returned => "Returned",
                ReportStatus.InChat => "Chatting",
                ReportStatus.Closed or ReportStatus.Expired => "Closed",
                _ => match is not null ? "Possible match" : "Searching",
            };
            return new ReportDto(r.Id, r.Kind == ReportKind.Lost ? "lost" : "found", r.Title, r.CategoryText, r.CategoryNorm, r.Description,
                r.LocationName, r.LocationText, r.EventDate?.ToString("yyyy-MM-dd"), r.EventTime?.ToString("HH:mm"),
                r.Status.ToString(), pill, r.IsSensitive, r.Photos.OrderBy(p => p.Position).Select(p => p.Id).ToArray(),
                match, chat, r.CreatedAt);
        }).ToList();
    }
}

/// <summary>Who may see a photo. Found items are never browsable: only people a match connects.</summary>
public static class PhotoAccess
{
    public static async Task<bool> CanViewAsync(ZarqaDb db, Guid viewer, Photo photo, CancellationToken ct)
    {
        var report = await db.Reports.AsNoTracking().FirstAsync(r => r.Id == photo.ReportId, ct);
        if (report.UserId == viewer) return true;
        if (await db.Users.AnyAsync(u => u.Id == viewer && u.IsAdmin, ct)) return !photo.IsSensitive;
        // Card/ID photos stay with the uploader for the pilot: the chat is where ownership gets proven.
        if (photo.IsSensitive) return false;

        return report.Kind == ReportKind.Found
            // The lost-side owner sees the found item's photos for a match they're deciding on or confirmed.
            ? await db.Matches.AnyAsync(m => m.FoundId == report.Id && m.Lost!.UserId == viewer
                && (m.Status == MatchStatus.Suggested || m.Status == MatchStatus.Confirmed), ct)
            // The finder sees the lost report's photos once the owner has claimed it.
            : await db.Matches.AnyAsync(m => m.LostId == report.Id && m.Found!.UserId == viewer && m.Status == MatchStatus.Confirmed, ct);
    }
}
