using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Zarqa.Api.Admin;
using Zarqa.Api.Data;
using Zarqa.Api.Notifications;
using Zarqa.Api.Rsa;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>The RSA desk: drop-off, receive, pickup code, handover, the shelf, read-only chats and the team.</summary>
public class RsaFlowTests(TestApp app) : IClassFixture<TestApp>
{
    private static MultipartFormDataContent DropForm(string title, string category, int photos = 0)
    {
        var form = Form("found", title, category, photos: photos);
        form.Add(new StringContent("true"), "dropAtRsa");
        return form;
    }

    /// <summary>An RSA staff member, listed directly (sign-in codes are rate-limited per email, so the admin signs in once, below).</summary>
    private async Task<HttpClient> Staff(string tag)
    {
        var email = $"rsa.{tag}@gutech.edu.om";
        await using (var db = app.Db())
        {
            db.RsaMembers.Add(new RsaMember { Email = email, AddedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        return await app.SignedIn(email, "Huda");
    }

    private async Task<(HttpClient Owner, HttpClient Finder, Guid Lost, Guid Found, string DropCode, Guid Match)> DroppedPair(string tag, int photos = 0)
    {
        var owner = await app.SignedIn($"owner.{tag}@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn($"finder.{tag}@gutech.edu.om", "Omar");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Blue Hydro Flask", "Bottles")))).GetProperty("id").GetGuid();
        var found = await Json(await finder.PostAsync("/api/reports", DropForm("Blue metal bottle", "Bottles", photos)));
        Assert.True(found.GetProperty("dropAtRsa").GetBoolean());
        Assert.Equal("Bring to RSA", found.GetProperty("pill").GetString());
        var code = found.GetProperty("dropCode").GetString()!;
        Assert.Matches("^[A-Z0-9]{3}-[A-Z0-9]{3}$", code);
        var foundId = found.GetProperty("id").GetGuid();
        await using var db = app.Db();
        var m = new Match { LostId = lost, FoundId = foundId, FinalScore = 0.9, Reasons = ["Same kind of item: bottle"], CreatedAt = DateTimeOffset.UtcNow };
        db.Matches.Add(m);
        await db.SaveChangesAsync();
        return (owner, finder, lost, foundId, code, m.Id);
    }

    [Fact]
    public async Task Drop_off_receive_claim_and_hand_over_without_a_chat()
    {
        var rsa = await Staff("full");
        Assert.True((await Json(await rsa.GetAsync("/api/me"))).GetProperty("isRsa").GetBoolean());
        var (owner, finder, lost, found, drop, match) = await DroppedPair("full");

        // The desk looks the drop code up (typed loosely) and marks it received.
        var desk = await Json(await rsa.GetAsync($"/api/rsa/desk/{drop.Replace("-", "").ToLowerInvariant()}"));
        Assert.Equal("drop", desk.GetProperty("type").GetString());
        Assert.Equal("expected", desk.GetProperty("item").GetProperty("state").GetString());
        var received = await Json(await rsa.PostAsync($"/api/rsa/drop/{drop}/receive", null));
        Assert.Equal("held", received.GetProperty("state").GetString());
        Assert.Equal("At the RSA", (await Json(await finder.GetAsync($"/api/reports/{found}"))).GetProperty("pill").GetString());

        // The owner sees it's at the RSA; "It's mine" gives a pickup code and no chat.
        var view = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.True(view.GetProperty("atRsa").GetBoolean());
        Assert.True(view.GetProperty("rsaReceived").GetBoolean());
        var pickup = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString()!;
        Assert.Equal(pickup, (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString());
        Assert.Equal(pickup, (await Json(await owner.GetAsync($"/api/matches/{match}"))).GetProperty("pickupCode").GetString());
        Assert.Equal(0, (await Json(await owner.GetAsync("/api/conversations"))).GetArrayLength());
        var lostDto = await Json(await owner.GetAsync($"/api/reports/{lost}"));
        Assert.Equal("Ready to collect", lostDto.GetProperty("pill").GetString());
        Assert.Equal(match, lostDto.GetProperty("pickupMatchId").GetGuid());
        // The drop code is the finder's: the owner's view of their own report has none.
        Assert.Equal(JsonValueKindNull, lostDto.GetProperty("dropCode").ValueKind);

        // At the desk the pickup code shows the owner's own words next to the item.
        var claim = await Json(await rsa.GetAsync($"/api/rsa/desk/{pickup}"));
        Assert.Equal("pickup", claim.GetProperty("type").GetString());
        Assert.Equal("Blue Hydro Flask", claim.GetProperty("claim").GetProperty("title").GetString());
        Assert.Equal("Maryam", claim.GetProperty("claim").GetProperty("ownerName").GetString());
        Assert.Equal("claimed", claim.GetProperty("item").GetProperty("state").GetString());

        Assert.Equal(HttpStatusCode.NoContent, (await rsa.PostAsync($"/api/rsa/pickup/{pickup}/handover", null)).StatusCode);
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Returned, r.Status));
            Assert.NotNull((await db.Matches.FirstAsync(m => m.Id == match)).CollectedAt);
            Assert.False(await db.Conversations.AnyAsync(c => c.MatchId == match));
        }
        Assert.Equal(1, (await Json(await owner.GetAsync("/api/me/stats"))).GetProperty("gotBack").GetInt32());
        Assert.Equal(1, (await Json(await finder.GetAsync("/api/me/stats"))).GetProperty("helpedReturn").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await rsa.PostAsync($"/api/rsa/pickup/{pickup}/handover", null)).StatusCode);
    }

    private const System.Text.Json.JsonValueKind JsonValueKindNull = System.Text.Json.JsonValueKind.Null;

    [Fact]
    public async Task Not_theirs_reopens_both_reports_and_matches_again()
    {
        var rsa = await Staff("reject");
        var (owner, _, lost, found, _, match) = await DroppedPair("reject");
        var pickup = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString()!;
        await using (var db = app.Db())
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Pickup, r.Status));

        Assert.Equal(HttpStatusCode.NoContent, (await rsa.PostAsync($"/api/rsa/pickup/{pickup}/reject", null)).StatusCode);
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Open, r.Status));
            Assert.Equal(MatchStatus.Rejected, (await db.Matches.FirstAsync(m => m.Id == match)).Status);
            Assert.True(await db.MatchJobs.AnyAsync(j => j.ReportId == lost && j.CompletedAt == null));
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await rsa.GetAsync($"/api/rsa/desk/{pickup}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/matches/{match}/confirm", null)).StatusCode);
    }

    [Fact]
    public async Task A_finder_can_choose_the_rsa_later_and_kept_items_still_chat()
    {
        var finder = await app.SignedIn("finder.later@gutech.edu.om", "Omar");
        var found = await Json(await finder.PostAsync("/api/reports", Form("found", "Grey hoodie", "Clothes")));
        Assert.False(found.GetProperty("dropAtRsa").GetBoolean());
        Assert.Equal(JsonValueKindNull, found.GetProperty("dropCode").ValueKind);
        var later = await Json(await finder.PostAsync($"/api/reports/{found.GetProperty("id").GetGuid()}/rsa", null));
        Assert.True(later.GetProperty("dropAtRsa").GetBoolean());
        Assert.False(string.IsNullOrEmpty(later.GetProperty("dropCode").GetString()));

        // Lost reports never go to the desk.
        var lost = (await Json(await finder.PostAsync("/api/reports", Form("lost", "My keys", "Keys")))).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await finder.PostAsync($"/api/reports/{lost}/rsa", null)).StatusCode);
    }

    [Fact]
    public async Task Claim_before_drop_off_then_owner_is_told_when_it_arrives()
    {
        var rsa = await Staff("early");
        var (owner, _, _, _, drop, match) = await DroppedPair("early");
        await owner.PostAsJsonAsync("/api/push/subscribe", new { endpoint = "https://push.example/owner-early", keys = new { p256dh = "BPublicKeyForTests", auth = "authsecret" } });
        var view = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.False(view.GetProperty("rsaReceived").GetBoolean());
        var pickup = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString()!;

        var desk = await Json(await rsa.GetAsync($"/api/rsa/desk/{drop}"));
        Assert.Equal(pickup, desk.GetProperty("claim").GetProperty("code").GetString());
        await rsa.PostAsync($"/api/rsa/drop/{drop}/receive", null);

        using var scope = app.Services.CreateScope();
        var found = await scope.ServiceProvider.GetRequiredService<ZarqaDb>().Matches.Where(m => m.Id == match).Select(m => m.FoundId).FirstAsync();
        await scope.ServiceProvider.GetRequiredService<NotificationSender>().RsaReceivedAsync(found, CancellationToken.None);
        Assert.Contains(app.Push.Sent, p => p.Endpoint == "https://push.example/owner-early" && p.Payload.Body.Contains(pickup));
        Assert.Contains(app.Emails.Sent, e => e.To == "owner.early@gutech.edu.om" && e.Subject.Contains("ready to collect"));
    }

    [Fact]
    public async Task Only_staff_reach_the_desk_and_chats_are_read_only()
    {
        var plain = await app.SignedIn("plain.rsa@gutech.edu.om");
        Assert.False((await Json(await plain.GetAsync("/api/me"))).GetProperty("isRsa").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await plain.GetAsync("/api/rsa/items")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await plain.GetAsync("/api/rsa/conversations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await plain.PostAsJsonAsync("/api/rsa/team", new { email = "plain.rsa@gutech.edu.om" })).StatusCode);

        // A normal chat between a finder who kept the item and its owner.
        var rsa = await Staff("chats");
        var owner = await app.SignedIn("owner.watch@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.watch@gutech.edu.om", "Omar");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Casio watch", "Accessories")))).GetProperty("id").GetGuid();
        var found = (await Json(await finder.PostAsync("/api/reports", Form("found", "Black digital watch", "Accessories")))).GetProperty("id").GetGuid();
        Guid match;
        await using (var db = app.Db())
        {
            var m = new Match { LostId = lost, FoundId = found, FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(m);
            await db.SaveChangesAsync();
            match = m.Id;
        }
        var chat = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid();
        await finder.PostAsJsonAsync($"/api/conversations/{chat}/messages", new { text = "What's the strap colour?" });

        var list = await Json(await rsa.GetAsync("/api/rsa/conversations"));
        var row = list.EnumerateArray().First(c => c.GetProperty("id").GetGuid() == chat);
        Assert.Equal("Maryam", row.GetProperty("lostName").GetString());
        Assert.Equal("Omar", row.GetProperty("foundName").GetString());
        var thread = await Json(await rsa.GetAsync($"/api/rsa/conversations/{chat}"));
        Assert.Equal("found", thread.GetProperty("messages")[1].GetProperty("from").GetString());

        // Staff aren't participants: the normal chat API stays closed to them, and the desk API has no write route.
        Assert.Equal(HttpStatusCode.NotFound, (await rsa.GetAsync($"/api/conversations/{chat}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await rsa.PostAsJsonAsync($"/api/conversations/{chat}/messages", new { text = "hi" })).StatusCode);
        Assert.NotEqual(HttpStatusCode.OK, (await rsa.PostAsJsonAsync($"/api/rsa/conversations/{chat}/messages", new { text = "hi" })).StatusCode);
        // Reading doesn't mark anything read for the participants.
        Assert.True((await Json(await owner.GetAsync("/api/home"))).GetProperty("unreadChats").GetInt32() >= 1);
    }

    [Fact]
    public async Task Staff_add_colleagues_and_removal_takes_effect_at_once()
    {
        // The owner (an admin) adds the first person; staff add colleagues.
        var admin = await app.SignedIn("admin@gutech.edu.om");
        Assert.True((await Json(await admin.GetAsync("/api/me"))).GetProperty("isRsa").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync("/api/rsa/team", new { email = "rsa.team1@gutech.edu.om" })).StatusCode);
        var first = await app.SignedIn("rsa.team1@gutech.edu.om", "Huda");
        Assert.Equal(HttpStatusCode.NoContent, (await first.PostAsJsonAsync("/api/rsa/team", new { email = "RSA.Team2@gutech.edu.om" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await first.PostAsJsonAsync("/api/rsa/team", new { email = "someone@gmail.com" })).StatusCode);
        var second = await app.SignedIn("rsa.team2@gutech.edu.om");
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync("/api/rsa/items")).StatusCode);
        var team = await Json(await second.GetAsync("/api/rsa/team"));
        Assert.Contains(team.EnumerateArray(), m => m.GetProperty("email").GetString() == "rsa.team2@gutech.edu.om");

        Assert.Equal(HttpStatusCode.BadRequest, (await second.DeleteAsync("/api/rsa/team/rsa.team2@gutech.edu.om")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await first.DeleteAsync("/api/rsa/team/rsa.team2@gutech.edu.om")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await second.GetAsync("/api/rsa/items")).StatusCode);
    }

    [Fact]
    public async Task Staff_see_item_photos_but_never_card_photos()
    {
        var rsa = await Staff("photos");
        var finder = await app.SignedIn("finder.photos@gutech.edu.om", "Omar");
        var bottle = await Json(await finder.PostAsync("/api/reports", DropForm("Green bottle", "Bottles", photos: 1)));
        var card = await Json(await finder.PostAsync("/api/reports", DropForm("Student ID", "Cards & IDs", photos: 1)));
        var bottlePhoto = bottle.GetProperty("photoIds")[0].GetGuid();
        var cardPhoto = card.GetProperty("photoIds")[0].GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await rsa.GetAsync($"/api/photos/{bottlePhoto}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await rsa.GetAsync($"/api/photos/{cardPhoto}")).StatusCode);
        var desk = await Json(await rsa.GetAsync($"/api/rsa/desk/{card.GetProperty("dropCode").GetString()}"));
        Assert.Empty(desk.GetProperty("item").GetProperty("photoIds").EnumerateArray());
    }

    [Fact]
    public async Task Held_items_never_expire_and_staff_close_them()
    {
        var rsa = await Staff("shelf");
        var finder = await app.SignedIn("finder.shelf@gutech.edu.om", "Omar");
        var held = await Json(await finder.PostAsync("/api/reports", DropForm("Umbrella", "Other")));
        var expected = await Json(await finder.PostAsync("/api/reports", DropForm("Scarf", "Clothes")));
        var heldId = held.GetProperty("id").GetGuid();
        var expectedId = expected.GetProperty("id").GetGuid();
        await rsa.PostAsync($"/api/rsa/drop/{held.GetProperty("dropCode").GetString()}/receive", null);
        Assert.Equal(HttpStatusCode.BadRequest, (await finder.PostAsync($"/api/reports/{heldId}/close", null)).StatusCode);

        await using (var db = app.Db())
            await db.Reports.Where(r => r.Id == heldId || r.Id == expectedId)
                .ExecuteUpdateAsync(s => s.SetProperty(r => r.UpdatedAt, DateTimeOffset.UtcNow.AddDays(-61)));
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<Retention>().RunAsync(CancellationToken.None);
        await using (var db = app.Db())
        {
            Assert.Equal(ReportStatus.Open, (await db.Reports.FirstAsync(r => r.Id == heldId)).Status);
            Assert.Equal(ReportStatus.Expired, (await db.Reports.FirstAsync(r => r.Id == expectedId)).Status);
        }

        var shelf = await Json(await rsa.GetAsync("/api/rsa/items"));
        Assert.Contains(shelf.EnumerateArray(), i => i.GetProperty("id").GetGuid() == heldId && i.GetProperty("state").GetString() == "held");
        Assert.Equal(HttpStatusCode.NoContent, (await rsa.PostAsync($"/api/rsa/items/{heldId}/close", null)).StatusCode);
        var done = await Json(await rsa.GetAsync("/api/rsa/items?done=true"));
        Assert.Contains(done.EnumerateArray(), i => i.GetProperty("id").GetGuid() == heldId);
    }

    [Fact]
    public void Codes_avoid_lookalikes_and_normalise()
    {
        for (var i = 0; i < 200; i++) Assert.DoesNotMatch("[0O1IL2Z5S8B]", RsaCodes.Random());
        Assert.Equal("K7P4QM", RsaCodes.Normalize(" k7p-4qm "));
        Assert.Null(RsaCodes.Normalize("K7P-4Q0"));
        Assert.Equal("K7P-4QM", RsaCodes.Format("K7P4QM"));
    }
}
