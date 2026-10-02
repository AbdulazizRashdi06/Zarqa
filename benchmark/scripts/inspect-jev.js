#!/usr/bin/env node
// Shows Jev's raw answers and the decision for every true pair, to see which rule blocks a match.
//   node --env-file=.env scripts/inspect-jev.js --data data/campus
import { parseArgs } from "node:util";
import path from "node:path";
import { loadDataset } from "../src/dataset.js";
import { embedReports } from "../src/embeddings.js";
import { preliminaryScore } from "../src/prescore.js";
import { jevReview } from "../src/reviewers/jev.js";
import { buildAliasIndex } from "../src/text.js";

const { values: a } = parseArgs({ options: { data: { type: "string", default: "data/campus" } } });
const dataDir = path.resolve(a.data);
const ds = await loadDataset(dataDir);
const ctx = { offline: false, useCache: true, aliasIndex: buildAliasIndex(ds.locations), dataDir };
await embedReports(ds.reports, "text", ctx);
const byId = new Map(ds.reports.map((r) => [r.id, r]));

const rows = [];
for (const p of ds.pairs.filter((p) => p.isMatch)) {
  const lost = byId.get(p.lostId), found = byId.get(p.foundId);
  const prelim = preliminaryScore(lost, found, lost.vectors.text, found.vectors.text, ctx.aliasIndex);
  const r = await jevReview(lost, found, prelim, ctx);
  if (r.failed) { rows.push({ pair: `${p.lostId}/${p.foundId}`, error: r.error }); continue; }
  const f = r.features;
  const blocked = [
    f.sameItemType < 0.8 && "sameItemType<0.8",
    f.colorConflict >= 0.3 && "colorConflict",
    f.brandConflict >= 0.3 && "brandConflict",
    f.location === "different" && "location=different",
    r.finalScore < 0.72 && "finalScore<0.72",
  ].filter(Boolean);
  rows.push({
    pair: `${p.lostId}/${p.foundId}`, diff: p.difficulty, match: r.isLikelyMatch, final: +r.finalScore.toFixed(2),
    same: f.sameItemType, color: f.colorConflict, brand: f.brandConflict, detail: f.distinctive, loc: f.location,
    overall: +f.overall.toFixed(2), conf: f.confidence, cos: +prelim.cosine.toFixed(2), blocked: blocked.join(" ") || "-",
  });
}
console.table(rows);
const blockers = {};
for (const r of rows) for (const b of (r.blocked || "-").split(" ")) blockers[b] = (blockers[b] || 0) + 1;
console.log("matched:", rows.filter((r) => r.match).length, "/", rows.length, " blockers:", blockers);
