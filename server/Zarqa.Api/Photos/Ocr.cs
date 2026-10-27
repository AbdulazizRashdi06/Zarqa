using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Options;
using SkiaSharp;

namespace Zarqa.Api.Photos;

public sealed class CoverOptions
{
    /// <summary>The Tesseract binary: a name on PATH or a full path.</summary>
    public string Tesseract { get; set; } = "tesseract";
    public string Languages { get; set; } = "eng+ara";
    /// <summary>One OCR pass; a photo takes up to 8 passes (4 rotations, then 4 for the re-check).</summary>
    public int TimeoutSeconds { get; set; } = 20;
}

/// <summary>One word read by OCR, in the pixel coordinates of the image it was read from.</summary>
public sealed record OcrWord(string Text, float Confidence, SKRectI Box);

public sealed class OcrException(string message) : Exception(message);

/// <summary>Local OCR. Never a network service: card photos don't leave the server for this.</summary>
public interface IOcrEngine
{
    bool IsAvailable { get; }
    Task<IReadOnlyList<OcrWord>> ReadAsync(SKBitmap image, CancellationToken ct);
}

/// <summary>
/// The Tesseract CLI (Debian's tesseract-ocr, English + Arabic). One run at a time and one thread,
/// so it never crowds the shared VPS; word boxes come from its TSV output.
/// </summary>
public sealed class TesseractOcr(IOptions<CoverOptions> options, ILogger<TesseractOcr> log) : IOcrEngine
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private readonly Lazy<string?> _binary = new(() => Resolve(options.Value.Tesseract));

    public bool IsAvailable => _binary.Value is not null;

    public async Task<IReadOnlyList<OcrWord>> ReadAsync(SKBitmap image, CancellationToken ct)
    {
        var binary = _binary.Value ?? throw new OcrException("tesseract not installed");
        var input = Path.Combine(Path.GetTempPath(), $"zarqa-ocr-{Guid.NewGuid():N}.png");
        await Gate.WaitAsync(ct);
        try
        {
            using (var data = image.Encode(SKEncodedImageFormat.Png, 100))
            await using (var file = File.Create(input))
                data.SaveTo(file);

            var start = new ProcessStartInfo(binary)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var a in new[] { input, "stdout", "-l", options.Value.Languages, "--psm", "11", "tsv" }) start.ArgumentList.Add(a);
            start.Environment["OMP_THREAD_LIMIT"] = "1";

            using var process = Process.Start(start) ?? throw new OcrException("tesseract did not start");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(options.Value.TimeoutSeconds));
            var stdout = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var stderr = process.StandardError.ReadToEndAsync(timeout.Token);
            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
                throw new OcrException(ct.IsCancellationRequested ? "cancelled" : "tesseract timed out");
            }
            var tsv = await stdout;
            await stderr;
            if (process.ExitCode != 0) throw new OcrException($"tesseract exited with {process.ExitCode}");
            return ParseTsv(tsv);
        }
        finally
        {
            Gate.Release();
            try { File.Delete(input); } catch (IOException e) { log.LogWarning("Could not delete an OCR temp file: {Message}", e.Message); }
        }
    }

    /// <summary>Word rows (level 5) of Tesseract's TSV: level page block par line word left top width height conf text.</summary>
    public static List<OcrWord> ParseTsv(string tsv)
    {
        var words = new List<OcrWord>();
        foreach (var line in tsv.Split('\n'))
        {
            var f = line.TrimEnd('\r').Split('\t');
            if (f.Length < 12 || f[0] != "5") continue;
            var text = f[11].Trim();
            if (text.Length == 0) continue;
            if (!int.TryParse(f[6], out var x) || !int.TryParse(f[7], out var y) || !int.TryParse(f[8], out var w) || !int.TryParse(f[9], out var h)) continue;
            if (!float.TryParse(f[10], NumberStyles.Float, CultureInfo.InvariantCulture, out var conf)) conf = 0;
            words.Add(new OcrWord(text, conf, new SKRectI(x, y, x + w, y + h)));
        }
        return words;
    }

    private static string? Resolve(string binary)
    {
        if (Path.IsPathRooted(binary)) return File.Exists(binary) ? binary : null;
        var names = OperatingSystem.IsWindows() ? new[] { binary + ".exe", binary } : [binary];
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            foreach (var name in names)
            {
                if (dir.Length == 0) continue;
                var full = Path.Combine(dir, name);
                if (File.Exists(full)) return full;
            }
        return null;
    }
}
