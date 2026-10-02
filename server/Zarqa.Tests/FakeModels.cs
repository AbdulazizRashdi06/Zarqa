using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Zarqa.Api.Matching;

namespace Zarqa.Tests;

/// <summary>Scriptable stand-ins for the model APIs, shared by one TestApp.</summary>
public sealed class FakeModels
{
    public bool LunaConfigured { get; set; } = true;
    public bool JevConfigured { get; set; } = true;
    /// <summary>Jev's P(same item) and the index (0..4) of its most likely "overall" level.</summary>
    public double SameItem { get; set; } = 0.9;
    public int OverallLevel { get; set; } = 4;
    /// <summary>Plain-Luna review score when Jev isn't used.</summary>
    public double LunaScore { get; set; } = 0.85;

    public ConcurrentBag<(string SchemaName, int Images)> LunaCalls { get; } = [];
    public int JevCalls;

    public FakeEmbedder Embedder => new(this);
    public FakeLuna Luna => new(this);
    public FakeJev Jev => new(this);

    public void Reset()
    {
        LunaConfigured = JevConfigured = true;
        SameItem = 0.9;
        OverallLevel = 4;
        LunaScore = 0.85;
        LunaCalls.Clear();
        JevCalls = 0;
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
        var json = schemaName switch
        {
            "advocate_for" => """{"argument":"Same blue metal bottle with a cat sticker.","strength":"strong"}""",
            "advocate_against" => """{"argument":"Little against it.","strength":"weak"}""",
            "match_reasons" => """{"reasons":["Both mention a cat sticker","Both are blue metal"]}""",
            "match_review" => $$"""{"isLikelyMatch":true,"finalScore":{{m.LunaScore}},"explanation":"looks the same","matchedFields":[],"riskFlags":[]}""",
            _ => "{}",
        };
        return Task.FromResult(new LunaResult(JsonDocument.Parse(json).RootElement.Clone(), 1000, 0, 100, 5));
    }
}

public sealed class FakeJev(FakeModels m) : IJev
{
    public bool IsConfigured => m.JevConfigured;

    public Task<JevResult> AskAsync(JsonObject state, JsonObject questions, CancellationToken ct)
    {
        Interlocked.Increment(ref m.JevCalls);
        var probs = new double[5];
        probs[m.OverallLevel] = 1;
        var answers = new JsonObject
        {
            ["same_item"] = new JsonObject { ["noul"] = m.SameItem },
            ["stronger_case"] = new JsonObject { ["choice"] = "for" },
            ["overall"] = new JsonObject { ["probabilities"] = new JsonArray(probs.Select(p => (JsonNode)p).ToArray()) },
        };
        return Task.FromResult(new JevResult(JsonDocument.Parse(answers.ToJsonString()).RootElement.Clone(), 500, 0, 5));
    }
}
