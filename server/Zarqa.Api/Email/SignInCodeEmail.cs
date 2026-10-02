using System.Net;

namespace Zarqa.Api.Email;

/// <summary>The sign-in code email. No links on purpose: a code-only email can't be used for phishing.</summary>
public static class SignInCodeEmail
{
    public record Message(string Subject, string Html, string Text);

    public static Message Build(string code)
    {
        // Code in the subject so phones show it in the notification.
        var subject = $"Your Zarqa code: {code}";
        var spaced = $"{code[..3]} {code[3..]}";

        var text = $"""
            Your Zarqa sign-in code is {spaced}

            It works for 10 minutes. If you didn't ask for it, ignore this email: nobody can sign in without the code.

            Zarqa · the GUtech lost & found, made by students
            """;

        var html = $"""
            <!doctype html>
            <html lang="en" style="background:#222634;">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{WebUtility.HtmlEncode(subject)}</title></head>
            <body style="margin:0;padding:0;background:#222634;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#222634;">
                <tr><td align="center" style="padding:32px 16px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;">
                    <tr><td style="padding:0 4px 20px;font-family:Impact,'Arial Narrow Bold',sans-serif;font-size:30px;letter-spacing:1px;color:#F2EEE8;">ZARQA <span style="color:#BD9777;">&#9673;</span></td></tr>
                    <tr><td style="background:#F2EEE8;border-radius:20px;padding:28px 24px;font-family:Arial,Helvetica,sans-serif;color:#222634;">
                      <div style="font-family:'Courier New',monospace;font-size:12px;font-weight:bold;letter-spacing:2px;color:#8A6A4F;">YOUR SIGN-IN CODE</div>
                      <div style="font-family:Impact,'Arial Narrow Bold',sans-serif;font-size:44px;letter-spacing:4px;line-height:1.1;margin:10px 0 14px;white-space:nowrap;">{spaced}</div>
                      <div style="font-size:15px;line-height:1.5;">It works for 10 minutes. Type it into Zarqa and you're in.</div>
                      <div style="border-top:2px dashed #CFC6BA;margin:22px 0 16px;"></div>
                      <div style="font-size:13px;line-height:1.5;color:#5E6472;">Didn't ask for this? Ignore it. Nobody can sign in without the code.</div>
                    </td></tr>
                    <tr><td style="padding:18px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#A9B4B6;">Zarqa · the GUtech lost &amp; found, made by students for students.</td></tr>
                  </table>
                </td></tr>
              </table>
            </body>
            </html>
            """;

        return new Message(subject, html, text);
    }
}
