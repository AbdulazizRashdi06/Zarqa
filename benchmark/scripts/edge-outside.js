#!/usr/bin/env node
// Housekeeping for a test set written by an outside agent (blind-benchmark skill).
//
//   node scripts/edge-outside.js prepare --data data/independent2 --batches 7 --out <scratch>/rate
//   node scripts/edge-outside.js merge   --data data/independent2 --ratings <file.json>
//
// prepare: checks the set, adds the fields the runner needs (kind, conflict, tags), copies the place aliases, and
//          writes rating batches (each pair with both reports and the absolute photo path) for the pair-rater agents.
//          Whole item kinds stay in one batch so a rater sees every pair that shares a photo.
// merge:   takes the raters' answers ([{batch, rater: "A"|"B", ratings: [{n, quality, difficulty, reason}]}]),
//          writes quality {a, b}, difficulty {a, b} and ratingNote into pairs.json, and prints how well they agree.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { data: { type: "string" }, batches: { type: "string", default: "7" }, out: { type: "string" }, ratings: { type: "string" } } });
const mode = positionals[0];
if (!["prepare", "merge"].includes(mode) || !args.data) throw new Error("usage: edge-outside.js prepare|merge --data <dir> ...");
const dir = path.resolve(args.data);
const pairsFile = path.join(dir, "pairs.json");
const pairs = JSON.parse(await readFile(pairsFile, "utf8"));
const reports = new Map(JSON.parse(await readFile(path.join(dir, "reports.json"), "utf8")).map((r) => [r.id, r]));

if (mode === "prepare") {
  if (!args.out) throw new Error("--out <folder for the rating batches> is required");
  const problems = [];
  const photoUse = new Map();
  for (const r of reports.values()) for (const ph of r.photos ?? []) {
    if (!existsSync(path.resolve(dir, ph))) problems.push(`${r.id}: photo not found ${ph}`);
    photoUse.set(ph, (photoUse.get(ph) || 0) + 1);
  }
  for (const [ph, n] of photoUse) if (n > 1) problems.push(`photo used ${n} times: ${ph}`);
  for (const p of pairs) {
    if (reports.get(p.lostId)?.type !== "lost" || reports.get(p.foundId)?.type !== "found") problems.push(`bad pair ${p.lostId} / ${p.foundId}`);
  }
  if (problems.length) throw new Error(`set is not fit to run:\n  ${problems.join("\n  ")}`);
  for (const p of pairs) {
    // Placeholders until the pairs are rated: a real pair "must" be shown; "nothing separates them" is a lookalike.
    p.kind ??= p.isMatch ? "must" : /indistinguish|cannot tell|identical/i.test(`${p.lens} ${p.why}`) ? "lookalike" : "trap";
    p.conflict ??= p.kind === "trap" ? "hard" : "none";
    p.tags ??= [p.itemKind, p.kind];
  }
  await writeFile(pairsFile, JSON.stringify(pairs, null, 1));
  if (!existsSync(path.join(dir, "locations.json"))) await copyFile(path.resolve("data/photo-set/locations.json"), path.join(dir, "locations.json"));
  const side = (r) => ({ text: r.description, place: r.location, date: r.eventDate || "", ...(r.photos?.length ? { photo: path.resolve(dir, r.photos[0]) } : {}) });
  const kinds = new Map();
  pairs.forEach((p, n) => kinds.set(p.itemKind, [...(kinds.get(p.itemKind) || []), n]));
  const batches = Array.from({ length: Number(args.batches) }, () => []);
  for (const [, ns] of [...kinds].sort((a, b) => b[1].length - a[1].length)) batches.reduce((m, b) => (b.length < m.length ? b : m)).push(...ns);
  await mkdir(path.resolve(args.out), { recursive: true });
  const name = path.basename(dir);
  for (const [i, b] of batches.entries()) {
    await writeFile(path.resolve(args.out, `${name}-${i}.json`), JSON.stringify(b.sort((x, y) => x - y).map((n) => ({ n, lost: side(reports.get(pairs[n].lostId)), found: side(reports.get(pairs[n].foundId)) })), null, 1));
  }
  console.log(`${pairs.length} pairs (${pairs.filter((p) => p.isMatch).length} real) · ${reports.size} reports · ${photoUse.size} photos · rating batches: ${batches.map((b) => b.length).join(", ")} in ${path.resolve(args.out)}/${name}-<i>.json`);
} else {
  const got = { A: new Map(), B: new Map() };
  for (const b of JSON.parse(await readFile(path.resolve(args.ratings), "utf8"))) for (const r of b.ratings) got[b.rater].set(r.n, r);
  const diffs = [];
  let missing = 0;
  pairs.forEach((p, n) => {
    const a = got.A.get(n), b = got.B.get(n);
    if (!a || !b) return void missing++;
    p.quality = { a: a.quality, b: b.quality };
    p.difficulty = { a: a.difficulty, b: b.difficulty };
    p.ratingNote = a.reason;
    diffs.push(Math.abs(a.quality - b.quality));
  });
  await writeFile(pairsFile, JSON.stringify(pairs, null, 1));
  const share = (f) => `${Math.round((100 * diffs.filter(f).length) / diffs.length)}%`;
  const q = (p) => (p.quality.a + p.quality.b) / 2;
  const ratedPairs = pairs.filter((p) => p.quality);
  console.log(`${diffs.length} pairs rated, ${missing} left unrated · the two raters are within 1 point on ${share((d) => d <= 1)}, within 2 on ${share((d) => d <= 2)}; ${diffs.filter((d) => d >= 4).length} differ by 4 or more`);
  console.log(`real pairs rated below 4: ${ratedPairs.filter((p) => p.isMatch && q(p) < 4).length} of ${ratedPairs.filter((p) => p.isMatch).length} · other pairs rated above 6: ${ratedPairs.filter((p) => !p.isMatch && q(p) > 6).length} of ${ratedPairs.filter((p) => !p.isMatch).length}`);
}
