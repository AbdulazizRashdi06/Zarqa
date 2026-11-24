import assert from "node:assert/strict";
import test from "node:test";
import { priceOf } from "../src/spend.js";

test("priceOf: Luna and Terra use their own prices, cached input is cheaper", () => {
  assert.equal(priceOf("gpt-6-luna", { inputTokens: 1_000_000, outputTokens: 1_000_000 }).toFixed(2), "0.60");
  assert.equal(priceOf("gpt-6.1-terra", { inputTokens: 1_000_000, outputTokens: 1_000_000 }).toFixed(2), "6.00");
  assert.equal(priceOf("gpt-6.1-terra", { inputTokens: 1_000_000, cachedInputTokens: 1_000_000 }).toFixed(2), "0.05");
  assert.equal(priceOf("text-embedding-3-small", { inputTokens: 1_000_000 }).toFixed(2), "0.02");
});

test("priceOf: an unknown model is priced as the dearest", () => {
  assert.equal(priceOf("something-new", { inputTokens: 1_000_000 }).toFixed(2), "1.00");
});
