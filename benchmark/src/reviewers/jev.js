import { OFFLINE_ESTIMATE, PROPOSED } from "../../config.js";
import { askJev, readChoice, readNoul, readScore } from "../jevClient.js";
import { dateRelation, matchAliases, overlap, photoAttributesText, tokens, truncate } from "../text.js";

export const LOCATION_OPTIONS = {
  same_place: "Both reports name the same place, or names that are aliases of each other",
  adjacent: "Different but neighbouring places, e.g. same building or floor",
  same_zone: "Same campus zone but not neighbouring",
  different: "Clearly different places far apart on campus",
  unknown: "One or both locations are missing or too vague to compare",
};

export const OVERALL_LEVELS = [
  "Clearly different items",
  "Probably different items",
  "Unclear, could be either",
  "Probably the same item",
  "Almost certainly the same physical item",
];

export const QUESTIONS = {
  same_item_type: {
    type: "noul",
    instructions: "Do the lost report and the found report describe the same kind of object (e.g. both a water bottle)?",
  },
  color_conflict: {
    type: "noul",
    instructions: "Do the two reports state colours for the item that clearly contradict each other? Similar shades such as navy and dark blue do not contradict.",
  },
  brand_conflict: {
    type: "noul",
    instructions: "Do the two reports name different brands or models for the item?",
  },
  shared_distinctive_detail: {
    type: "noul",
    instructions: "Do both reports mention the same distinctive detail, such as a sticker, engraving, keychain, case, name tag, or damage?",
  },
  location_relation: {
    type: "choice",
    instructions: "How do the lost location and the found location relate? Use the aliases list: names in one alias group are the same place.",
    criteria: LOCATION_OPTIONS,
  },
  overall_match: {
    type: "score",
    instructions: "How likely is it that the found item is exactly the item described in the lost report?",
    criteria: OVERALL_LEVELS,
  },
};

const side = (r, withPhoto) => {
  const s = {
    title: truncate(r.title, 120),
    category: r.category || "",
    description: truncate(r.description, PROPOSED.maxDescriptionChars),
    location: r.location || "",
  };
  if (withPhoto && r.photoAttributes) s.photo = photoAttributesText(r.photoAttributes);
  return s;
};

/** Minimal state: only what the questions need, only the alias groups of these two places. */
export function buildState(lost, found, aliasIndex, withPhoto) {
  const groups = new Map();
  for (const g of [...matchAliases(lost.location, aliasIndex), ...matchAliases(found.location, aliasIndex)]) groups.set(g.canonical, g.names);
  return {
    lost: side(lost, withPhoto),
    found: side(found, withPhoto),
    locationAliases: [...groups.values()],
    timing: dateRelation(lost, found),
  };
}

/**
 * Composite decision in code: hard rules gate, weights produce finalScore.
 * v1 weights are hand-set; fitted ones (logistic: true) can be passed with --weights.
 */
export function decide(a, cosine, weights = DEFAULT_WEIGHTS, { threshold = PROPOSED.matchThreshold, gates = true } = {}) {
  const riskFlags = [];
  if (a.colorConflict >= 0.5) riskFlags.push("color_conflict");
  if (a.brandConflict >= 0.5) riskFlags.push("brand_conflict");
  if (a.location === "different") riskFlags.push("location_different");
  if (a.sameItemType < 0.5) riskFlags.push("different_item_type");

  const z =
    weights.bias +
    weights.overall * a.overall +
    weights.sameItemType * a.sameItemType +
    weights.distinctive * a.distinctive +
    weights.cosine * cosine -
    weights.colorConflict * a.colorConflict -
    weights.brandConflict * a.brandConflict -
    (a.location === "different" ? weights.locationDifferent : 0);
  const finalScore = weights.logistic ? 1 / (1 + Math.exp(-z)) : Math.min(1, Math.max(0, z));

  // gates: hard rules on top of the score. Turning them off leaves the decision to the score alone.
  const passesGates = !gates || (a.sameItemType >= 0.8 && a.colorConflict < 0.3 && a.brandConflict < 0.3 && a.location !== "different");
  const isLikelyMatch = passesGates && finalScore >= threshold;

  const matchedFields = [];
  if (a.sameItemType >= 0.8) matchedFields.push("itemType");
  if (a.distinctive >= 0.6) matchedFields.push("distinctiveDetail");
  if (a.location === "same_place" || a.location === "adjacent") matchedFields.push("location");
  if (a.colorConflict < 0.2) matchedFields.push("color");

  return { isLikelyMatch, finalScore, riskFlags, matchedFields };
}

export const DEFAULT_WEIGHTS = {
  logistic: false,
  bias: 0,
  overall: 0.5,
  sameItemType: 0.2,
  distinctive: 0.15,
  cosine: 0.15,
  colorConflict: 0.25,
  brandConflict: 0.25,
  locationDifferent: 0.15,
};

const pct = (p) => `${Math.round(p * 100)}%`;
function explain(a, lost, found) {
  const bits = [];
  bits.push(a.sameItemType >= 0.8 ? `Same kind of item (${pct(a.sameItemType)})` : `Item type unclear (${pct(a.sameItemType)})`);
  if (a.distinctive >= 0.6) bits.push(`shared distinctive detail (${pct(a.distinctive)})`);
  if (a.colorConflict >= 0.5) bits.push(`colours conflict (${pct(a.colorConflict)})`);
  if (a.brandConflict >= 0.5) bits.push(`brands conflict (${pct(a.brandConflict)})`);
  const loc = { same_place: "same place", adjacent: "nearby places", same_zone: "same campus zone", different: "different places", unknown: "location unclear" }[a.location];
  if (loc) bits.push(`${loc}: ${lost.location || "?"} / ${found.location || "?"}`);
  return bits.join("; ") + ".";
}

/** Jev pair review. Returns the same shape as lunaReview plus raw answers and confidence. */
export async function jevReview(lost, found, prelim, ctx, { withPhoto = false, weights } = {}) {
  const state = buildState(lost, found, ctx.aliasIndex, withPhoto);
  let answers, call = null;
  if (ctx.offline) {
    answers = offlineAnswers(state);
    call = { kind: "jev", estimated: true, ...OFFLINE_ESTIMATE.jev };
  } else {
    try {
      const res = await askJev(state, QUESTIONS, { useCache: ctx.useCache });
      answers = res.answers;
      call = { kind: "jev", inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.latencyMs, fromCache: res.fromCache };
    } catch (err) {
      return { failed: true, error: err.message, call: null };
    }
  }

  const loc = readChoice(answers.location_relation, Object.keys(LOCATION_OPTIONS));
  const overall = readScore(answers.overall_match, OVERALL_LEVELS);
  const a = {
    sameItemType: readNoul(answers.same_item_type) ?? 0,
    colorConflict: readNoul(answers.color_conflict) ?? 0,
    brandConflict: readNoul(answers.brand_conflict) ?? 0,
    distinctive: readNoul(answers.shared_distinctive_detail) ?? 0,
    location: loc?.choice ?? "unknown",
    overall: overall?.normalized ?? 0,
    confidence: overall?.confidence ?? null,
  };
  const d = decide(a, prelim.cosine, weights);
  return { ...d, explanation: explain(a, lost, found), features: a, raw: answers, call };
}

/** Offline stand-in so the pipeline runs without keys. Its numbers say nothing about Jev's quality. */
function offlineAnswers(state) {
  const L = state.lost, F = state.found;
  const t = overlap(tokens(`${L.title} ${L.category}`), tokens(`${F.title} ${F.category}`));
  const d = overlap(tokens(L.description), tokens(F.description));
  const sameLoc = overlap(tokens(L.location), tokens(F.location)) > 0.3;
  const overall = Math.min(1, 0.6 * t + 0.4 * d);
  return {
    same_item_type: { noul: Math.min(1, t * 1.2) },
    color_conflict: { noul: 0.1 },
    brand_conflict: { noul: 0.1 },
    shared_distinctive_detail: { noul: d },
    location_relation: { choice: sameLoc ? "same_place" : "unknown", confidence: 0.5 },
    overall_match: { score: overall * 4, confidence: 0.5 },
  };
}
