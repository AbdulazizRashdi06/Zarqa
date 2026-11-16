#!/usr/bin/env node
// Compares two edge.js runs on the same set pair by pair: what a change moved, and on which pairs.
//
//   node scripts/edge-diff.js --base ind-judge-photos --cand ind-jp-t3 --gate one-day
//   node scripts/edge-diff.js --base r3t-jp --cand r3t-jp-p1 --gate relative --line 0.55 --list
//
// --gate picks the pairs a change is aimed at, so its effect there is read apart from everything else:
//   one-day   both event dates present and the found one exactly one calendar day before the lost one
//   relative  a report in the pair has no event date and uses a relative-time word ("today", "last week", "ams", …)
//   undated   a report in the pair has no event date
//   early     both reports undated and the found one posted 3 or more days before the lost one
// For the gated pairs and for the rest it prints: pairs whose score changed, real and other pairs shown before and
// after, pairs that crossed the line each way, pairs the screen dropped, and how many debates argue "found before lost".
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { foundOneDayBeforeLost } from "../src/text.js";

const { values: args } = parseArgs({ options: { base: { type: "string" }, cand: { type: "string" }, gate: { type: "string", default: "one-day" }, line: { type: "string", default: "0.55" }, list: { type: "boolean", default: false } } });
if (!args.base || !args.cand) throw new Error("--base <run> and --cand <run> are required");
const line = Number(args.line);
const load = async (name) => {
  const dir = path.resolve("results", `edge-${name}`);
  const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8"));
  const rows = new Map((await readFile(path.join(dir, "pairs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l)).map((r) => [`${r.lostId}|${r.foundId}`, r]));
  return { summary, rows };
};
const base = await load(args.base), cand = await load(args.cand);
if (path.resolve(base.summary.data) !== path.resolve(cand.summary.data)) throw new Error("the two runs are on different sets");
const reports = new Map(JSON.parse(await readFile(path.resolve(base.summary.data, "reports.json"), "utf8")).map((r) => [r.id, r]));
const pairs = new Map(JSON.parse(await readFile(path.resolve(base.summary.data, "pairs.json"), "utf8")).map((p) => [`${p.lostId}|${p.foundId}`, p]));

const RELATIVE = /\b(today|tonight|yesterday|this (morning|afternoon|evening)|last (night|week)|a (few|couple of) days ago|recently|ams|el ?yo?u?m|embare7|imbare7)\b|امس|أمس|اليوم|البارحة|قبل/i;
const GATES = {
  "one-day": (l, f) => foundOneDayBeforeLost(l, f),
  relative: (l, f) => (!l.eventDate && RELATIVE.test(l.description)) || (!f.eventDate && RELATIVE.test(f.description)),
  undated: (l, f) => !l.eventDate || !f.eventDate,
  early: (l, f) => !l.eventDate && !f.eventDate && Date.parse(l.createdAt) - Date.parse(f.createdAt) >= 3 * 86_400_000,
};
const gate = GATES[args.gate];
if (!gate) throw new Error(`--gate must be one of ${Object.keys(GATES).join(", ")}`);
const BEFORE_LOST = /found before|before it was lost|could not have been found|cannot be found before|impossible/i;
const shown = (r) => Boolean(r.retrieved && r.shortlisted && r.finalScore >= line);

const groups = { gated: [], rest: [] };
for (const [key, b] of base.rows) {
  const c = cand.rows.get(key);
  if (!c || b.error || c.error || b.finalScore == null || c.finalScore == null) continue;
  const l = reports.get(b.lostId), f = reports.get(b.foundId), p = pairs.get(key) ?? {};
  groups[gate(l, f) ? "gated" : "rest"].push({ b, c, real: b.isMatch, q: p.quality ? (p.quality.a + p.quality.b) / 2 : null, l, f });
}
console.log(`${args.base} → ${args.cand} · ${path.basename(base.summary.data)} · gate "${args.gate}" · line ${line}`);
for (const [name, g] of Object.entries(groups)) {
  const n = (f) => g.filter(f).length;
  const side = (real) => {
    const s = g.filter((x) => x.real === real);
    return `${s.filter((x) => shown(x.b)).length} → ${s.filter((x) => shown(x.c)).length} of ${s.length}`;
  };
  const mean = (k) => (g.length ? (g.reduce((t, x) => t + x[k].finalScore, 0) / g.length).toFixed(3) : "-");
  console.log(`\n${name === "gated" ? "pairs the change is aimed at" : "all other pairs"}: ${g.length}`);
  console.log(`  score changed on ${n((x) => Math.abs(x.b.finalScore - x.c.finalScore) > 1e-9)} · mean score ${mean("b")} → ${mean("c")}`);
  console.log(`  real pairs shown ${side(true)} · other pairs shown ${side(false)}`);
  console.log(`  crossed the line upward: ${n((x) => !shown(x.b) && shown(x.c))} (${n((x) => !shown(x.b) && shown(x.c) && x.real)} real) · downward: ${n((x) => shown(x.b) && !shown(x.c))} (${n((x) => shown(x.b) && !shown(x.c) && x.real)} real)`);
  console.log(`  dropped by search or the screen: ${n((x) => !(x.b.retrieved && x.b.shortlisted))} → ${n((x) => !(x.c.retrieved && x.c.shortlisted))} · debates arguing "found before lost": ${n((x) => BEFORE_LOST.test(x.b.debate ?? ""))} → ${n((x) => BEFORE_LOST.test(x.c.debate ?? ""))}`);
  if (args.list && name === "gated") {
    for (const x of g.sort((a, b) => Math.abs(b.c.finalScore - b.b.finalScore) - Math.abs(a.c.finalScore - a.b.finalScore))) {
      console.log(`    ${x.real ? "real " : "other"} q ${x.q ?? "-"} · ${x.b.finalScore.toFixed(3)} → ${x.c.finalScore.toFixed(3)}${shown(x.b) !== shown(x.c) ? (shown(x.c) ? " ▲ now shown" : " ▼ no longer shown") : ""} · L: ${x.l.description.slice(0, 60)} | F: ${x.f.description.slice(0, 45)}`);
    }
  }
}
