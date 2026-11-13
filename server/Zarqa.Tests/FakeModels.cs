using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Zarqa.Api.Matching;

namespace Zarqa.Tests;

/// <summary>Scriptable stand-ins for the model APIs, shared by one TestApp.</summary>
public sealed class FakeModels
{
    public bool LunaConfigured { get; set; } = true;
    public bool TerraConfigured { get; set; } = true;
    /// <summary>The judge's P(same item) and the index (0..4) of its most likely overall level.</summary>
    public double SameItem { get; set; } = 0.9;
    public int OverallLevel { get; set; } = 4;
    public ConcurrentBag<(string SchemaName, int Images)> LunaCalls { get; } = [];
    /// <summary>Every image data URL Luna was sent.</summary>
    public ConcurrentBag<string> LunaImages { get; } = [];
    public ConcurrentBag<string> JudgeModels { get; } = [];

    public FakeEmbedder Embedder => new(this);
    public FakeLuna Luna => new(this);
    public FakeJudge Terra => new(this, Fallback: false);
    public FakeJudge DeepSeek => new(this, Fallback: true);

    public void Reset()
    {
        LunaConfigured = TerraConfigured = true;
        SameItem = 0.9;
        OverallLevel = 4;
        LunaCalls.Clear();
        LunaImages.Clear();
        JudgeModels.Clear();
    }
}

/// <summary>Hashed bag-of-words vectors: similar wording → high cosine, like a real embedding.</summary>
public sealed class FakeEmbedder(FakeModels m) : IEmbedder
{
    public bool IsConfigured => m.LunaConfigured;

    public Task<EmbedResult> EmbedAsync(IReadOnlyList<string> texts, CancellationToken ct) =>
        Task.FromResult(new EmbedResult(texts.Select(Vector).ToArray(), texts.Sum(t => t.Length / 4)));

    private static float[] Vector(string text)
    {
        var v = new float[1536];
        // Only the item words count (title/description/category lines), so the fixed field labels don't dominate.
        foreach (var line in text.Split('\n').Where(l => l.StartsWith("title:") || l.StartsWith("description:") || l.StartsWith("category:")))
            foreach (var t in TextRules.Tokens(line[(line.IndexOf(':') + 1)..]))
                v[(int)((uint)t.GetHashCode() % 1536)] += 1;
        return v;
    }
}

public sealed class FakeLuna(FakeModels m) : ILuna
{
    public bool IsConfigured => m.LunaConfigured;

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> images, string schemaName, JsonObject schema, CancellationToken ct)
    {
        m.LunaCalls.Add((schemaName, images.Count));
        foreach (var i in images) m.LunaImages.Add(i);
        var json = schemaName switch
        {
            "advocate_for" => """{"argument":"Same blue metal bottle with a cat sticker.","strength":"strong"}""",
            "advocate_against" => """{"argument":"Little against it.","strength":"weak"}""",
            "match_reasons" => """{"reasons":["Both mention a cat sticker","Both are blue metal"]}""",
            _ => "{}",
        };
        return Task.FromResult(new LunaResult(JsonDocument.Parse(json).RootElement.Clone(), 1000, 0, 100, 5));
    }
}

public sealed class FakeJudge(FakeModels m, bool Fallback) : ITerra, IDeepSeek
{
    public bool IsConfigured => Fallback || m.TerraConfigured;

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> images, string schemaName, JsonObject schema, CancellationToken ct)
    {
        Assert.Equal("debate_judge", schemaName);
        Assert.Empty(images);
        var model = Fallback ? DeepSeekChat.Model : "gpt-6.1-terra";
        m.JudgeModels.Add(model);
        var levels = new[] { "clearly_different", "probably_different", "unclear", "probably_same", "almost_certainly_same" };
        var answers = new JsonObject
        {
            ["same_item_probability"] = m.SameItem,
            ["stronger_case"] = "for",
            ["overall_probabilities"] = new JsonObject(levels.Select((level, i) =>
                KeyValuePair.Create<string, JsonNode?>(level, JsonValue.Create(i == m.OverallLevel ? 1 : 0)))),
        };
        return Task.FromResult(new LunaResult(JsonSerializer.SerializeToElement(answers), 500, 0, 50, 5) { Model = model });
    }
}
