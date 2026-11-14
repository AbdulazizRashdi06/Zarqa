using System.Net.Mail;
using Zarqa.Api.Auth;

namespace Zarqa.Api.Email;

/// <summary>One configured provider on its own, by name ("Resend", "Brevo").</summary>
public sealed record EmailRoute(string Name, IEmailSender Sender);

/// <summary>
/// Every configured provider, first one first, each reachable on its own. Admin's "Send me a test email" uses it
/// to prove the backup works before the day it is needed. Empty when emails only go to the log.
/// </summary>
public sealed class EmailProbe(IReadOnlyList<EmailRoute> routes)
{
    public IReadOnlyList<EmailRoute> Routes => routes;
}

public static class EmailSetup
{
    /// <summary>With one provider it keeps the full time it always had.</summary>
    public static readonly TimeSpan SingleTimeout = TimeSpan.FromSeconds(15);
    /// <summary>
    /// With a backup, both tries must finish inside the app's own 15-second request limit (web/src/lib/api.ts),
    /// or the phone gives up while the backup is still sending.
    /// </summary>
    public static readonly TimeSpan FirstTimeout = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan BackupTimeout = TimeSpan.FromSeconds(8);

    /// <summary>
    /// Registers the email sender for <paramref name="email"/>. "resend" or "brevo" names the provider tried
    /// first; if the other one's key is set too, it is the backup. Sign-in depends on these emails, and the free
    /// Resend plan stops at 100 a day (decisions.md, 2026-11-14). Anything else logs emails instead of sending.
    /// </summary>
    public static IServiceCollection AddZarqaEmail(this IServiceCollection services, EmailOptions email)
    {
        if (email.Provider is not ("resend" or "brevo"))
        {
            services.AddSingleton<IEmailSender, LogEmailSender>();
            services.AddSingleton(new EmailProbe([]));
            return services;
        }

        var hasResend = !string.IsNullOrWhiteSpace(email.ResendApiKey);
        var hasBrevo = !string.IsNullOrWhiteSpace(email.BrevoApiKey);
        var resendFirst = email.Provider == "resend";
        if (string.IsNullOrWhiteSpace(email.From) || !(resendFirst ? hasResend : hasBrevo))
            throw new InvalidOperationException($"Email:Provider is '{email.Provider}' but its API key or Email:From is missing.");
        // Brevo needs the sender split into name and address. As the chosen provider a bad one stops the start;
        // as the backup it only fails its own sends (BrevoEmailSender), so adding a key can never take the site down.
        if (!resendFirst && !BrevoEmailSender.TryParseSender(email, out _))
            throw new InvalidOperationException("Email:Provider is 'brevo' but Email:BrevoFrom / Email:From is not a valid address.");
        var hasBackup = resendFirst ? hasBrevo : hasResend;

        var first = hasBackup ? FirstTimeout : SingleTimeout;
        services.AddHttpClient<ResendEmailSender>(c => c.Timeout = resendFirst ? first : BackupTimeout);
        services.AddHttpClient<BrevoEmailSender>(c => c.Timeout = resendFirst ? BackupTimeout : first);
        services.AddSingleton<EmailFallbackState>();

        static EmailRoute Resend(IServiceProvider sp) => new("Resend", sp.GetRequiredService<ResendEmailSender>());
        static EmailRoute Brevo(IServiceProvider sp) => new("Brevo", sp.GetRequiredService<BrevoEmailSender>());
        IReadOnlyList<EmailRoute> Routes(IServiceProvider sp) => (resendFirst, hasBackup) switch
        {
            (true, true) => [Resend(sp), Brevo(sp)],
            (true, false) => [Resend(sp)],
            (false, true) => [Brevo(sp), Resend(sp)],
            (false, false) => [Brevo(sp)],
        };
        services.AddTransient(sp => new EmailProbe(Routes(sp)));
        services.AddTransient<IEmailSender>(sp =>
        {
            var routes = Routes(sp);
            return routes.Count == 1
                ? routes[0].Sender
                : new FallbackEmailSender(routes[0].Sender, routes[1].Sender, sp.GetRequiredService<EmailFallbackState>(), sp.GetRequiredService<ILogger<FallbackEmailSender>>());
        });
        return services;
    }
}
