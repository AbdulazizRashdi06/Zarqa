using System.Globalization;
using System.Net;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Auth;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;
using Zarqa.Api.Reports;
using Zarqa.Api.Users;

namespace Zarqa.Api.Notifications;

/// <summary>
/// Notifications run off the request path: requests enqueue, a background service sends.
/// A failed push or email never fails the action that caused it.
/// </summary>
public sealed class NotificationQueue
{
    private readonly Channel<Func<IServiceProvider, CancellationToken, Task>> _channel =
        Channel.CreateBounded<Func<IServiceProvider, CancellationToken, Task>>(new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.DropOldest });

    public void Enqueue(Func<IServiceProvider, CancellationToken, Task> work) => _channel.Writer.TryWrite(work);

    public ChannelReader<Func<IServiceProvider, CancellationToken, Task>> Reader => _channel.Reader;
}

public sealed class NotificationWorker(NotificationQueue queue, IServiceScopeFactory scopes, ILogger<NotificationWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        await foreach (var work in queue.Reader.ReadAllAsync(stop))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await work(scope.ServiceProvider, stop);
            }
            catch (Exception e) when (!stop.IsCancellationRequested)
            {
                log.LogWarning(e, "A notification failed to send");
            }
        }
    }
}

/// <summary>The real <see cref="INotifier"/>: web push to every device, plus email for matches and claims.</summary>
public sealed class Notifier(NotificationQueue queue) : INotifier
{
    public Task MatchCreatedAsync(Guid matchId, CancellationToken ct)
    {
        queue.Enqueue((sp, c) => sp.GetRequiredService<NotificationSender>().MatchCreatedAsync(matchId, c));
        return Task.CompletedTask;
    }

    public Task ClaimedAsync(Guid conversationId, CancellationToken ct)
    {
        queue.Enqueue((sp, c) => sp.GetRequiredService<NotificationSender>().ClaimedAsync(conversationId, c));
        return Task.CompletedTask;
    }

    public Task MessageAsync(long messageId, CancellationToken ct)
    {
        queue.Enqueue((sp, c) => sp.GetRequiredService<NotificationSender>().MessageAsync(messageId, c));
        return Task.CompletedTask;
    }

    public Task HandoverAsync(long messageId, CancellationToken ct)
    {
        queue.Enqueue((sp, c) => sp.GetRequiredService<NotificationSender>().HandoverAsync(messageId, c));
        return Task.CompletedTask;
    }

    public Task RsaReceivedAsync(Guid reportId, CancellationToken ct)
    {
        queue.Enqueue((sp, c) => sp.GetRequiredService<NotificationSender>().RsaReceivedAsync(reportId, c));
        return Task.CompletedTask;
    }

    public Task CollectedAsync(Guid matchId, CancellationToken ct)
    {
        queue.Enqueue((sp, c) => sp.GetRequiredService<NotificationSender>().CollectedAsync(matchId, c));
        return Task.CompletedTask;
    }
}

/// <summary>Builds and sends each notification. Public methods are also called directly by tests.</summary>
public sealed class NotificationSender(ZarqaDb db, IPushSender push, IEmailSender email, ILogger<NotificationSender> log)
{
    public async Task MatchCreatedAsync(Guid matchId, CancellationToken ct)
    {
        var m = await db.Matches.Include(x => x.Lost).ThenInclude(r => r!.User).Include(x => x.Found).FirstOrDefaultAsync(x => x.Id == matchId, ct);
        var owner = m?.Lost?.User;
        if (m is null || owner is null || !owner.MatchAlerts) return;
        await PushAsync(owner.Id, new PushPayload("Zarqa spotted something 👀", $"Is this your {m.Lost!.Title}? Tap to see.", $"/matches/{m.Id}", $"match-{m.Id}"), ct);
        var (html, text) = NoticeEmail.Build("ZARQA SPOTTED SOMETHING", $"Is this your {m.Lost.Title}?", m.Found!.DropAtRsa
            ? "Someone found an item that looks a lot like yours and handed it to the RSA desk. Open Zarqa and check the match: if it's yours, you'll get a pickup code."
            : "Someone found an item that looks a lot like yours. Open Zarqa and check the match: if it's yours, you can message the finder right away.");
        await SafeEmailAsync(owner.Email, $"Zarqa spotted a possible match for your {m.Lost.Title}", html, text, ct);
    }

    public async Task ClaimedAsync(Guid conversationId, CancellationToken ct)
    {
        var c = await db.Conversations.Include(x => x.Match).ThenInclude(m => m!.Found).FirstOrDefaultAsync(x => x.Id == conversationId, ct);
        if (c is null) return;
        var finder = await db.Users.FirstAsync(u => u.Id == c.FoundUserId, ct);
        var owner = await db.Users.FirstAsync(u => u.Id == c.LostUserId, ct);
        var item = c.Match!.Found!.Title;
        await PushAsync(finder.Id, new PushPayload("Someone thinks it's theirs", $"{MeEndpoints.DisplayName(owner)} says the {item} is theirs. Say hi!", $"/chats/{c.Id}", $"chat-{c.Id}"), ct);
        var (html, text) = NoticeEmail.Build("YOU'RE A LEGEND", $"Someone thinks the {item} is theirs",
            $"{MeEndpoints.DisplayName(owner)} saw your found report and says it's theirs. Open Zarqa to chat: ask a question only the owner would know, then meet somewhere public on campus.");
        await SafeEmailAsync(finder.Email, $"Someone thinks the {item} is theirs", html, text, ct);
    }

    public async Task MessageAsync(long messageId, CancellationToken ct)
    {
        var (m, c, sender, to) = await LoadAsync(messageId, ct);
        if (m is null) return;
        await PushAsync(to, new PushPayload(MeEndpoints.DisplayName(sender!), TextRules.Truncate(m.Body, 120), $"/chats/{c!.Id}", $"chat-{c.Id}"), ct);
    }

    public async Task HandoverAsync(long messageId, CancellationToken ct)
    {
        var (m, c, sender, to) = await LoadAsync(messageId, ct);
        if (m is null || m.HandoverAt is null) return;
        var when = TimeZoneInfo.ConvertTime(m.HandoverAt.Value, ReportEndpoints.Campus).ToString("ddd h:mm tt", CultureInfo.InvariantCulture);
        // A confirmation is sent by the confirmer, so tell the person who suggested it.
        var (title, recipient) = m.HandoverStatus == HandoverStatus.Confirmed
            ? ($"Handover confirmed: {when}", m.SenderId!.Value)
            : ($"{MeEndpoints.DisplayName(sender!)} suggested a handover", to);
        await PushAsync(recipient, new PushPayload(title, $"{when} · {m.HandoverPlace}", $"/chats/{c!.Id}", $"chat-{c.Id}"), ct);
    }

    public async Task RsaReceivedAsync(Guid reportId, CancellationToken ct)
    {
        var r = await db.Reports.Include(x => x.User).FirstOrDefaultAsync(x => x.Id == reportId, ct);
        if (r?.User is null) return;
        await PushAsync(r.UserId, new PushPayload("The RSA has it ✅", $"The {r.Title} is safe at the RSA desk. You're a legend.", $"/reports/{r.Id}", $"report-{r.Id}"), ct);
        // Someone already said "It's mine": now they can go and get it.
        var m = await db.Matches.Include(x => x.Lost).ThenInclude(x => x!.User)
            .FirstOrDefaultAsync(x => x.FoundId == reportId && x.Status == MatchStatus.Confirmed && x.PickupCode != null && x.CollectedAt == null, ct);
        var owner = m?.Lost?.User;
        if (m is null || owner is null) return;
        var code = Rsa.RsaCodes.Format(m.PickupCode);
        await PushAsync(owner.Id, new PushPayload("Ready to collect 🎉", $"Your {m.Lost!.Title} is at the RSA desk. Pickup code {code}.", $"/matches/{m.Id}", $"match-{m.Id}"), ct);
        var (html, text) = NoticeEmail.Build("READY TO COLLECT", $"Your {m.Lost.Title} is at the RSA desk",
            $"Show the pickup code {code} at the RSA desk and bring your student ID. They'll check it against your description and hand it over.");
        await SafeEmailAsync(owner.Email, $"Your {m.Lost.Title} is ready to collect", html, text, ct);
    }

    public async Task CollectedAsync(Guid matchId, CancellationToken ct)
    {
        var m = await db.Matches.Include(x => x.Found).FirstOrDefaultAsync(x => x.Id == matchId, ct);
        if (m?.Found is null) return;
        await PushAsync(m.Found.UserId, new PushPayload("Back where it belongs 💛", $"The {m.Found.Title} you found is back with its owner. Thank you!", $"/reports/{m.Found.Id}", $"report-{m.Found.Id}"), ct);
    }

    private async Task<(Message?, Conversation?, User?, Guid)> LoadAsync(long messageId, CancellationToken ct)
    {
        var m = await db.Messages.FirstOrDefaultAsync(x => x.Id == messageId, ct);
        if (m?.SenderId is null) return (null, null, null, Guid.Empty);
        var c = await db.Conversations.FirstAsync(x => x.Id == m.ConversationId, ct);
        var sender = await db.Users.FirstAsync(u => u.Id == m.SenderId, ct);
        return (m, c, sender, c.LostUserId == m.SenderId ? c.FoundUserId : c.LostUserId);
    }

    private async Task PushAsync(Guid userId, PushPayload payload, CancellationToken ct)
    {
        foreach (var s in await db.PushSubscriptions.Where(s => s.UserId == userId).ToListAsync(ct))
            if (!await push.SendAsync(s, payload, ct)) db.PushSubscriptions.Remove(s);
        await db.SaveChangesAsync(ct);
    }

    private async Task SafeEmailAsync(string to, string subject, string html, string text, CancellationToken ct)
    {
        try { await email.SendAsync(to, subject, html, text, ct); }
        catch (Exception e) when (!ct.IsCancellationRequested) { log.LogWarning("Notification email to {Email} failed: {Message}", to, e.Message); }
    }
}

/// <summary>Notice emails in the sign-in email's look. No links, like every Zarqa email.</summary>
public static class NoticeEmail
{
    public static (string Html, string Text) Build(string label, string headline, string body)
    {
        static string e(string s) => WebUtility.HtmlEncode(s);
        var text = $"{headline}\n\n{body}\n\nOpen Zarqa (tryzarqa.com) on your phone to see it.\n\nZarqa · the GUtech lost & found, made by students";
        var html = $"""
            <!doctype html>
            <html lang="en" style="background:#222634;">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(headline)}</title></head>
            <body style="margin:0;padding:0;background:#222634;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#222634;">
                <tr><td align="center" style="padding:32px 16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;">
                    <tr><td style="padding:0 4px 20px;font-family:Impact,'Arial Narrow Bold',sans-serif;font-size:30px;letter-spacing:1px;color:#BD9777;">ZARQA</td></tr>
                    <tr><td style="background:#F2EEE8;border-radius:20px;padding:28px 24px;font-family:Arial,Helvetica,sans-serif;color:#222634;">
                      <div style="font-family:'Courier New',monospace;font-size:12px;font-weight:bold;letter-spacing:2px;color:#8A6A4F;">{e(label)}</div>
                      <div style="font-family:Impact,'Arial Narrow Bold',sans-serif;font-size:30px;line-height:1.1;margin:10px 0 14px;">{e(headline)}</div>
                      <div style="font-size:15px;line-height:1.5;">{e(body)}</div>
                      <div style="border-top:2px dashed #CFC6BA;margin:22px 0 16px;"></div>
                      <div style="font-size:13px;line-height:1.5;color:#5E6472;">Open Zarqa (tryzarqa.com) on your phone to see it. Turn these emails off in Profile → Match alerts.</div>
                    </td></tr>
                    <tr><td style="padding:18px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#A9B4B6;">Zarqa · the GUtech lost &amp; found, made by students for students.</td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
        return (html, text);
    }
}
