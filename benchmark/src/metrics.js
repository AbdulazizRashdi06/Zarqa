const key = (lostId, foundId) => `${lostId}|${foundId}`;

/**
 * Scores one system on one database.
 * A true pair counts as found if it became a visible match from either side's trigger.
 * Retrieval/shortlist recall are judged on the later report's run (the one that could see the other).
 */
export function score(db, runs) {
  const positives = db.pairs.filter((p) => p.isMatch);
  const hardNegatives = new Set(db.pairs.filter((p) => !p.isMatch).map((p) => key(p.lostId, p.foundId)));
  const posKeys = new Set(positives.map((p) => key(p.lostId, p.foundId)));
  const byId = new Map(db.reports.map((r) => [r.id, r]));

  const visible = new Map();
  const reviewed = new Map();
  for (const run of runs) {
    for (const p of run.result.pairs) reviewed.set(key(p.lostId, p.foundId), p);
    for (const p of run.result.visible) visible.set(key(p.lostId, p.foundId), p);
  }
  const runByQuery = new Map(runs.map((r) => [r.queryId, r.result]));

  const perPair = positives.map((p) => {
    const lost = byId.get(p.lostId), found = byId.get(p.foundId);
    const later = Date.parse(lost.createdAt) >= Date.parse(found.createdAt) ? lost : found;
    const other = later === lost ? found : lost;
    const r = runByQuery.get(later.id);
    return {
      ...p,
      hit: visible.has(key(p.lostId, p.foundId)),
      retrieved: !!r?.poolIds.includes(other.id),
      shortlisted: !!r?.shortlistIds.includes(other.id),
    };
  });

  const vis = [...visible.keys()];
  const truePos = vis.filter((k) => posKeys.has(k)).length;
  const hardNegHits = vis.filter((k) => hardNegatives.has(k)).length;

  const group = (fn) => {
    const g = {};
    for (const p of perPair) for (const name of fn(p)) (g[name] ??= []).push(p.hit);
    return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { n: v.length, recall: rate(v) }]));
  };

  // Brier score over every reviewed pair: how honest are the scores as probabilities?
  const brierItems = [...reviewed.entries()].map(([k, p]) => (p.finalScore - (posKeys.has(k) ? 1 : 0)) ** 2);

  const costs = runs.map((r) => r.result.costUsd);
  const lat = runs.map((r) => r.result.latencyMs).sort((a, b) => a - b);
  const sumCalls = (k) => runs.reduce((s, r) => s + r.result.calls[k], 0);

  return {
    queries: runs.length,
    positives: positives.length,
    recall: rate(perPair.map((p) => p.hit)),
    retrievalRecall: rate(perPair.map((p) => p.retrieved)),
    shortlistRecall: rate(perPair.map((p) => p.shortlisted)),
    visibleMatches: vis.length,
    precision: vis.length ? truePos / vis.length : null,
    falseMatches: vis.length - truePos,
    hardNegatives: hardNegatives.size,
    hardNegativeMatches: hardNegHits,
    byDifficulty: group((p) => [p.difficulty || "unlabelled"]),
    byTag: group((p) => p.tags || []),
    brier: brierItems.length ? mean(brierItems) : null,
    costPerReportUsd: mean(costs),
    totalCostUsd: costs.reduce((s, c) => s + c, 0),
    latencyP50Ms: pctl(lat, 0.5),
    latencyP95Ms: pctl(lat, 0.95),
    callsPerReport: {
      luna: sumCalls("luna") / runs.length,
      jev: sumCalls("jev") / runs.length,
      vision: sumCalls("vision") / runs.length,
    },
    firestoreReadsPerReport: mean(runs.map((r) => r.result.firestoreReads)),
    fallbacks: runs.reduce((s, r) => s + r.result.pairs.filter((p) => p.reviewer === "fallback" || p.reviewer === "luna-fallback").length, 0),
    perPair,
  };
}

/** McNemar's exact-ish test (continuity-corrected χ², 1 df) on paired hit/miss outcomes. */
export function mcnemar(basePairs, otherPairs) {
  const k = (p) => key(p.lostId, p.foundId);
  const other = new Map(otherPairs.map((p) => [k(p), p.hit]));
  let b = 0, c = 0;
  for (const p of basePairs) {
    const o = other.get(k(p));
    if (p.hit && !o) b++;
    if (!p.hit && o) c++;
  }
  if (b + c === 0) return { b, c, p: 1 };
  const chi2 = (Math.abs(b - c) - 1) ** 2 / (b + c);
  return { b, c, p: erfc(Math.sqrt(chi2 / 2)) };
}

function erfc(x) {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * x);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return y * Math.exp(-x * x);
}

const rate = (v) => (v.length ? v.filter(Boolean).length / v.length : null);
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const pctl = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
