using System.Text.RegularExpressions;
using SkiaSharp;

namespace Zarqa.Api.Photos;

/// <summary>A covered copy (JPEG), or null with the reason the photo stays private.</summary>
public sealed record CoverResult(byte[]? Jpeg, string Reason)
{
    public static CoverResult Fail(string reason) => new(null, reason);
}

/// <summary>
/// Covers every number on a card/ID photo (owner decision 2026-10-27): digits in any script, MRZ lines,
/// barcodes and QR codes. Names, faces and logos stay visible so an owner can recognise their card.
/// Fails closed: no readable text, too much covered, an OCR error, or any digit still readable on
/// the covered copy, and there is no copy at all.
/// </summary>
public sealed partial class CardCover(IOcrEngine ocr)
{
    /// <summary>Confident enough that a word is really what OCR says (used to keep names out of the barcode check).</summary>
    public const float SureConfidence = 80;
    /// <summary>A copy that's mostly covered says nothing: keep the photo private instead.</summary>
    public const double MaxCoveredShare = 0.7;
    /// <summary>The re-check in the other three orientations: real Tesseract reads upside-down letters as digits at up to ~65.</summary>
    public const float SidewaysConfidence = 70;
    /// <summary>Re-checks before giving up: each one covers what the previous one still read.</summary>
    public const int RecheckRounds = 3;
    public static readonly SKColor Ink = new(0x22, 0x1F, 0x1A);

    public async Task<CoverResult> CoverAsync(byte[] jpeg, CancellationToken ct)
    {
        using var original = SKBitmap.Decode(jpeg);
        if (original is null) return CoverResult.Fail("unreadable image");

        // Small photos read badly; OCR a 2× copy and map the boxes back.
        var scale = Math.Max(original.Width, original.Height) < 1000 ? 2f : 1f;

        // Cards are often photographed sideways: read the best of four rotations, and keep that one upright.
        SKBitmap? best = null;
        IReadOnlyList<OcrWord> bestWords = [];
        var bestScore = -1;
        try
        {
            foreach (var degrees in new[] { 0, 90, 180, 270 })
            {
                var rotated = Rotate(original, degrees);
                using var work = Scale(rotated, scale);
                var words = Unscale(await ocr.ReadAsync(work, ct), scale);
                var score = words.Count(w => w.Confidence >= 60 && w.Text.Count(char.IsLetterOrDigit) >= 2);
                if (score > bestScore)
                {
                    best?.Dispose();
                    (best, bestWords, bestScore) = (rotated, words, score);
                }
                else rotated.Dispose();
                if (degrees == 0 && score >= 4) break;
            }
            if (best is null || bestScore <= 0) return CoverResult.Fail("no readable text");

            var boxes = TextBoxes(bestWords, best.Width);
            boxes.AddRange(BusyRegions(best, bestWords));

            // Covering changes how OCR splits the image, so a re-check can find digits the first read missed.
            // Cover those too and check again; the copy is only kept after a clean check of the served bytes.
            var leftover = "";
            for (var round = 0; round < RecheckRounds; round++)
            {
                if (CoveredShare(best.Width, best.Height, boxes) > MaxCoveredShare) return CoverResult.Fail("too much to cover");
                var output = Draw(best, boxes);

                using var check = SKBitmap.Decode(output);
                var left = new List<OcrWord>();
                foreach (var degrees in new[] { 0, 90, 180, 270 })
                {
                    using var rotated = Rotate(check, degrees);
                    using var work = Scale(rotated, scale);
                    var read = (await ocr.ReadAsync(work, ct)).Where(w => w.Text.Any(char.IsDigit)
                        // A cover block itself reads as "1" or "|"; that's not a leak.
                        && InkShare(work, w.Box) < 0.5
                        // Sideways or upside down, letters get misread as digits; count only confident reads there.
                        && (degrees == 0 || w.Confidence >= SidewaysConfidence));
                    foreach (var w in Unscale([.. read], scale)) left.Add(w with { Box = Unrotate(w.Box, degrees, check.Width, check.Height) });
                    if (left.Count > 0) leftover = $"{degrees}°";
                }
                if (left.Count == 0) return new CoverResult(output, round == 0 ? "covered" : $"covered after {round + 1} checks");
                boxes.AddRange(TextBoxes(left, best.Width));
            }
            return CoverResult.Fail($"digits still readable ({leftover})");
        }
        finally
        {
            best?.Dispose();
        }
    }

    /// <summary>The image with the boxes filled in, as the JPEG we would serve.</summary>
    private static byte[] Draw(SKBitmap image, IReadOnlyList<SKRect> boxes)
    {
        using var covered = image.Copy();
        using (var canvas = new SKCanvas(covered))
        using (var paint = new SKPaint { Color = Ink, Style = SKPaintStyle.Fill, IsAntialias = false })
            foreach (var b in boxes) canvas.DrawRect(b, paint);
        using var encoded = SKImage.FromBitmap(covered);
        using var data = encoded.Encode(SKEncodedImageFormat.Jpeg, 82);
        return data.ToArray();
    }

    /// <summary>A box read on <see cref="Rotate"/>(image, degrees), in the unrotated image's pixels (width × height).</summary>
    public static SKRectI Unrotate(SKRectI box, int degrees, int width, int height)
    {
        (int X, int Y) Back(int u, int v) => degrees switch
        {
            90 => (v, height - u),
            180 => (width - u, height - v),
            270 => (width - v, u),
            _ => (u, v),
        };
        var (x1, y1) = Back(box.Left, box.Top);
        var (x2, y2) = Back(box.Right, box.Bottom);
        return new SKRectI(Math.Min(x1, x2), Math.Min(y1, y2), Math.Max(x1, x2), Math.Max(y1, y2));
    }

    /// <summary>Boxes over the numbers OCR found, padded; whole rows for card numbers and MRZ lines.</summary>
    public static List<SKRect> TextBoxes(IReadOnlyList<OcrWord> words, int imageWidth)
    {
        var boxes = new List<SKRect>();
        foreach (var row in Rows(words))
        {
            var digits = row.Sum(w => w.Text.Count(char.IsDigit));
            var top = row.Min(w => w.Box.Top);
            var bottom = row.Max(w => w.Box.Bottom);
            if (row.Any(w => IsMrz(w.Text)))
            {
                // Machine-readable zone: the whole band, edge to edge.
                boxes.Add(Pad(new SKRect(0, top, imageWidth, bottom), bottom - top));
                continue;
            }
            if (digits >= 6)
            {
                // A card or ID number split into groups: the row from first to last word.
                boxes.Add(Pad(new SKRect(row.Min(w => w.Box.Left), top, row.Max(w => w.Box.Right), bottom), bottom - top));
                continue;
            }
            // Single numbers (dates, short IDs), spreading to unsure neighbours that may be misread digits.
            var cover = row.Where(w => w.Text.Any(char.IsDigit)).ToHashSet();
            for (var grew = true; grew;)
            {
                grew = false;
                foreach (var w in row)
                {
                    if (cover.Contains(w) || !(w.Confidence < SureConfidence || w.Text.Length <= 3)) continue;
                    if (cover.Any(c => Gap(c.Box, w.Box) <= 1.5 * c.Box.Height)) { cover.Add(w); grew = true; }
                }
            }
            boxes.AddRange(cover.Select(w => Pad(SKRect.Create(w.Box.Left, w.Box.Top, w.Box.Width, w.Box.Height), w.Box.Height)));
        }
        return boxes;
    }

    /// <summary>
    /// Barcodes and QR codes have no text for OCR, but are dense with sharp edges. Covers clusters of
    /// busy cells, except under words OCR read with confidence (names and labels are busy too).
    /// </summary>
    public static List<SKRect> BusyRegions(SKBitmap image, IReadOnlyList<OcrWord> words)
    {
        var cell = Math.Max(8, Math.Min(image.Width, image.Height) / 60);
        var cols = image.Width / cell;
        var rows = image.Height / cell;
        if (cols == 0 || rows == 0) return [];

        var px = Luminance(image);
        var stride = image.Width;
        var sure = words.Where(w => w.Confidence >= SureConfidence && !w.Text.Any(char.IsDigit)).Select(w => w.Box).ToList();

        var busy = new bool[cols, rows];
        for (var cy = 0; cy < rows; cy++)
            for (var cx = 0; cx < cols; cx++)
            {
                int h = 0, v = 0, n = 0;
                for (var y = cy * cell; y < (cy + 1) * cell - 1; y++)
                    for (var x = cx * cell; x < (cx + 1) * cell - 1; x++)
                    {
                        int p = px[y * stride + x];
                        if (Math.Abs(p - px[y * stride + x + 1]) > 60) h++;
                        if (Math.Abs(p - px[(y + 1) * stride + x]) > 60) v++;
                        n++;
                    }
                var centre = new SKPointI(cx * cell + cell / 2, cy * cell + cell / 2);
                busy[cx, cy] = (h > 0.2 * n || v > 0.2 * n) && !sure.Any(b => b.Contains(centre.X, centre.Y));
            }

        // Clusters of at least 4 busy cells (4-connected); a lone busy cell is usually a letter edge.
        var boxes = new List<SKRect>();
        var seen = new bool[cols, rows];
        for (var cy = 0; cy < rows; cy++)
            for (var cx = 0; cx < cols; cx++)
            {
                if (!busy[cx, cy] || seen[cx, cy]) continue;
                int minX = cx, maxX = cx, minY = cy, maxY = cy, count = 0;
                var stack = new Stack<(int, int)>([(cx, cy)]);
                seen[cx, cy] = true;
                while (stack.Count > 0)
                {
                    var (x, y) = stack.Pop();
                    count++;
                    (minX, maxX, minY, maxY) = (Math.Min(minX, x), Math.Max(maxX, x), Math.Min(minY, y), Math.Max(maxY, y));
                    foreach (var (nx, ny) in new[] { (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1) })
                        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && busy[nx, ny] && !seen[nx, ny]) { seen[nx, ny] = true; stack.Push((nx, ny)); }
                }
                if (count >= 4) boxes.Add(new SKRect((minX - 1) * cell, (minY - 1) * cell, (maxX + 2) * cell, (maxY + 2) * cell));
            }
        return boxes;
    }

    /// <summary>Share of the image under the boxes (overlaps counted once).</summary>
    public static double CoveredShare(int width, int height, IReadOnlyList<SKRect> boxes)
    {
        if (boxes.Count == 0) return 0;
        var mask = new bool[width * height];
        foreach (var b in boxes)
        {
            int x0 = Math.Clamp((int)b.Left, 0, width), x1 = Math.Clamp((int)Math.Ceiling(b.Right), 0, width);
            int y0 = Math.Clamp((int)b.Top, 0, height), y1 = Math.Clamp((int)Math.Ceiling(b.Bottom), 0, height);
            for (var y = y0; y < y1; y++) Array.Fill(mask, true, y * width + x0, x1 - x0);
        }
        return (double)mask.Count(m => m) / mask.Length;
    }

    /// <summary>0–255 brightness per pixel, row by row.</summary>
    private static byte[] Luminance(SKBitmap image)
    {
        using var rgba = image.Copy(SKColorType.Rgba8888);
        var src = rgba.GetPixelSpan();
        var gray = new byte[image.Width * image.Height];
        for (var y = 0; y < image.Height; y++)
            for (var x = 0; x < image.Width; x++)
            {
                var i = y * rgba.RowBytes + x * 4;
                gray[y * image.Width + x] = (byte)((src[i] * 299 + src[i + 1] * 587 + src[i + 2] * 114) / 1000);
            }
        return gray;
    }

    /// <summary>Share of a box (in this image's pixels) that is the cover colour.</summary>
    public static double InkShare(SKBitmap image, SKRectI box)
    {
        var r = SKRectI.Intersect(box, new SKRectI(0, 0, image.Width, image.Height));
        if (r.IsEmpty) return 0;
        int ink = 0, n = 0;
        for (var y = r.Top; y < r.Bottom; y += 2)
            for (var x = r.Left; x < r.Right; x += 2)
            {
                var c = image.GetPixel(x, y);
                if (Math.Abs(c.Red - Ink.Red) < 16 && Math.Abs(c.Green - Ink.Green) < 16 && Math.Abs(c.Blue - Ink.Blue) < 16) ink++;
                n++;
            }
        return n == 0 ? 0 : (double)ink / n;
    }

    /// <summary>Words on the same line: their vertical extents overlap by at least half the shorter one.</summary>
    private static List<List<OcrWord>> Rows(IReadOnlyList<OcrWord> words)
    {
        var rows = new List<List<OcrWord>>();
        foreach (var w in words.OrderBy(w => w.Box.Top))
        {
            var row = rows.FirstOrDefault(r => r.Any(o =>
                Math.Min(o.Box.Bottom, w.Box.Bottom) - Math.Max(o.Box.Top, w.Box.Top) >= 0.5 * Math.Min(o.Box.Height, w.Box.Height)));
            if (row is null) rows.Add([w]); else row.Add(w);
        }
        return rows;
    }

    private static bool IsMrz(string text) => text.Contains("<<") || (MrzRe().IsMatch(text) && text.Any(char.IsDigit));

    [GeneratedRegex(@"^[A-Z0-9<]{12,}$")]
    private static partial Regex MrzRe();

    private static int Gap(SKRectI a, SKRectI b) => Math.Max(0, Math.Max(a.Left, b.Left) - Math.Min(a.Right, b.Right));

    private static SKRect Pad(SKRect r, float height)
    {
        var p = Math.Max(4f, 0.25f * height);
        return new SKRect(r.Left - p, r.Top - p, r.Right + p, r.Bottom + p);
    }

    private static List<OcrWord> Unscale(IReadOnlyList<OcrWord> words, float scale) => scale == 1f ? [.. words]
        : words.Select(w => w with { Box = new SKRectI((int)(w.Box.Left / scale), (int)(w.Box.Top / scale),
            (int)Math.Ceiling(w.Box.Right / scale), (int)Math.Ceiling(w.Box.Bottom / scale)) }).ToList();

    private static SKBitmap Scale(SKBitmap src, float scale) => scale == 1f ? src.Copy()
        : src.Resize(new SKImageInfo((int)(src.Width * scale), (int)(src.Height * scale)), new SKSamplingOptions(SKCubicResampler.Mitchell));

    public static SKBitmap Rotate(SKBitmap src, int degrees)
    {
        if (degrees == 0) return src.Copy();
        var swap = degrees is 90 or 270;
        var dst = new SKBitmap(swap ? src.Height : src.Width, swap ? src.Width : src.Height);
        using var canvas = new SKCanvas(dst);
        canvas.Translate(dst.Width / 2f, dst.Height / 2f);
        canvas.RotateDegrees(degrees);
        canvas.Translate(-src.Width / 2f, -src.Height / 2f);
        using var image = SKImage.FromBitmap(src);
        canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
        return dst;
    }
}
