#!/usr/bin/env node
// Edge-case run: follows every labelled pair of an edge dataset through each stage of the app's
// matching (vector top 25 → prescore shortlist ≥ 0.56, top 10 → two Luna advocates → Terra judge)
// and says at which stage it was lost.
//
//   node scripts/edge.js --data data/edge/round1 --offline          stages before the models only
//   OPENAI_BASE_URL=http://127.0.0.1:8090/v1 EMBEDDING_PROVIDER=local \
//     node scripts/edge.js --data data/edge/round1 --yes            live, through the Codex gateway
//
// Every labelled pair is reviewed by the models even when retrieval or the shortlist would have
// dropped it, so a miss can be blamed on the right stage. "shown" needs all three stages.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { CURRENT, PROPOSED } from "../config.js";
import { loadDataset } from "../src/dataset.js";
import { cosine, embedReports } from "../src/embeddings.js";
import { makeFiller, placesFrom } from "../src/filler.js";
import { toOne } from "../src/oneText.js";
import { embeddingModelName } from "../src/openai.js";
import { preliminaryScore } from "../src/prescore.js";
import { debateReview } from "../src/reviewers/debate.js";
import { buildAliasIndex } from "../src/text.js";

const { values: args } = parseArgs({
  options: {
    data: { type: "string" },
    extra: { type: "string", default: "data/campus" }, // real reports added as distractors
    filler: { type: "string", default: "300" }, // generated distractors
    judge: { type: "string", default: "terra" },
    parallel: { type: "string", default: "4" }, // pairs reviewed at once
    samples: { type: "string", default: "1" }, // model runs per pair (run-to-run variation)
    only: { type: "string" }, // comma-separated lens names
    "vector-limit": { type: "string" }, // try another retrieval size (the app: 25)
    "max-candidates": { type: "string" }, // try another shortlist size (the app: 10)
    "shortlist-threshold": { type: "string" }, // try another prescore floor (the app: 0.56)
    name: { type: "string" },
    offline: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});
if (!args.data) throw new Error("--data <edge dataset folder> is required");
if (!args.offline && !args.yes) {
  console.log("Live run: add --yes (each labelled pair costs three model calls per sample), or --offline for the stages before the models.");
  process.exit(1);
}

const dataDir = path.resolve(args.data);
const edge = await loadDataset(dataDir);
const extra = args.extra ? await loadDataset(path.resolve(args.extra)) : { reports: [], locations: {} };
const locations = { ...extra.locations, ...edge.locations };
const aliasIndex = buildAliasIndex(locations);
const ctx = { offline: false, useCache: true, aliasIndex, dataDir };

const latest = edge.reports.reduce((m, r) => Math.max(m, Date.parse(r.createdAt)), 0);
const filler = makeFiller({ count: Number(args.filler), places: placesFrom({ reports: extra.reports.length ? extra.reports : edge.reports }), endIso: new Date(latest).toISOString(), days: 90 });
const all = [...edge.reports, ...extra.reports.map((r) => ({ ...r, id: `campus-${r.id}`, photos: [] })), ...filler].map(toOne);
const byId = new Map(all.map((r) => [r.id, r]));
const setup = await embedReports(all, "text", ctx);

if (args["vector-limit"]) PROPOSED.vectorLimit = Number(args["vector-limit"]);
if (args["max-candidates"]) CURRENT.maxCandidates = Number(args["max-candidates"]);
const shortlistThreshold = args["shortlist-threshold"] ? Number(args["shortlist-threshold"]) : Math.max(CURRENT.shortlistFloor, CURRENT.matchThreshold - CURRENT.shortlistMargin);

const reviewsPerReport = new Map(); // how many pairs each traced report would send to the models
/** What `query`'s own matching run would do with `target`: rank in the vector pool, prescore, rank in the shortlist. */
function trace(query, target) {
  const pool = all
    .filter((r) => r.type === target.type && r.id !== query.id)
    .map((r) => ({ r, cos: cosine(query.vectors.text, r.vectors.text) }))
    .sort((a, b) => b.cos - a.cos);
  const vectorRank = pool.findIndex((x) => x.r.id === target.id) + 1;
  const prelim = preliminaryScore(query, target, query.vectors.text, target.vectors.text, aliasIndex);
  const list = pool
    .slice(0, PROPOSED.vectorLimit)
    .map((x) => ({ id: x.r.id, score: preliminaryScore(query, x.r, query.vectors.text, x.r.vectors.text, aliasIndex).score }))
    .filter((x) => x.score >= shortlistThreshold)
    .sort((a, b) => b.score - a.score);
  const shortlistRank = list.findIndex((x) => x.id === target.id) + 1;
  reviewsPerReport.set(query.id, Math.min(list.length, CURRENT.maxCandidates));
  return {
    vectorRank,
    retrieved: vectorRank > 0 && vectorRank <= PROPOSED.vectorLimit,
    prescore: round(prelim.score),
    cosine: round(prelim.cosine),
    parts: prelim.parts,
    shortlistRank,
    shortlisted: shortlistRank > 0 && shortlistRank <= CURRENT.maxCandidates,
  };
}

const lenses = args.only ? new Set(args.only.split(",")) : null;
const pairs = edge.pairs.filter((p) => !lenses || lenses.has(p.lens));
const samples = Number(args.samples);

const rows = await mapLimit(pairs, Number(args.parallel), async (p) => {
  const lost = byId.get(p.lostId), found = byId.get(p.foundId);
  // The pair is first seen when the later of the two reports is posted; that report's run decides.
  const lostLater = Date.parse(lost.createdAt) >= Date.parse(found.createdAt);
  const fromLost = trace(lost, found), fromFound = trace(found, lost);
  const main = lostLater ? fromLost : fromFound;
  const row = { ...p, lostText: lost.description, foundText: found.description, lostPlace: lost.location, foundPlace: found.location, lostDate: lost.eventDate, foundDate: found.eventDate, decidingSide: lostLater ? "lost" : "found", ...main, otherSide: lostLater ? fromFound : fromLost };
  if (args.offline) return row;
  row.scores = [];
  for (let i = 0; i < samples; i++) {
    const r = await debateReview(lost, found, main, { ...ctx, cacheSalt: i ? `sample-${i}` : undefined }, { judge: args.judge });
    if (r.failed) {
      row.error = r.error;
      break;
    }
    row.scores.push(round(r.finalScore));
    if (i === 0) Object.assign(row, { finalScore: round(r.finalScore), sameItem: round(r.features.sameItem), overall: round(r.features.overall), stronger: r.features.stronger, timing: r.features.timing, debate: r.explanation });
  }
  if (row.finalScore != null) {
    row.modelMatch = row.finalScore >= PROPOSED.debateThreshold;
    row.shown = row.retrieved && row.shortlisted && row.modelMatch;
    row.lostAt = row.shown ? null : !row.retrieved ? "retrieval" : !row.shortlisted ? "shortlist" : "review";
  }
  process.stdout.write(row.error ? "x" : ".");
  return row;
});
console.log();

// ---------------- report ----------------
const KINDS = [
  ["must", "same item, nothing or only small things disagree → must be shown"],
  ["stretch", "same item, but the reports contradict on a hard fact (a human mistake)"],
  ["trap", "different items with a concrete contradiction → must not be shown"],
  ["trap-soft", "different items, only a soft disagreement"],
  ["lookalike", "different items the reports cannot tell apart (a suggestion is acceptable)"],
];
const summary = { data: args.data, mode: args.offline ? "stages-only" : "live", judge: args.judge, embeddings: embeddingModelName(), database: all.length, pairs: rows.length, threshold: PROPOSED.debateThreshold, byKind: {}, byLens: {} };
const tally = (list) => {
  const t = { n: list.length, retrieved: count(list, (r) => r.retrieved), shortlisted: count(list, (r) => r.retrieved && r.shortlisted) };
  if (!args.offline) Object.assign(t, { errors: count(list, (r) => r.error), modelMatch: count(list, (r) => r.modelMatch), shown: count(list, (r) => r.shown) });
  return t;
};
for (const [kind] of KINDS) summary.byKind[kind] = tally(rows.filter((r) => r.kind === kind));
for (const lens of [...new Set(rows.map((r) => r.lens))]) {
  summary.byLens[lens] = Object.fromEntries(KINDS.map(([kind]) => [kind, tally(rows.filter((r) => r.lens === lens && r.kind === kind))]));
}

const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : "–");
summary.settings = { vectorLimit: PROPOSED.vectorLimit, maxCandidates: CURRENT.maxCandidates, shortlistThreshold };
summary.reviewsPerReport = round([...reviewsPerReport.values()].reduce((s, v) => s + v, 0) / (reviewsPerReport.size || 1));
console.log(`\nvector top ${PROPOSED.vectorLimit} · shortlist ≥ ${shortlistThreshold}, top ${CURRENT.maxCandidates} · ${summary.reviewsPerReport} reviews per report on average`);
console.log(`${rows.length} labelled pairs in a database of ${all.length} reports · embeddings ${summary.embeddings} · cut-off ${PROPOSED.debateThreshold}`);
for (const [kind, what] of KINDS) {
  const t = summary.byKind[kind];
  if (!t.n) continue;
  console.log(`\n${kind}: ${what}`);
  console.log(`  retrieved ${pct(t.retrieved, t.n)} · shortlisted ${pct(t.shortlisted, t.n)}` + (args.offline ? "" : ` · models say match ${pct(t.modelMatch, t.n - t.errors)} · SHOWN ${pct(t.shown, t.n - t.errors)}${t.errors ? ` · ${t.errors} failed calls` : ""}`));
  for (const [lens, k] of Object.entries(summary.byLens)) {
    const x = k[kind];
    if (x.n) console.log(`    ${lens.padEnd(26)} retrieved ${String(x.retrieved).padStart(2)}/${x.n}  shortlisted ${String(x.shortlisted).padStart(2)}/${x.n}` + (args.offline ? "" : `  models ${String(x.modelMatch).padStart(2)}/${x.n}  shown ${String(x.shown).padStart(2)}/${x.n}`));
  }
}

const outDir = path.resolve("results", `edge-${args.name || new Date().toISOString().replace(/[:.]/g, "-")}`);
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outDir, "pairs.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n"));
console.log(`\nSaved ${path.relative(process.cwd(), outDir)} (embedding setup: ${setup.calls} calls)`);

function count(list, fn) {
  return list.filter(fn).length;
}
function round(v) {
  return Math.round(v * 1000) / 1000;
}
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
