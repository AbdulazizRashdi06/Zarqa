import { MODELS } from "../config.js";
import { cached } from "./cache.js";
import { postJson } from "./http.js";

// Jev is reachable directly from TypeSafe or through OpenRouter's decisions endpoint.
// OpenRouter is used when OPENROUTER_API_KEY is set and TYPESAFE_API_KEY is not.
function provider() {
  if (process.env.TYPESAFE_API_KEY) {
    return { url: "https://api.typesafe.ai/v1/systemone", key: process.env.TYPESAFE_API_KEY, model: MODELS.jev };
  }
  if (process.env.OPENROUTER_API_KEY) {
    return { url: "https://openrouter.ai/api/alpha/decisions", key: process.env.OPENROUTER_API_KEY, model: MODELS.jevOpenRouter };
  }
  throw new Error("Set TYPESAFE_API_KEY or OPENROUTER_API_KEY (or run with --offline).");
}

/** One Jev call: all questions are answered in a single parallel pass. */
export async function askJev(state, questions, { useCache = true } = {}) {
  const p = provider();
  const body = { model: p.model, state, questions };
  return cached(
    "jev",
    body,
    async () => {
      const json = await postJson(p.url, body, { authorization: `Bearer ${p.key}` });
      return {
        answers: json.answers ?? {},
        model: json.model,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      };
    },
    { enabled: useCache },
  );
}

// ---- tolerant readers: the response shape is new, so accept the documented variants ----

/** P(yes) for a noul question. */
export function readNoul(a) {
  if (a == null) return null;
  if (typeof a === "number") return a;
  return num(a.noul ?? a.probability ?? a.value);
}

/** {choice, probabilities: {option: p}, confidence} for a choice question. */
export function readChoice(a, options) {
  if (!a) return null;
  let probs = a.probabilities ?? {};
  if (Array.isArray(probs)) probs = Object.fromEntries(options.map((o, i) => [o, probs[i] ?? 0]));
  const choice = a.choice ?? Object.entries(probs).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  return { choice, probabilities: probs, confidence: num(a.confidence) };
}

/** Score question → {normalized 0..1, confidence}. Prefers the expected level from probabilities. */
export function readScore(a, levels) {
  if (!a) return null;
  const n = levels.length;
  let expected = null;
  let probs = a.probabilities;
  if (probs && !Array.isArray(probs)) probs = levels.map((l, i) => probs[l] ?? probs[i] ?? probs[String(i)] ?? 0);
  if (Array.isArray(probs) && probs.length === n) {
    const total = probs.reduce((s, p) => s + p, 0) || 1;
    expected = probs.reduce((s, p, i) => s + (p / total) * i, 0);
  } else if (typeof a.score === "number") {
    // Levels may be reported 0-based or 1-based; anything above n-1 must be 1-based.
    expected = a.score > n - 1 ? a.score - 1 : a.score;
  }
  if (expected == null) return null;
  return { normalized: clamp01(expected / (n - 1)), confidence: num(a.confidence) };
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
