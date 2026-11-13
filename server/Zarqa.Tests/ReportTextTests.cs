using Zarqa.Api.Reports;

namespace Zarqa.Tests;

public class ReportTextTests
{
    [Theory]
    [InlineData("black JBL earbuds case, small scratch on the lid", "Black JBL earbuds case", "Electronics")]
    [InlineData("Keys on a red lanyard. Three keys and a fob", "Keys on a red lanyard", "Keys")]
    [InlineData("hoodie", "Hoodie", "Clothing")]
    [InlineData("a strange little thing", "A strange little thing", "")]
    [InlineData("Silver MacBook Air 15 inch with a sticker of the Omani flag on the back and a dent near the corner",
        "Silver MacBook Air 15 inch with a sticker of the Omani flag", "Electronics")]
    public void Splits_one_box_into_parts(string text, string title, string category)
    {
        var parts = ReportText.Split(text)!;
        Assert.Equal(title, parts.Title);
        Assert.Equal(category, parts.Category);
        Assert.Equal(text, parts.Description);
        Assert.True(parts.Title.Length <= ReportText.MaxTitle);
    }

    [Theory]
    [InlineData("Hi, I lost my black wallet", "Black wallet")]
    [InlineData("Please help! My AirPods case, white", "AirPods case")]
    [InlineData("URGENT: lost keys", "Keys")]
    [InlineData("Hi guys, please help. Blue bottle", "Blue bottle")]
    [InlineData("I lost my black wallet near the library", "Black wallet near the library")]
    [InlineData("I've found someone's student ID card", "Student ID card")]
    [InlineData("Found a wallet", "Wallet")]
    [InlineData("Lost: grey hoodie, size M", "Grey hoodie")]
    [InlineData("My keys", "Keys")]
    [InlineData("السلام عليكم، لقيت بطاقة بنك", "بطاقة بنك")]
    [InlineData("Foundation makeup pouch", "Foundation makeup pouch")] // "found" only as a whole word
    [InlineData("Hijab, black", "Hijab")]
    [InlineData("Hi!", "Hi")] // nothing left after the greeting: keep the text
    [InlineData("I lost", "I lost")]
    public void Name_skips_greetings_and_lead_ins(string text, string title)
    {
        var parts = ReportText.Split(text)!;
        Assert.Equal(title, parts.Title);
        Assert.Equal(text, parts.Description);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Empty_text_is_rejected(string? text) => Assert.Null(ReportText.Split(text));
}
