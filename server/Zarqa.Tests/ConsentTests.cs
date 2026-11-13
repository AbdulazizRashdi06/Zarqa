using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Users;

namespace Zarqa.Tests;

/// <summary>PDPL: no reports before recorded consent; consent stores the version and time.</summary>
public class ConsentTests(TestApp app) : IClassFixture<TestApp>
{
    [Fact]
    public async Task Posting_waits_for_consent_and_consent_is_recorded()
    {
        const string email = "consent.test@gutech.edu.om";
        var http = app.Client();
        (await http.PostAsJsonAsync("/api/auth/request-code", new { email })).EnsureSuccessStatusCode();
        (await http.PostAsJsonAsync("/api/auth/verify", new { email, code = app.Emails.LastCodeFor(email) })).EnsureSuccessStatusCode();

        var me = await http.GetFromJsonAsync<JsonElement>("/api/me");
        Assert.True(me.GetProperty("needsConsent").GetBoolean());

        var early = await http.PostAsync("/api/reports", ReportFlowTests.Form("lost", "Blue bottle", "Bottle"));
        Assert.Equal(HttpStatusCode.Forbidden, early.StatusCode);

        var stale = await http.PostAsJsonAsync("/api/me/consent", new { version = "2020-01-01" });
        Assert.Equal(HttpStatusCode.BadRequest, stale.StatusCode);

        var ok = await http.PostAsJsonAsync("/api/me/consent", new { version = Consent.Current });
        ok.EnsureSuccessStatusCode();
        Assert.False((await ok.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("needsConsent").GetBoolean());

        await using (var db = app.Db())
        {
            var user = await db.Users.SingleAsync(u => u.Email == email);
            Assert.Equal(Consent.Current, user.ConsentVersion);
            Assert.NotNull(user.ConsentedAt);
        }

        var posted = await http.PostAsync("/api/reports", ReportFlowTests.Form("lost", "Blue bottle", "Bottle"));
        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
    }
}
