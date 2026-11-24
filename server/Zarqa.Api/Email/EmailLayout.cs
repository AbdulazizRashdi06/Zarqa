using System.Net;

namespace Zarqa.Api.Email;

/// <summary>
/// What changes from one email to the next around the shared layout: which Zarqa picture, how much room she gets,
/// the sticker, and the headline as it breaks over lines. Words in [square brackets] take the accent colour.
/// </summary>
/// <param name="Art">File name (no extension) under web/public/mascot/email, built by deploy/email-mascots.py.</param>
/// <param name="ArtWidth">Widest she is shown, in CSS px. The file is saved at twice this.</param>
/// <param name="ArtShare">Share of the row she gets, in percent. The headline gets the rest.</param>
/// <param name="Found">Emails to a finder use sage, emails to an owner use tan, like Found and Lost in the app.</param>
public sealed record EmailLook(string Art, int ArtWidth, int ArtShare, string Alt, string Sticker, string[] Headline,
    int HeadlineSize, string TicketLabel, bool Found = false);

/// <summary>One look per email Zarqa sends (design: the "Zarqa emails" canvas, 2026-11-23).</summary>
public static class EmailLooks
{
    public static readonly EmailLook SignIn = new("key", 180, 46, "Zarqa winking and holding up a big golden key",
        "HERE'S YOUR KEY", ["Your", "sign-in", "[code.]"], 52, "WORKS FOR 10 MINUTES");

    public static readonly EmailLook Spotted = new("spotted", 215, 58, "Zarqa shading her eyes and pointing at something she has just spotted",
        "SPOTTED IT", ["Could", "this be", "[yours?]"], 44, "YOUR LOST REPORT");

    public static readonly EmailLook SpottedAtRsa = Spotted with { Sticker = "AT THE RSA DESK" };

    public static readonly EmailLook Claimed = new("legend", 180, 46, "Zarqa laughing and giving two thumbs up",
        "NICE FIND", ["Someone", "thinks", "it's", "[theirs]"], 44, "YOUR FOUND REPORT", Found: true);

    public static readonly EmailLook ReadyToCollect = new("pickup-tag", 190, 48, "Zarqa smiling, holding up a paper luggage tag and giving a thumbs up",
        "BRING YOUR ID", ["It's at", "the [RSA]", "[desk]"], 50, "YOUR PICKUP CODE");

    public static readonly EmailLook ExpiredLost = new("still-looking", 170, 44, "Zarqa looking at an hourglass that has almost run out",
        "60 DAYS", ["Your lost", "report", "has", "[expired]"], 44, "YOUR LOST REPORT");

    public static readonly EmailLook ExpiredFound = new("still-have-it", 150, 40, "Zarqa holding a small box of found things, head tilted",
        "60 DAYS", ["Your found", "report", "has", "[expired]"], 42, "YOUR FOUND REPORT", Found: true);

    /// <summary>The admin test email names the provider it went through ("Resend", "Brevo").</summary>
    public static EmailLook Test(string provider) => new("waving", 170, 44, "Zarqa waving hello",
        "JUST A TEST", [provider, "can", "[send]"], 52, $"SENT THROUGH {provider.ToUpperInvariant()}");

    /// <summary>Every fixed look, for tests and previews.</summary>
    public static IReadOnlyList<EmailLook> All => [SignIn, Spotted, SpottedAtRsa, Claimed, ReadyToCollect, ExpiredLost, ExpiredFound, Test("Resend")];
}

/// <summary>
/// The one layout every Zarqa email uses, in the app's look: charcoal ground, the wordmark, a big headline with Zarqa
/// beside it, and an off-white ticket with a tear line.
///
/// Built for mail apps, not browsers: tables and inline styles only, nothing positioned, and still no links (a
/// code-only email can't be used for phishing). Mail apps that drop a style lose decoration, never content: the
/// sticker sits straight instead of tilted, the item tag gets round corners instead of notches, and the fonts fall
/// back to condensed system ones. Zarqa's pictures load from the live site, so they show once the web app that
/// contains them is deployed; with pictures blocked the email still reads in full.
/// </summary>
public static class EmailLayout
{
    /// <summary>Where the pictures live. The files are in web/public/mascot/email.</summary>
    public const string ArtBase = "https://tryzarqa.com/mascot/email/";

    public const string Signature = "Zarqa · the GUtech lost & found, made by students for students.";

    private const string Ground = "#222634", Paper = "#F2EEE8", Tan = "#BD9777", Sage = "#8E9DA0";

    // Anton only loads where web fonts do (Apple Mail). Everywhere else the next condensed heavy face is used;
    // bold keeps Android's Roboto Condensed from looking thin.
    private const string Display = "'Anton',Impact,'DIN Condensed','Roboto Condensed',sans-serif-condensed,'Arial Narrow',sans-serif";
    private const string Sans = "'Figtree',Arial,Helvetica,sans-serif";
    private const string Mono = "'JetBrains Mono','Courier New',monospace";

    // Anton has one weight. Naming the same file as its bold too stops a mail app from thickening it when the
    // headline asks for bold. The file is Google Fonts' Latin subset; if it ever stops loading, the fallbacks apply.
    private const string Fonts = """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Figtree:wght@500;800&family=JetBrains+Mono:wght@700&display=swap');
        @font-face{font-family:'Anton';font-style:normal;font-weight:400;src:url(https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm3Kz-C8.woff2) format('woff2');}
        @font-face{font-family:'Anton';font-style:normal;font-weight:700;src:url(https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm3Kz-C8.woff2) format('woff2');}
        </style>
        """;

    private static string E(string s) => WebUtility.HtmlEncode(s);

    /// <summary>The small spaced-out label at the top of the ticket.</summary>
    public static string Label(EmailLook look) =>
        $"""<div style="font-family:{Mono};font-size:11px;font-weight:bold;letter-spacing:1.5px;color:{(look.Found ? "#5E6472" : "#8A6A4F")};">{E(look.TicketLabel)}</div>""";

    /// <summary>A sign-in or pickup code, set large. <paramref name="html"/> is already safe HTML.</summary>
    public static string Code(string html, int size, int spacing) =>
        $"""<div style="padding-top:8px;font-family:{Display};font-size:{size}px;font-weight:bold;letter-spacing:{spacing}px;line-height:1.1;white-space:nowrap;">{html}</div>""";

    /// <summary>The user's own title on a luggage tag, in quotes: titles are often whole sentences.</summary>
    public static string Tag(string item, EmailLook look) =>
        $"""
        <div style="padding-top:12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{(look.Found ? Sage : Tan)};border-radius:14px 4px 4px 14px;clip-path:polygon(16px 0,100% 0,100% 100%,16px 100%,0 calc(100% - 16px),0 16px);">
            <tr>
              <td width="36" align="center" valign="middle" style="width:36px;font-size:0;line-height:0;"><div style="width:12px;height:12px;margin:0 auto;border-radius:6px;background:{Paper};font-size:0;line-height:0;">&nbsp;</div></td>
              <td style="padding:13px 14px 13px 0;font-family:{Sans};font-size:17px;font-weight:800;line-height:1.3;color:{Ground};">&ldquo;{E(item)}&rdquo;</td>
            </tr>
          </table>
        </div>
        """;

    public static string Body(string text) =>
        $"""<div style="padding-top:12px;font-size:15px;font-weight:500;line-height:1.5;">{E(text)}</div>""";

    /// <summary>The line under the sign-in ticket, from the app's sign-in screen.</summary>
    public static string Motto(string text) =>
        $"""<div style="padding:0 0 10px;font-family:{Mono};font-size:11px;font-weight:bold;letter-spacing:1.2px;line-height:1.5;color:{Tan};">&mdash; {E(text)}</div>""";

    /// <param name="title">The page title; mail apps don't show it.</param>
    /// <param name="label">The few words beside the wordmark ("STILL LOOKING?").</param>
    /// <param name="ticket">Safe HTML for the top of the ticket, built from the helpers above.</param>
    /// <param name="footer">Plain text under the tear line.</param>
    /// <param name="below">Safe HTML between the ticket and the signature, if any.</param>
    public static string Build(string title, string label, EmailLook look, string ticket, string footer, string below = "")
    {
        var accent = look.Found ? Sage : Tan;
        var headline = string.Join("<br>", look.Headline.Select(line =>
            E(line).Replace("[", $"<span style=\"color:{accent};\">").Replace("]", "</span>")));
        return $"""
            <!doctype html>
            <html lang="en" style="background:{Ground};">
            <head>
            <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{E(title)}</title>
            {Fonts}
            </head>
            <body style="margin:0;padding:0;background:{Ground};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{Ground};">
                <tr><td align="center" style="padding:28px 14px 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;">
                    <tr><td style="padding:0 4px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                        <td style="font-family:{Display};font-size:26px;font-weight:bold;line-height:1;letter-spacing:1px;color:{Paper};white-space:nowrap;">ZARQA <span style="color:{Tan};">&#9673;</span></td>
                        <td align="right" style="font-family:{Mono};font-size:11px;font-weight:bold;letter-spacing:1.5px;line-height:1.3;color:#A9B4B6;">{E(label)}</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding:18px 0 0 4px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                        <td valign="bottom" style="padding:0 0 20px;">
                          <div style="padding:0 0 12px;"><span style="display:inline-block;transform:rotate(-5deg);background:{accent};color:{Ground};font-family:{Mono};font-size:10px;font-weight:bold;letter-spacing:1.5px;line-height:1.2;padding:6px 10px;border-radius:999px;">{E(look.Sticker)}</span></div>
                          <div style="font-family:{Display};font-size:{look.HeadlineSize}px;font-weight:bold;line-height:0.94;letter-spacing:0.5px;text-transform:uppercase;color:{Paper};">{headline}</div>
                        </td>
                        <td width="{look.ArtShare}%" align="right" valign="bottom" style="width:{look.ArtShare}%;padding:0 16px 0 0;font-size:0;line-height:0;">
                          <img src="{ArtBase}{look.Art}.png" width="{look.ArtWidth}" alt="{E(look.Alt)}" style="display:block;width:100%;max-width:{look.ArtWidth}px;height:auto;margin:0 0 0 auto;border:0;font-family:{Sans};font-size:12px;line-height:1.3;color:#A9B4B6;">
                        </td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="background:{Paper};border-radius:20px;font-family:{Sans};color:{Ground};">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr><td style="padding:24px 22px 16px;">
                          {ticket}
                        </td></tr>
                        <tr><td>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                            <td width="11" style="width:11px;font-size:0;line-height:0;"><div style="width:11px;height:22px;background:{Ground};border-radius:0 11px 11px 0;font-size:0;line-height:0;">&nbsp;</div></td>
                            <td valign="middle" style="font-size:0;line-height:0;"><div style="height:0;border-top:2px dashed #CFC6BA;font-size:0;line-height:0;">&nbsp;</div></td>
                            <td width="11" style="width:11px;font-size:0;line-height:0;"><div style="width:11px;height:22px;background:{Ground};border-radius:11px 0 0 11px;font-size:0;line-height:0;">&nbsp;</div></td>
                          </tr></table>
                        </td></tr>
                        <tr><td style="padding:10px 22px 22px;font-size:13px;line-height:1.5;color:#5E6472;">{E(footer)}</td></tr>
                      </table>
                    </td></tr>
                    <tr><td style="padding:18px 4px 0;font-family:{Sans};font-size:12px;line-height:1.5;color:#A9B4B6;">{below}{E(Signature)}</td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;
    }
}
