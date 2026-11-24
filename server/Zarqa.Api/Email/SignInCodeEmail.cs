namespace Zarqa.Api.Email;

/// <summary>
/// The sign-in code email, in the shared <see cref="EmailLayout"/>. No links on purpose: a code-only email can't be
/// used for phishing.
/// </summary>
public static class SignInCodeEmail
{
    public record Message(string Subject, string Html, string Text);

    public static Message Build(string code)
    {
        // Code in the subject so phones show it in the notification.
        var subject = $"Your Zarqa code: {code}";
        // No space inside the code: one long-press selects all six digits, and a paste fills every box.
        // The gap in the HTML is a margin between two spans.
        var split = $"""<span>{code[..3]}</span><span style="margin-left:14px;">{code[3..]}</span>""";

        var text = $"""
            Your Zarqa sign-in code is {code}

            It works for 10 minutes. If you didn't ask for it, ignore this email: nobody can sign in without the code.

            Zarqa · the GUtech lost & found, made by students
            """;

        var look = EmailLooks.SignIn;
        var html = EmailLayout.Build(subject, "SIGN-IN", look,
            ticket: EmailLayout.Label(look) + EmailLayout.Code(split, size: 64, spacing: 4)
                    + EmailLayout.Body("It works for 10 minutes. Type it into Zarqa and you're in."),
            footer: "Didn't ask for this? Ignore it. Nobody can sign in without the code.",
            below: EmailLayout.Motto("SHE SAW ARMIES 3 DAYS AWAY. YOUR KEYS ARE EASY."));

        return new Message(subject, html, text);
    }
}
