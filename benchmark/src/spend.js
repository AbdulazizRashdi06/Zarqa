import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PRICES } from "../config.js";

// A spending stop for calls that go to a paid API. With SPEND_CAP_USD set, every live (uncached) call is priced from
// the token counts the API reports and added to .cache/spend.json, which carries over between runs. Once the total
// reaches the cap the process ends: reviewers catch ordinary errors and carry on, and a cap must not be carried on past.
// Cached answers cost nothing and are not counted. Reset .cache/spend.json only when the owner sets a new budget.
const FILE = path.resolve(import.meta.dirname, "..", ".cache", "spend.json");
const M = 1_000_000;
const cap = () => Number(process.env.SPEND_CAP_USD || 0);

function load() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return { usd: 0, calls: 0, byModel: {} };
  }
}

/** USD for one call. A model this table does not know is priced as the dearest one in it. */
export function priceOf(model, { inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 }) {
  if (/embedding/.test(model)) return (inputTokens * PRICES.embeddingInput) / M;
  const p = /luna/.test(model)
    ? { input: PRICES.lunaInput, cached: PRICES.lunaCachedInput, output: PRICES.lunaOutput }
    : { input: PRICES.terraInput, cached: PRICES.terraCachedInput, output: PRICES.terraOutput };
  return ((inputTokens - cachedInputTokens) * p.input + cachedInputTokens * p.cached + outputTokens * p.output) / M;
}

/** Call before a live request: ends the run when the budget is used up. */
export function checkSpend() {
  if (!cap()) return;
  const s = load();
  if (s.usd >= cap()) {
    console.error(`\nSpending stop: $${s.usd.toFixed(2)} used of the $${cap().toFixed(2)} budget (${s.calls} live calls). No more paid calls.`);
    process.exit(3);
  }
}

/** Call after a live request with the usage it reported. */
export function charge(model, usage) {
  if (!cap()) return;
  const s = load();
  const usd = priceOf(model, usage);
  s.usd += usd;
  s.calls += 1;
  const m = (s.byModel[model] ??= { usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 });
  m.usd += usd;
  m.calls += 1;
  m.inputTokens += usage.inputTokens || 0;
  m.outputTokens += usage.outputTokens || 0;
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 1));
}

export const spendSoFar = load;

// ---- which route answered: the ChatGPT plan (free, shared with production) or the paid API ----
const PLAN_FILE = path.resolve(import.meta.dirname, "..", ".cache", "plan.json");
const RETRY_PLAN_AFTER_MS = 60 * 60 * 1000; // a closed plan is tried again after an hour
const readPlan = () => {
  try {
    return JSON.parse(readFileSync(PLAN_FILE, "utf8"));
  } catch {
    return { closedAt: 0, plan: 0, api: 0 };
  }
};
const writePlan = (s) => {
  mkdirSync(path.dirname(PLAN_FILE), { recursive: true });
  writeFileSync(PLAN_FILE, JSON.stringify(s));
};
export const planOpen = () => Date.now() - readPlan().closedAt > RETRY_PLAN_AFTER_MS;
export function closePlan() {
  const s = readPlan();
  if (Date.now() - s.closedAt > RETRY_PLAN_AFTER_MS) console.error(`\nThe ChatGPT plan reported its usage limit at ${new Date().toISOString()}; calls go to the API for the next hour.`);
  writePlan({ ...s, closedAt: Date.now() });
}
export function countRoute(route) {
  const s = readPlan();
  s[route] = (s[route] || 0) + 1;
  writePlan(s);
}
export const routeCounts = readPlan;
