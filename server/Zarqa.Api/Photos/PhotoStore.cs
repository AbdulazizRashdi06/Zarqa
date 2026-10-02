using SkiaSharp;

namespace Zarqa.Api.Photos;

public sealed class PhotoOptions
{
    /// <summary>Folder for stored photos (a Docker volume in production).</summary>
    public string Root { get; set; } = "data/photos";
}

/// <summary>
/// Stores uploaded photos as freshly encoded JPEGs: rotated upright, at most <see cref="MaxEdge"/> px,
/// and with no EXIF at all (GPS, device, time), because only pixels are copied.
/// </summary>
public sealed class PhotoStore(Microsoft.Extensions.Options.IOptions<PhotoOptions> options, ILogger<PhotoStore> log)
{
    public const int MaxEdge = 1600;
    public const int AvatarEdge = 512;
    public const long MaxUploadBytes = 15 * 1024 * 1024;

    private string Root => Path.GetFullPath(options.Value.Root);

    /// <summary>Returns the storage key, or null when the file isn't a readable image.</summary>
    public async Task<string?> SaveAsync(Stream upload, int maxEdge, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        await upload.CopyToAsync(buffer, ct);
        buffer.Position = 0;

        byte[] jpeg;
        try
        {
            jpeg = Normalize(buffer, maxEdge) ?? throw new InvalidDataException("not an image");
        }
        catch (Exception e) when (e is InvalidDataException or ArgumentException or NullReferenceException)
        {
            log.LogInformation("Rejected an upload that isn't a readable image: {Message}", e.Message);
            return null;
        }

        var key = $"{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}.jpg";
        var path = PathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, jpeg, ct);
        return key;
    }

    public string PathFor(string key)
    {
        var full = Path.GetFullPath(Path.Combine(Root, key));
        if (!full.StartsWith(Root, StringComparison.Ordinal)) throw new InvalidOperationException("bad photo key");
        return full;
    }

    public void Delete(string key)
    {
        try { File.Delete(PathFor(key)); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { log.LogWarning(e, "Could not delete photo {Key}", key); }
    }

    public static byte[]? Normalize(Stream input, int maxEdge)
    {
        using var codec = SKCodec.Create(input);
        if (codec is null) return null;
        using var decoded = SKBitmap.Decode(codec);
        if (decoded is null) return null;
        using var upright = ApplyOrigin(decoded, codec.EncodedOrigin);

        var scale = Math.Min(1.0, (double)maxEdge / Math.Max(upright.Width, upright.Height));
        var w = Math.Max(1, (int)Math.Round(upright.Width * scale));
        var h = Math.Max(1, (int)Math.Round(upright.Height * scale));
        using var resized = scale < 1.0
            ? upright.Resize(new SKImageInfo(w, h), new SKSamplingOptions(SKCubicResampler.Mitchell))
            : upright.Copy();
        if (resized is null) return null;

        using var image = SKImage.FromBitmap(resized);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 82);
        return data.ToArray();
    }

    /// <summary>Phones store rotation as an EXIF flag; bake it into the pixels before EXIF is dropped.</summary>
    private static SKBitmap ApplyOrigin(SKBitmap src, SKEncodedOrigin origin)
    {
        if (origin == SKEncodedOrigin.TopLeft) return src.Copy();
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var dst = new SKBitmap(swap ? src.Height : src.Width, swap ? src.Width : src.Height);
        using var canvas = new SKCanvas(dst);
        switch (origin)
        {
            case SKEncodedOrigin.TopRight: canvas.Scale(-1, 1, src.Width / 2f, 0); break;
            case SKEncodedOrigin.BottomRight: canvas.RotateDegrees(180, src.Width / 2f, src.Height / 2f); break;
            case SKEncodedOrigin.BottomLeft: canvas.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.LeftTop: canvas.Translate(dst.Width, 0); canvas.RotateDegrees(90); canvas.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.RightTop: canvas.Translate(dst.Width, 0); canvas.RotateDegrees(90); break;
            case SKEncodedOrigin.RightBottom: canvas.Translate(0, dst.Height); canvas.RotateDegrees(-90); canvas.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.LeftBottom: canvas.Translate(0, dst.Height); canvas.RotateDegrees(-90); break;
        }
        using var image = SKImage.FromBitmap(src);
        canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
        return dst;
    }
}
