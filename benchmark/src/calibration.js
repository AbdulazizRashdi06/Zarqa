import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decide } from "./reviewers/jev.js";

// Shared by scripts/calibrate.js and scripts/sweep-jev.js.
// Jev's decision weights are fitted with logistic regression on Jev's answers + cosine, and
// judged out of sample with 2-fold cross-fitting: reports are split in two halves by lost
// report id, and each half is scored by weights fitted on the other half only.

export const FEATURES = ["overall", "sameItemType", "distinctive", "cosine", "colorConflict", "brandConflict", "locationDifferent"];
const vec = (p) => [p.features.overall, p.features.sameItemType, p.features.distinctive, p.cosine, p.features.colorConflict, p.features.brandConflict, p.features.location === "different" ? 1 : 0];
const fold = (lostId) => createHash("md5").update(lostId).digest()[0] & 1;

/** Plain L2-regularised logistic regression on rows {x: number[], y: 0|1}; positives up-weighted to balance the classes. */
export function fitVector(rows) {
  const w = new Array(rows[0]?.x.length ?? 0).fill(0);
  let b = 0;
  const nPos = rows.filter((r) => r.y).length, nNeg = rows.length - nPos;
  const wPos = nPos ? rows.length / (2 * nPos) : 1, wNeg = nNeg ? rows.length / (2 * nNeg) : 1;
  for (let it = 0; it < 4000; it++) {
    const gw = new Array(w.length).fill(0);
    let gb = 0;
    for (const r of rows) {
      const p = 1 / (1 + Math.exp(-(b + r.x.reduce((s, x, i) => s + x * w[i], 0))));
      const e = (p - r.y) * (r.y ? wPos : wNeg);
      r.x.forEach((x, i) => (gw[i] += e * x));
      gb += e;
    }
    for (let i = 0; i < w.length; i++) w[i] -= 0.5 * (gw[i] / rows.length + 0.01 * w[i]);
    b -= 0.5 * (gb / rows.length);
  }
  return { b, w, predict: (x) => 1 / (1 + Math.exp(-(b + x.reduce((s, v, i) => s + v * w[i], 0)))) };
}

export const foldOf = (lostId) => createHash("md5").update(lostId).digest()[0] & 1;

/** Jev weights in the shape decide() expects. */
export function fit(rows) {
  const w = new Array(FEATURES.length).fill(0);
  let b = 0;
  const nPos = rows.filter((r) => r.y).length, nNeg = rows.length - nPos;
  const wPos = nPos ? rows.length / (2 * nPos) : 1, wNeg = nNeg ? rows.length / (2 * nNeg) : 1;
  for (let it = 0; it < 4000; it++) {
    const gw = new Array(w.length).fill(0);
    let gb = 0;
    for (const r of rows) {
      const p = 1 / (1 + Math.exp(-(b + r.x.reduce((s, x, i) => s + x * w[i], 0))));
      const e = (p - r.y) * (r.y ? wPos : wNeg);
      r.x.forEach((x, i) => (gw[i] += e * x));
      gb += e;
    }
    for (let i = 0; i < w.length; i++) w[i] -= 0.5 * (gw[i] / rows.length + 0.01 * w[i]);
    b -= 0.5 * (gb / rows.length);
  }
  // decide() subtracts the conflict terms, so store those coefficients negated.
  return { logistic: true, bias: b, overall: w[0], sameItemType: w[1], distinctive: w[2], cosine: w[3], colorConflict: -w[4], brandConflict: -w[5], locationDifferent: -w[6] };
}

export async function loadRun(runDir, dataDir) {
  const pairs = JSON.parse(await readFile(path.join(dataDir, "pairs.json"), "utf8"));
  const runs = (await readFile(path.join(runDir, "runs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  return {
    pairs,
    runs,
    positives: new Set(pairs.filter((p) => p.isMatch).map((p) => `${p.lostId}|${p.foundId}`)),
    hardNeg: new Set(pairs.filter((p) => !p.isMatch).map((p) => `${p.lostId}|${p.foundId}`)),
  };
}

/**
 * Prepares one Jev system of a run for scoring: unique reviewed pairs, their features, and
 * the out-of-sample weights for each pair (fitted on the other fold).
 */
export function prepare(run, system) {
  const sysRuns = run.runs.filter((r) => r.system === system);
  const unique = new Map();
  for (const r of sysRuns) for (const p of r.pairs) if (p.features && p.reviewer === "jev") unique.set(`${p.lostId}|${p.foundId}`, p);
  const rows = [...unique.entries()].map(([k, p]) => ({ k, p, x: vec(p), y: run.positives.has(k) ? 1 : 0, f: fold(p.lostId) }));
  if (!rows.length) return null;
  const weightsByFold = [fit(rows.filter((r) => r.f === 1)), fit(rows.filter((r) => r.f === 0))];
  return { system, sysRuns, rows, weightsByFold };
}

/** Recall/precision for each database size, with decisions from `decideFn(row)` (null = keep the run's own verdict). */
export function scoreBySize(run, prep, decideFn) {
  const decisions = new Map(prep.rows.map((r) => [r.k, decideFn(r)]));
  const out = {};
  for (const size of [...new Set(prep.sysRuns.map((r) => r.size))]) {
    const sizeRuns = prep.sysRuns.filter((r) => r.size === size);
    const realPos = new Set();
    for (const r of sizeRuns) for (const p of run.pairs) if (p.isMatch && (p.lostId === r.queryId || p.foundId === r.queryId)) realPos.add(`${p.lostId}|${p.foundId}`);
    const vis = new Set();
    for (const r of sizeRuns) {
      for (const p of r.pairs) {
        const k = `${p.lostId}|${p.foundId}`;
        const d = decisions.get(k);
        if (d ? d.isLikelyMatch : p.visible) vis.add(k);
      }
    }
    const tp = [...vis].filter((k) => run.positives.has(k)).length;
    out[size] = {
      truePairs: realPos.size,
      found: tp,
      recall: realPos.size ? tp / realPos.size : null,
      precision: vis.size ? tp / vis.size : null,
      visible: vis.size,
      hardNegativeHits: [...vis].filter((k) => run.hardNeg.has(k)).length,
      visiblePairs: [...vis],
    };
  }
  return out;
}

/** Out-of-sample calibrated decision for one row. */
export const calibratedDecision = (prep, opts) => (r) => decide({ ...r.p.features }, r.p.cosine, prep.weightsByFold[r.f], opts);

/** The original hand-set v1 decision. */
export const v1Decision = (r) => decide({ ...r.p.features }, r.p.cosine);
