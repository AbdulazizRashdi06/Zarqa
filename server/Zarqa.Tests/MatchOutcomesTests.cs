using Zarqa.Api.Admin;
using Zarqa.Api.Data;

namespace Zarqa.Tests;

public class MatchOutcomesTests
{
    [Fact]
    public void Shown_matches_are_counted_by_the_bands_people_see()
    {
        MatchOutcomes.Row Row(double score, MatchStatus status, bool returned = false) => new(score, status, returned);
        var bands = MatchOutcomes.ByBand(
        [
            Row(0.57, MatchStatus.Suggested),                 // was held, then shown
            Row(0.57, MatchStatus.Rejected),
            Row(0.60, MatchStatus.Rejected),                  // the edge belongs to the band above
            Row(0.69, MatchStatus.Confirmed),
            Row(0.70, MatchStatus.Confirmed, returned: true),
            Row(0.79, MatchStatus.Expired),
            Row(0.80, MatchStatus.Confirmed, returned: true),
            Row(0.95, MatchStatus.Confirmed),
        ]);

        Assert.Equal(["held", "small", "looks", "big"], bands.Select(b => b.Key));
        var held = bands[0];
        Assert.Equal((2, 0, 1, 0, 1, 0), (held.Shown, held.Claimed, held.NotMine, held.Returned, held.Waiting, held.Expired));
        var small = bands[1];
        Assert.Equal((2, 1, 1, 0), (small.Shown, small.Claimed, small.NotMine, small.Returned));
        var looks = bands[2];
        Assert.Equal((2, 1, 0, 1, 0, 1), (looks.Shown, looks.Claimed, looks.NotMine, looks.Returned, looks.Waiting, looks.Expired));
        var big = bands[3];
        Assert.Equal((2, 2, 0, 1), (big.Shown, big.Claimed, big.NotMine, big.Returned));
    }

    [Fact]
    public void A_score_under_the_line_gets_its_own_band_only_when_one_exists()
    {
        Assert.DoesNotContain(MatchOutcomes.ByBand([]), b => b.Key == "below");
        var bands = MatchOutcomes.ByBand([new(0.40, MatchStatus.Confirmed, false)]); // an older fallback review
        Assert.Equal(1, bands.Single(b => b.Key == "below").Claimed);
    }
}
