#!/usr/bin/env node
// Compares calibrated Jev at every cut-off from --from to --to (step --step), with the hard
// rules on and off, at each database size. Uses saved runs only: no model calls, no cost.
// All numbers are out of sample (2-fold cross-fitting, see src/calibration.js).
//
//   node scripts/sweep-jev.js --runs results/<100-run>,results/<1000-run>,results/<10000-run>
//   options: --from 0.50 --to 0.75 --step 0.05 --systems jev,jev-photo --data data/campus
// Writes results/jev-sweep.csv and results/jev-sweep.json.
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { calibratedDecision, foldOf, loadRun, prepare, scoreBySize } from "../src/calibration.js";

const { values: a } = parseArgs({
  options: {
    runs: { type: "string" },
    data: { type: "string", default: "data/campus" },
    from: { type: "string", default: "0.50" },
    to: { type: "string", default: "0.75" },
    step: { type: "string", default: "0.05" },
    systems: { type: "string", default: "jev,jev-photo" },
    "min-recall": { type: "string", default: "0.95" },
  },
});
if (!a.runs) throw new Error("--runs <dir>,<dir>,... is required");

const thresholds = [];
for (let t = Number(a.from); t <= Number(a.to) + 1e-9; t += Number(a.step)) thresholds.push(Math.round(t * 100) / 100);

const rows = [];
for (const dir of a.runs.split(",").map((d) => d.trim())) {
  const run = await loadRun(dir, a.data);
  for (const system of a.systems.split(",")) {
    const prep = prepare(run, system);
    if (!prep) continue;
    for (const gates of [true, false]) {
      for (const threshold of thresholds) {
        for (const [size, s] of Object.entries(scoreBySize(run, prep, calibratedDecision(prep, { threshold, gates })))) {
          rows.push({ system, size: Number(size), rules: gates ? "on" : "off", threshold, found: s.found, truePairs: s.truePairs, recall: s.recall, precision: s.precision, shown: s.visible, traps: s.hardNegativeHits });
        }
      }
    }
  }
}
rows.sort((x, y) => x.system.localeCompare(y.system) || x.size - y.size || x.rules.localeCompare(y.rules) || x.threshold - y.threshold);

const pct = (v) => (v == null ? "–" : `${Math.round(v * 100)}%`);
for (const system of [...new Set(rows.map((r) => r.system))]) {
  for (const size of [...new Set(rows.filter((r) => r.system === system).map((r) => r.size))]) {
    console.log(`\n${system} · ${size} reports (recall / precision / traps)`);
    console.log(`cut-off   rules on              rules off`);
    for (const t of thresholds) {
      const on = rows.find((r) => r.system === system && r.size === size && r.rules === "on" && r.threshold === t);
      const off = rows.find((r) => r.system === system && r.size === size && r.rules === "off" && r.threshold === t);
      const cell = (r) => `${pct(r.recall).padStart(4)} / ${pct(r.precision).padStart(4)} / ${String(r.traps).padStart(2)}`;
      console.log(`  ${t.toFixed(2)}    ${cell(on)}     ${cell(off)}`);
    }
  }
}

// Honest cut-off (rules off): chosen on the other half for recall >= --min-recall, applied to this half.
const minRecall = Number(a["min-recall"]);
const cutoffs = Array.from({ length: 19 }, (_, i) => Math.round((0.05 + i * 0.05) * 100) / 100);
console.log(`\nHonest cut-off, rules off (chosen on the other half, target recall ≥ ${minRecall * 100}%):`);
const honestRows = [];
for (const dir of a.runs.split(",").map((d) => d.trim())) {
  const run = await loadRun(dir, a.data);
  for (const system of a.systems.split(",")) {
    const prep = prepare(run, system);
    if (!prep) continue;
    const prob = new Map(prep.rows.map((r) => [r.k, calibratedDecision(prep, { threshold: 0, gates: false })(r).finalScore]));
    for (const size of [...new Set(prep.sysRuns.map((r) => r.size))]) {
      const sizeRuns = prep.sysRuns.filter((r) => r.size === size);
      const reviewed = new Set(sizeRuns.flatMap((r) => r.pairs.map((p) => `${p.lostId}|${p.foundId}`)));
      const truePairs = [...new Set(sizeRuns.flatMap((r) => run.pairs.filter((p) => p.isMatch && (p.lostId === r.queryId || p.foundId === r.queryId)).map((p) => `${p.lostId}|${p.foundId}`)))];
      const rowsHere = prep.rows.filter((r) => reviewed.has(r.k));
      const evaluate = (inFold, cut) => {
        const pos = truePairs.filter(inFold);
        const shown = rowsHere.filter((r) => inFold(r.k) && prob.get(r.k) >= cut);
        const tp = shown.filter((r) => r.y).length;
        return { recall: pos.length ? tp / pos.length : null, found: tp, shown: shown.length, traps: shown.filter((r) => run.hardNeg.has(r.k)).length };
      };
      const foldOfKey = (k) => foldOf(k.split("|")[0]);
      let found = 0, shown = 0, traps = 0;
      const chosen = [];
      for (const f of [0, 1]) {
        const cut = [...cutoffs].reverse().find((c) => (evaluate((k) => foldOfKey(k) !== f, c).recall ?? 0) >= minRecall) ?? cutoffs[0];
        chosen.push(cut);
        const e = evaluate((k) => foldOfKey(k) === f, cut);
        found += e.found;
        shown += e.shown;
        traps += e.traps;
      }
      const row = { system, size: Number(size), recall: truePairs.length ? found / truePairs.length : null, precision: shown ? found / shown : null, traps, cutoffs: chosen.join(" / ") };
      honestRows.push(row);
      console.log(`  ${system.padEnd(10)} ${String(size).padStart(5)} reports: recall ${pct(row.recall).padStart(4)} precision ${pct(row.precision).padStart(4)} traps ${traps}  [cut-offs ${row.cutoffs}]`);
    }
  }
}
await writeFile("results/jev-honest.json", JSON.stringify(honestRows, null, 2));

const csv = ["system,size,rules,threshold,found,true_pairs,recall,precision,shown,traps", ...rows.map((r) => [r.system, r.size, r.rules, r.threshold, r.found, r.truePairs, r.recall?.toFixed(3), r.precision?.toFixed(3), r.shown, r.traps].join(","))].join("\n");
await writeFile("results/jev-sweep.csv", csv);
await writeFile("results/jev-sweep.json", JSON.stringify(rows, null, 2));
console.log(`\nSaved results/jev-sweep.csv and results/jev-sweep.json`);
