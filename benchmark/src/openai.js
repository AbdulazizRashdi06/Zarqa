import { existsSync } from "node:fs";
import path from "node:path";
import { MODELS, OFFLINE_ESTIMATE } from "../config.js";
import { cached } from "./cache.js";
import { codexJson } from "./codexClient.js";
import { postJson } from "./http.js";
import { LOCAL_EMBEDDING_MODEL, localEmbed } from "./localEmbed.js";
import { photoDataUrls } from "./photos.js";

// Where Luna and embedding calls go:
// 1. OPENAI_BASE_URL / EMBEDDING_BASE_URL set → that OpenAI-compatible endpoint.
// 2. OPENAI_API_KEY set → OpenAI directly.
// 3. OPENROUTER_API_KEY set → OpenRouter, with OpenRouter's model names.
// 4. Otherwise Luna runs through the Codex CLI (ChatGPT sign-in) and embeddings run locally.
// LUNA_PROVIDER=codex|api and EMBEDDING_PROVIDER=local|api force a choice.
const OPENAI = "https://api.openai.com/v1";
const OPENROUTER = "https://openrouter.ai/api/v1";

function apiRoute(kind) {
  const env = process.env;
  const base = kind === "embedding" ? env.EMBEDDING_BASE_URL || env.OPENAI_BASE_URL : env.OPENAI_BASE_URL;
  const key = (kind === "embedding" && env.EMBEDDING_API_KEY) || env.OPENAI_API_KEY;
  const model = kind === "embedding" ? MODELS.embedding : MODELS.luna;
  if (base) return { base, headers: key ? { authorization: `Bearer ${key}` } : {}, model };
  if (key) return { base: OPENAI, headers: { authorization: `Bearer ${key}` }, model };
  if (env.OPENROUTER_API_KEY) {
    const orModel = kind === "embedding" ? env.EMBEDDING_MODEL || `openai/${MODELS.embedding}` : env.LUNA_MODEL || `openai/${MODELS.luna}`;
    return { base: OPENROUTER, headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` }, model: orModel };
  }
  return null;
}

export function lunaProvider() {
  const forced = process.env.LUNA_PROVIDER;
  if (forced) return forced;
  return apiRoute("luna") ? "api" : "codex";
}

export function embeddingProvider() {
  const forced = process.env.EMBEDDING_PROVIDER;
  if (forced) return forced;
  return apiRoute("embedding") ? "api" : "local";
}

/** The model whose vectors are in use (cache keys and reports name it). */
export const embeddingModelName = () => (embeddingProvider() === "local" ? LOCAL_EMBEDDING_MODEL : MODELS.embedding);

/** Embeds texts. Returns {vectors, inputTokens, latencyMs, fromCache}. */
export async function embed(texts, { useCache = true } = {}) {
  if (embeddingProvider() === "local") {
    return cached(
      "embedding",
      { model: LOCAL_EMBEDDING_MODEL, texts },
      async () => ({
        vectors: await localEmbed(texts),
        // Priced as if text-embedding-3-small were used, so cost stays comparable (~4 chars/token).
        inputTokens: Math.ceil(texts.join(" ").length / 4),
        // Local compute time says nothing about an API call: use the modelled API latency.
        latencyMs: OFFLINE_ESTIMATE.embedding.latencyMs,
      }),
      { enabled: useCache },
    );
  }
  const r = apiRoute("embedding");
  if (!r) throw new Error("No embeddings API configured (set EMBEDDING_PROVIDER=local to use the local model).");
  return cached(
    "embedding",
    { model: MODELS.embedding, texts }, // same vectors whichever provider serves the model
    async () => {
      const json = await postJson(`${r.base}/embeddings`, { model: r.model, input: texts }, r.headers);
      return {
        vectors: json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
        inputTokens: json.usage?.prompt_tokens ?? 0,
      };
    },
    { enabled: useCache },
  );
}

/**
 * One structured-output Luna call: a text prompt plus optional photos (local file paths).
 * Returns {parsed, inputTokens, cachedInputTokens, outputTokens, latencyMs, fromCache}.
 */
export async function chatJson({ system, text, imagePaths = [], imageDetail, schemaName, schema, useCache = true }) {
  if (lunaProvider() === "codex") {
    return codexJson({ model: process.env.LUNA_MODEL || MODELS.luna, system, text, imagePaths, schema, useCache });
  }
  const r = apiRoute("luna");
  if (!r) throw new Error("No Luna API configured (set LUNA_PROVIDER=codex to use the Codex CLI).");
  const content = [{ type: "text", text }];
  for (const url of await photoDataUrls({ photos: imagePaths }, "/", imagePaths.length)) {
    content.push({ type: "image_url", image_url: { url, detail: imageDetail } });
  }
  const body = {
    model: r.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
  };
  return cached(
    "luna",
    body,
    async () => {
      const json = await postJson(`${r.base}/chat/completions`, body, r.headers);
      return {
        parsed: JSON.parse(json.choices[0].message.content),
        inputTokens: json.usage?.prompt_tokens ?? 0,
        cachedInputTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      };
    },
    { enabled: useCache },
  );
}

export const codexInstalled = () => existsSync(path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js"));
