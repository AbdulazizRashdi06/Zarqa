using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WebPush;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using DbPushSubscription = Zarqa.Api.Data.PushSubscription;

namespace Zarqa.Api.Notifications;

public sealed record PushPayload(string Title, string Body, string Url, string Tag);

public interface IPushSender
{
    /// <summary>False when the subscription is gone (the browser unsubscribed) and should be deleted.</summary>
    Task<bool> SendAsync(DbPushSubscription subscription, PushPayload payload, CancellationToken ct);
}

/// <summary>
/// The app's VAPID key pair, generated once and kept in app_settings (no secret to manage by hand).
/// </summary>
public sealed class VapidKeys(IServiceScopeFactory scopes)
{
    private const string PublicKeyName = "vapid_public";
    private const string PrivateKeyName = "vapid_private";
    public const string Subject = "mailto:hello@tryzarqa.com";
    private readonly SemaphoreSlim _lock = new(1, 1);
    private VapidDetails? _details;

    public async Task<VapidDetails> GetAsync(CancellationToken ct)
    {
        if (_details is not null) return _details;
        await _lock.WaitAsync(ct);
        try
        {
            if (_details is not null) return _details;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ZarqaDb>();
            var stored = await db.AppSettings.Where(s => s.Key == PublicKeyName || s.Key == PrivateKeyName).ToDictionaryAsync(s => s.Key, s => s.Value, ct);
            if (!stored.TryGetValue(PublicKeyName, out var pub) || !stored.TryGetValue(PrivateKeyName, out var priv))
            {
                var keys = VapidHelper.GenerateVapidKeys();
                (pub, priv) = (keys.PublicKey, keys.PrivateKey);
                db.AppSettings.RemoveRange(db.AppSettings.Where(s => s.Key == PublicKeyName || s.Key == PrivateKeyName));
                db.AppSettings.Add(new AppSetting { Key = PublicKeyName, Value = pub });
                db.AppSettings.Add(new AppSetting { Key = PrivateKeyName, Value = priv });
                await db.SaveChangesAsync(ct);
            }
            return _details = new VapidDetails(Subject, pub, priv);
        }
        finally
        {
            _lock.Release();
        }
    }
}

public sealed class WebPushSender(VapidKeys keys, ILogger<WebPushSender> log) : IPushSender
{
    private static readonly WebPushClient Client = new();

    public async Task<bool> SendAsync(DbPushSubscription s, PushPayload payload, CancellationToken ct)
    {
        try
        {
            await Client.SendNotificationAsync(new WebPush.PushSubscription(s.Endpoint, s.P256dh, s.Auth),
                JsonSerializer.Serialize(payload, JsonSerializerOptions.Web), await keys.GetAsync(ct), ct);
            return true;
        }
        catch (WebPushException e) when (e.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound)
        {
            return false;
        }
        catch (WebPushException e)
        {
            log.LogWarning("Push to {Host} failed: {Status}", new Uri(s.Endpoint).Host, e.StatusCode);
            return true;
        }
    }
}

public static class PushEndpoints
{
    public record SubscribeBody(string? Endpoint, Keys? Keys);
    public record Keys(string? P256dh, string? Auth);

    public static void MapPush(this RouteGroupBuilder api)
    {
        var push = api.MapGroup("/push").RequireAuthorization();

        push.MapGet("/key", async (VapidKeys keys, CancellationToken ct) => Results.Ok(new { publicKey = (await keys.GetAsync(ct)).PublicKey }));

        push.MapPost("/subscribe", async (SubscribeBody body, HttpContext http, ZarqaDb db, TimeProvider clock, CancellationToken ct) =>
        {
            if (body.Endpoint is not { Length: > 0 and < 1000 } endpoint || !Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "https"
                || string.IsNullOrEmpty(body.Keys?.P256dh) || string.IsNullOrEmpty(body.Keys.Auth))
                return Errors.BadRequest("That push subscription doesn't look right.");
            var me = http.User.Id();
            var existing = await db.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == endpoint, ct);
            if (existing is null)
                db.PushSubscriptions.Add(new DbPushSubscription { UserId = me, Endpoint = endpoint, P256dh = body.Keys.P256dh, Auth = body.Keys.Auth, CreatedAt = clock.GetUtcNow() });
            else
            {
                // A device that signs in as someone else now belongs to them.
                existing.UserId = me;
                existing.P256dh = body.Keys.P256dh;
                existing.Auth = body.Keys.Auth;
            }
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        push.MapPost("/unsubscribe", async (SubscribeBody body, HttpContext http, ZarqaDb db, CancellationToken ct) =>
        {
            var me = http.User.Id();
            await db.PushSubscriptions.Where(s => s.Endpoint == body.Endpoint && s.UserId == me).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });
    }
}
