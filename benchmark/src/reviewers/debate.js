import { existsSync } from "node:fs";
import path from "node:path";
import { CURRENT, MODELS, OFFLINE_ESTIMATE, PROPOSED, RUNTIME } from "../../config.js";
import { askJev, readChoice, readNoul, readScore } from "../jevClient.js";
import { chatJson } from "../openai.js";
import { dateRelation, matchAliases, truncate } from "../text.js";
import { usage } from "./luna.js";

// Same as the app (decisions.md, 2026-10-27 and 2026-10-31): read item names in context, similarity over proof.
// Runs before these changes used older wording.
export const SIMILARITY_RULE =
  "People describe the same kind of item in different ways and often give very few details. Interpret item names in context; different words, levels of detail, or singular and plural forms alone neither prove nor disprove a match. Missing specifics are not evidence against a match. A missed real match may prevent an item being returned, while the owner can reject a wrong suggestion, so prefer recall when the evidence makes a match plausible. Still weigh concrete contradictions honestly.";

// luna-debate: two Luna advocates argue the case, Jev decides.
// luna-debate-terra: the same advocates, but GPT-6.1 Terra answers Jev's three questions (terraJudge).
// The FOR advocate makes the strongest honest case that both reports describe the same
// physical item; the AGAINST advocate makes the strongest honest case that they don't.
// Both see the same text and photos. Jev reads both cases and answers typed questions.

const SIDES = {
  for: "You are the advocate FOR a match. Make the strongest honest case that the LOST and FOUND reports describe the same physical item.",
  against: "You are the advocate AGAINST a match. Make the strongest honest case that the LOST and FOUND reports describe different items.",
};
export const COMMON = `This is a university lost-and-found app. Use only evidence in the reports and photos: item type, colour, brand/model, distinctive marks, place (location aliases name the same place), and timing (an item cannot be found before it was lost).
${SIMILARITY_RULE}
Cite concrete details, say how strong each point is, and do not invent facts. If the evidence on your side is weak, say so plainly. At most 120 words.`;

const ADVOCATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["argument", "strength"],
  properties: {
    argument: { type: "string" },
    strength: { type: "string", enum: ["weak", "moderate", "strong"] },
  },
};

export const DEBATE_LEVELS = [
  "Clearly different items",
  "Probably different items",
  "Unclear, could be either",
  "Probably the same item",
  "Almost certainly the same physical item",
];

const QUESTIONS = {
  same_item: {
    type: "noul",
    instructions: "Weighing both advocates' cases against the two reports, do the LOST and FOUND reports describe the same physical item? " + SIMILARITY_RULE,
  },
  stronger_case: {
    type: "choice",
    instructions: "Which advocate's case is better supported by the concrete evidence in the reports?",
    criteria: { for: "The case FOR a match is better supported", against: "The case AGAINST a match is better supported", balanced: "Both cases are about equally supported" },
  },
  overall: {
    type: "score",
    instructions: "How likely is it that the found item is exactly the item described in the lost report? " + SIMILARITY_RULE,
    criteria: DEBATE_LEVELS,
  },
};

// ---- Terra judge: Jev's questions, asked of GPT-6.1 Terra as one structured answer ----
// Only the judge changes: same state (reports, timing, both cases), same question wording, and
// answers read into the same features, so debateScore and the cut-off apply unchanged.
// Text only, like Jev. Probabilities are normalised in code.
const LEVEL_KEYS = ["clearly_different", "probably_different", "unclear", "probably_same", "almost_certainly_same"];
const TERRA_SYSTEM = `You are the judge in a university lost-and-found app. Two advocates have argued whether a LOST report and a FOUND report describe the same physical item. Read the reports and both cases, then answer three questions.
same_item: ${QUESTIONS.same_item.instructions} Give the probability (0 to 1) that the answer is yes.
stronger_case: ${QUESTIONS.stronger_case.instructions} "for" = ${QUESTIONS.stronger_case.criteria.for}; "against" = ${QUESTIONS.stronger_case.criteria.against}; "balanced" = ${QUESTIONS.stronger_case.criteria.balanced}.
overall: ${QUESTIONS.overall.instructions} Give a probability (0 to 1) for each level; they should sum to 1. Levels: ${LEVEL_KEYS.map((k, i) => `${k} = "${DEBATE_LEVELS[i]}"`).join("; ")}.`;

const TERRA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["same_item_probability", "stronger_case", "overall_probabilities"],
  properties: {
    same_item_probability: { type: "number" },
    stronger_case: { type: "string", enum: ["for", "against", "balanced"] },
    overall_probabilities: {
      type: "object",
      additionalProperties: false,
      required: LEVEL_KEYS,
      properties: Object.fromEntries(LEVEL_KEYS.map((k) => [k, { type: "number" }])),
    },
  },
};

/** Terra's answer in the shapes the Jev readers accept. */
export function terraAnswers(parsed) {
  const clamp = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    same_item: { noul: clamp(parsed.same_item_probability) },
    stronger_case: { choice: parsed.stronger_case },
    overall: { probabilities: LEVEL_KEYS.map((k) => clamp(parsed.overall_probabilities?.[k])) },
  };
}

async function askTerra(state, ctx) {
  const res = await chatJson({
    system: TERRA_SYSTEM,
    text: JSON.stringify(state),
    schemaName: "debate_judge",
    schema: TERRA_SCHEMA,
    model: MODELS.terra,
    useCache: ctx.useCache,
  });
  // Priced as a "luna" call (Luna's rates as a placeholder); `model` says what it really was.
  return { answers: terraAnswers(res.parsed), call: { kind: "luna", model: MODELS.terra, ...usage(res) } };
}

const brief = (r) => ({
  ...(r.title ? { title: r.title } : {}),
  ...(r.category ? { category: r.category } : {}),
  description: truncate(r.description, 500),
  location: r.location,
  eventDate: r.eventDate,
});

async function advocate(side, lost, found, ctx) {
  if (ctx.offline) return { argument: `(offline ${side} argument)`, strength: "moderate", call: { kind: "luna", estimated: true, ...OFFLINE_ESTIMATE.luna } };
  const photos = (r) => (r.photos || []).slice(0, CURRENT.photosPerReport).map((p) => path.resolve(ctx.dataDir, p)).filter((p) => existsSync(p));
  const lostPhotos = photos(lost), foundPhotos = photos(found);
  const aliases = [...matchAliases(lost.location, ctx.aliasIndex), ...matchAliases(found.location, ctx.aliasIndex)].map((g) => `${g.canonical}: ${g.names.join(", ")}`);
  const text =
    `LOST report: ${JSON.stringify(brief(lost))}\nFOUND report: ${JSON.stringify(brief(found))}\n` +
    `Location aliases: ${aliases.join(" | ") || "none"}\n` +
    `Attached photos: ${lostPhotos.length} from the LOST report first, then ${foundPhotos.length} from the FOUND report.`;
  const res = await chatJson({
    system: `${SIDES[side]}\n${COMMON}`,
    text,
    imagePaths: [...lostPhotos, ...foundPhotos],
    imageDetail: RUNTIME.lunaImageDetail,
    schemaName: `advocate_${side}`,
    schema: ADVOCATE_SCHEMA,
    useCache: ctx.useCache,
  });
  return { ...res.parsed, call: { kind: "luna", ...usage(res) } };
}

/** Score in code; thresholds are tuned with scripts/sweep-debate.js. */
export function debateScore(f) {
  return 0.5 * f.sameItem + 0.5 * f.overall;
}

export async function debateReview(lost, found, prelim, ctx, { threshold = PROPOSED.debateThreshold, judge = "jev" } = {}) {
  let pro, con;
  try {
    [pro, con] = await Promise.all([advocate("for", lost, found, ctx), advocate("against", lost, found, ctx)]);
  } catch (err) {
    return { failed: true, error: `advocate failed: ${err.message}`, call: null };
  }
  const state = {
    lost: brief(lost),
    found: brief(found),
    timing: dateRelation(lost, found),
    case_for: { argument: pro.argument, self_rated_strength: pro.strength },
    case_against: { argument: con.argument, self_rated_strength: con.strength },
  };

  let answers, jevCall;
  if (ctx.offline) {
    answers = { same_item: { noul: prelim.score }, stronger_case: { choice: "balanced" }, overall: { score: prelim.score * 4 } };
    jevCall = { kind: "jev", estimated: true, ...OFFLINE_ESTIMATE.jev };
  } else if (judge === "terra") {
    try {
      ({ answers, call: jevCall } = await askTerra(state, ctx));
    } catch (err) {
      return { failed: true, error: `terra failed: ${err.message}`, call: null, extraCalls: [pro.call, con.call] };
    }
  } else {
    try {
      const res = await askJev(state, QUESTIONS, { useCache: ctx.useCache });
      answers = res.answers;
      jevCall = { kind: "jev", inputTokens: res.inputTokens, outputTokens: res.outputTokens, latencyMs: res.latencyMs, fromCache: res.fromCache };
    } catch (err) {
      return { failed: true, error: `jev failed: ${err.message}`, call: null, extraCalls: [pro.call, con.call] };
    }
  }

  const stronger = readChoice(answers.stronger_case, ["for", "against", "balanced"]);
  const features = {
    sameItem: readNoul(answers.same_item) ?? 0,
    overall: readScore(answers.overall, DEBATE_LEVELS)?.normalized ?? 0,
    stronger: stronger?.choice ?? "balanced",
    proStrength: pro.strength,
    conStrength: con.strength,
  };
  const finalScore = debateScore(features);
  return {
    isLikelyMatch: finalScore >= threshold,
    finalScore,
    explanation: `For (${pro.strength}): ${pro.argument}\nAgainst (${con.strength}): ${con.argument}`,
    matchedFields: [],
    riskFlags: features.stronger === "against" ? ["case_against_stronger"] : [],
    features: { ...features, judge },
    // The advocates run in parallel, then the judge: the critical path is the slower advocate plus Jev.
    latencyMs: Math.max(pro.call.latencyMs || 0, con.call.latencyMs || 0) + (jevCall.latencyMs || 0),
    call: jevCall,
    extraCalls: [pro.call, con.call],
  };
}
