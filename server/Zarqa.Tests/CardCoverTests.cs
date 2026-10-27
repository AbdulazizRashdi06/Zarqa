using System.Net;
using System.Net.Http.Headers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;
using Zarqa.Api.Data;
using Zarqa.Api.Photos;
using static Zarqa.Tests.ReportFlowTests;

namespace Zarqa.Tests;

/// <summary>
/// A card drawn in code, never a real one. Words sit at known boxes; a red mark in the top-left corner
/// tells the fake OCR which way up the image is.
/// </summary>
public sealed class SyntheticCard
{
    public const int Width = 1200, Height = 760;
    public List<(string Text, SKRectI Box)> Words { get; } = [];
    public List<SKRectI> Barcodes { get; } = [];
    public SKRectI Face { get; } = new(60, 180, 360, 560);

    public SyntheticCard Word(string text, int x, int y, int w, int h = 44)
    {
        Words.Add((text, new SKRectI(x, y, x + w, y + h)));
        return this;
    }

    public SyntheticCard Barcode(int x, int y, int w, int h)
    {
        Barcodes.Add(new SKRectI(x, y, x + w, y + h));
        return this;
    }

    public static SyntheticCard Student() => new SyntheticCard()
        .Word("GUtech", 420, 60, 180).Word("Student", 620, 60, 200)
        .Word("Name:", 420, 200, 150).Word("Sara", 590, 200, 130)
        .Word("ID:", 420, 290, 70).Word("2023-4471", 510, 290, 250)
        .Word("DOB:", 420, 380, 110).Word("14/03/2004", 550, 380, 260)
        .Barcode(420, 560, 600, 120);

    public static SyntheticCard Arabic() => new SyntheticCard()
        .Word("الاسم", 820, 200, 160).Word("سارة", 620, 200, 150)
        .Word("الرقم", 820, 300, 160).Word("٢٠٢٣٤٤٧١", 500, 300, 280)
        .Word("الميلاد", 820, 400, 180).Word("١٤/٠٣/٢٠٠٤", 500, 400, 280);

    public static SyntheticCard Bank() => new SyntheticCard()
        .Word("Bank", 420, 60, 140).Word("Muscat", 580, 60, 180)
        .Word("4111", 420, 330, 130).Word("1111", 580, 330, 130).Word("1111", 740, 330, 130).Word("1111", 900, 330, 130)
        .Word("12/29", 420, 430, 140)
        .Word("SARA", 420, 560, 140).Word("AL", 580, 560, 70);

    public static SyntheticCard Passport() => new SyntheticCard()
        .Word("Passport", 420, 60, 240).Word("Sara", 420, 200, 130)
        .Word("P<OMNSARA<<AL<HARTHY<<<<<<<<<<<<<<<<<<<<<", 40, 600, 1100, 40)
        .Word("12345678<9OMN0403149F2912315<<<<<<<<<<<<<<04", 40, 660, 1100, 40);

    public byte[] Jpeg()
    {
        using var bmp = new SKBitmap(Width, Height);
        using (var canvas = new SKCanvas(bmp))
        {
            canvas.Clear(new SKColor(0xF4, 0xEF, 0xE4));
            using var fill = new SKPaint { IsAntialias = true };
            // A smooth "face": no sharp edges, so the barcode check leaves it alone.
            fill.Color = new SKColor(0xC9, 0xA8, 0x8A);
            canvas.DrawRect(Face, fill);
            fill.Color = new SKColor(0xB8, 0x95, 0x78);
            canvas.DrawOval(new SKRect(Face.Left + 70, Face.Top + 60, Face.Right - 70, Face.Bottom - 80), fill);
            // Each word as a dark block with light gaps, standing in for text (fonts differ between machines).
            // Navy, so a word is never mistaken for the cover colour.
            fill.Color = new SKColor(0x1C, 0x3F, 0x8C);
            foreach (var (_, box) in Words)
                for (var x = box.Left; x < box.Right; x += 18) canvas.DrawRect(new SKRect(x, box.Top + 6, Math.Min(x + 10, box.Right), box.Bottom - 6), fill);
            fill.Color = SKColors.Black;
            foreach (var b in Barcodes)
                for (var x = b.Left; x < b.Right; x += 6) canvas.DrawRect(new SKRect(x, b.Top, x + (x / 6 % 3 == 0 ? 3 : 2), b.Bottom), fill);
            fill.Color = SKColors.Red;
            canvas.DrawRect(new SKRect(0, 0, 12, 12), fill);
        }
        using var img = SKImage.FromBitmap(bmp);
        return img.Encode(SKEncodedImageFormat.Jpeg, 92).ToArray();
    }

    /// <summary>Share of a box that is the cover colour in a covered copy.</summary>
    public static double InkShare(SKBitmap bmp, SKRectI box)
    {
        int ink = 0, n = 0;
        for (var y = box.Top; y < box.Bottom; y += 2)
            for (var x = box.Left; x < box.Right; x += 2)
            {
                var c = bmp.GetPixel(x, y);
                if (Math.Abs(c.Red - CardCover.Ink.Red) < 40 && Math.Abs(c.Green - CardCover.Ink.Green) < 40 && Math.Abs(c.Blue - CardCover.Ink.Blue) < 40
                    && Math.Abs(c.Red - c.Blue) < 30) ink++;
                n++;
            }
        return (double)ink / n;
    }
}

/// <summary>
/// Stands in for Tesseract: "reads" a synthetic card's words when the image is upright (red mark top-left)
/// and the word isn't covered. Can also fail, or keep seeing a digit, on purpose.
/// </summary>
public sealed class FakeOcr : IOcrEngine
{
    public bool IsAvailable { get; set; } = true;
    public SyntheticCard? Card { get; set; }
    public bool Throw { get; set; }
    /// <summary>A digit the first read misses (so it isn't covered) and the re-check finds, in the same place.</summary>
    public bool MissedDigit { get; set; }
    /// <summary>A digit that turns up somewhere new on every re-check, so covering never catches up.</summary>
    public bool StubbornDigit { get; set; }
    public int Calls;
    public static readonly SKRectI MissedDigitBox = new(1100, 40, 1130, 80);

    public Task<IReadOnlyList<OcrWord>> ReadAsync(SKBitmap image, CancellationToken ct)
    {
        Interlocked.Increment(ref Calls);
        if (Throw) throw new OcrException("tesseract exited with 1");
        var words = new List<OcrWord>();
        var mark = image.GetPixel(4, 4);
        if (Card is null || image.Width != SyntheticCard.Width || mark.Red < 180 || mark.Green > 90) return Task.FromResult<IReadOnlyList<OcrWord>>(words);
        foreach (var (text, box) in Card.Words)
            if (SyntheticCard.InkShare(image, box) < 0.5) words.Add(new OcrWord(text, 91, box));
        // A digit the first read missed (so it was never covered) turns up when the covered copy is re-checked.
        var recheck = words.Count < Card.Words.Count; // some words are covered: this is the covered copy
        if (MissedDigit && recheck) words.Add(new OcrWord("7", 90, MissedDigitBox));
        if (StubbornDigit && recheck) { var x = 40 + 40 * (Calls % 25); words.Add(new OcrWord("7", 90, new SKRectI(x, 700, x + 20, 740))); }
        return Task.FromResult<IReadOnlyList<OcrWord>>(words);
    }
}

public class CardCoverTests
{
    private static (CoverResult Result, SKBitmap? Covered) Cover(SyntheticCard card, FakeOcr? ocr = null)
    {
        ocr ??= new FakeOcr { Card = card };
        var result = new CardCover(ocr).CoverAsync(card.Jpeg(), CancellationToken.None).GetAwaiter().GetResult();
        return (result, result.Jpeg is null ? null : SKBitmap.Decode(result.Jpeg));
    }

    private static SKRectI Box(SyntheticCard card, string text) => card.Words.First(w => w.Text == text).Box;

    [Fact]
    public void English_student_card_keeps_the_name_and_covers_numbers_and_barcode()
    {
        var card = SyntheticCard.Student();
        var (result, covered) = Cover(card);
        Assert.NotNull(covered);
        Assert.InRange(SyntheticCard.InkShare(covered, Box(card, "2023-4471")), 0.95, 1);
        Assert.InRange(SyntheticCard.InkShare(covered, Box(card, "14/03/2004")), 0.95, 1);
        Assert.InRange(SyntheticCard.InkShare(covered, card.Barcodes[0]), 0.95, 1);
        // The name, its label, the face and the issuer stay as they were.
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "Sara")));
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "Name:")));
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "GUtech")));
        Assert.Equal(0, SyntheticCard.InkShare(covered, card.Face));
        Assert.Equal("covered", result.Reason);
    }

    [Fact]
    public void Arabic_card_covers_arabic_indic_digits_and_keeps_the_name()
    {
        var card = SyntheticCard.Arabic();
        var (_, covered) = Cover(card);
        Assert.NotNull(covered);
        Assert.InRange(SyntheticCard.InkShare(covered, Box(card, "٢٠٢٣٤٤٧١")), 0.95, 1);
        Assert.InRange(SyntheticCard.InkShare(covered, Box(card, "١٤/٠٣/٢٠٠٤")), 0.95, 1);
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "سارة")));
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "الاسم")));
    }

    [Fact]
    public void Bank_card_number_is_covered_as_one_row()
    {
        var card = SyntheticCard.Bank();
        var (_, covered) = Cover(card);
        Assert.NotNull(covered);
        // The gaps between the four groups are covered too, not just the groups.
        Assert.InRange(SyntheticCard.InkShare(covered, new SKRectI(420, 330, 1030, 374)), 0.95, 1);
        Assert.InRange(SyntheticCard.InkShare(covered, Box(card, "12/29")), 0.95, 1);
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "SARA")));
    }

    [Fact]
    public void Passport_mrz_lines_are_covered_edge_to_edge()
    {
        var card = SyntheticCard.Passport();
        var (_, covered) = Cover(card);
        Assert.NotNull(covered);
        Assert.InRange(SyntheticCard.InkShare(covered, new SKRectI(0, 600, SyntheticCard.Width, 700)), 0.95, 1);
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "Sara")));
    }

    [Fact]
    public void A_sideways_card_is_read_and_comes_out_upright()
    {
        var card = SyntheticCard.Student();
        using var upright = SKBitmap.Decode(card.Jpeg());
        using var sideways = CardCover.Rotate(upright, 90);
        using var img = SKImage.FromBitmap(sideways);
        var jpeg = img.Encode(SKEncodedImageFormat.Jpeg, 92).ToArray();
        var result = new CardCover(new FakeOcr { Card = card }).CoverAsync(jpeg, CancellationToken.None).GetAwaiter().GetResult();
        using var covered = SKBitmap.Decode(result.Jpeg);
        Assert.Equal((SyntheticCard.Width, SyntheticCard.Height), (covered.Width, covered.Height));
        Assert.InRange(SyntheticCard.InkShare(covered, Box(card, "2023-4471")), 0.95, 1);
    }

    [Fact]
    public void No_readable_text_means_no_copy()
    {
        var (result, covered) = Cover(new SyntheticCard());
        Assert.Null(covered);
        Assert.Equal("no readable text", result.Reason);
    }

    [Fact]
    public void A_digit_found_on_the_recheck_is_covered_too()
    {
        var card = SyntheticCard.Student();
        var (result, covered) = Cover(card, new FakeOcr { Card = card, MissedDigit = true });
        Assert.NotNull(covered);
        Assert.InRange(SyntheticCard.InkShare(covered, FakeOcr.MissedDigitBox), 0.95, 1);
        Assert.Equal(0, SyntheticCard.InkShare(covered, Box(card, "Sara")));
        Assert.Equal("covered after 2 checks", result.Reason);
    }

    [Fact]
    public void Digits_that_keep_turning_up_mean_no_copy()
    {
        var card = SyntheticCard.Student();
        var (result, covered) = Cover(card, new FakeOcr { Card = card, StubbornDigit = true });
        Assert.Null(covered);
        Assert.StartsWith("digits still readable", result.Reason);
    }

    [Theory]
    [InlineData(90)]
    [InlineData(180)]
    [InlineData(270)]
    public void Boxes_read_on_a_rotated_copy_map_back(int degrees)
    {
        using var bmp = new SKBitmap(300, 200);
        bmp.Erase(SKColors.White);
        var box = new SKRectI(40, 30, 70, 50);
        for (var y = box.Top; y < box.Bottom; y++) for (var x = box.Left; x < box.Right; x++) bmp.SetPixel(x, y, SKColors.Black);
        using var rotated = CardCover.Rotate(bmp, degrees);
        // Find the black box on the rotated copy, as OCR would, then map it back.
        int minX = int.MaxValue, minY = int.MaxValue, maxX = 0, maxY = 0;
        for (var y = 0; y < rotated.Height; y++)
            for (var x = 0; x < rotated.Width; x++)
                if (rotated.GetPixel(x, y).Red < 100) (minX, minY, maxX, maxY) = (Math.Min(minX, x), Math.Min(minY, y), Math.Max(maxX, x + 1), Math.Max(maxY, y + 1));
        var back = CardCover.Unrotate(new SKRectI(minX, minY, maxX, maxY), degrees, 300, 200);
        Assert.InRange(Math.Abs(back.Left - box.Left) + Math.Abs(back.Top - box.Top) + Math.Abs(back.Right - box.Right) + Math.Abs(back.Bottom - box.Bottom), 0, 4);
    }

    [Fact]
    public async Task An_ocr_failure_throws_and_never_returns_a_copy() =>
        await Assert.ThrowsAsync<OcrException>(() => new CardCover(new FakeOcr { Throw = true }).CoverAsync(SyntheticCard.Student().Jpeg(), CancellationToken.None));

    [Fact]
    public void Reads_tesseract_tsv_words()
    {
        const string tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
            + "1\t1\t0\t0\t0\t0\t0\t0\t1200\t760\t-1\t\n"
            + "5\t1\t1\t1\t1\t1\t420\t200\t150\t44\t93.5\tName:\n"
            + "5\t1\t1\t1\t1\t2\t510\t290\t250\t44\t88\t2023-4471\n";
        var words = TesseractOcr.ParseTsv(tsv);
        Assert.Equal(2, words.Count);
        Assert.Equal(new OcrWord("2023-4471", 88, new SKRectI(510, 290, 760, 334)), words[1]);
    }

    /// <summary>The real engine on drawn cards, where Tesseract is installed (CI and the API image).</summary>
    [Theory]
    [InlineData("student")]
    [InlineData("bank")]
    public async Task Real_tesseract_covers_printed_digits_when_installed(string kind)
    {
        var ocr = new TesseractOcr(Microsoft.Extensions.Options.Options.Create(new CoverOptions()), Microsoft.Extensions.Logging.Abstractions.NullLogger<TesseractOcr>.Instance);
        if (!ocr.IsAvailable) return; // Not installed on this machine: covered by CI.
        // SkiaSharp's no-dependency Linux build has no font lookup, so load a font file directly.
        var fontFile = new[] { "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", @"C:\Windows\Fonts\arial.ttf" }.FirstOrDefault(File.Exists);
        Assert.NotNull(fontFile);
        var (background, colour, name, lines) = kind == "student"
            ? (SKColors.White, SKColors.Black, "Sara", new (string, float, float)[]
                { ("GUtech Student Card", 120, 56), ("Name: Sara", 260, 56), ("ID 20234471", 400, 56), ("Born 14/03/2004", 540, 56) })
            // A dark bank card: grouped number, expiry and small print, light text.
            : (new SKColor(0x7A, 0x12, 0x1E), new SKColor(0xF2, 0xEE, 0xE6), "SARA", new (string, float, float)[]
                { ("Bank Muscat", 110, 60), ("4111 1111 1111 1111", 380, 72), ("VALID THRU 12/29", 480, 40), ("SARA AL HARTHY", 600, 52),
                  ("Customer service 24795555", 700, 26) });
        using var bmp = new SKBitmap(1200, 760);
        using (var canvas = new SKCanvas(bmp))
        {
            canvas.Clear(background);
            using var typeface = SKTypeface.FromFile(fontFile);
            using var ink = new SKPaint { Color = colour, IsAntialias = true };
            foreach (var (text, y, size) in lines)
            {
                using var font = new SKFont(typeface, size);
                canvas.DrawText(text, 80, y, font, ink);
            }
        }
        using var img = SKImage.FromBitmap(bmp);
        var before = await ocr.ReadAsync(bmp, CancellationToken.None);
        Assert.Contains(before, w => w.Text.Contains(name));
        Assert.Contains(before, w => w.Text.Any(char.IsDigit));

        var result = await new CardCover(ocr).CoverAsync(img.Encode(SKEncodedImageFormat.Jpeg, 92).ToArray(), CancellationToken.None);
        Assert.True(result.Jpeg is not null, result.Reason);
        using var covered = SKBitmap.Decode(result.Jpeg);
        var after = await ocr.ReadAsync(covered, CancellationToken.None);
        Assert.DoesNotContain(after, w => w.Text.Any(char.IsDigit) && CardCover.InkShare(covered, w.Box) < 0.5);
        Assert.Contains(after, w => w.Text.Contains(name));
    }
}

/// <summary>The covered copy through the app: who gets it, who gets the original, and what Luna sees.</summary>
public class CardCoverFlowTests(TestApp app) : IClassFixture<TestApp>
{
    private static MultipartFormDataContent CardForm(string kind, string text, byte[]? photo)
    {
        var form = new MultipartFormDataContent { { new StringContent(kind), "kind" }, { new StringContent(text), "text" },
            { new StringContent("GU1 Library"), "locationName" } };
        if (photo is not null)
        {
            var file = new ByteArrayContent(photo);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            form.Add(file, "photos", "card.jpg");
        }
        return form;
    }

    private async Task<Photo> PhotoRow(Guid id)
    {
        await using var db = app.Db();
        return await db.Photos.AsNoTracking().SingleAsync(p => p.Id == id);
    }

    private async Task<int> DrainCoversAsync()
    {
        var worker = app.Services.GetRequiredService<CardCoverWorker>();
        var n = 0;
        while (n < 20 && await worker.RunOneAsync(CancellationToken.None)) n++;
        return n;
    }

    [Fact]
    public async Task Possible_owner_staff_and_luna_get_the_covered_copy_never_the_original()
    {
        var card = SyntheticCard.Student();
        app.Ocr.Card = card;
        app.Models.Reset();
        var finder = await app.SignedIn("finder.cover@gutech.edu.om", "Omar");
        var owner = await app.SignedIn("owner.cover@gutech.edu.om", "Sara");
        var stranger = await app.SignedIn("stranger.cover@gutech.edu.om");
        var admin = await app.SignedIn("admin@gutech.edu.om");
        await using (var db = app.Db())
        {
            db.RsaMembers.Add(new RsaMember { Email = "rsa.cover@gutech.edu.om", AddedAt = DateTimeOffset.UtcNow });
            await db.SaveChangesAsync();
        }
        var rsa = await app.SignedIn("rsa.cover@gutech.edu.om", "Huda");

        var photoBytes = card.Jpeg();
        var found = await Json(await finder.PostAsync("/api/reports",
            CardForm("found", "Blue GUtech student card, first name Sara, found in the library", photoBytes)));
        Assert.True(found.GetProperty("isSensitive").GetBoolean());
        var photoId = found.GetProperty("photoIds")[0].GetGuid();
        Assert.Equal(CoverState.Pending, (await PhotoRow(photoId)).CoverState);

        // Before covering, nobody else sees anything.
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/photos/{photoId}")).StatusCode);

        Assert.Equal(1, await DrainCoversAsync());
        var row = await PhotoRow(photoId);
        Assert.Equal(CoverState.Ready, row.CoverState);
        var coveredBytes = await File.ReadAllBytesAsync(Path.Combine(app.PhotoRoot, row.CoveredKey!));
        var originalBytes = await File.ReadAllBytesAsync(Path.Combine(app.PhotoRoot, row.StorageKey));

        var lost = await Json(await owner.PostAsync("/api/reports", CardForm("lost", "My blue GUtech student card, first name Sara, lost in the library", null)));
        await app.DrainMatchingAsync();

        // Luna saw the found card only as its covered copy.
        var coveredUrl = $"data:image/jpeg;base64,{Convert.ToBase64String(coveredBytes)}";
        var originalUrl = $"data:image/jpeg;base64,{Convert.ToBase64String(originalBytes)}";
        Assert.Contains(app.Models.LunaImages, i => i == coveredUrl);
        Assert.DoesNotContain(app.Models.LunaImages, i => i == originalUrl);

        Guid matchId;
        await using (var db = app.Db())
            matchId = (await db.Matches.SingleAsync(m => m.LostId == lost.GetProperty("id").GetGuid() && m.FoundId == found.GetProperty("id").GetGuid())).Id;

        // The possible owner sees the covered copy while deciding, before "It's mine".
        var match = await Json(await owner.GetAsync($"/api/matches/{matchId}"));
        Assert.Equal(photoId, match.GetProperty("found").GetProperty("photoIds")[0].GetGuid());
        Assert.True(match.GetProperty("found").GetProperty("isSensitive").GetBoolean());
        Assert.Equal(coveredBytes, await owner.GetByteArrayAsync($"/api/photos/{photoId}"));
        Assert.Equal(coveredBytes, await admin.GetByteArrayAsync($"/api/photos/{photoId}"));
        Assert.Equal(coveredBytes, await rsa.GetByteArrayAsync($"/api/photos/{photoId}"));
        Assert.Equal(originalBytes, await finder.GetByteArrayAsync($"/api/photos/{photoId}"));
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/photos/{photoId}")).StatusCode);

        // Edited so it's no longer a card: the covered copy goes, and the photo is an ordinary one.
        var coveredPath = Path.Combine(app.PhotoRoot, row.CoveredKey!);
        var patched = await finder.PatchAsync($"/api/reports/{found.GetProperty("id").GetGuid()}",
            System.Net.Http.Json.JsonContent.Create(new { title = "Blue lanyard", category = "Accessories", description = "Blue lanyard found in the library" }));
        patched.EnsureSuccessStatusCode();
        row = await PhotoRow(photoId);
        Assert.Equal((CoverState.None, (string?)null), (row.CoverState, row.CoveredKey));
        Assert.False(File.Exists(coveredPath));
    }

    [Fact]
    public async Task When_covering_fails_the_photo_stays_private()
    {
        app.Ocr.Card = SyntheticCard.Student();
        app.Ocr.StubbornDigit = true;
        try
        {
            var finder = await app.SignedIn("finder.fail@gutech.edu.om");
            var found = await Json(await finder.PostAsync("/api/reports", CardForm("found", "Student ID card", SyntheticCard.Student().Jpeg())));
            var photoId = found.GetProperty("photoIds")[0].GetGuid();
            await DrainCoversAsync();
            var row = await PhotoRow(photoId);
            Assert.Equal((CoverState.Failed, (string?)null), (row.CoverState, row.CoveredKey));
            var admin = await app.SignedIn("admin@gutech.edu.om");
            Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/photos/{photoId}")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await finder.GetAsync($"/api/photos/{photoId}")).StatusCode);
        }
        finally { app.Ocr.StubbornDigit = false; }
    }

    [Fact]
    public async Task Ocr_errors_and_a_missing_engine_keep_the_photo_private()
    {
        var finder = await app.SignedIn("finder.ocrdown@gutech.edu.om");
        app.Ocr.IsAvailable = false;
        try
        {
            var found = await Json(await finder.PostAsync("/api/reports", CardForm("found", "Bank card", SyntheticCard.Bank().Jpeg())));
            var photoId = found.GetProperty("photoIds")[0].GetGuid();
            Assert.Equal(0, await DrainCoversAsync());
            Assert.Equal(CoverState.Pending, (await PhotoRow(photoId)).CoverState);

            app.Ocr.IsAvailable = true;
            app.Ocr.Throw = true;
            await DrainCoversAsync();
            Assert.Equal(CoverState.Failed, (await PhotoRow(photoId)).CoverState);
        }
        finally
        {
            app.Ocr.IsAvailable = true;
            app.Ocr.Throw = false;
        }
    }
}
