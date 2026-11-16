#!/usr/bin/env node
// Counts "stupid matches": pairs a run shows although the raters put them at quality 2 or below (clearly not the
// same item). Owner's reminder, 2026-11-16: recall decides, but the app must not show obviously wrong pairs.
//
//   node scripts/edge-stupid.js --runs ind-judge-photos:0.55,ind-haiku-full:0.35 [--max-quality 2] [--list]
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { runs: { type: "string" }, "max-quality": { type: "string", default: "2" }, list: { type: "boolean", default: false } } });
if (!args.runs) throw new Error("--runs <name>:<line>[,<name>:<line>] is required");
const maxQ = Number(args["max-quality"]);
for (const spec of args.runs.split(",")) {
  const [name, lineText] = spec.split(":");
  const line = Number(lineText ?? 0.55);
  const dir = path.resolve("results", `edge-${name}`);
  const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8"));
  const rows = (await readFile(path.join(dir, "pairs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  const reports = new Map(JSON.parse(await readFile(path.resolve(summary.data, "reports.json"), "utf8")).map((r) => [r.id, r]));
  const pairs = new Map(JSON.parse(await readFile(path.resolve(summary.data, "pairs.json"), "utf8")).map((p) => [`${p.lostId}|${p.foundId}`, p]));
  let low = 0, shown = [], real = 0, realShown = 0;
  for (const r of rows) {
    const p = pairs.get(`${r.lostId}|${r.foundId}`) ?? {};
    const isShown = Boolean(r.retrieved && r.shortlisted && r.finalScore != null && r.finalScore >= line);
    if (r.isMatch) { real++; if (isShown) realShown++; }
    if (!p.quality) continue;
    const q = (p.quality.a + (p.quality.b ?? p.quality.a)) / 2;
    if (q > maxQ) continue;
    low++;
    if (isShown) shown.push({ q, score: r.finalScore, l: reports.get(r.lostId).description, f: reports.get(r.foundId).description });
  }
  console.log(`${name} at ${line}: stupid matches ${shown.length} of ${low} pairs rated ${maxQ} or below · real items ${realShown}/${real}`);
  if (args.list) for (const s of shown.sort((a, b) => b.score - a.score)) console.log(`    q ${s.q} · ${s.score.toFixed(2)} · L: ${s.l.slice(0, 70)} | F: ${s.f.slice(0, 60)}`);
}
