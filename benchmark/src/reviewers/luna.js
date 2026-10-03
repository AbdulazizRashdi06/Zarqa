import { CURRENT, OFFLINE_ESTIMATE, RUNTIME } from "../../config.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { chatJson } from "../openai.js";
import { matchAliases } from "../text.js";

const SYSTEM = `You review one possible match between a LOST report and a FOUND report on a university campus lost-and-found app.
Be cautious: a false match wastes both people's time. Penalize any conflict in item type, colour, brand, location, or dates that make the match impossible (an item cannot be found before it was lost).
Location aliases name the same place. Photos, when present, are strong evidence.
Return finalScore in 0..1 as your probability that both reports describe the same physical item.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isLikelyMatch", "finalScore", "explanation", "matchedFields", "riskFlags"],
  properties: {
    isLikelyMatch: { type: "boolean" },
    finalScore: { type: "number" },
    explanation: { type: "string" },
    matchedFields: { type: "array", items: { type: "string" } },
    riskFlags: { type: "array", items: { type: "string" } },
  },
};

const describe = (r) =>
  JSON.stringify({
    ...(r.title ? { title: r.title } : {}),
    ...(r.category ? { category: r.category } : {}),
    description: r.description,
    location: r.location,
    campusZone: r.campusZone,
    eventDate: r.eventDate,
  });

/** gpt-6-luna pair review with text, alias context and up to two photos per report. */
export async function lunaReview(lost, found, prelim, ctx) {
  if (ctx.offline) return { ...fallback(prelim, "offline"), call: { kind: "luna", estimated: true, ...OFFLINE_ESTIMATE.luna } };
  const aliases = [...matchAliases(lost.location, ctx.aliasIndex), ...matchAliases(found.location, ctx.aliasIndex)]
    .map((g) => `${g.canonical}: ${g.names.join(", ")}`);
  const photos = (r) =>
    (r.photos || []).slice(0, CURRENT.photosPerReport).map((p) => path.resolve(ctx.dataDir, p)).filter((p) => existsSync(p));
  const lostPhotos = photos(lost), foundPhotos = photos(found);
  const text =
    `LOST report: ${describe(lost)}\nFOUND report: ${describe(found)}\nLocation aliases: ${aliases.join(" | ") || "none"}\n` +
    `Attached photos: ${lostPhotos.length} from the LOST report first, then ${foundPhotos.length} from the FOUND report.`;
  try {
    const res = await chatJson({
      system: SYSTEM,
      text,
      imagePaths: [...lostPhotos, ...foundPhotos],
      imageDetail: RUNTIME.lunaImageDetail,
      schemaName: "match_review",
      schema: SCHEMA,
      useCache: ctx.useCache,
    });
    const p = res.parsed;
    return {
      isLikelyMatch: !!p.isLikelyMatch,
      finalScore: clamp01(p.finalScore),
      explanation: p.explanation,
      matchedFields: p.matchedFields,
      riskFlags: p.riskFlags,
      call: { kind: "luna", ...usage(res) },
    };
  } catch (err) {
    return fallback(prelim, err.message);
  }
}

/** Same as processReport's fallback: trust the preliminary score. */
function fallback(prelim, reason) {
  return {
    isLikelyMatch: prelim.score >= CURRENT.matchThreshold,
    finalScore: prelim.score,
    explanation: "Deterministic fallback (no model review).",
    matchedFields: [],
    riskFlags: ["fallback"],
    fallbackReason: reason,
    call: null,
  };
}

export const usage = (res) => ({
  inputTokens: res.inputTokens,
  cachedInputTokens: res.cachedInputTokens,
  outputTokens: res.outputTokens,
  latencyMs: res.latencyMs,
  fromCache: res.fromCache,
});

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
