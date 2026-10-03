using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>Match decision → chat → handover → returned, as two real users.</summary>
public class ChatFlowTests(TestApp app) : IClassFixture<TestApp>
{
    private async Task<(HttpClient Owner, HttpClient Finder, Guid Lost, Guid Found, Guid Match)> MatchedPair(string tag, double score = 0.9)
    {
        var owner = await app.SignedIn($"owner.{tag}@gutech.edu.om", "Maryam");
        var finder = await app.SignedIn($"finder.{tag}@gutech.edu.om", "Omar");
        var lost = (await Json(await owner.PostAsync("/api/reports", Form("lost", "AirPods Pro case", "Tech")))).GetProperty("id").GetGuid();
        var found = (await Json(await finder.PostAsync("/api/reports", Form("found", "White earbuds case", "Tech")))).GetProperty("id").GetGuid();
        await using var db = app.Db();
        var match = new Match { LostId = lost, FoundId = found, FinalScore = score, Reasons = ["Same kind of item: electronics"], CreatedAt = DateTimeOffset.UtcNow };
        db.Matches.Add(match);
        await db.SaveChangesAsync();
        return (owner, finder, lost, found, match.Id);
    }

    [Fact]
    public async Task Claim_chat_handover_and_return()
    {
        var (owner, finder, lost, found, match) = await MatchedPair("full");

        // Only the lost owner sees the match.
        var view = await Json(await owner.GetAsync($"/api/matches/{match}"));
        Assert.Equal("strong", view.GetProperty("strength").GetString());
        Assert.Equal("AirPods Pro case", view.GetProperty("lost").GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await finder.GetAsync($"/api/matches/{match}")).StatusCode);

        // "It's mine" opens a chat; doing it twice returns the same chat.
        var chatId = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid();
        Assert.Equal(chatId, (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid());
        await using (var db = app.Db())
        {
            Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.InChat, r.Status));
        }

        // The finder sees the chat with Zarqa's opening message unread.
        var list = await Json(await finder.GetAsync("/api/conversations"));
        Assert.Equal("Maryam", list[0].GetProperty("otherName").GetString());
        Assert.Equal("found", list[0].GetProperty("myRole").GetString());
        Assert.Equal(1, list[0].GetProperty("unread").GetInt32());
        Assert.Equal(1, (await Json(await finder.GetAsync("/api/home"))).GetProperty("unreadChats").GetInt32());

        var sent = await Json(await finder.PostAsJsonAsync($"/api/conversations/{chatId}/messages", new { text = "What's on the back of it?" }));
        Assert.True(sent.GetProperty("mine").GetBoolean());

        var thread = await Json(await owner.GetAsync($"/api/conversations/{chatId}"));
        Assert.Equal("Omar", thread.GetProperty("otherName").GetString());
        var messages = thread.GetProperty("messages");
        Assert.Equal("system", messages[0].GetProperty("kind").GetString());
        Assert.False(messages[1].GetProperty("mine").GetBoolean());

        // Polling with ?after= returns only newer messages.
        var lastId = messages[1].GetProperty("id").GetInt64();
        Assert.Equal(0, (await Json(await owner.GetAsync($"/api/conversations/{chatId}?after={lastId}"))).GetProperty("messages").GetArrayLength());

        // Reading clears the unread count.
        await owner.PostAsJsonAsync($"/api/conversations/{chatId}/read", new { lastMessageId = lastId });
        Assert.Equal(0, (await Json(await owner.GetAsync("/api/conversations")))[0].GetProperty("unread").GetInt32());

        // The finder suggests a handover; only the owner can confirm it.
        var tomorrow = DateTime.UtcNow.AddDays(1).ToString("yyyy-MM-dd");
        var handoverRes = await finder.PostAsJsonAsync($"/api/conversations/{chatId}/handover", new { date = tomorrow, time = "14:30", place = "Library entrance" });
        Assert.True(handoverRes.IsSuccessStatusCode, await handoverRes.Content.ReadAsStringAsync());
        var handover = await Json(handoverRes);
        var handoverId = handover.GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.BadRequest, (await finder.PostAsync($"/api/handovers/{handoverId}/confirm", null)).StatusCode);
        var confirmed = await Json(await owner.PostAsync($"/api/handovers/{handoverId}/confirm", null));
        Assert.Equal("confirmed", confirmed.GetProperty("handoverStatus").GetString());
        Assert.Equal($"{tomorrow}T14:30", confirmed.GetProperty("handoverAt").GetString());

        // Returned is a handshake: the owner asks, nothing closes until the finder confirms.
        var ask = await Json(await owner.PostAsync($"/api/conversations/{chatId}/returned", null));
        var askId = ask.GetProperty("id").GetInt64();
        Assert.Equal("return", ask.GetProperty("kind").GetString());
        Assert.NotEqual("Returned", (await Json(await owner.GetAsync("/api/reports/mine")))[0].GetProperty("pill").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/returns/{askId}/confirm", null)).StatusCode);
        Assert.Equal("confirmed", (await Json(await finder.PostAsync($"/api/returns/{askId}/confirm", null))).GetProperty("handoverStatus").GetString());
        Assert.Equal("Returned", (await Json(await owner.GetAsync("/api/reports/mine")))[0].GetProperty("pill").GetString());
        Assert.Equal(1, (await Json(await owner.GetAsync("/api/me/stats"))).GetProperty("gotBack").GetInt32());
        Assert.Equal(1, (await Json(await finder.GetAsync("/api/me/stats"))).GetProperty("helpedReturn").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await finder.PostAsJsonAsync($"/api/conversations/{chatId}/messages", new { text = "hi" })).StatusCode);
    }

    [Fact]
    public async Task Not_back_yet_keeps_the_chat_open()
    {
        var (owner, finder, _, _, match) = await MatchedPair("notyet");
        var chatId = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid();

        // The finder asks; the owner says it isn't back yet. Both reports stay in the chat.
        var ask = (await Json(await finder.PostAsync($"/api/conversations/{chatId}/returned", null))).GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/conversations/{chatId}/returned", null)).StatusCode);
        Assert.Equal("replaced", (await Json(await owner.PostAsync($"/api/returns/{ask}/decline", null))).GetProperty("handoverStatus").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, (await finder.PostAsync($"/api/returns/{ask}/confirm", null)).StatusCode);
        Assert.Equal("Chatting", (await Json(await owner.GetAsync("/api/reports/mine")))[0].GetProperty("pill").GetString());

        // The asker can withdraw their own request too.
        var again = (await Json(await owner.PostAsync($"/api/conversations/{chatId}/returned", null))).GetProperty("id").GetInt64();
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync($"/api/returns/{again}/decline", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await finder.PostAsJsonAsync($"/api/conversations/{chatId}/messages", new { text = "still open" })).StatusCode);
    }

    [Fact]
    public async Task Strangers_cannot_read_a_chat()
    {
        var (owner, _, _, _, match) = await MatchedPair("private");
        var chatId = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid();
        var stranger = await app.SignedIn("stranger.private@gutech.edu.om");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/conversations/{chatId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync($"/api/conversations/{chatId}/messages", new { text = "hi" })).StatusCode);
    }

    [Fact]
    public async Task Not_mine_rejects_the_match()
    {
        var (owner, _, lost, _, match) = await MatchedPair("reject", score: 0.7);
        Assert.Equal("likely", (await Json(await owner.GetAsync($"/api/matches/{match}"))).GetProperty("strength").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/matches/{match}/reject", null)).StatusCode);
        await using var db = app.Db();
        Assert.Equal(MatchStatus.Rejected, (await db.Matches.FirstAsync(m => m.Id == match)).Status);
        Assert.Equal("Searching", (await Json(await owner.GetAsync("/api/reports/mine")))[0].GetProperty("pill").GetString());
    }

    [Fact]
    public async Task Not_it_after_all_reopens_both_reports()
    {
        var (owner, finder, lost, found, match) = await MatchedPair("notit");
        var chatId = (await Json(await owner.PostAsync($"/api/matches/{match}/confirm", null))).GetProperty("conversationId").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await finder.PostAsync($"/api/conversations/{chatId}/not-it", null)).StatusCode);

        await using var db = app.Db();
        Assert.All(await db.Reports.Where(r => r.Id == lost || r.Id == found).ToListAsync(), r => Assert.Equal(ReportStatus.Open, r.Status));
        Assert.Equal(MatchStatus.Rejected, (await db.Matches.FirstAsync(m => m.Id == match)).Status);
        Assert.Equal("Closed", (await Json(await owner.GetAsync("/api/conversations")))[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_finder_already_in_a_chat_cannot_be_claimed_twice()
    {
        var (owner, finder, _, found, match) = await MatchedPair("twice");
        await owner.PostAsync($"/api/matches/{match}/confirm", null);

        var other = await app.SignedIn("other.twice@gutech.edu.om");
        var otherLost = (await Json(await other.PostAsync("/api/reports", Form("lost", "Earbuds case", "Tech")))).GetProperty("id").GetGuid();
        Guid second;
        await using (var db = app.Db())
        {
            var m = new Match { LostId = otherLost, FoundId = found, FinalScore = 0.8, CreatedAt = DateTimeOffset.UtcNow };
            db.Matches.Add(m);
            await db.SaveChangesAsync();
            second = m.Id;
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsync($"/api/matches/{second}/confirm", null)).StatusCode);
    }
}
