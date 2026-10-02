using System.Security.Claims;

namespace Zarqa.Api.Auth;

public static class CurrentUser
{
    public static Guid Id(this ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new InvalidOperationException("not signed in"));
}
