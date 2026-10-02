import { createHash } from "node:crypto";
import { MODELS, OFFLINE_ESTIMATE } from "../config.js";
import { embed, embeddingModelName } from "./openai.js";
import { embeddingText, tokens } from "./text.js";

const LOCAL_DIMS = 512;

/** Deterministic hashed bag-of-words vector: the same fallback idea processReport uses without an API key. */
export function localVector(text) {
  const v = new Float64Array(LOCAL_DIMS);
  for (const t of tokens(text)) {
    const h = createHash("md5").update(t).digest();
    v[h.readUInt32LE(0) % LOCAL_DIMS] += h[4] & 1 ? 1 : -1;
  }
  return normalize(Array.from(v));
}

export function normalize(v) {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Attaches `report.vectors[variant]` to every report that lacks one.
 * variant "text" = current embedding text; "photo" = same text plus photo attributes.
 * Returns {inputTokens, latencyMs, calls} for setup-cost reporting.
 */
export async function embedReports(reports, variant, ctx) {
  // Without photo attributes the "photo" text equals the plain text: reuse that vector.
  if (variant === "photo") for (const r of reports) if (!r.photoAttributes && r.vectors?.text) r.vectors.photo = r.vectors.text;
  const todo = reports.filter((r) => !r.vectors?.[variant]);
  const stats = { inputTokens: 0, latencyMs: 0, calls: 0, model: ctx.offline ? "local-hash" : embeddingModelName() };
  const texts = todo.map((r) => embeddingText(r, ctx.aliasIndex, { withPhotoAttributes: variant === "photo" }));
  if (ctx.offline) {
    todo.forEach((r, i) => ((r.vectors ??= {})[variant] = localVector(texts[i])));
    return stats;
  }
  for (let i = 0; i < todo.length; i += 500) {
    const res = await embed(texts.slice(i, i + 500), { useCache: ctx.useCache });
    res.vectors.forEach((v, j) => ((todo[i + j].vectors ??= {})[variant] = Float32Array.from(v))); // halves memory at 10k reports
    stats.inputTokens += res.inputTokens;
    stats.latencyMs += res.latencyMs;
    stats.calls++;
  }
  return stats;
}

/** Embeds the one report being processed and books the call on its ledger. */
export async function embedQuery(report, variant, ctx, ledger) {
  const text = embeddingText(report, ctx.aliasIndex, { withPhotoAttributes: variant === "photo" });
  if (ctx.offline) {
    ledger.record({ kind: "embedding", estimated: true, ...OFFLINE_ESTIMATE.embedding });
    ledger.stage("embed", OFFLINE_ESTIMATE.embedding.latencyMs);
    return localVector(text);
  }
  const res = await embed([text], { useCache: ctx.useCache });
  ledger.record({ kind: "embedding", inputTokens: res.inputTokens, latencyMs: res.latencyMs });
  ledger.stage("embed", res.latencyMs);
  return res.vectors[0];
}
