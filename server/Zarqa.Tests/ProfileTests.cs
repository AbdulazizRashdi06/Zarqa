using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Zarqa.Api.Data;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>Profile: the avatar follows "Show my first name in chats", and it can be removed.</summary>
public class ProfileTests(TestApp app) : IClassFixture<TestApp>
{
    private static MultipartFormDataContent AvatarForm()
    {
        var file = new ByteArrayContent(PhotoStoreTests.PhoneJpeg(400, 400));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return new MultipartFormDataContent { { file, "photo", "avatar.jpg" } };
    }

    [Fact]
    public async Task Hidden_name_hides_the_avatar_from_the_other_person()
    {
        var owner = await app.SignedIn("owner.avatar@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn("finder.avatar@gutech.edu.om", "Omar");
        var me = await Json(await finder.PostAsync("/api/me/avatar", AvatarForm()));
        var finderId = me.GetProperty("id").GetGuid();
        var ownUrl = me.GetProperty("avatarUrl").GetString();
        Assert.NotNull(ownUrl);

        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "Grey hoodie", "Clothing")))).GetProperty("id").GetGuid();
        var found = (await Json(await finder.PostAsync("/api/reports", Form("found", "Grey hoodie", "Clothing")))).GetProperty("id").GetGuid();
        Guid matchId;
        await using (var db = app.Db())
        {
            var match = new Match { LostId = lost, FoundId = found, FinalScore = 0.9, Reasons = ["Same kind of item"], CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(match);
            await db.SaveChangesAsync();
            matchId = match.Id;
        }
        var chatId = (await Json(await owner.PostAsync($"/api/matches/{matchId}/confirm", null))).GetProperty("conversationId").GetGuid();

        // Name shown: the owner sees the finder's photo.
        var thread = await Json(await owner.GetAsync($"/api/conversations/{chatId}"));
        Assert.Equal(ownUrl, thread.GetProperty("otherAvatarUrl").GetString());
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/avatars/{finderId}")).StatusCode);

        // Name hidden: "GUtech student" and no photo, in the thread, the list and the image itself.
        var hidden = await Json(await finder.PatchAsJsonAsync("/api/me", new { showFirstName = false }));
        Assert.Equal(ownUrl, hidden.GetProperty("avatarUrl").GetString()); // still visible to its owner
        thread = await Json(await owner.GetAsync($"/api/conversations/{chatId}"));
        Assert.Equal("GUtech student", thread.GetProperty("otherName").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, thread.GetProperty("otherAvatarUrl").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, (await Json(await owner.GetAsync("/api/conversations")))[0].GetProperty("otherAvatarUrl").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/avatars/{finderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await finder.GetAsync($"/api/avatars/{finderId}")).StatusCode);

        // Removing the photo.
        var removed = await Json(await finder.DeleteAsync("/api/me/avatar"));
        Assert.Equal(System.Text.Json.JsonValueKind.Null, removed.GetProperty("avatarUrl").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await finder.GetAsync($"/api/avatars/{finderId}")).StatusCode);
    }

    [Fact]
    public async Task Consent_for_an_old_version_says_how_to_get_the_new_one()
    {
        var http = await app.SignedIn("consent.old@gutech.edu.om", "Huda");
        var res = await http.PostAsJsonAsync("/api/me/consent", new { version = "1999-01-01" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("open it again", await res.Content.ReadAsStringAsync());
    }
}
