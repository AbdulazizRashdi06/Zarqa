using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;

namespace Zarqa.Api.Users;

public static partial class MeEndpoints
{
    public record MeDto(Guid Id, string Email, string? FirstName, string? SuggestedFirstName, bool ShowFirstName, bool MatchAlerts, string Locale);

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
    }

    private static MeDto ToDto(User u) =>
        new(u.Id, u.Email, u.FirstName, u.FirstName is null ? EmailRules.GuessFirstName(u.Email) : null, u.ShowFirstName, u.MatchAlerts, u.Locale);
}
