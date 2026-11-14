#!/usr/bin/env node
// Turns the edge-case writers' output into a dataset folder (reports.json, pairs.json).
//
//   node scripts/edge-build.js --in <writers.json> --out data/edge/round1 --prefix R1
//
// Input: [{lens, groups: [{idea, reports: [{key, type, text, location, eventDate, reportedAt}],
//          pairs: [{lost, found, truth: "same"|"different", why}]}],
//          verdicts: [{group, lost, found, conflict: "none"|"soft"|"hard", note}]}]
// The writer knows the truth; an independent checker, who is not told it, says whether the two texts
// conflict. Together they give each pair its kind (see KIND below).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { in: { type: "string" }, out: { type: "string" }, prefix: { type: "string", default: "E" } } });
const lenses = JSON.parse(await readFile(args.in, "utf8"));

const KIND = {
  same: { none: "must", soft: "must", hard: "stretch" },
  different: { none: "lookalike", soft: "trap-soft", hard: "trap" },
};
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

const reports = [], pairs = [], skipped = [];
let n = 0;
for (const { lens, groups, verdicts } of lenses) {
  groups.forEach((g, gi) => {
    const ids = new Map();
    for (const r of g.reports) {
      if (!["lost", "found"].includes(r.type) || !String(r.text || "").trim()) continue;
      const id = `${args.prefix}-${lens}-${String(gi + 1).padStart(2, "0")}-${r.key}`;
      ids.set(r.key, id);
      const posted = isDate(r.reportedAt) ? r.reportedAt : isDate(r.eventDate) ? r.eventDate : "2026-11-01";
      reports.push({
        id,
        type: r.type,
        title: "",
        category: "",
        description: r.text.trim(),
        location: (r.location || "").trim(),
        campusZone: "",
        eventDate: isDate(r.eventDate) ? r.eventDate : null,
        // Reports posted on one day keep a stable order.
        createdAt: new Date(Date.parse(`${posted}T08:00:00Z`) + (n++ % 600) * 60_000).toISOString(),
        photos: [],
        status: "open",
        tags: [lens],
      });
    }
    for (const p of g.pairs) {
      const lostId = ids.get(p.lost), foundId = ids.get(p.found);
      const v = (verdicts || []).find((x) => x.group === gi && x.lost === p.lost && x.found === p.found);
      const lostType = g.reports.find((r) => r.key === p.lost)?.type, foundType = g.reports.find((r) => r.key === p.found)?.type;
      if (!lostId || !foundId || lostType !== "lost" || foundType !== "found" || !KIND[p.truth] || !v) {
        skipped.push({ lens, group: gi, ...p, reason: !v ? "no checker verdict" : "bad report keys" });
        continue;
      }
      pairs.push({ lostId, foundId, isMatch: p.truth === "same", lens, kind: KIND[p.truth][v.conflict], conflict: v.conflict, idea: g.idea, why: p.why, checkerNote: v.note, tags: [lens, KIND[p.truth][v.conflict]] });
    }
  });
}

await mkdir(args.out, { recursive: true });
await writeFile(path.join(args.out, "reports.json"), JSON.stringify(reports, null, 1));
await writeFile(path.join(args.out, "pairs.json"), JSON.stringify(pairs, null, 1));
const kinds = {};
for (const p of pairs) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
console.log(`${reports.length} reports, ${pairs.length} pairs`, kinds, skipped.length ? `· ${skipped.length} skipped` : "");
if (skipped.length) console.log(skipped.map((s) => `  ${s.lens} g${s.group} ${s.lost}/${s.found}: ${s.reason}`).join("\n"));
