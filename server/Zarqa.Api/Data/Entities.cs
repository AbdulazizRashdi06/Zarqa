using Pgvector;

namespace Zarqa.Api.Data;

public enum ReportKind { Lost, Found }

/// <summary>Stored status. The UI pill ("Possible match") is derived from this plus suggested matches.</summary>
public enum ReportStatus { Open, InChat, Returned, Closed, Expired }

public enum MatchStatus { Suggested, Confirmed, Rejected, Expired }

public enum MatchDecider { Debate, LunaFallback }

public enum ConversationStatus { Active, Returned, Closed }

public enum MessageKind { Text, System, Handover }

public enum HandoverStatus { Suggested, Confirmed, Replaced }

public class User
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public string? FirstName { get; set; }
    public bool ShowFirstName { get; set; } = true;
    public bool MatchAlerts { get; set; } = true;
    public string? AvatarPhotoKey { get; set; }
    public string Locale { get; set; } = "en";
    public bool IsAdmin { get; set; }
    public bool IsBanned { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? LastSeenAt { get; set; }
}

public class LoginCode
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public required string CodeHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
}

public class Location
{
    /// <summary>Canonical name from the campus map, e.g. "GU1 Library".</summary>
    public required string Name { get; set; }
    public string[] Aliases { get; set; } = [];
}

public class Report
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public ReportKind Kind { get; set; }
    /// <summary>What the user typed. Free text by design.</summary>
    public required string CategoryText { get; set; }
    /// <summary>Benchmark category key, or null when the text doesn't normalise.</summary>
    public string? CategoryNorm { get; set; }
    public required string Title { get; set; }
    public string Description { get; set; } = "";
    /// <summary>Campus-map name when picked from the list; null for free text.</summary>
    public string? LocationName { get; set; }
    public required string LocationText { get; set; }
    public DateTimeOffset EventAt { get; set; }
    /// <summary>Card/ID report: photos never go to a model.</summary>
    public bool IsSensitive { get; set; }
    public ReportStatus Status { get; set; } = ReportStatus.Open;
    public Vector? Embedding { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<Photo> Photos { get; set; } = [];
}

public class Photo
{
    public Guid Id { get; set; }
    public Guid ReportId { get; set; }
    public required string StorageKey { get; set; }
    public int Position { get; set; }
    public bool IsSensitive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Match
{
    public Guid Id { get; set; }
    public Guid LostId { get; set; }
    public Report? Lost { get; set; }
    public Guid FoundId { get; set; }
    public Report? Found { get; set; }
    public double Prescore { get; set; }
    public double? SameItem { get; set; }
    public double? Overall { get; set; }
    public double FinalScore { get; set; }
    public MatchDecider DecidedBy { get; set; }
    public string[] Reasons { get; set; } = [];
    public MatchStatus Status { get; set; } = MatchStatus.Suggested;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
}

public class MatchJob
{
    public long Id { get; set; }
    public Guid ReportId { get; set; }
    public DateTimeOffset RunAfter { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}

/// <summary>Raw output of every matching step: the audit trail and the pilot's re-check data.</summary>
public class ReviewLog
{
    public long Id { get; set; }
    public Guid ReportId { get; set; }
    public Guid? CounterpartId { get; set; }
    public required string Step { get; set; }
    public required string Payload { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public decimal? CostUsd { get; set; }
    public int? LatencyMs { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class Conversation
{
    public Guid Id { get; set; }
    public Guid MatchId { get; set; }
    public Match? Match { get; set; }
    public Guid LostUserId { get; set; }
    public Guid FoundUserId { get; set; }
    public ConversationStatus Status { get; set; } = ConversationStatus.Active;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReturnedAt { get; set; }
}

public class Message
{
    public long Id { get; set; }
    public Guid ConversationId { get; set; }
    /// <summary>Null for Zarqa's system messages.</summary>
    public Guid? SenderId { get; set; }
    public MessageKind Kind { get; set; }
    public string Body { get; set; } = "";
    public DateTimeOffset? HandoverAt { get; set; }
    public string? HandoverPlace { get; set; }
    public HandoverStatus? HandoverStatus { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public class ConversationRead
{
    public Guid UserId { get; set; }
    public Guid ConversationId { get; set; }
    public long LastReadMessageId { get; set; }
}

public class PushSubscription
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Endpoint { get; set; }
    public required string P256dh { get; set; }
    public required string Auth { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
