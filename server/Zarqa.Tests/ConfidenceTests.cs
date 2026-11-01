using Xunit;
using Zarqa.Api.Chat;

namespace Zarqa.Tests;

public class ConfidenceTests
{
    [Theory]
    [InlineData(0.55, "small")]
    [InlineData(0.649, "small")]
    [InlineData(0.65, "looks")]
    [InlineData(0.799, "looks")]
    [InlineData(0.80, "big")]
    public void Confidence_bands_match_the_copy_the_owner_sees(double score, string band) =>
        Assert.Equal(band, MatchEndpoints.Confidence(score));
}
