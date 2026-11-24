#!/usr/bin/env node
// The free gate of the tuning loop: what a change to the line, the prescore floor or how many candidates are
// reviewed would show, worked out from answers a finished run already holds. No model call.
//
//   node scripts/edge-forecast.js --runs ind3-opus-route,ind2-opus-route --line 0.45 --new-line 0.40
//   node scripts/edge-forecast.js --runs ind3-opus-alone --reach as-run --new-reach all     # review every candidate
//   node scripts/edge-forecast.js --runs ind3-opus-route --floor 0.56 --new-floor 0.50
//
// reach "as-run" = the pairs the run's own shortlist and screen let through; "all" = every retrieved pair over the
// floor. A pair the change would newly review but the run holds no answer for is counted as "no answer": the
// forecast cannot speak for it. The gate may only drop an idea (nothing gained, best case); a good forecast is
// never evidence for one. A wording or effort change cannot be forecast this way at all.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({ options: { runs: { type: "string" }, line: { type: "string", default: "0.45" }, "new-line": { type: "string" }, floor: { type: "string", default: "0.56" }, "new-floor": { type: "string" }, reach: { type: "string", default: "as-run" }, "new-reach": { type: "string" }, list: { type: "boolean", default: false } } });
if (!a.runs) throw new Error("--runs <name>[,<name>] is required");
const base = { line: Number(a.line), floor: Number(a.floor), reach: a.reach };
const change = { line: Number(a["new-line"] ?? a.line), floor: Number(a["new-floor"] ?? a.floor), reach: a["new-reach"] ?? a.reach };
const state = (r, s) => {
  const reached = r.retrieved && (s.reach === "all" ? r.prescore >= s.floor : r.shortlisted && r.prescore >= s.floor);
  if (!reached) return "hidden";
  if (r.finalScore == null) return "no answer";
  return r.finalScore >= s.line ? "shown" : "hidden";
};
const total = { base: [0, 0, 0], change: [0, 0, 0], gained: [0, 0, 0], lost: [0, 0, 0], unknown: [0, 0, 0] };
const moved = [];
for (const name of a.runs.split(",")) {
  const dir = path.resolve("results", `edge-${name}`);
  const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8"));
  const rows = (await readFile(path.join(dir, "pairs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  const rated = new Map(JSON.parse(await readFile(path.resolve(summary.data, "pairs.json"), "utf8")).map((p) => [`${p.lostId}|${p.foundId}`, p]));
  for (const r of rows) {
    const p = rated.get(`${r.lostId}|${r.foundId}`);
    const q = p?.quality ? (p.quality.a + (p.quality.b ?? p.quality.a)) / 2 : null;
    // Columns: real items, other pairs, stupid matches (rated 2 or lower; a subset of the other pairs).
    const cols = [r.isMatch ? 1 : 0, r.isMatch ? 0 : 1, q != null && q <= 2 ? 1 : 0];
    const add = (key) => cols.forEach((c, i) => (total[key][i] += c));
    const was = state(r, base), now = state(r, change);
    if (was === "shown") add("base");
    if (now === "shown") add("change");
    if (now === "no answer") add("unknown");
    if (was !== "shown" && now === "shown") { add("gained"); moved.push({ name, how: "newly shown", r, q }); }
    if (was === "shown" && now !== "shown") { add("lost"); moved.push({ name, how: now === "no answer" ? "no answer" : "newly hidden", r, q }); }
  }
}
const fmt = (t) => `${t[0]} real / ${t[1]} other / ${t[2]} stupid`;
console.log(`base   line ${base.line} · floor ${base.floor} · reach ${base.reach}:   ${fmt(total.base)}`);
console.log(`change line ${change.line} · floor ${change.floor} · reach ${change.reach}:   ${fmt(total.change)}`);
console.log(`newly shown: ${fmt(total.gained)} · no longer shown: ${fmt(total.lost)} · would be reviewed but the run holds no answer: ${fmt(total.unknown)}`);
const verdict = total.gained[0] === 0 && total.unknown[0] === 0 && total.lost[2] === 0 ? "DROP: gains no real item and removes no stupid match, even in the best case" : total.unknown[0] + total.unknown[1] > 0 ? "CANNOT FORECAST in full: some pairs have no recorded answer; goes on to the critics" : "not dropped (this is not evidence for the change)";
console.log(`gate: ${verdict}`);
if (a.list) for (const m of moved) console.log(`  ${m.how} · ${m.r.isMatch ? "REAL" : "other"} · rated ${m.q ?? "?"} · score ${m.r.finalScore ?? "none"} · L: ${String(m.r.lostText).slice(0, 60)} | F: ${String(m.r.foundText).slice(0, 50)}`);
