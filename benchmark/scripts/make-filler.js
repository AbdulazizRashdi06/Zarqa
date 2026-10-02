#!/usr/bin/env node
// Writes filler reports to a file (the runner can also generate them in memory).
//   node scripts/make-filler.js --data data/campus --count 10000 --days 365 --out data/filler-10000.json
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { loadDataset } from "../src/dataset.js";
import { makeFiller, placesFrom } from "../src/filler.js";

const { values: a } = parseArgs({
  options: {
    data: { type: "string", default: "data/sample" },
    count: { type: "string", default: "10000" },
    days: { type: "string", default: "365" },
    seed: { type: "string", default: "42" },
    out: { type: "string", default: "data/filler.json" },
  },
});
const dataset = await loadDataset(a.data);
const end = new Date(dataset.reports.reduce((m, r) => Math.max(m, Date.parse(r.createdAt)), 0)).toISOString();
const filler = makeFiller({ count: Number(a.count), places: placesFrom(dataset), endIso: end, days: Number(a.days), seed: Number(a.seed) });
await writeFile(a.out, JSON.stringify(filler, null, 1));
console.log(`Wrote ${filler.length} filler reports to ${a.out}`);
