#!/usr/bin/env node
// Reads edge.js runs as good match / bad match, at one or more lines on the score.
//
//   node scripts/edge-read.js --runs p3-app,p3-photos-def2 --lines 0.55,0.75
//   node scripts/edge-read.js --runs r2p-norm-screen,r2p-def2 --draft3
//
// "Good" and "bad" come from `definitionLabel` in the dataset's pairs.json (the written definition applied by
// labellers who saw neither the truth nor the app's answers). Where a set has no such labels, the pair kinds stand
// in: must, trap-soft and lookalike are good; trap and stretch are bad. Pairs the two labellers split on
// (`disputed`) are counted apart. "Real items" is the check on the definition itself: pairs that are the same item.
// A pair counts as shown at a line when search and the shortlist kept it and its score is at or above the line.
// --draft3 uses the draft-3 reading for the pairs that were read again, where its two readers agree.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    runs: { type: "string" },
    lines: { type: "string", default: "0.55,0.75" },
    draft3: { type: "boolean", default: false },
    fold: { type: "string" }, // with --folds: only the item kinds in this half
    folds: { type: "string" }, // JSON file {itemKind: "a"|"b"}
  },
});
if (!args.runs) throw new Error("--runs <name,name> is required (results/edge-<name>)");
const lines = args.lines.split(",").map(Number);
const folds = args.folds ? JSON.parse(await readFile(path.resolve(args.folds), "utf8")) : null;
const GOOD_KINDS = new Set(["must", "trap-soft", "lookalike"]);
const pct = (a, b) => `${String(a).padStart(3)}/${String(b).padEnd(3)} ${b ? String(Math.round((100 * a) / b)).padStart(3) : "  -"}%`;

for (const name of args.runs.split(",")) {
  const dir = path.resolve("results", `edge-${name}`);
  const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8"));
  const rows = (await readFile(path.join(dir, "pairs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  const labels = new Map(JSON.parse(await readFile(path.resolve(summary.data, "pairs.json"), "utf8")).map((p) => [`${p.lostId}|${p.foundId}`, p]));
  let failed = 0;
  const list = [];
  for (const r of rows) {
    if (folds && args.fold && folds[r.itemKind ?? r.lens] !== args.fold) continue;
    if (r.error || r.finalScore == null) { failed++; continue; }
    const p = labels.get(`${r.lostId}|${r.foundId}`) ?? r;
    let label = p.definitionLabel ?? (GOOD_KINDS.has(r.kind) ? "good" : "bad");
    let disputed = Boolean(p.disputed);
    if (args.draft3 && p.draft3) {
      disputed = p.draft3.a !== p.draft3.b;
      if (!disputed) label = p.draft3.a;
    }
    list.push({ label, disputed, real: r.isMatch, reached: r.retrieved && r.shortlisted, score: r.finalScore });
  }
  const s = summary.settings;
  console.log(`\n${name}: ${path.basename(summary.data)} · ${list.length} pairs${failed ? ` · ${failed} failed calls left out` : ""} · judge ${s.judgePhotos ? "sees photos" : "text only"} · definition ${s.matchDefinition ?? "none"}${args.draft3 ? " · labels: draft 3 where re-read" : ""}`);
  const settled = list.filter((x) => !x.disputed);
  const groups = [
    ["good matches", settled.filter((x) => x.label === "good")],
    ["bad matches", settled.filter((x) => x.label === "bad")],
    ["labellers split", list.filter((x) => x.disputed)],
    ["real items", list.filter((x) => x.real)],
    ["other items", list.filter((x) => !x.real)],
  ];
  console.log(`  ${"shown at".padEnd(16)}${lines.map((t) => String(t).padEnd(15)).join("")}reached the judge`);
  for (const [title, g] of groups) {
    if (!g.length) continue;
    console.log(`  ${title.padEnd(16)}${lines.map((t) => pct(g.filter((x) => x.reached && x.score >= t).length, g.length).padEnd(15)).join("")}${pct(g.filter((x) => x.reached).length, g.length)}`);
  }
}
