using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Zarqa.Api.Matching;

/// <summary>
/// Model access, routed like the benchmark (benchmark/src/openai.js, jevClient.js):
/// OpenAI-compatible API (key or base URL) or OpenRouter for Luna and embeddings; TypeSafe or OpenRouter for Jev.
/// Set on the server as OPENAI_API_KEY / OPENAI_BASE_URL / OPENROUTER_API_KEY / TYPESAFE_API_KEY.
/// </summary>
public sealed class ModelOptions
{
    public string? OpenAiApiKey { get; set; }
    public string? OpenAiBaseUrl { get; set; }
    public string? OpenRouterApiKey { get; set; }
    public string? TypeSafeApiKey { get; set; }
    public string LunaModel { get; set; } = "gpt-6-luna";
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
    /// <summary>Pinned: jev-latest moves silently and would shift the 0.65 cut-off.</summary>
    public string JevModel { get; set; } = "jev-1.13.0";
    public string JevOpenRouterModel { get; set; } = "typesafe/jev-1.13";
    public string LunaImageDetail { get; set; } = "low";
    /// <summary>Matching pauses for the day once logged model spend reaches this.</summary>
    public decimal DailySpendCapUsd { get; set; } = 2m;

    public bool HasLunaRoute => !string.IsNullOrWhiteSpace(OpenAiApiKey) || !string.IsNullOrWhiteSpace(OpenAiBaseUrl) || !string.IsNullOrWhiteSpace(OpenRouterApiKey);
    public bool HasJevRoute => !string.IsNullOrWhiteSpace(TypeSafeApiKey) || !string.IsNullOrWhiteSpace(OpenRouterApiKey);
}

/// <summary>USD per 1M tokens, from benchmark/config.js PRICES (Sep 2026 public prices).</summary>
public static class Prices
{
    public const decimal EmbeddingInput = 0.02m, LunaInput = 0.10m, LunaCachedInput = 0.01m, LunaOutput = 0.50m, JevInput = 0.042m, JevOutput = 0m;

    public static decimal Luna(int input, int cached, int output) =>
        ((input - cached) * LunaInput + cached * LunaCachedInput + output * LunaOutput) / 1_000_000m;
}

public sealed record EmbedResult(float[][] Vectors, int InputTokens);
public sealed record LunaResult(JsonElement Parsed, int InputTokens, int CachedInputTokens, int OutputTokens, long LatencyMs)
{
    public decimal CostUsd => Prices.Luna(InputTokens, CachedInputTokens, OutputTokens);
}
public sealed record JevResult(JsonElement Answers, int InputTokens, int OutputTokens, long LatencyMs)
{
    public decimal CostUsd => (InputTokens * Prices.JevInput + OutputTokens * Prices.JevOutput) / 1_000_000m;
}

public interface IEmbedder
{
    bool IsConfigured { get; }
    Task<EmbedResult> EmbedAsync(IReadOnlyList<string> texts, CancellationToken ct);
}

public interface ILuna
{
    bool IsConfigured { get; }
    /// <summary>One structured-output call: system + text + optional images (data URLs).</summary>
    Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct);
}

public interface IJev
{
    bool IsConfigured { get; }
    /// <summary>One Jev call: all questions answered in one pass.</summary>
    Task<JevResult> AskAsync(JsonObject state, JsonObject questions, CancellationToken ct);
}

public sealed class ModelCallException(string message) : Exception(message);

internal static class Route
{
    private const string OpenAi = "https://api.openai.com/v1";
    private const string OpenRouter = "https://openrouter.ai/api/v1";

    /// <summary>(base URL, bearer key, model) for Luna or embeddings; null when nothing is configured.</summary>
    public static (string Base, string? Key, string Model)? For(ModelOptions o, bool embedding)
    {
        var model = embedding ? o.EmbeddingModel : o.LunaModel;
        if (!string.IsNullOrWhiteSpace(o.OpenAiBaseUrl)) return (o.OpenAiBaseUrl.TrimEnd('/'), o.OpenAiApiKey, model);
        if (!string.IsNullOrWhiteSpace(o.OpenAiApiKey)) return (OpenAi, o.OpenAiApiKey, model);
        if (!string.IsNullOrWhiteSpace(o.OpenRouterApiKey)) return (OpenRouter, o.OpenRouterApiKey, model.Contains('/') ? model : $"openai/{model}");
        return null;
    }

    public static async Task<JsonElement> PostAsync(HttpClient http, string url, string? key, object body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        if (!string.IsNullOrWhiteSpace(key)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        using var res = await http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode) throw new ModelCallException($"{(int)res.StatusCode} from {new Uri(url).Host}: {TextRules.Truncate(text, 300)}");
        return JsonDocument.Parse(text).RootElement.Clone();
    }

    public static int Int(JsonElement e, params string[] path)
    {
        foreach (var p in path)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(p, out e)) return 0;
        }
        return e.ValueKind == JsonValueKind.Number ? e.GetInt32() : 0;
    }
}

public sealed class OpenAiEmbedder(HttpClient http, IOptions<ModelOptions> options) : IEmbedder
{
    public bool IsConfigured => Route.For(options.Value, embedding: true) is not null;

    public async Task<EmbedResult> EmbedAsync(IReadOnlyList<string> texts, CancellationToken ct)
    {
        var r = Route.For(options.Value, embedding: true) ?? throw new ModelCallException("No embeddings provider configured.");
        var json = await Route.PostAsync(http, $"{r.Base}/embeddings", r.Key, new { model = r.Model, input = texts }, ct);
        var vectors = json.GetProperty("data").EnumerateArray()
            .OrderBy(d => d.GetProperty("index").GetInt32())
            .Select(d => d.GetProperty("embedding").EnumerateArray().Select(v => v.GetSingle()).ToArray())
            .ToArray();
        return new EmbedResult(vectors, Route.Int(json, "usage", "prompt_tokens"));
    }
}

public sealed class OpenAiLuna(HttpClient http, IOptions<ModelOptions> options) : ILuna
{
    public bool IsConfigured => Route.For(options.Value, embedding: false) is not null;

    public async Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct)
    {
        var r = Route.For(options.Value, embedding: false) ?? throw new ModelCallException("No Luna provider configured.");
        var content = new JsonArray { new JsonObject { ["type"] = "text", ["text"] = text } };
        foreach (var url in imageDataUrls)
            content.Add(new JsonObject { ["type"] = "image_url", ["image_url"] = new JsonObject { ["url"] = url, ["detail"] = options.Value.LunaImageDetail } });
        var body = new JsonObject
        {
            ["model"] = r.Model,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = system },
                new JsonObject { ["role"] = "user", ["content"] = content },
            },
            ["response_format"] = new JsonObject
            {
                ["type"] = "json_schema",
                ["json_schema"] = new JsonObject { ["name"] = schemaName, ["strict"] = true, ["schema"] = schema.DeepClone() },
            },
        };
        var sw = Stopwatch.StartNew();
        var json = await Route.PostAsync(http, $"{r.Base}/chat/completions", r.Key, body, ct);
        var message = json.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "{}";
        return new LunaResult(JsonDocument.Parse(message).RootElement.Clone(),
            Route.Int(json, "usage", "prompt_tokens"), Route.Int(json, "usage", "prompt_tokens_details", "cached_tokens"),
            Route.Int(json, "usage", "completion_tokens"), sw.ElapsedMilliseconds);
    }
}

public sealed class TypeSafeJev(HttpClient http, IOptions<ModelOptions> options) : IJev
{
    public bool IsConfigured => options.Value.HasJevRoute;

    public async Task<JevResult> AskAsync(JsonObject state, JsonObject questions, CancellationToken ct)
    {
        var o = options.Value;
        var (url, key, model) = !string.IsNullOrWhiteSpace(o.TypeSafeApiKey)
            ? ("https://api.typesafe.ai/v1/systemone", o.TypeSafeApiKey, o.JevModel)
            : !string.IsNullOrWhiteSpace(o.OpenRouterApiKey)
                ? ("https://openrouter.ai/api/alpha/decisions", o.OpenRouterApiKey, o.JevOpenRouterModel)
                : throw new ModelCallException("No Jev provider configured.");
        var sw = Stopwatch.StartNew();
        var json = await Route.PostAsync(http, url, key, new JsonObject { ["model"] = model, ["state"] = state.DeepClone(), ["questions"] = questions.DeepClone() }, ct);
        var answers = json.TryGetProperty("answers", out var a) ? a : JsonDocument.Parse("{}").RootElement;
        return new JevResult(answers.Clone(), Route.Int(json, "usage", "input_tokens"), Route.Int(json, "usage", "output_tokens"), sw.ElapsedMilliseconds);
    }
}
