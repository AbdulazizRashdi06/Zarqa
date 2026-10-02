using System.Net;
using System.Text.Json.Nodes;
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

    private sealed class Handler(Func<HttpRequestMessage, string> response) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(response(request)) });
    }
}
