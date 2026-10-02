#!/usr/bin/env node
// Fits the Jev decision weights and reports out-of-sample results (2-fold cross-fitting,
// see src/calibration.js).
//
//   node scripts/calibrate.js --run results/<time> --data data/campus [--threshold 0.72] [--no-gates]
// Writes <run>/weights.json (fitted on all data, for later runs) and <run>/calibration.json.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { calibratedDecision, fit, loadRun, prepare, scoreBySize, v1Decision } from "../src/calibration.js";

const { values: a } = parseArgs({
  options: {
    run: { type: "string" },
    data: { type: "string", default: "data/campus" },
    threshold: { type: "string", default: "0.72" },
    "no-gates": { type: "boolean", default: false },
  },
});
if (!a.run) throw new Error("--run results/<time> is required");
const threshold = Number(a.threshold);
const opts = { threshold, gates: !a["no-gates"] };
const run = await loadRun(a.run, a.data);

const out = { threshold, gates: opts.gates, systems: {} };
for (const system of ["jev", "jev-photo"]) {
  const prep = prepare(run, system);
  if (!prep) continue;
  const v1 = scoreBySize(run, prep, v1Decision);
  const cal = scoreBySize(run, prep, calibratedDecision(prep, opts));
  const bySize = Object.fromEntries(Object.keys(cal).map((s) => [s, { truePairs: cal[s].truePairs, v1: v1[s], calibrated: cal[s] }]));
  const all = fit(prep.rows);
  out.systems[system] = { reviewedPairs: prep.rows.length, positivesReviewed: prep.rows.filter((r) => r.y).length, bySize, weightsAllData: all };
  await writeFile(path.join(a.run, system === "jev" ? "weights.json" : `weights-${system}.json`), JSON.stringify(all, null, 2));
}
await writeFile(path.join(a.run, "calibration.json"), JSON.stringify(out, null, 2));

const pct = (v) => (v == null ? "  – " : `${Math.round(v * 100)}%`.padStart(4));
for (const [system, s] of Object.entries(out.systems)) {
  console.log(`\n${system}: ${s.reviewedPairs} reviewed pairs (${s.positivesReviewed} true). Out-of-sample, threshold ${threshold}${opts.gates ? "" : ", no gates"}:`);
  for (const [size, r] of Object.entries(s.bySize)) {
    console.log(
      `  size ${String(size).padStart(5)}  v1: recall ${pct(r.v1.recall)} precision ${pct(r.v1.precision)} hard-neg ${r.v1.hardNegativeHits}` +
        `   calibrated: recall ${pct(r.calibrated.recall)} precision ${pct(r.calibrated.precision)} hard-neg ${r.calibrated.hardNegativeHits}`,
    );
  }
}
