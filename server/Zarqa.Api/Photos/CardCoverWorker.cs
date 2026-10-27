using Microsoft.EntityFrameworkCore;
using Zarqa.Api.Data;
using Zarqa.Api.Matching;

namespace Zarqa.Api.Photos;

/// <summary>
/// Covers card/ID photos in the background, one at a time (decisions.md, 2026-10-27). Pending photos
/// live in the photos table, so a restart loses nothing. When a report's last photo is done, it is
/// matched again so the reviewers can see the covered copies.
/// </summary>
public sealed class CardCoverWorker(IServiceScopeFactory scopes, IOcrEngine ocr, PhotoStore store, TimeProvider clock, ILogger<CardCoverWorker> log)
    : BackgroundService
{
    private static readonly TimeSpan Idle = TimeSpan.FromSeconds(5);
    private DateTimeOffset _lastMissingLog = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        while (!stop.IsCancellationRequested)
        {
            var worked = false;
            try
            {
                worked = await RunOneAsync(stop);
            }
            catch (Exception e) when (!stop.IsCancellationRequested)
            {
                log.LogError(e, "Card cover worker loop failed");
            }
            if (!worked) await Task.Delay(Idle, clock, stop).ContinueWith(_ => { }, CancellationToken.None);
        }
    }

    /// <summary>Covers the next pending photo. Public for tests. Returns false when there was nothing to do.</summary>
    public async Task<bool> RunOneAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ZarqaDb>();
        var photo = await db.Photos.AsNoTracking().Where(p => p.CoverState == CoverState.Pending && p.IsSensitive)
            .OrderBy(p => p.CreatedAt).FirstOrDefaultAsync(ct);
        if (photo is null) return false;
        if (!ocr.IsAvailable)
        {
            // Without OCR nothing is shown: the photos simply wait, private.
            if (clock.GetUtcNow() - _lastMissingLog > TimeSpan.FromHours(1))
            {
                log.LogWarning("Card photos are waiting for OCR: tesseract isn't installed. They stay private until it is.");
                _lastMissingLog = clock.GetUtcNow();
            }
            return false;
        }

        CoverResult result;
        try
        {
            var path = store.PathFor(photo.StorageKey);
            result = File.Exists(path)
                ? await scope.ServiceProvider.GetRequiredService<CardCover>().CoverAsync(await File.ReadAllBytesAsync(path, ct), ct)
                : CoverResult.Fail("original missing");
        }
        catch (Exception e) when (!ct.IsCancellationRequested)
        {
            // Never log OCR text: it's someone's card.
            result = CoverResult.Fail(e is OcrException ? e.Message : e.GetType().Name);
        }

        var key = result.Jpeg is null ? null : await store.SaveJpegAsync(result.Jpeg, ct);
        // Only if nothing changed meanwhile: an edit may have made it a normal photo, or the report may be gone.
        var updated = await db.Photos.Where(p => p.Id == photo.Id && p.CoverState == CoverState.Pending && p.IsSensitive)
            .ExecuteUpdateAsync(s => s
                .SetProperty(p => p.CoverState, key is null ? CoverState.Failed : CoverState.Ready)
                .SetProperty(p => p.CoveredKey, key), ct);
        if (updated == 0)
        {
            if (key is not null) store.Delete(key);
            return true;
        }
        if (key is null) log.LogInformation("Card photo {Photo} stays private: {Reason}", photo.Id, result.Reason);

        var stillPending = await db.Photos.AnyAsync(p => p.ReportId == photo.ReportId && p.CoverState == CoverState.Pending, ct);
        var anyReady = await db.Photos.AnyAsync(p => p.ReportId == photo.ReportId && p.CoverState == CoverState.Ready, ct);
        if (!stillPending && anyReady) await scope.ServiceProvider.GetRequiredService<MatchQueue>().EnqueueAsync(photo.ReportId, ct);
        return true;
    }
}
