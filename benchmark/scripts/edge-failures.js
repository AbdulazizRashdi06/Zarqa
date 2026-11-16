#!/usr/bin/env node
// Lists a finished edge.js run's mistakes by the owner's rules, costliest first, for diagnosis.
//
//   node scripts/edge-failures.js --run ind-judge-photos --show-from 5 --line 0.55 --top 12
//
// A mistake is a rated pair above "show from" that was not shown, or one below it that was. Cost is the same as in
// edge-rate.js: distance from "show from" (to the power 1.2 for a miss, times 0.25 for a wrong suggestion), times
// ease ((6 - difficulty) / 5). Prints counts by situation (lens), then the costliest of each kind with the texts,
// the score, where the pair was lost, and the start of the debate.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: { run: { type: "string" }, "show-from": { type: "string", default: "5" }, line: { type: "string", default: "0.55" }, top: { type: "string", default: "12" }, json: { type: "boolean", default: false } },
});
if (!args.run) throw new Error("--run <name> is required (results/edge-<name>)");
const from = Number(args["show-from"]), line = Number(args.line), top = Number(args.top);
const dir = path.resolve("results", `edge-${args.run}`);
const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8"));
const rows = (await readFile(path.join(dir, "pairs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
const rated = new Map(JSON.parse(await readFile(path.resolve(summary.data, "pairs.json"), "utf8")).filter((p) => p.quality).map((p) => [`${p.lostId}|${p.foundId}`, p]));
if (!rated.size) throw new Error(`${summary.data} has no quality ratings; rate it first (blind-benchmark skill)`);

const mistakes = [];
const byLens = new Map();
for (const r of rows) {
  const p = rated.get(`${r.lostId}|${r.foundId}`);
  if (!p || r.error || r.finalScore == null) continue;
  const q = (p.quality.a + p.quality.b) / 2, d = (p.difficulty.a + p.difficulty.b) / 2, ease = (6 - d) / 5;
  const reached = r.retrieved && r.shortlisted, shown = reached && r.finalScore >= line;
  const lens = byLens.get(r.lens) ?? byLens.set(r.lens, { above: 0, missed: 0, below: 0, wrong: 0 }).get(r.lens);
  if (q > from) lens.above++;
  if (q < from) lens.below++;
  const kind = q > from && !shown ? "missed" : q < from && shown ? "wrong" : null;
  if (!kind) continue;
  lens[kind]++;
  mistakes.push({
    kind, cost: Number((kind === "missed" ? (q - from) ** 1.2 * ease : 0.25 * (from - q) * ease).toFixed(2)), quality: q, difficulty: d, lens: r.lens, real: r.isMatch,
    score: r.finalScore, lostAt: reached ? "score below the line" : !r.retrieved ? "search" : "shortlist or screen",
    lost: r.lostText, found: r.foundText, raterNote: p.ratingNote ?? "", debate: (r.debate ?? "").slice(0, 500),
  });
}
mistakes.sort((a, b) => b.cost - a.cost);
const out = { run: args.run, data: summary.data, showFrom: from, line, totals: { missed: mistakes.filter((m) => m.kind === "missed").length, wrong: mistakes.filter((m) => m.kind === "wrong").length, cost: Number(mistakes.reduce((t, m) => t + m.cost, 0).toFixed(1)) }, byLens: Object.fromEntries([...byLens].filter(([, v]) => v.missed || v.wrong)), missed: mistakes.filter((m) => m.kind === "missed").slice(0, top), wrong: mistakes.filter((m) => m.kind === "wrong").slice(0, top) };
if (args.json) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${args.run} · ${path.basename(summary.data)} · show from ${from} · line ${line} · ${out.totals.missed} missed, ${out.totals.wrong} wrongly shown · total cost ${out.totals.cost}`);
  console.log("by situation (missed/above, wrong/below):");
  for (const [k, v] of Object.entries(out.byLens)) console.log(`  ${k.padEnd(24)} missed ${v.missed}/${v.above} · wrong ${v.wrong}/${v.below}`);
  for (const kind of ["missed", "wrong"]) {
    console.log(`\n${kind === "missed" ? "MISSED (should be shown)" : "WRONGLY SHOWN"}, costliest first:`);
    for (const m of out[kind]) console.log(`  cost ${m.cost} · q ${m.quality} d ${m.difficulty} · score ${m.score} · ${m.lostAt} · ${m.lens}${m.real ? " · real" : ""}\n    L: ${m.lost.slice(0, 110)}\n    F: ${m.found.slice(0, 90)}\n    ${m.debate.slice(0, 260).replace(/\n/g, " ")}`);
  }
}
