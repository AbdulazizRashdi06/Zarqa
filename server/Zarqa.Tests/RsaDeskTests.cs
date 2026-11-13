using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>Desk safeguards: no double manual match, no closing what never arrived, the address check and the owner's email at pickup.</summary>
public class RsaDeskTests(TestApp app) : IClassFixture<TestApp>
{
    private static MultipartFormDataContent DropForm(string title, string category)
    {
        var form = Form("found", title, category);
        form.Add(new StringContent("true"), "dropAtRsa");
        return form;
    }

    private async Task<HttpClient> Staff(string tag)
    {
        var email = $"desk.{tag}@gutech.edu.om";
        await using (var db = app.Db())
        {
            db.RsaMembers.Add(new RsaMember { Email = email, AddedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        return await app.SignedIn(email, "Huda");
    }

    [Fact]
    public async Task A_manual_match_is_sent_once_per_person_and_shows_on_the_item()
    {
        var rsa = await Staff("twice");
        var finder = await app.SignedIn("finder.twice@gutech.edu.om", "Omar");
        var kept = (await Json(await finder.PostAsync("/api/reports", Form("found", "Silver ring", "Jewellery")))).GetProperty("id").GetGuid();
        var body = new { email = "walkin.twice@gutech.edu.om", handOver = false };

        Assert.Equal(HttpStatusCode.OK, (await rsa.PostAsJsonAsync($"/api/rsa/found/{kept}/match", body)).StatusCode);
        // A second tap or a second send to the same person files nothing new.
        Assert.Equal(HttpStatusCode.BadRequest, (await rsa.PostAsJsonAsync($"/api/rsa/found/{kept}/match", body with { email = "Walkin.Twice@gutech.edu.om" })).StatusCode);
        await using (var db = app.Db())
            Assert.Equal(1, await db.Matches.CountAsync(m => m.FoundId == kept));
        // Someone else asking for the same item still can.
        Assert.Equal(HttpStatusCode.OK, (await rsa.PostAsJsonAsync($"/api/rsa/found/{kept}/match", body with { email = "walkin.other@gutech.edu.om" })).StatusCode);

        var item = (await Json(await rsa.GetAsync("/api/rsa/found"))).EnumerateArray().First(i => i.GetProperty("id").GetGuid() == kept);
        var sent = item.GetProperty("suggestedTo").EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.Equal(["walkin.other@gutech.edu.om", "walkin.twice@gutech.edu.om"], sent.Order());
    }

    [Fact]
    public async Task Staff_cannot_close_an_item_that_was_never_handed_in()
    {
        var rsa = await Staff("close");
        var finder = await app.SignedIn("finder.close@gutech.edu.om", "Omar");
        var expected = (await Json(await finder.PostAsync("/api/reports", DropForm("Scarf", "Clothes")))).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.BadRequest, (await rsa.PostAsync($"/api/rsa/items/{expected}/close", null)).StatusCode);
        await using (var db = app.Db())
            Assert.Equal(ReportStatus.Open, (await db.Reports.FirstAsync(r => r.Id == expected)).Status);

        // Expired items read as expired on the finished list, not as closed by the desk.
        await using (var db = app.Db())
            await db.Reports.Where(r => r.Id == expected).ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, ReportStatus.Expired));
        var done = await Json(await rsa.GetAsync("/api/rsa/items?done=true"));
        var row = done.EnumerateArray().First(i => i.GetProperty("id").GetGuid() == expected);
        Assert.Equal("expired", row.GetProperty("state").GetString());
        Assert.True(row.TryGetProperty("updatedAt", out _));
    }

    [Fact]
    public async Task Staff_check_an_address_before_matching()
    {
        var plain = await app.SignedIn("plain.person@gutech.edu.om");
        Assert.Equal(HttpStatusCode.Forbidden, (await plain.GetAsync("/api/rsa/person?email=plain.person@gutech.edu.om")).StatusCode);

        var rsa = await Staff("person");
        await app.SignedIn("known.person@gutech.edu.om", "Maryam");
        var known = await Json(await rsa.GetAsync("/api/rsa/person?email=Known.Person@gutech.edu.om"));
        Assert.True(known.GetProperty("hasAccount").GetBoolean());
        Assert.Equal("Maryam", known.GetProperty("name").GetString());
        Assert.Equal("known.person@gutech.edu.om", known.GetProperty("email").GetString());

        var unknown = await Json(await rsa.GetAsync("/api/rsa/person?email=nobody.yet@gutech.edu.om"));
        Assert.False(unknown.GetProperty("hasAccount").GetBoolean());
        await using (var db = app.Db())
            Assert.False(await db.Users.AnyAsync(u => u.Email == "nobody.yet@gutech.edu.om"));
        Assert.Equal(HttpStatusCode.BadRequest, (await rsa.GetAsync("/api/rsa/person?email=someone@gmail.com")).StatusCode);
    }

    [Fact]
    public async Task The_pickup_view_shows_the_owner_email_only_once_the_code_matches()
    {
        var rsa = await Staff("email");
        var owner = await app.SignedIn("owner.email@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.email@gutech.edu.om", "Omar");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Blue Hydro Flask", "Bottles")))).GetProperty("id").GetGuid();
        var found = await Json(await finder.PostAsync("/api/reports", DropForm("Blue metal bottle", "Bottles")));
        Guid match;
        await using (var db = app.Db())
        {
            var m = new Match { LostId = lost, FoundId = found.GetProperty("id").GetGuid(), FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(m);
            await db.SaveChangesAsync();
            match = m.Id;
        }
        var pickup = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("pickupCode").GetString()!;
        var desk = await Json(await rsa.GetAsync($"/api/rsa/desk/{pickup}"));
        Assert.Equal("owner.email@gutech.edu.om", desk.GetProperty("claim").GetProperty("ownerEmail").GetString());

        // A code that doesn't match says nothing about anyone.
        var wrong = await rsa.GetAsync("/api/rsa/desk/ACD-EFG");
        Assert.Equal(HttpStatusCode.NotFound, wrong.StatusCode);
        Assert.DoesNotContain("owner.email", await wrong.Content.ReadAsStringAsync());
    }
}
