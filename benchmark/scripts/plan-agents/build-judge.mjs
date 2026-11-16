// Builds the judge's inputs from another model's advocate arguments.
//   node build-judge.mjs <set dir> <advocate outputs.json> <out dir> <prefix> <pairs per file>
// outputs.json: [{file, side: "for"|"against", arguments: [{n, argument, strength}]}]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TERRA_SYSTEM } from "../../src/reviewers/debate.js";
import { dateRelation, truncate, EARLY_LINE, earlyJudgeText, foundDaysBeforeLost } from "../../src/text.js";
const [, , set, outputs, out, prefix, size] = process.argv;
const reports = new Map(JSON.parse(await readFile(path.resolve(set, "reports.json"), "utf8")).map((r) => [r.id, r]));
const pairs = JSON.parse(await readFile(path.resolve(set, "pairs.json"), "utf8"));
const args = { for: new Map(), against: new Map() };
for (const b of JSON.parse(await readFile(outputs, "utf8"))) for (const a of b.arguments) args[b.side].set(a.n, a);
const brief = (r) => ({ description: truncate(r.description, 500), location: r.location, eventDate: r.eventDate || null });
const system = TERRA_SYSTEM + "\nThe photos are attached. Look at them yourself and go by what they show.";
const items = [];
let missing = 0;
pairs.forEach((p, n) => {
  const pro = args.for.get(n), con = args.against.get(n);
  if (!pro || !con) return void missing++;
  const lost = reports.get(p.lostId), found = reports.get(p.foundId);
  const state = { lost: brief(lost), found: brief(found), timing: dateRelation(lost, found), case_for: { argument: pro.argument, self_rated_strength: pro.strength }, case_against: { argument: con.argument, self_rated_strength: con.strength } };
  const photo = found.photos?.length ? path.resolve(set, found.photos[0]) : null;
  const line = photo ? "Attached photos: 1, all taken by the finder of the FOUND item. The LOST report has no photo: what the owner lost is known only from the LOST report's words." : "Attached photos: none. Neither report has a photo.";
  const early = EARLY_LINE && foundDaysBeforeLost(lost, found) ? "\n" + earlyJudgeText(foundDaysBeforeLost(lost, found)) : "";
  items.push({ n, input: JSON.stringify(state) + early + "\n" + line, ...(photo ? { photo } : {}) });
});
const per = Number(size);
let files = 0;
for (let i = 0; i < items.length; i += per) await writeFile(path.join(out, `${prefix}-${files++}.json`), JSON.stringify({ judge_instructions: system, pairs: items.slice(i, i + per) }, null, 1));
console.log(`${items.length} pairs in ${files} files · ${missing} pairs without both arguments`);
