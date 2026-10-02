using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace Zarqa.Tests;

public class AuthFlowTests(TestApp app) : IClassFixture<TestApp>
{
    private static async Task<string> Error(HttpResponseMessage r) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("error").GetString()!;

    private static async Task<T> Prop<T>(HttpResponseMessage r, string name) =>
        (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty(name).Deserialize<T>()!;

    [Fact]
    public async Task Full_sign_in_flow()
    {
        var http = app.Client();
        const string email = "Maryam.Test@Student.GUtech.edu.om";

        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/me")).StatusCode);

        var sent = await http.PostAsJsonAsync("/api/auth/request-code", new { email });
        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);
        // Test mode is off by default: the code never reaches the client.
        Assert.False((await sent.Content.ReadFromJsonAsync<JsonElement>()).TryGetProperty("testCode", out _));
        var code = app.Emails.LastCodeFor("maryam.test@student.gutech.edu.om");

        var wrong = await http.PostAsJsonAsync("/api/auth/verify", new { email, code = code == "000000" ? "111111" : "000000" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal("Wrong code. 4 tries left.", await Error(wrong));

        var ok = await http.PostAsJsonAsync("/api/auth/verify", new { email, code });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.True(await Prop<bool>(ok, "isNew"));

        var me = await http.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var meJson = await me.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("maryam.test@student.gutech.edu.om", meJson.GetProperty("email").GetString());
        Assert.Equal("Maryam", meJson.GetProperty("suggestedFirstName").GetString());

        var named = await http.PatchAsJsonAsync("/api/me", new { firstName = "  Maryam  " });
        Assert.Equal(HttpStatusCode.OK, named.StatusCode);
        Assert.Equal("Maryam", await Prop<string>(named, "firstName"));

        // The used code can't be replayed.
        var replay = await app.Client().PostAsJsonAsync("/api/auth/verify", new { email, code });
        Assert.Equal(HttpStatusCode.BadRequest, replay.StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await http.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Refuses_non_gutech_addresses()
    {
        var r = await app.Client().PostAsJsonAsync("/api/auth/request-code", new { email = "someone@fakegutech.edu.om" });
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
    }

    [Fact]
    public async Task Code_dies_after_five_wrong_tries()
    {
        var http = app.Client();
        const string email = "tries@gutech.edu.om";
        await http.PostAsJsonAsync("/api/auth/request-code", new { email });
        var code = app.Emails.LastCodeFor(email);
        var wrong = code == "000000" ? "111111" : "000000";

        for (var i = 0; i < 5; i++) await http.PostAsJsonAsync("/api/auth/verify", new { email, code = wrong });

        var late = await http.PostAsJsonAsync("/api/auth/verify", new { email, code });
        Assert.Equal(HttpStatusCode.BadRequest, late.StatusCode);
        Assert.Equal("That code has expired. Ask for a new one.", await Error(late));
    }

    [Fact]
    public async Task Limits_codes_per_email()
    {
        var http = app.Client();
        const string email = "spam@gutech.edu.om";
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/auth/request-code", new { email })).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await http.PostAsJsonAsync("/api/auth/request-code", new { email })).StatusCode);
    }

    [Fact]
    public async Task Rejects_bad_first_names()
    {
        var http = app.Client();
        const string email = "names@gutech.edu.om";
        await http.PostAsJsonAsync("/api/auth/request-code", new { email });
        await http.PostAsJsonAsync("/api/auth/verify", new { email, code = app.Emails.LastCodeFor(email) });

        Assert.Equal(HttpStatusCode.BadRequest, (await http.PatchAsJsonAsync("/api/me", new { firstName = "<script>" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await http.PatchAsJsonAsync("/api/me", new { firstName = "عبدالعزيز" })).StatusCode);
    }

    [Fact]
    public async Task Failed_email_returns_503_and_does_not_use_up_the_limit()
    {
        const string email = "outage@gutech.edu.om";
        app.Emails.FailNext = true;
        var r = await app.Client().PostAsJsonAsync("/api/auth/request-code", new { email });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, r.StatusCode);
        Assert.Equal("We couldn't send the email just now. Try again in a minute.", await Error(r));

        await using var db = app.Db();
        Assert.False(await db.LoginCodes.AnyAsync(c => c.Email == email));
    }
}
