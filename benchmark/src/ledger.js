import { PRICES } from "../config.js";

/**
 * Cost and latency record for processing one report.
 * Latency is modelled from the recorded per-call latencies (cached calls replay theirs),
 * so reruns report the same numbers. Stages run one after another; calls inside a
 * parallel stage overlap in batches of `concurrency`.
 */
export class Ledger {
  constructor() {
    this.calls = [];
    this.stages = []; // [{name, latencyMs}]
    this.firestoreReads = 0;
  }

  record(call) {
    this.calls.push(call);
    return call;
  }

  stage(name, latencyMs) {
    this.stages.push({ name, latencyMs });
  }

  /** Critical path of a parallel stage: batches of `concurrency`, each as slow as its slowest call. */
  parallelStage(name, latencies, concurrency) {
    let total = 0;
    for (let i = 0; i < latencies.length; i += concurrency) total += Math.max(0, ...latencies.slice(i, i + concurrency));
    this.stage(name, total);
  }

  get costUsd() {
    return this.calls.reduce((s, c) => s + callCost(c), 0) + this.firestoreReads * PRICES.firestoreRead;
  }

  get latencyMs() {
    return this.stages.reduce((s, x) => s + x.latencyMs, 0);
  }

  countBy(kind) {
    return this.calls.filter((c) => c.kind === kind).length;
  }

  tokens() {
    const t = { input: 0, output: 0 };
    for (const c of this.calls) {
      t.input += c.inputTokens || 0;
      t.output += c.outputTokens || 0;
    }
    return t;
  }
}

export function callCost(c) {
  const M = 1_000_000;
  switch (c.kind) {
    case "embedding":
      return ((c.inputTokens || 0) * PRICES.embeddingInput) / M;
    case "luna":
    case "vision": {
      const cachedIn = c.cachedInputTokens || 0;
      return (
        (((c.inputTokens || 0) - cachedIn) * PRICES.lunaInput + cachedIn * PRICES.lunaCachedInput + (c.outputTokens || 0) * PRICES.lunaOutput) / M
      );
    }
    case "jev":
      return ((c.inputTokens || 0) * PRICES.jevInput + (c.outputTokens || 0) * PRICES.jevOutput) / M;
    default:
      return 0;
  }
}
