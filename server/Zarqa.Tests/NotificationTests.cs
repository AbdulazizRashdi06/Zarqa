using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Zarqa.Api.Data;
using Zarqa.Api.Notifications;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

public class NotificationTests(TestApp app) : IClassFixture<TestApp>
{
    private async Task Subscribe(HttpClient http, string endpoint) =>
        (await http.PostAsJsonAsync("/api/push/subscribe", new { endpoint, keys = new { p256dh = "BPublicKeyForTests", auth = "authsecret" } })).EnsureSuccessStatusCode();

    private async Task<(HttpClient Owner, HttpClient Finder, Guid Match, string OwnerEmail, string FinderEmail)> Pair(string tag)
    {
        var ownerEmail = $"owner.{tag}@gutech.edu.om";
        var finderEmail = $"finder.{tag}@gutech.edu.om";
        var owner = await app.SignedIn(ownerEmail, "Maryam");
        var finder = await app.SignedIn(finderEmail, "Omar");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Casio watch", "Accessories")))).GetProperty("id").GetGuid();
        var found = (await Json(await finder.PostAsync("/api/reports", Form("found", "Black digital watch", "Accessories")))).GetProperty("id").GetGuid();
        await using var db = app.Db();
        var m = new Match { LostId = lost, FoundId = found, FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow };
        db.Matches.Add(m);
        await db.SaveChangesAsync();
        return (owner, finder, m.Id, ownerEmail, finderEmail);
    }

    private async Task Run(Func<NotificationSender, Task> send)
    {
        using var scope = app.Services.CreateScope();
        await send(scope.ServiceProvider.GetRequiredService<NotificationSender>());
    }

    [Fact]
    public async Task Push_key_is_generated_once()
    {
        var http = await app.SignedIn("key@gutech.edu.om");
        var a = (await Json(await http.GetAsync("/api/push/key"))).GetProperty("publicKey").GetString();
        var b = (await Json(await http.GetAsync("/api/push/key"))).GetProperty("publicKey").GetString();
        Assert.False(string.IsNullOrEmpty(a));
        Assert.Equal(a, b);
    }

    [Fact]
    public async Task New_match_pushes_and_emails_the_owner()
    {
        var (owner, _, match, ownerEmail, _) = await Pair("alert");
        await Subscribe(owner, "https://push.example/owner-alert");
        await Run(n => n.MatchCreatedAsync(match, CancellationToken.None));

        Assert.Contains(app.Push.Sent, p => p.Endpoint == "https://push.example/owner-alert" && p.Payload.Url == $"/matches/{match}");
        Assert.Contains(app.Emails.Sent, e => e.To == ownerEmail && e.Subject.Contains("Casio watch"));
    }

    [Fact]
    public async Task Match_alerts_off_means_silence()
    {
        var (owner, _, match, ownerEmail, _) = await Pair("quiet");
        await Subscribe(owner, "https://push.example/owner-quiet");
        await owner.PatchAsJsonAsync("/api/me", new { matchAlerts = false });
        await Run(n => n.MatchCreatedAsync(match, CancellationToken.None));

        Assert.DoesNotContain(app.Push.Sent, p => p.Endpoint == "https://push.example/owner-quiet");
        Assert.DoesNotContain(app.Emails.Sent, e => e.To == ownerEmail);
    }

    [Fact]
    public async Task Claim_and_messages_reach_the_other_person()
    {
        var (owner, finder, match, _, finderEmail) = await Pair("claim");
        await Subscribe(finder, "https://push.example/finder-claim");
        await Subscribe(owner, "https://push.example/owner-claim");
        var chat = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid();
        await Run(n => n.ClaimedAsync(chat, CancellationToken.None));
        Assert.Contains(app.Emails.Sent, e => e.To == finderEmail && e.Subject.Contains("Black digital watch"));
        Assert.Contains(app.Push.Sent, p => p.Endpoint == "https://push.example/finder-claim" && p.Payload.Body.Contains("Maryam"));

        var msg = (await Json(await finder.PostAsJsonAsync($"/api/conversations/{chat}/messages", new { text = "Is it the black one?" }))).GetProperty("id").GetInt64();
        await Run(n => n.MessageAsync(msg, CancellationToken.None));
        Assert.Contains(app.Push.Sent, p => p.Endpoint == "https://push.example/owner-claim" && p.Payload.Title == "Omar" && p.Payload.Body == "Is it the black one?");
    }

    [Fact]
    public async Task Dead_subscriptions_are_removed()
    {
        var (owner, _, match, _, _) = await Pair("gone");
        await Subscribe(owner, "https://push.example/owner-gone");
        app.Push.Gone["https://push.example/owner-gone"] = true;
        await Run(n => n.MatchCreatedAsync(match, CancellationToken.None));
        await using var db = app.Db();
        Assert.False(await db.PushSubscriptions.AnyAsync(s => s.Endpoint == "https://push.example/owner-gone"));
    }

    [Fact]
    public async Task Rejects_bad_subscriptions()
    {
        var http = await app.SignedIn("badsub@gutech.edu.om");
        var r = await http.PostAsJsonAsync("/api/push/subscribe", new { endpoint = "http://not-https.example/x", keys = new { p256dh = "a", auth = "b" } });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }
}
