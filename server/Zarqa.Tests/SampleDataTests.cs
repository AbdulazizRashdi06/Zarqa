using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Admin;
using Zarqa.Api.Data;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

public class SampleDataTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Sample_data_fills_never_matches_and_deletes_cleanly()
    {
        var admin = await app.SignedIn("admin@gutech.edu.om");
        var student = await app.SignedIn("student@gutech.edu.om");
        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsync("/api/admin/sample", null)).StatusCode);

        var filled = await Json(await admin.PostAsync("/api/admin/sample", null));
        Assert.Equal(9, filled.GetProperty("users").GetInt32());
        Assert.True(filled.GetProperty("reports").GetInt32() >= 12);
        Assert.True(filled.GetProperty("chats").GetInt32() >= 2);

        // Filling again replaces the set instead of doubling it.
        await admin.PostAsync("/api/admin/sample", null);
        await using (var db = app.Db())
        {
            Assert.Equal(9, await db.Users.CountAsync(u => u.Email.EndsWith(SampleData.EmailSuffix)));
            Assert.True(await db.Reports.AnyAsync(r => r.DropAtRsa && r.RsaReceivedAt != null && r.User!.Email.EndsWith(SampleData.EmailSuffix)));
            Assert.True(await db.Matches.AnyAsync(m => m.PickupCode != null));
        }

        // A real report looking like a sample one is never matched with it, and re-check skips sample reports.
        var real = (await Json(await student.PostAsync("/api/reports", Form("lost", "Purple Puff bottle with gold marble", "Bottles")))).GetProperty("id").GetGuid();
        await app.DrainMatchingAsync();
        await using (var db = app.Db())
            Assert.False(await db.Matches.AnyAsync(m => m.LostId == real));
        var queued = (await Json(await admin.PostAsync("/api/admin/rematch", null))).GetProperty("queued").GetInt32();
        Assert.Equal(1, queued);

        Assert.Equal(HttpStatusCode.OK, (await admin.DeleteAsync("/api/admin/sample")).StatusCode);
        await using (var db = app.Db())
        {
            Assert.False(await db.Users.AnyAsync(u => u.Email.EndsWith(SampleData.EmailSuffix)));
            Assert.Equal(1, await db.Reports.CountAsync());
            Assert.Equal(0, await db.Conversations.CountAsync());
            Assert.True(await db.Reports.AnyAsync(r => r.Id == real));
        }
    }
}

public class DeleteEverythingTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Delete_everything_needs_the_word_and_keeps_admins()
    {
        var admin = await app.SignedIn("admin@gutech.edu.om");
        var student = await app.SignedIn("student@gutech.edu.om");
        await student.PostAsync("/api/reports", Form("lost", "Black umbrella", "Other", photos: 1));
        await admin.PostAsync("/api/admin/sample", null);

        Assert.Equal(HttpStatusCode.Forbidden, (await student.PostAsJsonAsync("/api/admin/delete-everything", new { confirm = "DELETE" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/admin/delete-everything", new { confirm = "delete" })).StatusCode);
        await using (var db = app.Db())
            Assert.True(await db.Reports.AnyAsync());

        var done = await Json(await admin.PostAsJsonAsync("/api/admin/delete-everything", new { confirm = "DELETE" }));
        Assert.True(done.GetProperty("reports").GetInt32() >= 13);
        await using (var db = app.Db())
        {
            Assert.Equal(0, await db.Reports.CountAsync());
            Assert.Equal(0, await db.Photos.CountAsync());
            Assert.Equal(0, await db.Conversations.CountAsync());
            Assert.Equal(["admin@gutech.edu.om"], await db.Users.Select(u => u.Email).ToListAsync());
        }
        // The admin is still signed in; the student's account is gone.
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/stats")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await student.GetAsync("/api/me")).StatusCode);
    }
}
