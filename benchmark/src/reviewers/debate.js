import { existsSync } from "node:fs";
import path from "node:path";
import { CURRENT, OFFLINE_ESTIMATE, PROPOSED, RUNTIME } from "../../config.js";
import { askJev, readChoice, readNoul, readScore } from "../jevClient.js";
import { chatJson } from "../openai.js";
import { dateRelation, matchAliases, truncate } from "../text.js";
import { usage } from "./luna.js";

// luna-debate: two Luna advocates argue the case, Jev decides.
// The FOR advocate makes the strongest honest case that both reports describe the same
// physical item; the AGAINST advocate makes the strongest honest case that they don't.
// Both see the same text and photos. Jev reads both cases and answers typed questions.

const SIDES = {
  for: "You are the advocate FOR a match. Make the strongest honest case that the LOST and FOUND reports describe the same physical item.",
  against: "You are the advocate AGAINST a match. Make the strongest honest case that the LOST and FOUND reports describe different items.",
};
const COMMON = `This is a university lost-and-found app. Use only evidence in the reports and photos: item type, colour, brand/model, distinctive marks, place (location aliases name the same place), and timing (an item cannot be found before it was lost).
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
    instructions: "Weighing both advocates' cases against the two reports, do the LOST and FOUND reports describe the same physical item?",
  },
  stronger_case: {
    type: "choice",
    instructions: "Which advocate's case is better supported by the concrete evidence in the reports?",
    criteria: { for: "The case FOR a match is better supported", against: "The case AGAINST a match is better supported", balanced: "Both cases are about equally supported" },
  },
  overall: {
    type: "score",
    instructions: "How likely is it that the found item is exactly the item described in the lost report?",
    criteria: DEBATE_LEVELS,
  },
};

const brief = (r) => ({ title: r.title, category: r.category, description: truncate(r.description, 500), location: r.location, eventDate: r.eventDate });

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

export async function debateReview(lost, found, prelim, ctx, { threshold = PROPOSED.debateThreshold } = {}) {
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
    features,
    // The advocates run in parallel, then Jev: the critical path is the slower advocate plus Jev.
    latencyMs: Math.max(pro.call.latencyMs || 0, con.call.latencyMs || 0) + (jevCall.latencyMs || 0),
    call: jevCall,
    extraCalls: [pro.call, con.call],
  };
}
