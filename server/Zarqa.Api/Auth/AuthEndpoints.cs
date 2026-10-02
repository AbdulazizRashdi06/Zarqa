using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Api.Auth;

public static class AuthEndpoints
{
    public const string RequestCodeLimit = "auth-request-code";
    public const string VerifyLimit = "auth-verify";

    public record RequestCodeBody(string? Email);
    public record VerifyBody(string? Email, string? Code);

    public static void MapAuth(this RouteGroupBuilder api)
    {
        var auth = api.MapGroup("/auth");

        auth.MapPost("/request-code", async (RequestCodeBody body, ZarqaDb db, IEmailSender email, TimeProvider clock, CancellationToken ct) =>
        {
            var address = EmailRules.NormalizeUniversityEmail(body.Email);
            if (address is null) return Errors.BadRequest("Only GUtech emails can join (@gutech.edu.om).");

            var now = clock.GetUtcNow();
            var recent = await db.LoginCodes.CountAsync(c => c.Email == address && c.CreatedAt > now - LoginCodes.Window, ct);
            if (recent >= LoginCodes.MaxPerWindow)
                return Errors.TooMany("Too many codes for this email. Wait 15 minutes and try again.");

            var code = LoginCodes.Generate();
            db.LoginCodes.Add(new LoginCode
            {
                Email = address,
                CodeHash = LoginCodes.Hash(address, code),
                CreatedAt = now,
                ExpiresAt = now + LoginCodes.Lifetime,
            });
            await db.SaveChangesAsync(ct);
            await email.SendSignInCodeAsync(address, code, ct);
            return Results.Ok(new { email = address });
        }).RequireRateLimiting(RequestCodeLimit);

        auth.MapPost("/verify", async (VerifyBody body, ZarqaDb db, TimeProvider clock, HttpContext http, CancellationToken ct) =>
        {
            var address = EmailRules.NormalizeUniversityEmail(body.Email);
            var code = body.Code?.Trim();
            if (address is null || !LoginCodes.IsWellFormed(code)) return Errors.BadRequest("Enter the 6-digit code from your email.");

            var now = clock.GetUtcNow();
            // Only the newest live code counts; asking for a new one retires the old.
            var login = await db.LoginCodes
                .Where(c => c.Email == address && c.UsedAt == null && c.ExpiresAt > now)
                .OrderByDescending(c => c.CreatedAt)
                .FirstOrDefaultAsync(ct);
            if (login is null || login.Attempts >= LoginCodes.MaxAttempts)
                return Errors.BadRequest("That code has expired. Ask for a new one.");

            login.Attempts++;
            if (!LoginCodes.Verify(login.CodeHash, address, code!))
            {
                await db.SaveChangesAsync(ct);
                var left = LoginCodes.MaxAttempts - login.Attempts;
                return Errors.BadRequest(left > 0 ? $"Wrong code. {left} {(left == 1 ? "try" : "tries")} left." : "Wrong code. Ask for a new one.");
            }

            login.UsedAt = now;
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == address, ct);
            if (user is null)
            {
                user = new User { Email = address, CreatedAt = now };
                db.Users.Add(user);
            }
            if (user.IsBanned) return Errors.Forbidden("This account can't sign in. Contact us via Help.");
            user.LastSeenAt = now;
            await db.SaveChangesAsync(ct);

            var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())], CookieAuthenticationDefaults.AuthenticationScheme);
            await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
                new AuthenticationProperties { IsPersistent = true });

            return Results.Ok(new { isNew = user.FirstName is null });
        }).RequireRateLimiting(VerifyLimit);

        auth.MapPost("/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });
    }
}

/// <summary>Errors the PWA shows as-is: { "error": "…" }.</summary>
public static class Errors
{
    public static IResult BadRequest(string message) => Results.Json(new { error = message }, statusCode: StatusCodes.Status400BadRequest);
    public static IResult Forbidden(string message) => Results.Json(new { error = message }, statusCode: StatusCodes.Status403Forbidden);
    public static IResult NotFound(string message = "Not found.") => Results.Json(new { error = message }, statusCode: StatusCodes.Status404NotFound);
    public static IResult TooMany(string message) => Results.Json(new { error = message }, statusCode: StatusCodes.Status429TooManyRequests);
}
