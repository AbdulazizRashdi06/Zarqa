using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Photos;

namespace Zarqa.Api.Users;

public static partial class MeEndpoints
{
    public record MeDto(Guid Id, string Email, string? FirstName, string? SuggestedFirstName, bool ShowFirstName, bool MatchAlerts, string Locale, string? AvatarUrl, bool IsAdmin);

    public record PatchMeBody(string? FirstName, bool? ShowFirstName, bool? MatchAlerts);

    /// <summary>A first name: letters in any script (Arabic too), spaces, hyphens, apostrophes.</summary>
    [GeneratedRegex(@"^\p{L}[\p{L}\p{M}' -]{0,39}$")]
    private static partial Regex FirstNameRe();

    public static void MapMe(this RouteGroupBuilder api)
    {
        var me = api.MapGroup("/me").RequireAuthorization();

        me.MapGet("", async (HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var user = await db.Users.AsNoTracking().FirstAsync(u => u.Id == http.User.Id(), ct);
            return ToDto(user);
        });

        me.MapPatch("", async (PatchMeBody body, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var user = await db.Users.FirstAsync(u => u.Id == http.User.Id(), ct);
            if (body.FirstName is not null)
            {
                var name = Regex.Replace(body.FirstName.Trim(), @"\s+", " ");
                if (!FirstNameRe().IsMatch(name)) return Errors.BadRequest("Use letters only, up to 40 characters.");
                user.FirstName = name;
            }
            if (body.ShowFirstName is { } show) user.ShowFirstName = show;
            if (body.MatchAlerts is { } alerts) user.MatchAlerts = alerts;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(user));
        });

        me.MapGet("/stats", async (HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var id = http.User.Id();
            var posts = await db.Reports.CountAsync(r => r.UserId == id, ct);
            var gotBack = await db.Reports.CountAsync(r => r.UserId == id && r.Kind == ReportKind.Lost && r.Status == ReportStatus.Returned, ct);
            var helped = await db.Reports.CountAsync(r => r.UserId == id && r.Kind == ReportKind.Found && r.Status == ReportStatus.Returned, ct);
            return Results.Ok(new { posts, gotBack, helpedReturn = helped });
        });

        me.MapPost("/avatar", async (HttpRequest req, ZarqaDb db, PhotoStore photos, CancellationToken ct) =>
        {
            if (!req.HasFormContentType) return Errors.BadRequest("Send the photo as a form.");
            var file = (await req.ReadFormAsync(ct)).Files.GetFile("photo");
            if (file is null || file.Length == 0) return Errors.BadRequest("Pick a photo.");
            if (file.Length > PhotoStore.MaxUploadBytes) return Errors.BadRequest("That photo is too big (15 MB max).");
            await using var stream = file.OpenReadStream();
            var key = await photos.SaveAsync(stream, PhotoStore.AvatarEdge, ct);
            if (key is null) return Errors.BadRequest("That file isn't a photo we can read.");
            var user = await db.Users.FirstAsync(u => u.Id == req.HttpContext.User.Id(), ct);
            if (user.AvatarPhotoKey is not null) photos.Delete(user.AvatarPhotoKey);
            user.AvatarPhotoKey = key;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(user));
        }).DisableAntiforgery();

        me.MapDelete("/avatar", async (HttpContext http, ZarqaDb db, PhotoStore photos, CancellationToken ct) =>
        {
            var user = await db.Users.FirstAsync(u => u.Id == http.User.Id(), ct);
            if (user.AvatarPhotoKey is not null) photos.Delete(user.AvatarPhotoKey);
            user.AvatarPhotoKey = null;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(user));
        });

        api.MapGet("/avatars/{id:guid}", async (Guid id, ZarqaDb db, PhotoStore photos, HttpContext http, CancellationToken ct) =>
        {
            var key = await db.Users.Where(u => u.Id == id).Select(u => u.AvatarPhotoKey).FirstOrDefaultAsync(ct);
            if (key is null) return Errors.NotFound();
            var path = photos.PathFor(key);
            if (!File.Exists(path)) return Errors.NotFound();
            http.Response.Headers.CacheControl = "private, max-age=604800";
            return Results.File(path, "image/jpeg");
        }).RequireAuthorization();
    }

    private static MeDto ToDto(User u) =>
        new(u.Id, u.Email, u.FirstName, u.FirstName is null ? EmailRules.GuessFirstName(u.Email) : null, u.ShowFirstName, u.MatchAlerts, u.Locale,
            AvatarUrl(u), u.IsAdmin);

    /// <summary>Cache-busting URL of a user's avatar, or null.</summary>
    public static string? AvatarUrl(User u) =>
        u.AvatarPhotoKey is null ? null : $"/api/avatars/{u.Id}?v={Path.GetFileNameWithoutExtension(u.AvatarPhotoKey)[..8]}";

    /// <summary>The name other people see: the first name, or "GUtech student" when hidden.</summary>
    public static string DisplayName(User u) => u.ShowFirstName && u.FirstName is not null ? u.FirstName : "GUtech student";
}
