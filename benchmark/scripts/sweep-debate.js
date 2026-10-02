#!/usr/bin/env node
// Scores luna-debate from saved runs (no model calls), entirely out of sample:
// - the decision model is a logistic regression on Jev's verdict features
//   (same-item probability, overall score, which case was stronger, advocates' self-rated strength, cosine);
// - 2-fold cross-fitting by lost report id: each half is scored by a model fitted on the other half;
// - the cut-off is also chosen on the other half: the highest cut-off whose recall there is >= --min-recall
//   (recall first, then as few wrong matches as possible).
// Also prints a full cut-off table for reference.
//
//   node scripts/sweep-debate.js --runs results/<run>[,results/<run>] [--min-recall 0.95] [--data data/campus]
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { fitVector, foldOf, loadRun } from "../src/calibration.js";

const { values: a } = parseArgs({
  options: { runs: { type: "string" }, data: { type: "string", default: "data/campus" }, "min-recall": { type: "string", default: "0.95" } },
});
const minRecall = Number(a["min-recall"]);
const STRENGTH = { weak: 0, moderate: 0.5, strong: 1 };
const vec = (p) => [
  p.features.sameItem,
  p.features.overall,
  p.features.stronger === "for" ? 1 : 0,
  p.features.stronger === "against" ? 1 : 0,
  STRENGTH[p.features.proStrength] ?? 0.5,
  STRENGTH[p.features.conStrength] ?? 0.5,
  p.cosine,
];
const pct = (v) => (v == null ? "  – " : `${Math.round(v * 100)}%`.padStart(4));
const cutoffs = Array.from({ length: 19 }, (_, i) => Math.round((0.05 + i * 0.05) * 100) / 100);
const results = [];

for (const dir of a.runs.split(",").map((d) => d.trim())) {
  const run = await loadRun(dir, a.data);
  const sysRuns = run.runs.filter((r) => r.system === "luna-debate");
  for (const size of [...new Set(sysRuns.map((r) => r.size))]) {
    const sizeRuns = sysRuns.filter((r) => r.size === size);
    const unique = new Map();
    for (const r of sizeRuns) for (const p of r.pairs) if (p.features && p.reviewer === "debate") unique.set(`${p.lostId}|${p.foundId}`, p);
    const rows = [...unique.entries()].map(([k, p]) => ({ k, p, x: vec(p), y: run.positives.has(k) ? 1 : 0, f: foldOf(p.lostId) }));
    const truePairs = [...new Set(sizeRuns.flatMap((r) => run.pairs.filter((p) => p.isMatch && (p.lostId === r.queryId || p.foundId === r.queryId)).map((p) => `${p.lostId}|${p.foundId}`)))];
    const foldOfPair = (k) => foldOf(k.split("|")[0]);

    // Out-of-sample probability for every reviewed pair.
    const models = [fitVector(rows.filter((r) => r.f === 1)), fitVector(rows.filter((r) => r.f === 0))];
    const prob = new Map(rows.map((r) => [r.k, models[r.f].predict(r.x)]));

    const evaluate = (keys, cut) => {
      const pos = truePairs.filter((k) => keys(k));
      const shown = rows.filter((r) => keys(r.k) && prob.get(r.k) >= cut);
      const tp = shown.filter((r) => r.y).length;
      return { recall: pos.length ? tp / pos.length : null, precision: shown.length ? tp / shown.length : null, shown: shown.length, found: tp, truePairs: pos.length, traps: shown.filter((r) => run.hardNeg.has(r.k)).length };
    };

    // Cut-off chosen on the other half, applied to this half; then the two halves are combined.
    let found = 0, shown = 0, traps = 0;
    const chosen = [];
    for (const f of [0, 1]) {
      const other = (k) => foldOfPair(k) !== f, mine = (k) => foldOfPair(k) === f;
      const cut = [...cutoffs].reverse().find((c) => (evaluate(other, c).recall ?? 0) >= minRecall) ?? cutoffs[0];
      chosen.push(cut);
      const e = evaluate(mine, cut);
      found += e.found;
      shown += e.shown;
      traps += e.traps;
    }
    const honest = { recall: truePairs.length ? found / truePairs.length : null, precision: shown ? found / shown : null, traps, cutoffs: chosen };
    results.push({ size, honest, table: cutoffs.map((c) => ({ cut: c, ...evaluate(() => true, c) })) });

    console.log(`\nluna-debate · ${size} reports · ${rows.length} pairs reviewed, ${truePairs.length} true pairs`);
    console.log(`  honest (cut-off chosen on the other half, target recall ≥ ${minRecall * 100}%): recall ${pct(honest.recall)} precision ${pct(honest.precision)} traps ${traps}  [cut-offs ${chosen.join(" / ")}]`);
    console.log(`  cut-off  recall  precision  traps   (reference: same-data table)`);
    for (const t of results.at(-1).table.filter((t) => t.cut >= 0.3 && t.cut <= 0.9)) console.log(`   ${t.cut.toFixed(2)}    ${pct(t.recall)}    ${pct(t.precision)}     ${t.traps}`);
  }
}
await writeFile("results/debate-sweep.json", JSON.stringify(results, null, 2));
console.log("\nSaved results/debate-sweep.json");
