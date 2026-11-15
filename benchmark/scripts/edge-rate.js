#!/usr/bin/env node
// Scores edge.js runs against the quality ratings in a dataset's pairs.json and works out the best line for each run.
//
//   node scripts/edge-rate.js --runs p3-app,p3-photos-def2 --show-from 4,5,6
//   node scripts/edge-rate.js --runs p3-app --wrong-weight 1 --even-difficulty   # the plain version
//
// Each pair carries quality {a, b}: two raters' 0-10 scores for how good a match it is on the evidence alone
// (blind to the truth and to the app), and difficulty {a, b} (1-5). The mean of the two raters is used.
//
// The owner's choice is one number on that scale, "show from": the lowest quality that should still be shown.
// Showing a pair rated q is then worth (q - showFrom): positive above it, negative below it, nothing at it.
// --wrong-weight scales the negative side: 1 treats a point below the line like a point above it; 0.25 says a
// wrong suggestion costs the owner a glance and a missed one costs them the item (the project's stated priority).
// A run's value at a line is the sum of that over the pairs it shows; the best line is the one with the most value.
// The owner's difficulty rule (on unless --even-difficulty): a mistake is a pair above "show from" that is not shown, or one below it that
// is. Each mistake is weighed by how easy the pair was: full weight at difficulty 1, a fifth at difficulty 5
// ((6 - difficulty) / 5). An easy pair got wrong costs most, a hard pair got wrong costs little, and getting a hard
// pair right earns nothing extra.
// "Honest" picks the line on one half of the item kinds and scores it on the other half, both ways round, so the
// reported value is not tuned on the pairs it is measured on. Value is given as a share of the most any system
// could get (showing exactly the pairs above "show from").
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    runs: { type: "string" },
    "show-from": { type: "string", default: "4,5,6" },
    // Owner's rules, 2026-11-15: a wrong suggestion costs less than a missed one, and a mistake on an easy pair costs
    // more than one on a hard pair. The size of the first (a quarter) is the assistant's number, not the owner's.
    "wrong-weight": { type: "string", default: "0.25" }, // how much a point below "show from" costs, against a point above it
    "even-difficulty": { type: "boolean", default: false }, // switch off the difficulty rule: every mistake counts the same
  },
});
if (!args.runs) throw new Error("--runs <name,name> is required (results/edge-<name>)");
const LINES = Array.from({ length: 19 }, (_, i) => Math.round((0.05 + i * 0.05) * 100) / 100); // 0.05 … 0.95
const mean = (o) => (o.a + o.b) / 2;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");

function spearman(x, y) {
  const rank = (v) => {
    const order = v.map((_, i) => i).sort((i, j) => v[i] - v[j]);
    const r = new Array(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]] === v[order[i]]) j++;
      for (let k = i; k <= j; k++) r[order[k]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x), ry = rank(y);
  const mx = rx.reduce((s, v) => s + v, 0) / rx.length, my = ry.reduce((s, v) => s + v, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

for (const name of args.runs.split(",")) {
  const dir = path.resolve("results", `edge-${name}`);
  const summary = JSON.parse(await readFile(path.join(dir, "summary.json"), "utf8"));
  const rows = (await readFile(path.join(dir, "pairs.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  const rated = new Map(JSON.parse(await readFile(path.resolve(summary.data, "pairs.json"), "utf8")).filter((p) => p.quality).map((p) => [`${p.lostId}|${p.foundId}`, p]));
  const list = [];
  for (const r of rows) {
    const p = rated.get(`${r.lostId}|${r.foundId}`);
    if (!p || r.error || r.finalScore == null) continue;
    // A pair that search or the shortlist dropped is never shown, whatever the judge would have said.
    list.push({ q: mean(p.quality), d: mean(p.difficulty), real: r.isMatch, score: r.retrieved && r.shortlisted ? r.finalScore : -1, group: r.itemKind ?? r.lens });
  }
  // Two halves by item kind (or lens), largest first, each to the smaller half.
  const sizes = new Map();
  for (const x of list) sizes.set(x.group, (sizes.get(x.group) || 0) + 1);
  const half = new Map();
  const n = [0, 0];
  for (const [g, c] of [...sizes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const h = n[0] <= n[1] ? 0 : 1;
    half.set(g, h);
    n[h] += c;
  }
  const s = summary.settings;
  console.log(`\n${name}: ${path.basename(path.dirname(summary.data))}/${path.basename(summary.data)} · ${list.length} rated pairs · wrong weight ${args["wrong-weight"]}${args["even-difficulty"] ? "" : " · mistakes weighed by ease"} · judge ${s.judgePhotos ? "sees photos" : "text only"} · definition ${s.matchDefinition ?? "none"}`);
  const reached = list.filter((x) => x.score >= 0);
  console.log(`  the app's score follows the quality rating: rank correlation ${spearman(reached.map((x) => x.score), reached.map((x) => x.q)).toFixed(2)} (pairs that reached the judge)`);

  const W = Number(args["wrong-weight"]);
  const ease = (x) => (args["even-difficulty"] ? 1 : (6 - x.d) / 5);
  // What a run loses at a line: every missed pair above "show from", every shown pair below it.
  const loss = (items, line, from) => items.reduce((t, x) => t + (x.score >= line ? (x.q < from ? W * (from - x.q) * ease(x) : 0) : x.q > from ? (x.q - from) * ease(x) : 0), 0);
  const best = (items, from) => LINES.reduce((b, line) => (loss(items, line, from) < loss(items, b, from) - 1e-9 ? line : b), LINES[0]);
  // Showing nothing loses every pair above "show from": the scale's zero. Losing nothing is 100%.
  const most = (items, from) => items.reduce((t, x) => t + Math.max(0, x.q - from) * ease(x), 0);
  const value = (items, line, from) => most(items, from) - loss(items, line, from);
  for (const from of args["show-from"].split(",").map(Number)) {
    const line = best(list, from);
    const halves = [0, 1].map((h) => list.filter((x) => half.get(x.group) === h));
    const honest = value(halves[1], best(halves[0], from), from) + value(halves[0], best(halves[1], from), from);
    const should = list.filter((x) => x.q > from), shouldNot = list.filter((x) => x.q < from);
    const shown = (items) => items.filter((x) => x.score >= line).length;
    console.log(`  show from ${from}: best line ${line.toFixed(2)} (halves pick ${best(halves[0], from).toFixed(2)} and ${best(halves[1], from).toFixed(2)}) · value ${pct(value(list, line, from), most(list, from))} of the most possible, honest ${pct(honest, most(list, from))}`);
    console.log(`      at that line: shown ${shown(should)}/${should.length} rated above ${from}, ${shown(shouldNot)}/${shouldNot.length} rated below · real items ${shown(list.filter((x) => x.real))}/${list.filter((x) => x.real).length}`);
    const levels = [["easy", (x) => x.d <= 1.5], ["medium", (x) => x.d > 1.5 && x.d < 3], ["hard", (x) => x.d >= 3]];
    console.log("      by difficulty: " + levels.map(([t, f]) => `${t} ${shown(should.filter(f))}/${should.filter(f).length} above, ${shown(shouldNot.filter(f))}/${shouldNot.filter(f).length} below`).join(" · "));
  }
}
