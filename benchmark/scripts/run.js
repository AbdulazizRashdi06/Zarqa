#!/usr/bin/env node
// Runs the five matching systems on a dataset at several database sizes and scores them.
//
//   node scripts/run.js --offline --data data/sample                  free dry run + cost estimate
//   node --env-file=.env scripts/run.js --data data/campus --sizes 10,100
//   node --env-file=.env scripts/run.js --data data/campus --systems jev,jev-photo --max-queries 20
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { MODELS, RUNTIME, SYSTEMS } from "../config.js";
import { codexInstalled, embeddingModelName, embeddingProvider, lunaProvider } from "../src/openai.js";
import { buildDatabase, loadDataset } from "../src/dataset.js";
import { embedReports } from "../src/embeddings.js";
import { makeFiller, placesFrom } from "../src/filler.js";
import { callCost } from "../src/ledger.js";
import { mcnemar, score } from "../src/metrics.js";
import { extractPhotoAttributes } from "../src/photoAttributes.js";
import { PIPELINES } from "../src/systems.js";
import { buildAliasIndex } from "../src/text.js";

const { values: args } = parseArgs({
  options: {
    data: { type: "string", default: "data/sample" },
    systems: { type: "string", default: SYSTEMS.join(",") },
    sizes: { type: "string", default: "10,100,1000,10000" },
    filler: { type: "string" }, // optional JSON file; otherwise generated in memory
    "filler-days": { type: "string", default: "365" },
    "max-queries": { type: "string" }, // cap real reports processed per size (cost control)
    parallel: { type: "string", default: "4" }, // reports processed at once
    "review-concurrency": { type: "string" }, // reviews per report run at once
    weights: { type: "string" }, // fitted Jev weights from scripts/calibrate.js
    offline: { type: "boolean", default: false },
    "no-cache": { type: "boolean", default: false },
    yes: { type: "boolean", default: false }, // skip the cost confirmation for live runs
  },
});

const systems = args.systems.split(",").map((s) => s.trim());
for (const s of systems) if (!PIPELINES[s]) throw new Error(`Unknown system "${s}". Options: ${SYSTEMS.join(", ")}`);
const sizes = args.sizes.split(",").map(Number);
const dataDir = path.resolve(args.data);
const dataset = await loadDataset(dataDir);

const ctx = {
  offline: args.offline,
  useCache: !args["no-cache"],
  aliasIndex: buildAliasIndex(dataset.locations),
  dataDir,
  jevWeights: args.weights ? JSON.parse(await readFile(args.weights, "utf8")) : undefined,
};

const latestReal = dataset.reports.reduce((m, r) => Math.max(m, Date.parse(r.createdAt)), 0);
const filler = args.filler
  ? JSON.parse(await readFile(args.filler, "utf8"))
  : makeFiller({ count: Math.max(...sizes), places: placesFrom(dataset), endIso: new Date(latestReal).toISOString(), days: Number(args["filler-days"]) });

if (!ctx.offline) {
  const env = process.env;
  const hasLuna = env.OPENAI_API_KEY || env.OPENAI_BASE_URL || env.OPENROUTER_API_KEY || codexInstalled();
  if (args["review-concurrency"]) {
    RUNTIME.reviewConcurrency = Number(args["review-concurrency"]);
  } else if (lunaProvider() === "codex") {
    // Each Codex call is a separate CLI process: keep the number running at once modest
    // unless asked otherwise (--parallel and --review-concurrency).
    RUNTIME.reviewConcurrency = Math.min(RUNTIME.reviewConcurrency, 4);
    if (!process.argv.includes("--parallel")) args.parallel = "2";
  }
  console.log(`Luna via ${lunaProvider()} (${env.LUNA_MODEL || MODELS.luna}), embeddings via ${embeddingProvider()} (${embeddingModelName()}), Jev via ${env.TYPESAFE_API_KEY ? "TypeSafe" : env.OPENROUTER_API_KEY ? "OpenRouter" : "—"}`);
  const hasJev = env.TYPESAFE_API_KEY || env.OPENROUTER_API_KEY;
  const missing = [!hasLuna && "OPENROUTER_API_KEY (or OPENAI_API_KEY)", systems.some((s) => s.startsWith("jev")) && !hasJev && "OPENROUTER_API_KEY (or TYPESAFE_API_KEY) for Jev"].filter(Boolean);
  if (missing.length) {
    console.error(`Missing in benchmark/.env: ${missing.join(", ")}. See .env.example, or run with --offline.`);
    process.exit(1);
  }
}

if (!ctx.offline && !args.yes) {
  console.log(
    `Live run: ${systems.length} systems × sizes ${sizes.join("/")} on ${dataset.reports.length} real reports.\n` +
      `Run the same command with --offline first to see the cost estimate, then add --yes to confirm.`,
  );
  process.exit(1);
}

const outDir = path.resolve("results", new Date().toISOString().replace(/[:.]/g, "-") + (ctx.offline ? "-offline" : ""));
await mkdir(outDir, { recursive: true });
const summary = { mode: ctx.offline ? "offline-estimate" : "live", systems, sizes, dataset: args.data, results: {} };
const detail = [];

for (const size of sizes) {
  const db = buildDatabase(dataset, filler, size);
  let queries = [...db.queries].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (args["max-queries"]) queries = queries.slice(0, Number(args["max-queries"]));

  // Setup = indexing the database before the measured reports arrive. Reported separately.
  const setup = { embedding: await embedReports(db.reports, "text", ctx), visionUsd: 0 };
  if (systems.some((s) => s.startsWith("jev-"))) {
    const calls = await mapLimit(db.reports, Number(args.parallel), (r) => extractPhotoAttributes(r, ctx));
    setup.visionUsd = calls.filter(Boolean).reduce((s, c) => s + callCost(c), 0);
    setup.photoEmbedding = await embedReports(db.reports, "photo", ctx);
  }

  summary.results[size] = { dbReports: db.reports.length, realQueries: queries.length, setup, systems: {} };
  console.log(`\n== database size ${size}: ${db.reports.length} reports, ${queries.length} measured, ${db.pairs.filter((p) => p.isMatch).length} true pairs ==`);

  const scored = {};
  for (const system of systems) {
    const runs = await mapLimit(queries, Number(args.parallel), async (q) => ({
      queryId: q.id,
      result: await PIPELINES[system](q, db, ctx),
    }));
    scored[system] = score(db, runs);
    for (const r of runs) detail.push({ size, system, queryId: r.queryId, ...r.result, stages: undefined });
    const { perPair, ...s } = scored[system];
    summary.results[size].systems[system] = s;
    summary.results[size].systems[system].missedPairs = perPair.filter((p) => !p.hit).map((p) => ({ lostId: p.lostId, foundId: p.foundId, retrieved: p.retrieved, shortlisted: p.shortlisted }));
    if (scored.luna && system !== "luna") summary.results[size].systems[system].vsLuna = mcnemar(scored.luna.perPair, scored[system].perPair);
    printRow(system, s);
  }
}

await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outDir, "runs.jsonl"), detail.map((d) => JSON.stringify(d)).join("\n"));
console.log(`\nSaved ${path.relative(process.cwd(), outDir)}${ctx.offline ? "  (offline: costs/latency are estimates; quality numbers are meaningless)" : ""}`);

function printRow(system, s) {
  const p = (v) => (v == null ? "  –  " : (v * 100).toFixed(0).padStart(3) + "%");
  console.log(
    `${system.padEnd(12)} recall ${p(s.recall)} (retrieved ${p(s.retrievalRecall)}) · precision ${p(s.precision)} · ` +
      `hard-neg hits ${s.hardNegativeMatches}/${s.hardNegatives} · $${s.costPerReportUsd.toFixed(5)}/report · ` +
      `p50 ${(s.latencyP50Ms / 1000).toFixed(1)}s p95 ${(s.latencyP95Ms / 1000).toFixed(1)}s`,
  );
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
