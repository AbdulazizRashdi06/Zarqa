using Zarqa.Api.Chat;
using Zarqa.Api.Data;

namespace Zarqa.Api.Admin;

/// <summary>
/// How shown matches turned out, by confidence band: the pilot's own evidence for where the line belongs.
/// Written test sets could not settle it (decisions.md, 2026-11-15); what people do with real suggestions can.
/// </summary>
public static class MatchOutcomes
{
    public sealed record Row(double Score, MatchStatus Status, bool Returned);

    /// <param name="Shown">Suggestions people could see.</param>
    /// <param name="Claimed">The owner said "that's mine" (includes the ones later returned).</param>
    /// <param name="NotMine">Someone said it is not the same item, or released a claim.</param>
    /// <param name="Returned">Both people confirmed the item went back.</param>
    /// <param name="Waiting">Still shown, no answer yet.</param>
    /// <param name="Expired">Closed without an answer (a report ended or timed out).</param>
    public sealed record Band(string Key, double From, double? To, int Shown, int Claimed, int NotMine, int Returned, int Waiting, int Expired);

    // The same edges as the labels people see and the admin hold (HeldMatches.HoldBelow, MatchEndpoints.LooksLikeAt/BigChanceAt).
    // The top band has no upper edge (null): JSON cannot carry infinity.
    private static readonly (string Key, double From, double? To)[] Edges =
    [
        ("below", 0, DebateEdge),
        ("held", DebateEdge, Matching.HeldMatches.HoldBelow),
        ("small", Matching.HeldMatches.HoldBelow, MatchEndpoints.LooksLikeAt),
        ("looks", MatchEndpoints.LooksLikeAt, MatchEndpoints.BigChanceAt),
        ("big", MatchEndpoints.BigChanceAt, null),
    ];

    private const double DebateEdge = Matching.DebateReviewer.Threshold;

    public static IReadOnlyList<Band> ByBand(IEnumerable<Row> rows)
    {
        var list = rows.ToList();
        return [.. Edges.Select(e =>
        {
            var inBand = list.Where(r => r.Score >= e.From && (e.To is null || r.Score < e.To)).ToList();
            return new Band(e.Key, e.From, e.To,
                inBand.Count,
                inBand.Count(r => r.Status == MatchStatus.Confirmed),
                inBand.Count(r => r.Status == MatchStatus.Rejected),
                inBand.Count(r => r.Returned),
                inBand.Count(r => r.Status == MatchStatus.Suggested),
                inBand.Count(r => r.Status == MatchStatus.Expired));
        }).Where(b => b.Key != "below" || b.Shown > 0)];
    }
}
