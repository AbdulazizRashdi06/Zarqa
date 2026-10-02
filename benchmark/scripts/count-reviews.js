#!/usr/bin/env node
// Counts the Luna reviews a run will need (unique pairs, minus ones already cached), without calling Luna.
//   LUNA_PROVIDER=none node scripts/count-reviews.js --data data/campus --sizes 100,1000,10000
import { readdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildDatabase, loadDataset } from "../src/dataset.js";
import { embedReports } from "../src/embeddings.js";
import { makeFiller, placesFrom } from "../src/filler.js";
import { PIPELINES } from "../src/systems.js";
import { buildAliasIndex } from "../src/text.js";

process.env.LUNA_PROVIDER = "none"; // chatJson throws → reviewer falls back → no model calls
const { values: a } = parseArgs({ options: { data: { type: "string", default: "data/campus" }, sizes: { type: "string", default: "10,100,1000,10000" } } });
const sizes = a.sizes.split(",").map(Number);
const dataDir = path.resolve(a.data);
const ds = await loadDataset(dataDir);
const ctx = { offline: false, useCache: true, aliasIndex: buildAliasIndex(ds.locations), dataDir };
const latest = ds.reports.reduce((m, r) => Math.max(m, Date.parse(r.createdAt)), 0);
const filler = makeFiller({ count: Math.max(...sizes), places: placesFrom(ds), endIso: new Date(latest).toISOString(), days: 365 });

const all = new Set();
for (const size of sizes) {
  const db = buildDatabase(ds, filler, size);
  await embedReports(db.reports, "text", ctx);
  const perSystem = {};
  for (const system of ["luna", "luna-vector"]) {
    const set = new Set();
    for (const q of db.queries) for (const p of (await PIPELINES[system](q, db, ctx)).pairs) set.add(`${p.lostId}|${p.foundId}`);
    perSystem[system] = set.size;
    for (const k of set) all.add(k);
  }
  console.log(`size ${size}: luna ${perSystem.luna} pairs, luna-vector ${perSystem["luna-vector"]} pairs, unique so far ${all.size}`);
}
const cachedCalls = (await readdir(path.resolve(import.meta.dirname, "..", ".cache", "codex")).catch(() => [])).length;
console.log(`unique Luna reviews needed: ${all.size}; Codex calls cached so far: ${cachedCalls}`);
