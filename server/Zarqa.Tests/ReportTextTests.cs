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
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Empty_text_is_rejected(string? text) => Assert.Null(ReportText.Split(text));
}
