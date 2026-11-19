using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace Zarqa.Api.Matching;

/// <summary>
/// Model access, routed like the benchmark (benchmark/src/openai.js, jevClient.js):
/// OpenAI-compatible routes for Luna, Terra and embeddings; DeepSeek for debate fallback and TypeSafe for legacy Jev.
/// </summary>
public sealed class ModelOptions
{
    public string? OpenAiApiKey { get; set; }
    public string? OpenAiBaseUrl { get; set; }
    /// <summary>Optional separate Luna route, e.g. the private Codex gateway. Never receives API keys.</summary>
    public string? LunaBaseUrl { get; set; }
    public string? OpenRouterApiKey { get; set; }
    public string? TypeSafeApiKey { get; set; }
    public string? DeepSeekApiKey { get; set; }
    public bool UseTerraJudge { get; set; } = true;
    /// <summary>One text-only screening call over the best 30 by prescore when more than 10 pass (decisions.md, 2026-11-14).</summary>
    public bool UseScreen { get; set; } = true;
    /// <summary>
    /// One text-only call per new or edited report writes a plain-English rendering, used only to find and rank
    /// candidates (benchmark/src/normalize.js). Off: nothing is called and stored renderings are ignored.
    /// </summary>
    public bool UseNormalize { get; set; } = true;
    /// <summary>
    /// The judge gets the same photos as the advocates (for a card report, only the covered copy) and is told to go by
    /// what they show. Fewer wrong pairs at the same recall on two benchmark sets (decisions.md, 2026-11-15). Off by default.
    /// </summary>
    public bool JudgeSeesPhotos { get; set; }
    /// <summary>
    /// One line for the advocates on pairs where the found date is exactly one calendar day before the lost date,
    /// saying that order is not a point against a match (decisions.md, 2026-11-16). No other pair changes. Off by default.
    /// </summary>
    public bool OneDayNote { get; set; }
    /// <summary>
    /// Every model that sees a report's dates also gets the day it was posted, so "today" and "last week" can be
    /// placed (decisions.md, 2026-11-16). Changes every screening, advocate and judge prompt. Off by default.
    /// </summary>
    public bool PostedOn { get; set; }
    /// <summary>
    /// One model alone reviews each pair in place of the debate: no advocates, no separate judge (owner decision,
    /// decisions.md 2026-11-16). Needs <see cref="OpusBaseUrl"/>. A failed call falls back to the debate. Off by default.
    /// </summary>
    public bool UseOpusAlone { get; set; }
    /// <summary>The private Claude Code gateway (deploy/claude), e.g. http://claude:8091/v1. Never receives API keys.</summary>
    public string? OpusBaseUrl { get; set; }
    public string OpusModel { get; set; } = "opus";
    /// <summary>Reasoning level sent to the gateway: low, medium or high. The benchmark runs used high.</summary>
    public string OpusEffort { get; set; } = "high";
    /// <summary>
    /// A one-model review is shown from this score. Its scores sit lower than the debate's: on the five rated sets
    /// its best line fell between 0.30 and 0.45 on every half (decisions.md, 2026-11-16). Read off test sets; to be
    /// settled on pilot reports.
    /// </summary>
    public double OpusThreshold { get; set; } = 0.45;
    /// <summary>
    /// What happens to a pair when the one-model call fails (gateway down, signed out, plan limit, unusable answer).
    /// "debate" (the default): the debate reviews the pair and its match is shown as any debate match is.
    /// "hold": the debate still reviews it, so nothing is missed, but a match it finds always waits in To review,
    /// whatever its score. In tests the debate showed far more clearly wrong pairs than the one-model review
    /// (69 against 2), so its answers should not reach people unseen while it is only the stand-in
    /// (council, 2026-11-19; the owner allowed the build, off by default).
    /// </summary>
    public string OpusFallback { get; set; } = "debate";
    /// <summary>
    /// Only a plain "off" value shows stand-in matches directly. Anything else, a typo included, holds them: a match
    /// held by mistake is released after 48 hours, one shown by mistake cannot be taken back.
    /// </summary>
    public bool HoldsOpusFallback => !ShowsStandInMatches.Contains((OpusFallback ?? "").Trim());
    private static readonly HashSet<string> ShowsStandInMatches = new(StringComparer.OrdinalIgnoreCase) { "", "debate", "false", "off", "no", "0" };
    public string LunaModel { get; set; } = "gpt-6-luna";
    public string TerraModel { get; set; } = "gpt-6.1-terra";
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
    /// <summary>Pinned: jev-latest moves silently and would shift the 0.55 cut-off.</summary>
    public string JevModel { get; set; } = "jev-1.13.0";
    public string JevOpenRouterModel { get; set; } = "typesafe/jev-1.13";
    public string LunaImageDetail { get; set; } = "low";
    /// <summary>Matching pauses for the day once logged model spend reaches this.</summary>
    public decimal DailySpendCapUsd { get; set; } = 2m;

    public bool HasJevRoute => !string.IsNullOrWhiteSpace(TypeSafeApiKey) || !string.IsNullOrWhiteSpace(OpenRouterApiKey);
}

/// <summary>USD per 1M tokens, from benchmark/config.js PRICES (Sep 2026 public prices).</summary>
public static class Prices
{
    public const decimal EmbeddingInput = 0.02m, LunaInput = 0.10m, LunaCachedInput = 0.01m, LunaOutput = 0.50m, JevInput = 0.042m, JevOutput = 0m;

    public static decimal Luna(int input, int cached, int output) =>
        ((input - cached) * LunaInput + cached * LunaCachedInput + output * LunaOutput) / 1_000_000m;

    /// <summary>
    /// Opus at API list prices on 2026-11-03 ($4 in, $0.20 cached in, $20 out per 1M tokens). The Claude Code gateway
    /// runs on a plan and is not billed per call; this is what the same calls would cost through the API.
    /// </summary>
    public static decimal Opus(int input, int cached, int output) =>
        ((input - cached) * 4.00m + cached * 0.20m + output * 20.00m) / 1_000_000m;

    // DeepSeek Flash peak rates, in USD per 1M tokens. Use the peak rate for the spend cap.
    public static decimal DeepSeek(int input, int cached, int output) =>
        ((input - cached) * 0.30m + cached * 0.006m + output * 1.20m) / 1_000_000m;
}

public sealed record EmbedResult(float[][] Vectors, int InputTokens);
public sealed record LunaResult(JsonElement Parsed, int InputTokens, int CachedInputTokens, int OutputTokens, long LatencyMs)
{
    public string? Model { get; init; }
    public decimal? ProviderCostUsd { get; init; }
    public decimal CostUsd => ProviderCostUsd ?? Prices.Luna(InputTokens, CachedInputTokens, OutputTokens);
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

public interface IStructuredChat
{
    bool IsConfigured { get; }
    /// <summary>One structured-output call: system + text + optional images (data URLs).</summary>
    Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct);
}

public interface ILuna : IStructuredChat { }
public interface ITerra : IStructuredChat { }
public interface IDeepSeek : IStructuredChat { }
public interface IOpus : IStructuredChat { }

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
    public static (string Base, string? Key, string Model)? For(ModelOptions o, bool embedding, string? chatModel = null)
    {
        var model = embedding ? o.EmbeddingModel : chatModel ?? o.LunaModel;
        if (!embedding && !string.IsNullOrWhiteSpace(o.LunaBaseUrl)) return (o.LunaBaseUrl.TrimEnd('/'), null, model);
        if (!string.IsNullOrWhiteSpace(o.OpenAiBaseUrl)) return (o.OpenAiBaseUrl.TrimEnd('/'), o.OpenAiApiKey, model);
        if (!string.IsNullOrWhiteSpace(o.OpenAiApiKey)) return (OpenAi, o.OpenAiApiKey, model);
        if (!string.IsNullOrWhiteSpace(o.OpenRouterApiKey)) return (OpenRouter, o.OpenRouterApiKey, model.Contains('/') ? model : $"openai/{model}");
        return null;
    }

    public static async Task<JsonElement> PostAsync(HttpClient http, string url, string? key, object body, CancellationToken ct, bool includeErrorBody = true)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        if (!string.IsNullOrWhiteSpace(key)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        using var res = await http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            var detail = includeErrorBody ? $": {TextRules.Truncate(text, 300)}" : "";
            throw new ModelCallException($"{(int)res.StatusCode} from {new Uri(url).Host}{detail}");
        }
        using var document = JsonDocument.Parse(text);
        return document.RootElement.Clone();
    }

    public static int Int(JsonElement e, params string[] path)
    {
        foreach (var p in path)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(p, out e)) return 0;
        }
        return e.ValueKind == JsonValueKind.Number && e.TryGetInt32(out var value) ? Math.Max(0, value) : 0;
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

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct)
    {
        var r = Route.For(options.Value, embedding: false) ?? throw new ModelCallException("No Luna provider configured.");
        return ChatCompletions.SendAsync(http, r, system, text, imageDataUrls, options.Value.LunaImageDetail,
            ChatCompletions.StrictFormat(schemaName, schema), ct);
    }
}

public sealed class OpenAiTerra(HttpClient http, IOptions<ModelOptions> options) : ITerra
{
    public bool IsConfigured => Route.For(options.Value, embedding: false, options.Value.TerraModel) is not null;

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct)
    {
        var r = Route.For(options.Value, embedding: false, options.Value.TerraModel) ?? throw new ModelCallException("No Terra provider configured.");
        return ChatCompletions.SendAsync(http, r, system, text, imageDataUrls, options.Value.LunaImageDetail,
            ChatCompletions.StrictFormat(schemaName, schema), ct);
    }
}

/// <summary>Opus through the private Claude Code gateway, which speaks the same Chat Completions shape as the Codex one.</summary>
public sealed class ClaudeGatewayOpus(HttpClient http, IOptions<ModelOptions> options) : IOpus
{
    public bool IsConfigured => options.Value.UseOpusAlone && !string.IsNullOrWhiteSpace(options.Value.OpusBaseUrl);

    public async Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct)
    {
        var o = options.Value;
        if (!IsConfigured) throw new ModelCallException("No Opus gateway configured.");
        var result = await ChatCompletions.SendAsync(http, (o.OpusBaseUrl!.TrimEnd('/'), null, o.OpusModel), system, text, imageDataUrls,
            o.LunaImageDetail, ChatCompletions.StrictFormat(schemaName, schema), ct, reasoningEffort: o.OpusEffort);
        return result with { ProviderCostUsd = Prices.Opus(result.InputTokens, result.CachedInputTokens, result.OutputTokens) };
    }
}

public sealed class DeepSeekChat(HttpClient http, IOptions<ModelOptions> options) : IDeepSeek
{
    public const string Model = "deepseek-flash";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(options.Value.DeepSeekApiKey);

    public Task<LunaResult> ChatJsonAsync(string system, string text, IReadOnlyList<string> imageDataUrls, string schemaName, JsonObject schema, CancellationToken ct)
    {
        if (!IsConfigured) throw new ModelCallException("No DeepSeek provider configured.");
        // DeepSeek supports JSON mode, so give it the schema in the prompt and validate the response locally.
        var jsonSystem = $"{system}\nReturn a single JSON object matching this schema: {PromptParts.Stringify(schema)}";
        return ChatCompletions.SendAsync(http, ("https://api.deepseek.com", options.Value.DeepSeekApiKey, Model),
            jsonSystem, text, imageDataUrls, options.Value.LunaImageDetail, new JsonObject { ["type"] = "json_object" }, ct, deepSeek: true);
    }
}

internal static class ChatCompletions
{
    public static JsonObject StrictFormat(string schemaName, JsonObject schema) => new()
    {
        ["type"] = "json_schema",
        ["json_schema"] = new JsonObject { ["name"] = schemaName, ["strict"] = true, ["schema"] = schema.DeepClone() },
    };

    public static async Task<LunaResult> SendAsync(HttpClient http, (string Base, string? Key, string Model) route,
        string system, string text, IReadOnlyList<string> imageDataUrls, string imageDetail, JsonObject format,
        CancellationToken ct, bool deepSeek = false, string? reasoningEffort = null)
    {
        var content = new JsonArray { new JsonObject { ["type"] = "text", ["text"] = text } };
        foreach (var url in imageDataUrls)
            content.Add(new JsonObject { ["type"] = "image_url", ["image_url"] = new JsonObject { ["url"] = url, ["detail"] = imageDetail } });
        var body = new JsonObject
        {
            ["model"] = route.Model,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = system },
                new JsonObject { ["role"] = "user", ["content"] = content },
            },
            ["response_format"] = format,
        };
        if (reasoningEffort is not null) body["reasoning_effort"] = reasoningEffort;
        if (deepSeek)
        {
            body["reasoning_effort"] = "low";
            body["max_tokens"] = 4096;
        }
        var sw = Stopwatch.StartNew();
        var json = await Route.PostAsync(http, $"{route.Base}/chat/completions", route.Key, body, ct, includeErrorBody: false);
        if (json.ValueKind != JsonValueKind.Object || !json.TryGetProperty("choices", out var choices) ||
            choices.ValueKind != JsonValueKind.Array || choices.GetArrayLength() == 0 || choices[0].ValueKind != JsonValueKind.Object ||
            !choices[0].TryGetProperty("message", out var message) || message.ValueKind != JsonValueKind.Object ||
            !message.TryGetProperty("content", out var output) || output.ValueKind != JsonValueKind.String ||
            string.IsNullOrWhiteSpace(output.GetString()))
            throw new ModelCallException("Model returned no JSON content.");
        if (choices[0].TryGetProperty("finish_reason", out var finish) && finish.ValueKind == JsonValueKind.String && finish.GetString() == "length")
            throw new ModelCallException("Model JSON response was truncated.");
        using var parsed = JsonDocument.Parse(output.GetString()!);
        var inputTokens = Route.Int(json, "usage", "prompt_tokens");
        var cachedTokens = deepSeek ? Route.Int(json, "usage", "prompt_cache_hit_tokens") : Route.Int(json, "usage", "prompt_tokens_details", "cached_tokens");
        cachedTokens = Math.Clamp(cachedTokens, 0, Math.Max(inputTokens, 0));
        var outputTokens = Route.Int(json, "usage", "completion_tokens");
        return new LunaResult(parsed.RootElement.Clone(), inputTokens, cachedTokens, outputTokens, sw.ElapsedMilliseconds)
        {
            Model = route.Model,
            ProviderCostUsd = deepSeek ? Prices.DeepSeek(inputTokens, cachedTokens, outputTokens) : null,
        };
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
