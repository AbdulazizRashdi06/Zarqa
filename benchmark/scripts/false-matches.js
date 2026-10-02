#!/usr/bin/env node
// Blind labelling of false matches, so precision can be reported two ways.
//
// 1) export: collect every visible pair that is not in the answer key, from all systems and
//    sizes (plus calibrated Jev from calibration.json), and write them in shuffled order
//    WITHOUT saying which system showed them:
//      node scripts/false-matches.js export --runs <dir>,<dir>,... --out results/false-matches.json
// 2) a person (or Claude) fills in "label": "plausible" | "wrong" for each pair in that file.
// 3) score: strict precision (all non-key pairs wrong) and adjusted precision (only "wrong" counts):
//      node scripts/false-matches.js score --runs <dirs> --labels results/false-matches.json
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadDataset } from "../src/dataset.js";
import { makeFiller, placesFrom } from "../src/filler.js";

const { positionals, values: a } = parseArgs({
  allowPositionals: true,
  options: { runs: { type: "string" }, out: { type: "string" }, labels: { type: "string" }, data: { type: "string", default: "data/campus" } },
});
const mode = positionals[0];
const dirs = a.runs.split(",").map((d) => d.trim());
const ds = await loadDataset(a.data);
const latest = ds.reports.reduce((m, r) => Math.max(m, Date.parse(r.createdAt)), 0);
const filler = makeFiller({ count: 10000, places: placesFrom(ds), endIso: new Date(latest).toISOString(), days: 365 });
const byId = new Map([...ds.reports, ...filler].map((r) => [r.id, r]));
const positives = new Set(ds.pairs.filter((p) => p.isMatch).map((p) => `${p.lostId}|${p.foundId}`));

// visible[system][size] = Set of pair keys
const visible = {};
const add = (system, size, k) => ((visible[system] ??= {})[size] ??= new Set()).add(k);
for (const dir of dirs) {
  for (const line of readFileSync(path.join(dir, "runs.jsonl"), "utf8").trim().split("\n")) {
    const r = JSON.parse(line);
    for (const p of r.visible) add(r.system, r.size, `${p.lostId}|${p.foundId}`);
  }
  const cal = path.join(dir, "calibration.json");
  if (existsSync(cal)) {
    for (const [system, s] of Object.entries(JSON.parse(readFileSync(cal, "utf8")).systems)) {
      for (const [size, r] of Object.entries(s.bySize)) for (const k of r.calibrated.visiblePairs || []) add(`${system} (calibrated)`, Number(size), k);
    }
  }
}

const describe = (r) => ({ title: r.title, category: r.category, description: r.description, location: r.location, date: r.eventDate });

if (mode === "export") {
  const keys = new Set();
  for (const sizes of Object.values(visible)) for (const set of Object.values(sizes)) for (const k of set) if (!positives.has(k)) keys.add(k);
  const order = (k) => createHash("md5").update(k).digest("hex"); // stable shuffle, hides grouping by system
  const items = [...keys].sort((x, y) => order(x).localeCompare(order(y))).map((k) => {
    const [l, f] = k.split("|");
    return { pair: k, lost: describe(byId.get(l)), found: describe(byId.get(f)), label: "" };
  });
  writeFileSync(a.out, JSON.stringify(items, null, 1));
  console.log(`Wrote ${items.length} unlabelled false matches to ${a.out}`);
} else if (mode === "score") {
  const labels = new Map(JSON.parse(readFileSync(a.labels, "utf8")).map((i) => [i.pair, i.label]));
  const pct = (v) => (v == null ? "  – " : `${Math.round(v * 100)}%`.padStart(4));
  const rows = [];
  for (const [system, sizes] of Object.entries(visible)) {
    for (const [size, set] of Object.entries(sizes)) {
      const keys = [...set];
      const tp = keys.filter((k) => positives.has(k)).length;
      const wrong = keys.filter((k) => !positives.has(k) && labels.get(k) === "wrong").length;
      const plausible = keys.filter((k) => !positives.has(k) && labels.get(k) === "plausible").length;
      const unlabelled = keys.length - tp - wrong - plausible;
      rows.push({ system, size: Number(size), shown: keys.length, true: tp, plausible, wrong, unlabelled, strict: pct(keys.length ? tp / keys.length : null), adjusted: pct(tp + plausible + wrong ? (tp + plausible) / (tp + plausible + wrong) : null) });
    }
  }
  rows.sort((x, y) => x.size - y.size || x.system.localeCompare(y.system));
  console.table(rows);
  writeFileSync(path.join(path.dirname(a.labels), "precision-adjusted.json"), JSON.stringify(rows, null, 2));
} else {
  console.log("usage: false-matches.js export|score --runs <dirs> [--out file | --labels file]");
}
