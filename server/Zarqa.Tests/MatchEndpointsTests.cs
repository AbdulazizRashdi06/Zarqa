using System.Net;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>The lost owner's Match screen API: what it lists, the "taken" wait and taking back an RSA pickup.</summary>
public class MatchEndpointsTests(TestApp app) : IClassFixture<TestApp>
{
    private const System.Text.Json.JsonValueKind JsonNull = System.Text.Json.JsonValueKind.Null;

    private async Task<Guid> NewMatch(Guid lost, Guid found, double score = 0.9)
    {
        await using var db = app.Db();
        var m = new Match { LostId = lost, FoundId = found, FinalScore = score, Reasons = ["Same kind of item: bottle"], CreatedAt = DateTimeOffset.UtcNow };
        db.Matches.Add(m);
        await db.SaveChangesAsync();
        return m.Id;
    }

    private static async Task<Guid> Post(HttpClient who, MultipartFormDataContent form) =>
        (await Json(await who.PostAsync("/api/reports", form))).GetProperty("id").GetGuid();

    private static MultipartFormDataContent DropForm(string title, string category, int photos = 0)
    {
        var form = Form("found", title, category, photos: photos);
        form.Add(new StringContent("true"), "dropAtRsa");
        return form;
    }

    private async Task<HttpClient> Staff(string tag)
    {
        var email = $"rsa.m.{tag}@gutech.edu.om";
        await using (var db = app.Db())
        {
            db.RsaMembers.Add(new RsaMember { Email = email, AddedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        return await app.SignedIn(email, "Huda");
    }

    [Fact]
    public async Task Found_photo_ids_are_listed_only_while_the_owner_may_open_them()
    {
        var owner = await app.SignedIn("owner.mphotos@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.mphotos@gutech.edu.om", "Omar");
        var lost = await Post(owner, Form("lost", "Blue Hydro Flask", "Bottles"));
        var found = await Post(finder, Form("found", "Blue metal bottle", "Bottles", photos: 2));
        var match = await NewMatch(lost, found);

        var open = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.Equal(2, open.GetProperty("found").GetProperty("photoIds").GetArrayLength());
        Assert.False(open.GetProperty("found").GetProperty("hasPrivatePhoto").GetBoolean());
        Assert.False(open.GetProperty("taken").GetBoolean());
        var photo = open.GetProperty("found").GetProperty("photoIds")[0].GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/photos/{photo}")).StatusCode);

        // Once it's closed the photos aren't served, so no ids that would only show broken images.
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/matches/{match}/reject", null)).StatusCode);
        var closed = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.Equal("Rejected", closed.GetProperty("status").GetString());
        Assert.Equal(0, closed.GetProperty("found").GetProperty("photoIds").GetArrayLength());
        Assert.False(closed.GetProperty("found").GetProperty("hasPrivatePhoto").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/photos/{photo}")).StatusCode);
    }

    [Fact]
    public async Task A_card_photo_not_covered_yet_is_never_listed_only_flagged()
    {
        var owner = await app.SignedIn("owner.mcard@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.mcard@gutech.edu.om", "Omar");
        var lost = await Post(owner, Form("lost", "My student ID card", "Wallets & cards"));
        var found = await Json(await finder.PostAsync("/api/reports", Form("found", "Student ID card", "Wallets & cards", photos: 1)));
        Assert.True(found.GetProperty("isSensitive").GetBoolean());
        var photo = found.GetProperty("photoIds")[0].GetGuid();
        var match = await NewMatch(lost, found.GetProperty("id").GetGuid());

        var view = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.True(view.GetProperty("found").GetProperty("isSensitive").GetBoolean());
        Assert.Equal(0, view.GetProperty("found").GetProperty("photoIds").GetArrayLength());
        Assert.True(view.GetProperty("found").GetProperty("hasPrivatePhoto").GetBoolean());
        Assert.DoesNotContain(photo.ToString(), view.GetRawText());
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/photos/{photo}")).StatusCode);
    }

    [Fact]
    public async Task The_owner_can_take_back_an_uncollected_pickup_and_others_see_it_free_up()
    {
        var rsa = await Staff("release");
        var owner = await app.SignedIn("owner.release@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.release@gutech.edu.om", "Omar");
        var other = await app.SignedIn("other.release@gutech.edu.om", "Aisha");
        var lost = await Post(owner, Form("lost", "Blue Hydro Flask", "Bottles"));
        var found = await Post(finder, DropForm("Blue metal bottle", "Bottles"));
        var otherLost = await Post(other, Form("lost", "Blue bottle", "Bottles"));
        var match = await NewMatch(lost, found);
        var otherMatch = await NewMatch(otherLost, found, 0.7);

        // Nothing to release before a claim.
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        Assert.False((await Json(await other.GetAsync($"/api/matches/{otherMatch}"))).GetProperty("taken").GetBoolean());

        var pickup = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString()!;
        var taken = await Json(await other.GetAsync($"/api/matches/{otherMatch}"));
        Assert.True(taken.GetProperty("taken").GetBoolean());
        Assert.Equal("Suggested", taken.GetProperty("status").GetString());

        // Only the owner who claimed it: not another student, the finder, RSA staff or a signed-out caller.
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await finder.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await rsa.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.Client().PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        // And only a claimed pickup: the other student's match is still just a suggestion.
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsync($"/api/matches/{otherMatch}/release", null)).StatusCode);
        await using (var db = app.Db())
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Pickup, r.Status));

        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Open, r.Status));
            Assert.Equal(MatchStatus.Rejected, (await db.Matches.FirstAsync(m => m.Id == match)).Status);
            Assert.True(await db.MatchJobs.AnyAsync(j => j.ReportId == lost && j.CompletedAt == null));
            Assert.True(await db.MatchJobs.AnyAsync(j => j.ReportId == found && j.CompletedAt == null));
        }
        var closed = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.Equal("Rejected", closed.GetProperty("status").GetString());
        Assert.Equal(JsonNull, closed.GetProperty("pickupCode").ValueKind);
        // The code no longer works at the desk, a second release is refused, and the item is free for the next owner.
        Assert.Equal(HttpStatusCode.BadRequest, (await rsa.GetAsync($"/api/rsa/desk/{pickup}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/matches/{match}/confirm", null)).StatusCode);
        Assert.False((await Json(await other.GetAsync($"/api/matches/{otherMatch}"))).GetProperty("taken").GetBoolean());
        Assert.True((await Json(await other.PostAsync($"/api/matches/{otherMatch}/confirm", null))).TryGetProperty("pickupCode", out _));
    }

    [Fact]
    public async Task A_collected_pickup_or_a_chat_cannot_be_released()
    {
        var rsa = await Staff("collected");
        var owner = await app.SignedIn("owner.collected@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.collected@gutech.edu.om", "Omar");
        var lost = await Post(owner, Form("lost", "Blue Hydro Flask", "Bottles"));
        var found = await Post(finder, DropForm("Blue metal bottle", "Bottles"));
        var match = await NewMatch(lost, found);
        var pickup = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString()!;
        Assert.Equal(HttpStatusCode.NoContent, (await rsa.PostAsync($"/api/rsa/pickup/{pickup}/handover", null)).StatusCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/matches/{match}/release", null)).StatusCode);
        await using (var db = app.Db())
        {
            Assert.Equal(MatchStatus.Confirmed, (await db.Matches.FirstAsync(m => m.Id == match)).Status);
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Returned, r.Status));
        }

        // A chat claim ends in the chat ("Not the same item"), not here.
        var lost2 = await Post(owner, Form("lost", "Black wallet", "Wallets & cards"));
        var found2 = await Post(finder, Form("found", "Black leather wallet", "Wallets & cards"));
        var chatMatch = await NewMatch(lost2, found2);
        Assert.True((await Json(await owner.PostAsync($"/api/matches/{chatMatch}/confirm", null))).TryGetProperty("conversationId", out _));
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/matches/{chatMatch}/release", null)).StatusCode);
        await using (var db = app.Db())
            Assert.All(await db.Reports.Where(r => r.Id == lost2 || r.Id == found2).ToListAsync(), r => Assert.Equal(ReportStatus.InChat, r.Status));
    }
}
