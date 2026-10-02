using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;

namespace Zarqa.Tests;

public class ReportFlowTests(TestApp app) : IClassFixture<TestApp>
{
    public static MultipartFormDataContent Form(string kind, string title, string category, string? location = null, string? date = null,
        string? time = null, int photos = 0, string description = "black, sticker on the back")
    {
        var form = new MultipartFormDataContent
        {
            { new StringContent(kind), "kind" },
            { new StringContent(title), "title" },
            { new StringContent(category), "category" },
            { new StringContent(description), "description" },
        };
        if (location is not null) form.Add(new StringContent(location), "locationName");
        if (date is not null) form.Add(new StringContent(date), "eventDate");
        if (time is not null) form.Add(new StringContent(time), "eventTime");
        for (var i = 0; i < photos; i++)
        {
            var file = new ByteArrayContent(PhotoStoreTests.PhoneJpeg(800, 600));
            file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(file, "photos", $"p{i}.jpg");
        }
        return form;
    }

    public static async Task<JsonElement> Json(HttpResponseMessage r) => await r.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Post_list_view_photo_and_close()
    {
        var owner = await app.SignedIn("owner.reports@gutech.edu.om");
        var today = DateTime.UtcNow.ToString("yyyy-MM-dd");

        var posted = await owner.PostAsync("/api/reports", Form("lost", "AirPods Pro case", "Tech", "GU1 Library", today, "14:30", photos: 2));
        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
        var report = await Json(posted);
        var id = report.GetProperty("id").GetGuid();
        Assert.Equal("lost", report.GetProperty("kind").GetString());
        Assert.Equal("GU1 Library", report.GetProperty("locationText").GetString());
        Assert.Equal("14:30", report.GetProperty("eventTime").GetString());
        Assert.Equal("Searching", report.GetProperty("pill").GetString());
        var photoIds = report.GetProperty("photoIds").EnumerateArray().Select(p => p.GetString()).ToList();
        Assert.Equal(2, photoIds.Count);

        // A match job is queued for the worker, and the free-text category is normalised.
        await using (var db = app.Db())
        {
            Assert.True(await db.MatchJobs.AnyAsync(j => j.ReportId == id && j.CompletedAt == null));
            Assert.Equal("Electronics", (await db.Reports.FirstAsync(r => r.Id == id)).CategoryNorm);
        }

        Assert.Single((await Json(await owner.GetAsync("/api/reports/mine"))).EnumerateArray());

        var photo = await owner.GetAsync($"/api/photos/{photoIds[0]}");
        Assert.Equal(HttpStatusCode.OK, photo.StatusCode);
        Assert.Equal("image/jpeg", photo.Content.Headers.ContentType!.MediaType);

        // Nobody else can see it: reports are never browsable.
        var stranger = await app.SignedIn("stranger.reports@gutech.edu.om");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/photos/{photoIds[0]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/reports/{id}")).StatusCode);

        Assert.Equal(1, (await Json(await owner.GetAsync("/api/home"))).GetProperty("active").GetInt32());
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/reports/{id}/close", null)).StatusCode);
        Assert.Equal(0, (await Json(await owner.GetAsync("/api/home"))).GetProperty("active").GetInt32());
    }

    [Fact]
    public async Task Card_reports_are_sensitive_and_their_photos_stay_private()
    {
        var finder = await app.SignedIn("finder.cards@gutech.edu.om");
        var owner = await app.SignedIn("owner.cards@gutech.edu.om");
        var found = await Json(await finder.PostAsync("/api/reports", Form("found", "Student ID", "Cards & IDs", photos: 1)));
        Assert.True(found.GetProperty("isSensitive").GetBoolean());
        var lost = await Json(await owner.PostAsync("/api/reports", Form("lost", "My student card", "Cards & IDs")));

        // Even with a waiting match, the card photo isn't shown to the other side.
        await using (var db = app.Db())
        {
            db.Matches.Add(new Match { LostId = lost.GetProperty("id").GetGuid(), FoundId = found.GetProperty("id").GetGuid(), FinalScore = 0.9, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        var photoId = found.GetProperty("photoIds")[0].GetString();
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/photos/{photoId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await finder.GetAsync($"/api/photos/{photoId}")).StatusCode);

        // The owner's lost report shows the waiting match.
        var mine = await Json(await owner.GetAsync("/api/reports/mine"));
        Assert.Equal("Possible match", mine[0].GetProperty("pill").GetString());
    }

    [Fact]
    public async Task Lost_owner_sees_found_photos_of_a_suggested_match()
    {
        var finder = await app.SignedIn("finder.photos@gutech.edu.om");
        var owner = await app.SignedIn("owner.photos@gutech.edu.om");
        var found = await Json(await finder.PostAsync("/api/reports", Form("found", "Blue bottle", "Bottles", photos: 1)));
        var lost = await Json(await owner.PostAsync("/api/reports", Form("lost", "Blue water bottle", "Bottles", photos: 1)));
        await using (var db = app.Db())
        {
            db.Matches.Add(new Match { LostId = lost.GetProperty("id").GetGuid(), FoundId = found.GetProperty("id").GetGuid(), FinalScore = 0.8, CreatedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/photos/{found.GetProperty("photoIds")[0].GetString()}")).StatusCode);
        // The finder doesn't see the lost report's photos until the owner claims it.
        Assert.Equal(HttpStatusCode.NotFound, (await finder.GetAsync($"/api/photos/{lost.GetProperty("photoIds")[0].GetString()}")).StatusCode);
    }

    [Theory]
    [InlineData("", "Tech", "Give the item a name")]
    [InlineData("Phone", "", "Add a category")]
    public async Task Validates_required_fields(string title, string category, string error)
    {
        var http = await app.SignedIn($"validate.{Guid.NewGuid():N}@gutech.edu.om");
        var r = await http.PostAsync("/api/reports", Form("lost", title, category));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.StartsWith(error, (await Json(r)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Refuses_future_dates()
    {
        var http = await app.SignedIn("future@gutech.edu.om");
        var r = await http.PostAsync("/api/reports", Form("lost", "Phone", "Tech", date: DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-dd")));
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task Stats_count_posts()
    {
        var http = await app.SignedIn("stats@gutech.edu.om");
        await http.PostAsync("/api/reports", Form("found", "Umbrella", "Other"));
        var stats = await Json(await http.GetAsync("/api/me/stats"));
        Assert.Equal(1, stats.GetProperty("posts").GetInt32());
        Assert.Equal(0, stats.GetProperty("helpedReturn").GetInt32());
    }
}
