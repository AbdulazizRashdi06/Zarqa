// Writes, per pair, exactly what the app's two advocates are given, so another model can argue in their place.
//   node export-advocates.mjs <set dir> <out dir> <prefix> <pairs per file>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { COMMON, photoLine } from "../../src/reviewers/debate.js";
import { buildAliasIndex, matchAliases, truncate, ONE_DAY_LINE, ONE_DAY_TEXT, EARLY_LINE, earlyText, foundOneDayBeforeLost, foundDaysBeforeLost } from "../../src/text.js";
const [, , set, out, prefix, size] = process.argv;
const read = async (f, d) => { try { return JSON.parse(await readFile(path.resolve(set, f), "utf8")); } catch { return d; } };
const reports = new Map((await read("reports.json")).map((r) => [r.id, r]));
const pairs = await read("pairs.json");
const campus = JSON.parse(await readFile(new URL("../../data/campus/locations.json", import.meta.url), "utf8"));
const aliasIndex = buildAliasIndex({ ...campus, ...(await read("locations.json", {})) });
const brief = (r) => ({ description: truncate(r.description, 500), location: r.location, eventDate: r.eventDate || null });
// With ONE_DAY_LINE=1 and/or EARLY_LINE=1 only the pairs a date note applies to are written, with the note, as the benchmark adds it.
const DATES = ONE_DAY_LINE || EARLY_LINE;
const items = pairs.map((p, n) => {
  const lost = reports.get(p.lostId), found = reports.get(p.foundId);
  const aliases = [...matchAliases(lost.location, aliasIndex), ...matchAliases(found.location, aliasIndex)].map((g) => `${g.canonical}: ${g.names.join(", ")}`);
  const photo = found.photos?.length ? path.resolve(set, found.photos[0]) : null;
  const input = `LOST report: ${JSON.stringify(brief(lost))}\nFOUND report: ${JSON.stringify(brief(found))}\nLocation aliases: ${aliases.join(" | ") || "none"}\n${photoLine(0, photo ? 1 : 0)}` + (ONE_DAY_LINE && foundOneDayBeforeLost(lost, found) ? `\n${ONE_DAY_TEXT}` : "") + (EARLY_LINE && foundDaysBeforeLost(lost, found) ? `\n${earlyText(foundDaysBeforeLost(lost, found))}` : "");
  const gated = (ONE_DAY_LINE && foundOneDayBeforeLost(lost, found)) || (EARLY_LINE && foundDaysBeforeLost(lost, found));
  return { n, input, gated, ...(photo ? { photo } : {}) };
}).filter((x) => !DATES || x.gated).map(({ gated, ...x }) => x);
const SIDES = {
  for: "You are the advocate FOR a match. Make the strongest honest case that the LOST and FOUND reports describe the same physical item.",
  against: "You are the advocate AGAINST a match. Make the strongest honest case that the LOST and FOUND reports describe different items.",
};
const per = Number(size);
let files = 0;
for (let i = 0; i < items.length; i += per) {
  await writeFile(path.join(out, `${prefix}-${files++}.json`), JSON.stringify({ advocate_for_instructions: `${SIDES.for}\n${COMMON}`, advocate_against_instructions: `${SIDES.against}\n${COMMON}`, pairs: items.slice(i, i + per) }, null, 1));
}
console.log(`${items.length} pairs in ${files} files`);
