using SkiaSharp;
using Zarqa.Api.Photos;
using Zarqa.Api.Reports;

namespace Zarqa.Tests;

public class PhotoStoreTests
{
    /// <summary>A JPEG with an EXIF block (orientation and a fake GPS string), like a phone photo.</summary>
    public static byte[] PhoneJpeg(int width, int height, ushort orientation = 1)
    {
        using var bmp = new SKBitmap(width, height);
        bmp.Erase(SKColors.Coral);
        using var img = SKImage.FromBitmap(bmp);
        var jpeg = img.Encode(SKEncodedImageFormat.Jpeg, 90).ToArray();

        // APP1 "Exif": little-endian TIFF with one IFD entry (0x0112 Orientation), then a GPS-like marker.
        var tiff = new List<byte> { 0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
            (byte)orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
        tiff.AddRange("GPSLatitude=23.6"u8.ToArray());
        var payload = new List<byte>("Exif\0\0"u8.ToArray());
        payload.AddRange(tiff);
        var len = payload.Count + 2;
        var app1 = new List<byte> { 0xFF, 0xE1, (byte)(len >> 8), (byte)len };
        app1.AddRange(payload);
        return [jpeg[0], jpeg[1], .. app1, .. jpeg[2..]];
    }

    private static bool Contains(byte[] haystack, string needle) =>
        haystack.AsSpan().IndexOf(System.Text.Encoding.ASCII.GetBytes(needle)) >= 0;

    [Fact]
    public void Strips_exif_and_shrinks()
    {
        var input = PhoneJpeg(3000, 2000);
        Assert.True(Contains(input, "Exif"));

        var output = PhotoStore.Normalize(new MemoryStream(input), PhotoStore.MaxEdge)!;
        Assert.False(Contains(output, "Exif"));
        Assert.False(Contains(output, "GPS"));
        using var decoded = SKBitmap.Decode(output);
        Assert.Equal(1600, decoded.Width);
        Assert.Equal(1067, decoded.Height);
    }

    [Fact]
    public void Turns_sideways_phone_photos_upright()
    {
        // Orientation 6 = rotate 90° clockwise to display: the stored 400x300 shows as 300x400.
        var output = PhotoStore.Normalize(new MemoryStream(PhoneJpeg(400, 300, orientation: 6)), PhotoStore.MaxEdge)!;
        using var decoded = SKBitmap.Decode(output);
        Assert.Equal((300, 400), (decoded.Width, decoded.Height));
    }

    [Fact]
    public void Refuses_non_images() => Assert.Null(PhotoStore.Normalize(new MemoryStream("not a photo"u8.ToArray()), 1600));
}

public class CategoryTests
{
    [Theory]
    [InlineData("Tech", "AirPods Pro case", "Electronics")]
    [InlineData("tech stuff", "", "Electronics")]
    [InlineData("Cards & IDs", "Student ID", "Wallets & cards")]
    [InlineData("", "Bunch of keys", "Keys")]
    [InlineData("stuff", "Black hoodie", "Clothing")]
    [InlineData("Bottles", "", "Bottles")]
    [InlineData("random thing", "mystery object", null)]
    public void Normalises_free_text(string category, string title, string? expected) =>
        Assert.Equal(expected, Categories.Normalize(category, title));

    [Theory]
    [InlineData("Cards & IDs", true)]
    [InlineData("bank card", true)]
    [InlineData("Passport", true)]
    [InlineData("Student ID", true)]
    [InlineData("Tech", false)]
    [InlineData("Idea notebook", false)] // "id" only counts as a whole word
    public void Spots_card_and_id_reports(string text, bool sensitive) => Assert.Equal(sensitive, Categories.IsSensitive(text));
}
