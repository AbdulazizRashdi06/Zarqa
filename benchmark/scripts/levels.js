#!/usr/bin/env node
// Splits a luna-debate run's suggested matches into the app's three confidence levels
// (decisions.md, 2026-11-01; server MatchEndpoints.Confidence): a fixed display rule, not tuned.
//   Small chance  0.55–0.649   Looks like it  0.65–0.799   Big chance  0.80+
// No model calls: it reads a finished run's runs.jsonl.
//
//   node scripts/levels.js --run results/<dir> [--data data/campus] [--system luna-debate]
import { parseArgs } from "node:util";
import { loadRun } from "../src/calibration.js";

const { values: a } = parseArgs({
  options: {
    run: { type: "string" },
    data: { type: "string", default: "data/campus" },
    system: { type: "string", default: "luna-debate" },
  },
});
if (!a.run) throw new Error("--run results/<dir> is required");

const LEVELS = [
  { name: "Big chance", min: 0.8 },
  { name: "Looks like it", min: 0.65 },
  { name: "Small chance", min: 0 },
];
const levelOf = (score) => LEVELS.find((l) => score >= l.min).name;

const run = await loadRun(a.run, a.data);
const sysRuns = run.runs.filter((r) => r.system === a.system);
if (!sysRuns.length) throw new Error(`no ${a.system} runs in ${a.run}`);

for (const size of [...new Set(sysRuns.map((r) => r.size))].sort((x, y) => x - y)) {
  // A pair seen from both sides keeps its highest suggested score.
  const shown = new Map();
  const reviewers = {};
  for (const r of sysRuns.filter((r) => r.size === size)) {
    for (const p of r.pairs ?? []) reviewers[p.reviewer] = (reviewers[p.reviewer] || 0) + 1;
    for (const p of r.visible ?? []) {
      const k = `${p.lostId}|${p.foundId}`;
      if (!shown.has(k) || p.finalScore > shown.get(k).finalScore) shown.set(k, p);
    }
  }

  const rows = LEVELS.map((l) => ({ level: l.name, right: 0, wrong: 0, traps: 0, pairs: [] }));
  for (const [k, p] of shown) {
    const row = rows.find((r) => r.level === levelOf(p.finalScore));
    const kind = run.positives.has(k) ? "right" : run.hardNeg.has(k) ? "trap" : "wrong";
    if (kind === "right") row.right++;
    else row.wrong++;
    if (kind === "trap") row.traps++;
    row.pairs.push({ k, score: p.finalScore, kind });
  }

  const truePairs = run.pairs.filter((p) => p.isMatch).length;
  const found = rows.reduce((s, r) => s + r.right, 0);
  console.log(`\n== ${a.system}, ${size} reports: ${found}/${truePairs} true pairs suggested, ${shown.size} suggestions ==`);
  // Anything but "debate" means an advocate or the judge failed (e.g. a Codex usage limit) and a fallback decided.
  const failed = Object.entries(reviewers).filter(([k]) => k !== "debate");
  console.log(`reviews: ${reviewers.debate || 0} by the debate` + (failed.length ? `, FALLBACK ${failed.map(([k, n]) => `${k} ${n}`).join(", ")} (failed calls: rerun to retry them)` : ", no failures"));
  console.log("level           right  wrong (traps)  share right");
  for (const r of rows) {
    const n = r.right + r.wrong;
    const share = n ? `${Math.round((100 * r.right) / n)}%` : "–";
    console.log(`${r.level.padEnd(15)} ${String(r.right).padStart(5)}  ${String(r.wrong).padStart(5)} (${r.traps})  ${share.padStart(11)}`);
  }
  for (const r of rows) {
    for (const p of r.pairs.filter((p) => p.kind !== "right").sort((x, y) => y.score - x.score)) {
      console.log(`  ${r.level}: ${p.kind} ${p.k} ${p.score.toFixed(3)}`);
    }
  }
  const missed = run.pairs.filter((p) => p.isMatch && !shown.has(`${p.lostId}|${p.foundId}`));
  if (missed.length) console.log(`  missed: ${missed.map((p) => `${p.lostId}|${p.foundId}`).join(", ")}`);
}
