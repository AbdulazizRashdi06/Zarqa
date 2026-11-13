using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Zarqa.Api.Matching;

namespace Zarqa.Tests;

public class ModelRouteTests
{
    [Fact]
    public async Task Separate_luna_gateway_never_receives_the_embedding_api_key()
    {
        var handler = new Handler(req =>
        {
            Assert.Equal("http://codex:8090/v1/chat/completions", req.RequestUri!.ToString());
            Assert.Null(req.Headers.Authorization);
            return """{"choices":[{"message":{"content":"{\"match\":true}"}}],"usage":{"prompt_tokens":12,"completion_tokens":3}}""";
        });
        var options = Options.Create(new ModelOptions { OpenAiApiKey = "fake-embedding-key", LunaBaseUrl = "http://codex:8090/v1/" });
        var luna = new OpenAiLuna(new HttpClient(handler), options);
        var result = await luna.ChatJsonAsync("review", "umbrella", [], "test", new JsonObject { ["type"] = "object" }, default);
        Assert.True(result.Parsed.GetProperty("match").GetBoolean());
    }

    [Fact]
    public async Task Embeddings_still_use_OpenAI_when_luna_has_its_own_gateway()
    {
        var handler = new Handler(req =>
        {
            Assert.Equal("https://api.openai.com/v1/embeddings", req.RequestUri!.ToString());
            Assert.Equal("Bearer", req.Headers.Authorization!.Scheme);
            Assert.Equal("fake-embedding-key", req.Headers.Authorization.Parameter);
            return """{"data":[{"index":0,"embedding":[1,0]}],"usage":{"prompt_tokens":4}}""";
        });
        var embedder = new OpenAiEmbedder(new HttpClient(handler), Options.Create(new ModelOptions { OpenAiApiKey = "fake-embedding-key", LunaBaseUrl = "http://codex:8090/v1" }));
        var result = await embedder.EmbedAsync(["umbrella"], default);
        Assert.Equal(4, result.InputTokens);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Terra_debate_falls_back_by_stage_and_keeps_the_benchmark_prompts(bool failAdvocates)
    {
        // SHA-256 of the primary prompts in the benchmark's dba3604 Terra implementation.
        var hashes = new Dictionary<string, string>
        {
            ["advocate_for"] = "eabfcdb6cadb162e6e5e7067bb6066bab33214f6caf0f0d5a6700549c0b82adc",
            ["advocate_against"] = "7d740cd05fae9c41d53aab904b0f2a6777c8a2c17f1eb3b42a0011ff59349d09",
            ["debate_judge"] = "6532a9c393ae594626093eda81e6e273b5d5f36c2fa3da68ea7e2e12155778d8",
        };
        var calls = new ConcurrentBag<(string Stage, string Model)>();
        var options = Options.Create(new ModelOptions
        {
            OpenAiApiKey = "fake-embedding-key", LunaBaseUrl = "http://codex:8090/v1", DeepSeekApiKey = "fake-deepseek-key",
        });
        const string image = "data:image/jpeg;base64,cGhvdG8=";
        using var http = new HttpClient(new ScriptedHandler((req, body) =>
        {
            var model = body["model"]!.GetValue<string>();
            var prompt = body["messages"]![0]!["content"]!.GetValue<string>();
            var content = body["messages"]![1]!["content"]!.AsArray();
            var stage = prompt.StartsWith("You are the judge") ? "debate_judge" :
                prompt.StartsWith("You are the advocate FOR") ? "advocate_for" : "advocate_against";
            var judge = stage == "debate_judge";
            calls.Add((stage, model));
            Assert.Equal(judge ? 1 : 2, content.Count);
            if (judge)
            {
                var state = JsonNode.Parse(content[0]!["text"]!.GetValue<string>())!;
                Assert.Equal("Photo clue", state["case_for"]!["argument"]!.GetValue<string>());
                Assert.Equal("Photo clue", state["case_against"]!["argument"]!.GetValue<string>());
                Assert.Null(state["lost"]!["eventDate"]);
            }
            else Assert.Equal(image, content[1]!["image_url"]!["url"]!.GetValue<string>());

            if (model == DeepSeekChat.Model)
            {
                Assert.Equal("https://api.deepseek.com/chat/completions", req.RequestUri!.ToString());
                Assert.Equal("fake-deepseek-key", req.Headers.Authorization!.Parameter);
                Assert.Equal("json_object", body["response_format"]!["type"]!.GetValue<string>());
                Assert.Contains("Example JSON response", prompt);
                Assert.Contains("matching this schema", prompt);
            }
            else
            {
                Assert.Equal("http://codex:8090/v1/chat/completions", req.RequestUri!.ToString());
                Assert.Null(req.Headers.Authorization);
                Assert.Equal(judge ? "gpt-6.1-terra" : "gpt-6-luna", model);
                Assert.Equal(stage, body["response_format"]!["json_schema"]!["name"]!.GetValue<string>());
                Assert.Equal(hashes[stage], Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(prompt))));
                if (judge) return ChatResponse("{}"); // Valid JSON, invalid judge answer.
                if (failAdvocates) return new HttpResponseMessage(HttpStatusCode.TooManyRequests);
            }

            return ChatResponse(judge
                ? """{"same_item_probability":0.6,"stronger_case":"for","overall_probabilities":{"clearly_different":0,"probably_different":0,"unclear":0.2,"probably_same":0.6,"almost_certainly_same":0.2}}"""
                : """{"argument":"Photo clue","strength":"moderate"}""");
        }));
        var reviewer = new DebateReviewer(new OpenAiLuna(http, options), new OpenAiTerra(http, options), new DeepSeekChat(http, options),
            new TypeSafeJev(http, options), new AliasIndex([]), options, NullLogger<DebateReviewer>.Instance);
        var lost = new MatchInput(Guid.NewGuid(), "lost", "", "", "", "Lost blue bottle", "Library", "", null, false, []);
        var found = lost with { Id = Guid.NewGuid(), Type = "found", Description = "Blue bottle with sticker", PhotoPaths = [typeof(ModelRouteTests).Assembly.Location] };

        var review = await reviewer.ReviewAsync(lost, found, [image], default);

        Assert.NotNull(review);
        Assert.True(review.IsMatch);
        Assert.Equal(0.675, review.FinalScore, 8);
        Assert.Equal(DeepSeekChat.Model, review.Log["judgeModel"]!.GetValue<string>());
        Assert.Equal(failAdvocates ? 3 : 1, calls.Count(c => c.Model == DeepSeekChat.Model));
        Assert.Equal(failAdvocates ? DeepSeekChat.Model : "gpt-6-luna", review.Log["for"]!["model"]!.GetValue<string>());
        Assert.Equal(failAdvocates ? DeepSeekChat.Model : "gpt-6-luna", review.Log["against"]!["model"]!.GetValue<string>());
    }

    private static HttpResponseMessage ChatResponse(string json) => new(HttpStatusCode.OK)
    {
        Content = JsonContent.Create(new { choices = new[] { new { message = new { content = json } } } }),
    };

    private sealed class ScriptedHandler(Func<HttpRequestMessage, JsonObject, HttpResponseMessage> response) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            response(request, JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!.AsObject());
    }

    private sealed class Handler(Func<HttpRequestMessage, string> response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(response(request)) });
    }
}
