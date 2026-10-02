// Every number the benchmark depends on lives here, so runs are comparable.

export const MODELS = {
  embedding: "text-embedding-3-small",
  luna: "gpt-6-luna",
  jev: "jev-1.13.0", // pinned: jev-latest moves silently and would shift thresholds
  jevOpenRouter: "typesafe/jev-1.13", // same model through OpenRouter's decisions endpoint
};
// A proxy (e.g. a local Codex auth tunnel) may expose Luna under another model name.
if (process.env.LUNA_MODEL) MODELS.luna = process.env.LUNA_MODEL;
if (process.env.EMBEDDING_MODEL) MODELS.embedding = process.env.EMBEDDING_MODEL;

// USD per 1M tokens (Sep 2026 public prices). Firestore reads priced per read.
export const PRICES = {
  embeddingInput: 0.02,
  lunaInput: 0.10,
  lunaCachedInput: 0.01,
  lunaOutput: 0.50,
  jevInput: 0.042,
  jevOutput: 0,
  firestoreRead: 0.06 / 100_000,
};

// Mirrors the current processReport defaults.
export const CURRENT = {
  matchThreshold: 0.72,
  shortlistFloor: 0.55,
  shortlistMargin: 0.16, // shortlist = max(floor, threshold - margin) = 0.56
  maxCandidates: 10,
  poolLimit: 200, // newest N counterparts loaded
  eligibleStatuses: ["open", "matched", "in_chat"],
  photosPerReport: 2,
};

export const PROPOSED = {
  vectorLimit: 25, // findNearest limit
  shortlistThreshold: 0.45,
  maxCandidates: 10,
  matchThreshold: 0.72,
  maxDescriptionChars: 500,
  // Pairs whose Jev score lands here (or whose confidence is low) go to Luna in the cascade.
  cascadeBand: [0.62, 0.80],
  cascadeMinConfidence: 0.5,
  // A found item can't have been found more than this many days before it was lost.
  dateToleranceDays: 1,
  // luna-debate: show a match when 0.5·same_item + 0.5·overall >= this. Was 0.60; raised to 0.65
  // on 2026-10-01 after reviewing the size-1,000 false matches (all scored 0.60–0.66), so the
  // 0.65 results on the campus set are partly tuned on that set.
  debateThreshold: 0.65,
};

export const RUNTIME = {
  reviewConcurrency: 10, // reviews for one report run in parallel, like Promise.all
  lunaImageDetail: "low", // "low" | "high" | "auto" — set to what production uses
  requestTimeoutMs: 60_000,
};

// Firestore time can't be measured offline, so it is modelled. Replace with numbers
// measured against your project (emulator timings are not representative).
// "load" = query returning full docs with 1536-float vectors (~12 KB each).
export const FIRESTORE_LATENCY = {
  loadBaseMs: 80,
  loadPerDocMs: 1.5,
  vectorSearchBaseMs: 150,
  vectorSearchPerResultMs: 1,
};

// --offline runs price every call it would have made with these assumptions,
// so a dry run prints a cost estimate before any real money is spent.
const IMAGE_TOKENS = { low: 85, high: 765, auto: 765 };
export const OFFLINE_ESTIMATE = {
  embedding: { inputTokens: 150, latencyMs: 300 },
  luna: { inputTokens: 900 + 4 * IMAGE_TOKENS[RUNTIME.lunaImageDetail], outputTokens: 250, latencyMs: 2500 },
  vision: { inputTokens: 300 + 2 * IMAGE_TOKENS[RUNTIME.lunaImageDetail], outputTokens: 120, latencyMs: 1500 },
  jev: { inputTokens: 750, outputTokens: 0, latencyMs: 150 },
};

export const SYSTEMS = ["luna", "luna-vector", "jev", "jev-photo", "jev-cascade", "luna-debate"];
