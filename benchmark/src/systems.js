import { CURRENT, FIRESTORE_LATENCY as FL, PROPOSED, RUNTIME } from "../config.js";
import { cosine, embedQuery } from "./embeddings.js";
import { Ledger } from "./ledger.js";
import { extractPhotoAttributes } from "./photoAttributes.js";
import { preliminaryScore } from "./prescore.js";
import { debateReview } from "./reviewers/debate.js";
import { jevReview } from "./reviewers/jev.js";
import { lunaReview } from "./reviewers/luna.js";
import { counterpartType, dateRelation } from "./text.js";

/** Reports the trigger could see when `query` arrived: opposite type, eligible, visible, already created. */
function eligibleCounterparts(query, db) {
  const type = counterpartType(query.type);
  const t = Date.parse(query.createdAt);
  return db.reports.filter(
    (r) => r.type === type && r.id !== query.id && !r.hidden && CURRENT.eligibleStatuses.includes(r.status ?? "open") && Date.parse(r.createdAt) < t,
  );
}

/** Current retrieval: newest 200 counterparts by createdAt, scanned in memory. */
function newestPool(query, db, ledger) {
  const pool = eligibleCounterparts(query, db)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, CURRENT.poolLimit);
  ledger.firestoreReads += pool.length;
  ledger.stage("retrieve", FL.loadBaseMs + FL.loadPerDocMs * pool.length);
  return pool;
}

/** Proposed retrieval: Firestore findNearest (COSINE, limit 25) over all eligible counterparts. */
function vectorPool(query, vec, variant, db, ledger) {
  const pool = eligibleCounterparts(query, db)
    .map((r) => ({ r, s: cosine(vec, r.vectors?.[variant]) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, PROPOSED.vectorLimit)
    .map((x) => x.r);
  ledger.firestoreReads += pool.length;
  ledger.stage("retrieve", FL.vectorSearchBaseMs + FL.vectorSearchPerResultMs * pool.length);
  return pool;
}

const orient = (query, other) => (query.type === "lost" ? [query, other] : [other, query]);

function shortlist(query, vec, variant, pool, threshold, max, ctx) {
  return pool
    .map((c) => {
      const [lost, found] = orient(query, c);
      return { c, lost, found, prelim: preliminaryScore(query, c, vec, c.vectors?.[variant], ctx.aliasIndex) };
    })
    .filter((x) => x.prelim.score >= threshold)
    .sort((a, b) => b.prelim.score - a.prelim.score)
    .slice(0, max);
}

async function runStage(name, items, fn, ledger) {
  const results = [];
  for (let i = 0; i < items.length; i += RUNTIME.reviewConcurrency) {
    results.push(...(await Promise.all(items.slice(i, i + RUNTIME.reviewConcurrency).map(fn))));
  }
  const latencies = [];
  for (const r of results) {
    for (const call of [r.call, ...(r.extraCalls || [])].filter(Boolean)) {
      ledger.record(call);
    }
    // A reviewer that runs calls in parallel reports its own critical path as r.latencyMs.
    latencies.push(r.latencyMs ?? (r.call?.latencyMs ?? 0) + (r.extraCalls || []).reduce((s, c) => s + (c.latencyMs || 0), 0));
  }
  ledger.parallelStage(name, latencies, RUNTIME.reviewConcurrency);
  return results;
}

const pairOut = (x, review, reviewer) => ({
  lostId: x.lost.id,
  foundId: x.found.id,
  prelim: round(x.prelim.score),
  cosine: round(x.prelim.cosine),
  finalScore: round(review.finalScore),
  isLikelyMatch: !!review.isLikelyMatch,
  // The debate reviewer applies its own threshold; the others use the production 0.72.
  visible: !!review.isLikelyMatch && (reviewer === "debate" || review.finalScore >= CURRENT.matchThreshold),
  reviewer,
  explanation: review.explanation,
  riskFlags: review.riskFlags,
  features: review.features,
  fallbackReason: review.fallbackReason,
});

// ---------------- the five systems ----------------

async function lunaSystem(query, db, ctx, { vector }) {
  const ledger = new Ledger();
  const vec = await embedQuery(query, "text", ctx, ledger);
  const pool = vector ? vectorPool(query, vec, "text", db, ledger) : newestPool(query, db, ledger);
  const threshold = Math.max(CURRENT.shortlistFloor, CURRENT.matchThreshold - CURRENT.shortlistMargin);
  const list = shortlist(query, vec, "text", pool, threshold, CURRENT.maxCandidates, ctx);
  const reviews = await runStage("review", list, (x) => lunaReview(x.lost, x.found, x.prelim, ctx), ledger);
  return done(ledger, pool, list, list.map((x, i) => pairOut(x, reviews[i], reviews[i].call ? "luna" : "fallback")));
}

async function jevSystem(query, db, ctx, { withPhoto, cascade }) {
  const ledger = new Ledger();
  const variant = withPhoto ? "photo" : "text";
  if (withPhoto) {
    const call = await extractPhotoAttributes(query, ctx);
    if (call) ledger.record(call);
    ledger.stage("photo_attributes", call?.latencyMs ?? 0);
  }
  const vec = await embedQuery(query, variant, ctx, ledger);
  const pool = vectorPool(query, vec, variant, db, ledger);

  // Hard rules in code: an item can't be found before it was lost.
  const allowed = pool.filter((c) => {
    const [lost, found] = orient(query, c);
    return dateRelation(lost, found) !== "found_before_lost";
  });
  const list = shortlist(query, vec, variant, allowed, PROPOSED.shortlistThreshold, PROPOSED.maxCandidates, ctx);

  const reviews = await runStage(
    "review",
    list,
    async (x) => {
      const r = await jevReview(x.lost, x.found, x.prelim, ctx, { withPhoto, weights: ctx.jevWeights });
      if (!r.failed) return { ...r, reviewer: "jev" };
      const l = await lunaReview(x.lost, x.found, x.prelim, ctx); // Jev down → Luna → deterministic
      return { ...l, reviewer: l.call ? "luna-fallback" : "fallback", jevError: r.error };
    },
    ledger,
  );

  let pairs = list.map((x, i) => pairOut(x, reviews[i], reviews[i].reviewer));

  if (cascade) {
    const [lo, hi] = PROPOSED.cascadeBand;
    const unsure = list
      .map((x, i) => ({ x, i, r: reviews[i] }))
      .filter(({ r }) => r.reviewer === "jev" && ((r.finalScore >= lo && r.finalScore <= hi) || (r.features?.confidence ?? 1) < PROPOSED.cascadeMinConfidence));
    const second = await runStage("cascade", unsure, ({ x }) => lunaReview(x.lost, x.found, x.prelim, ctx), ledger);
    unsure.forEach(({ x, i }, j) => {
      if (second[j].call) pairs[i] = { ...pairOut(x, second[j], "luna-cascade"), jevScore: pairs[i].finalScore };
    });
  }
  return done(ledger, pool, list, pairs);
}

/** luna-debate: vector retrieval and luna-vector's shortlist; two Luna advocates argue, Jev decides. */
async function debateSystem(query, db, ctx) {
  const ledger = new Ledger();
  const vec = await embedQuery(query, "text", ctx, ledger);
  const pool = vectorPool(query, vec, "text", db, ledger);
  const threshold = Math.max(CURRENT.shortlistFloor, CURRENT.matchThreshold - CURRENT.shortlistMargin);
  const list = shortlist(query, vec, "text", pool, threshold, CURRENT.maxCandidates, ctx);
  const reviews = await runStage(
    "review",
    list,
    async (x) => {
      const r = await debateReview(x.lost, x.found, x.prelim, ctx);
      if (!r.failed) return { ...r, reviewer: "debate" };
      const l = await lunaReview(x.lost, x.found, x.prelim, ctx);
      return { ...l, reviewer: l.call ? "luna-fallback" : "fallback", debateError: r.error, extraCalls: r.extraCalls };
    },
    ledger,
  );
  return done(ledger, pool, list, list.map((x, i) => pairOut(x, reviews[i], reviews[i].reviewer)));
}

function done(ledger, pool, list, pairs) {
  return {
    poolIds: pool.map((r) => r.id),
    shortlistIds: list.map((x) => x.c.id),
    pairs,
    visible: pairs.filter((p) => p.visible),
    costUsd: ledger.costUsd,
    latencyMs: Math.round(ledger.latencyMs),
    stages: ledger.stages,
    calls: { embedding: ledger.countBy("embedding"), luna: ledger.countBy("luna"), jev: ledger.countBy("jev"), vision: ledger.countBy("vision") },
    tokens: ledger.tokens(),
    firestoreReads: ledger.firestoreReads,
  };
}

const round = (v) => Math.round(v * 1000) / 1000;

export const PIPELINES = {
  luna: (q, db, ctx) => lunaSystem(q, db, ctx, { vector: false }),
  "luna-vector": (q, db, ctx) => lunaSystem(q, db, ctx, { vector: true }),
  jev: (q, db, ctx) => jevSystem(q, db, ctx, { withPhoto: false, cascade: false }),
  "jev-photo": (q, db, ctx) => jevSystem(q, db, ctx, { withPhoto: true, cascade: false }),
  "jev-cascade": (q, db, ctx) => jevSystem(q, db, ctx, { withPhoto: true, cascade: true }),
  "luna-debate": (q, db, ctx) => debateSystem(q, db, ctx),
};
