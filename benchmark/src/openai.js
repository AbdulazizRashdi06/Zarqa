import { existsSync } from "node:fs";
import path from "node:path";
import { MODELS, OFFLINE_ESTIMATE } from "../config.js";
import { cached } from "./cache.js";
import { codexJson } from "./codexClient.js";
import { postJson } from "./http.js";
import { LOCAL_EMBEDDING_MODEL, localEmbed } from "./localEmbed.js";
import { photoDataUrls } from "./photos.js";
import { charge, checkSpend, closePlan, countRoute, planOpen } from "./spend.js";

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
      checkSpend();
      const json = await postJson(`${r.base}/embeddings`, { model: r.model, input: texts }, r.headers);
      charge(MODELS.embedding, { inputTokens: json.usage?.prompt_tokens ?? 0 });
      return {
        vectors: json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
        inputTokens: json.usage?.prompt_tokens ?? 0,
      };
    },
    { enabled: useCache },
  );
}

// How many calls are on the plan at once is found, not guessed (owner, 2026-11-16: "check for the burst limit and
// edge it"). Start at PLAN_MAX_PARALLEL (default 8); after a run of clean answers allow one more; on a limit error
// drop to 70% and remember that level as the ceiling, so the run settles just under where the plan pushes back.
// The ceiling is forgotten after 5 quiet minutes, because the plan's limit moves. Extra calls wait for a slot
// rather than go to the API. 20 at once drew a limit within a minute on 2026-11-16; 8 at once ran clean.
const PLAN_HARD_MAX = Number(process.env.PLAN_HARD_MAX || 40);
let planMax = Number(process.env.PLAN_MAX_PARALLEL || 8), planCeiling = PLAN_HARD_MAX, planBusy = 0, planClean = 0, planLastLimit = 0, planPeak = 0;
const planWaiters = [];
async function planSlot() {
  while (planBusy >= planMax) await new Promise((go) => planWaiters.push(go));
  planBusy++;
  planPeak = Math.max(planPeak, planBusy);
  return () => {
    planBusy--;
    planWaiters.shift()?.();
  };
}
function planAnswered() {
  if (planLastLimit && Date.now() - planLastLimit > 5 * 60_000) planCeiling = PLAN_HARD_MAX;
  if (++planClean >= planMax * 3 && planMax < planCeiling - 1) {
    planMax++;
    planClean = 0;
    planWaiters.shift()?.();
    if (process.env.PLAN_LOG) console.error(`\n[plan] ${planMax} calls at once`);
  }
}
function planPushedBack() {
  if (Date.now() - planLastLimit < 5_000) return; // one burst produces several errors; react once
  planLastLimit = Date.now();
  planCeiling = Math.max(3, planBusy);
  planMax = Math.max(2, Math.floor(planBusy * 0.7));
  planClean = 0;
  console.error(`\n[plan] limit error with ${planBusy} calls in flight; now ${planMax} at once, ceiling ${planCeiling}`);
}
export const planParallelism = () => ({ now: planMax, ceiling: planCeiling, peak: planPeak });

/**
 * One Opus review through the private Claude Code gateway (deploy/claude/gateway.mjs), the route the app uses with
 * MATCHING_OPUS_ALONE=true: one pair per call, signed in with a Claude plan. OPUS_BASE_URL names the gateway
 * (for example http://127.0.0.1:8091/v1). There is no paid route behind it: a plan limit fails the call, so a
 * run can be continued later from the cache instead of quietly switching model.
 */
export async function opusJson({ system, text, imagePaths = [], schemaName, schema, useCache = true, cacheSalt }) {
  const base = process.env.OPUS_BASE_URL;
  if (!base) throw new Error("OPUS_BASE_URL is not set (start deploy/claude/gateway.mjs and point it there).");
  const content = [{ type: "text", text }];
  for (const url of await photoDataUrls({ photos: imagePaths }, "/", imagePaths.length)) content.push({ type: "image_url", image_url: { url } });
  const body = {
    model: process.env.OPUS_MODEL || "opus",
    reasoning_effort: process.env.OPUS_EFFORT || "high",
    messages: [{ role: "system", content: system }, { role: "user", content }],
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
  };
  return cached(
    "opus",
    cacheSalt ? { ...body, cacheSalt } : body,
    async () => {
      const json = await postJson(`${base}/chat/completions`, body, {}, { attempts: 3 });
      return { parsed: JSON.parse(json.choices[0].message.content), inputTokens: json.usage?.prompt_tokens ?? 0, cachedInputTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0, route: "claude-plan" };
    },
    { enabled: useCache },
  );
}

/**
 * One structured-output Luna call: a text prompt plus optional photos (local file paths).
 * Returns {parsed, inputTokens, cachedInputTokens, outputTokens, latencyMs, fromCache}.
 */
export async function chatJson({ system, text, imagePaths = [], imageDetail, schemaName, schema, useCache = true, model, cacheSalt }) {
  if (lunaProvider() === "codex") {
    return codexJson({ model: model || process.env.LUNA_MODEL || MODELS.luna, system, text, imagePaths, schema, useCache });
  }
  const r = apiRoute("luna");
  if (!r) throw new Error("No Luna API configured (set LUNA_PROVIDER=codex to use the Codex CLI).");
  const content = [{ type: "text", text }];
  for (const url of await photoDataUrls({ photos: imagePaths }, "/", imagePaths.length)) {
    content.push({ type: "image_url", image_url: { url, detail: imageDetail } });
  }
  const body = {
    model: model || r.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
  };
  return cached(
    "luna",
    // cacheSalt asks for a fresh sample of the same prompt (run-to-run variation); it is never sent.
    cacheSalt ? { ...body, cacheSalt } : body,
    async () => {
      // Owner, 2026-11-16: use the ChatGPT plan whenever it has allowance, then the paid API. PLAN_BASE_URL is the
      // Codex gateway; its answers cost nothing and are not counted against the budget.
      const plan = process.env.PLAN_BASE_URL;
      if (plan && plan !== r.base && planOpen()) {
        const release = await planSlot();
        try {
          // The gateway reports a burst limit ("too many requests") and a used-up allowance with the same words.
          // A burst clears in seconds, so wait and try again before giving the plan up for a while.
          for (let attempt = 0; attempt < 3 && planOpen(); attempt++) {
            try {
              const viaPlan = await postJson(`${plan}/chat/completions`, body, {}, { attempts: 1 });
              countRoute("plan");
              planAnswered();
              return { parsed: JSON.parse(viaPlan.choices[0].message.content), inputTokens: viaPlan.usage?.prompt_tokens ?? 0, cachedInputTokens: 0, outputTokens: viaPlan.usage?.completion_tokens ?? 0, route: "plan" };
            } catch (err) {
              if (!/usage limit|HTTP 429/i.test(err.message)) break; // another gateway failure: this one call goes to the API
              planPushedBack();
              if (attempt === 2) closePlan();
              else await new Promise((done) => setTimeout(done, 20_000 * (attempt + 1) + Math.random() * 5_000));
            }
          }
        } finally {
          release();
        }
      }
      checkSpend();
      const json = await postJson(`${r.base}/chat/completions`, body, r.headers);
      countRoute("api");
      const usage = {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        cachedInputTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      };
      charge(body.model, usage); // before parsing: a reply that fails to parse was still paid for
      return { parsed: JSON.parse(json.choices[0].message.content), ...usage, route: "api" };
    },
    { enabled: useCache },
  );
}

export const codexInstalled = () => existsSync(path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js"));
