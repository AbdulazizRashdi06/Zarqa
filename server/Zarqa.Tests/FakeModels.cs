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
    /// <summary>The screen's raw JSON answer; null keeps every candidate in the order given.</summary>
    public string? ScreenAnswer { get; set; }
    /// <summary>Luna fails the screening call like an outage.</summary>
    public bool ScreenFails { get; set; }
    /// <summary>What DeepSeek answers when the screen falls back to it; null means it fails too.</summary>
    public string? DeepSeekScreenAnswer { get; set; }
    public ConcurrentQueue<(string Model, string System, string Text, int Images)> ScreenCalls { get; } = [];
    /// <summary>
    /// The rendering's raw JSON answer for a call's user text; unset or null answers with the report's own words and
    /// place, so nothing is ranked differently.
    /// </summary>
    public Func<string, string?>? NormalizeAnswer { get; set; }
    /// <summary>Luna fails the rendering call like an outage.</summary>
    public bool NormalizeFails { get; set; }
    /// <summary>What DeepSeek answers when the rendering falls back to it; null means it fails too.</summary>
    public string? DeepSeekNormalizeAnswer { get; set; }
    public ConcurrentQueue<(string Model, string System, string Text, int Images)> NormalizeCalls { get; } = [];
    /// <summary>Every text sent for embedding.</summary>
    public ConcurrentQueue<string> EmbeddedTexts { get; } = [];
    /// <summary>Every chat prompt any model was sent, by schema name.</summary>
    public ConcurrentQueue<(string SchemaName, string System, string Text)> Prompts { get; } = [];

    /// <summary>The one-model review is switched on and its gateway is set (off by default, as in the app).</summary>
    public bool OpusConfigured { get; set; }
    /// <summary>The gateway is down, signed out or at its plan limit.</summary>
    public bool OpusFails { get; set; }
    public double OpusSameItem { get; set; } = 0.9;
    public int OpusOverallLevel { get; set; } = 4;
    public ConcurrentQueue<(string SchemaName, string System, string Text, int Images)> OpusCalls { get; } = [];

    public FakeEmbedder Embedder => new(this);
    public FakeLuna Luna => new(this);
    public FakeJudge Terra => new(this, Fallback: false);
    public FakeJudge DeepSeek => new(this, Fallback: true);
    public FakeOpus Opus => new(this);

    public void Reset()
    {
        LunaConfigured = TerraConfigured = true;
        SameItem = 0.9;
        OverallLevel = 4;
        OpusConfigured = OpusFails = false;
        OpusSameItem = 0.9;
        OpusOverallLevel = 4;
        OpusCalls.Clear();
        LunaCalls.Clear();
        LunaImages.Clear();
        JudgeModels.Clear();
        ScreenAnswer = DeepSeekScreenAnswer = null;
        ScreenFails = false;
        ScreenCalls.Clear();
        NormalizeAnswer = null;
        NormalizeFails = false;
        DeepSeekNormalizeAnswer = null;
        NormalizeCalls.Clear();
        EmbeddedTexts.Clear();
        Prompts.Clear();
    }
}

/// <summary>Hashed bag-of-words vectors: similar wording → high cosine, like a real embedding.</summary>
public sealed class FakeEmbedder(FakeModels m) : IEmbedder
{
    public bool IsConfigured => m.LunaConfigured;

    public Task<EmbedResult> EmbedAsync(IReadOnlyList<string> texts, CancellationToken ct)
    {
        foreach (var t in texts) m.EmbeddedTexts.Enqueue(t);
        return Task.FromResult(new EmbedResult(texts.Select(Vector).ToArray(), texts.Sum(t => t.Length / 4)));
    }

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
        m.Prompts.Enqueue((schemaName, system, text));
        foreach (var i in images) m.LunaImages.Add(i);
        if (schemaName == ReportNormalizer.SchemaName)
        {
            m.NormalizeCalls.Enqueue(("gpt-6-luna", system, text, images.Count));
            if (m.NormalizeFails) throw new ModelCallException("rendering down");
            return Task.FromResult(new LunaResult(JsonDocument.Parse(m.NormalizeAnswer?.Invoke(text) ?? Echo(text)).RootElement.Clone(), 300, 0, 60, 3));
        }
        if (schemaName == ScreenReviewer.SchemaName)
        {
            m.ScreenCalls.Enqueue(("gpt-6-luna", system, text, images.Count));
            if (m.ScreenFails) throw new ModelCallException("screen down");
            // Unscripted: keep everything, so the best by prescore are reviewed as they were before the screen.
            var all = $$"""{"keep":[{{string.Join(",", Enumerable.Range(1, text.Split('\n').Length - 2))}}]}""";
            return Task.FromResult(new LunaResult(JsonDocument.Parse(m.ScreenAnswer ?? all).RootElement.Clone(), 2000, 0, 40, 7));
        }
        var json = schemaName switch
        {
            "advocate_for" => """{"argument":"Same blue metal bottle with a cat sticker.","strength":"strong"}""",
            "advocate_against" => """{"argument":"Little against it.","strength":"weak"}""",
            "match_reasons" => """{"reasons":["Both mention a cat sticker","Both are blue metal"]}""",
            _ => "{}",
        };
        return Task.FromResult(new LunaResult(JsonDocument.Parse(json).RootElement.Clone(), 1000, 0, 100, 5));
    }

    /// <summary>Unscripted rendering: the report's own words and place, which add nothing to the ranking.</summary>
    private static string Echo(string text)
    {
        var report = JsonDocument.Parse(text[(text.IndexOf(':') + 1)..]).RootElement;
        return new JsonObject { ["english"] = report.GetProperty("description").GetString(), ["place"] = report.GetProperty("place").GetString() }.ToJsonString();
    }
}

public sealed class FakeJudge(FakeModels m, bool Fallback) : ITerra, IDeepSeek
{
    public bool IsConfigured => Fallback || m.TerraConfigured;

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> images, string schemaName, JsonObject schema, CancellationToken ct)
    {
        Assert.Empty(images);
        m.Prompts.Enqueue((schemaName, system, text));
        if (Fallback && schemaName == ReportNormalizer.SchemaName)
        {
            m.NormalizeCalls.Enqueue((DeepSeekChat.Model, system, text, images.Count));
            if (m.DeepSeekNormalizeAnswer is null) throw new ModelCallException("rendering fallback down");
            return Task.FromResult(new LunaResult(JsonDocument.Parse(m.DeepSeekNormalizeAnswer).RootElement.Clone(), 300, 0, 60, 3) { Model = DeepSeekChat.Model, ProviderCostUsd = Prices.DeepSeek(300, 0, 60) });
        }
        if (Fallback && schemaName == ScreenReviewer.SchemaName)
        {
            m.ScreenCalls.Enqueue((DeepSeekChat.Model, system, text, images.Count));
            if (m.DeepSeekScreenAnswer is null) throw new ModelCallException("screen fallback down");
            return Task.FromResult(new LunaResult(JsonDocument.Parse(m.DeepSeekScreenAnswer).RootElement.Clone(), 2000, 0, 40, 7) { Model = DeepSeekChat.Model });
        }
        Assert.Equal("debate_judge", schemaName);
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

/// <summary>The private Claude Code gateway: one call answers the judge's three questions.</summary>
public sealed class FakeOpus(FakeModels m) : IOpus
{
    public bool IsConfigured => m.OpusConfigured;

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> images, string schemaName, JsonObject schema, CancellationToken ct)
    {
        m.OpusCalls.Enqueue((schemaName, system, text, images.Count));
        if (m.OpusFails) throw new ModelCallException("429 from claude");
        var levels = new[] { "clearly_different", "probably_different", "unclear", "probably_same", "almost_certainly_same" };
        var answers = new JsonObject
        {
            ["same_item_probability"] = m.OpusSameItem,
            ["stronger_case"] = "for",
            ["overall_probabilities"] = new JsonObject(levels.Select((level, i) =>
                KeyValuePair.Create<string, JsonNode?>(level, JsonValue.Create(i == m.OpusOverallLevel ? 1 : 0)))),
        };
        return Task.FromResult(new LunaResult(JsonSerializer.SerializeToElement(answers), 4000, 0, 300, 9) { Model = "opus", ProviderCostUsd = Prices.Opus(4000, 0, 300) });
    }
}
