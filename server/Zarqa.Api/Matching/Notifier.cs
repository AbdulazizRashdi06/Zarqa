namespace Zarqa.Api.Matching;

/// <summary>Things worth telling people about. Push and email live behind this (step 7).</summary>
public interface INotifier
{
    /// <summary>Zarqa spotted a possible match: tell the lost owner.</summary>
    Task MatchCreatedAsync(Guid matchId, CancellationToken ct);

    /// <summary>The owner said "It's mine": tell the finder a chat has started.</summary>
    Task ClaimedAsync(Guid conversationId, CancellationToken ct);

    /// <summary>A new chat message: tell the other person.</summary>
    Task MessageAsync(long messageId, CancellationToken ct);

    /// <summary>A handover was suggested or confirmed: tell the other person.</summary>
    Task HandoverAsync(long messageId, CancellationToken ct);
}

public sealed class NoopNotifier : INotifier
{
    public Task MatchCreatedAsync(Guid matchId, CancellationToken ct) => Task.CompletedTask;
    public Task ClaimedAsync(Guid conversationId, CancellationToken ct) => Task.CompletedTask;
    public Task MessageAsync(long messageId, CancellationToken ct) => Task.CompletedTask;
    public Task HandoverAsync(long messageId, CancellationToken ct) => Task.CompletedTask;
}
