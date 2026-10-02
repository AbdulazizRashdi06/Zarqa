import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Disk cache for every paid API call. A rerun of the same benchmark costs nothing,
// and each entry keeps the latency measured when the call was really made.
const ROOT = path.resolve(import.meta.dirname, "..", ".cache");

export const hashKey = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function cached(kind, keyValue, fn, { enabled = true } = {}) {
  const file = path.join(ROOT, kind, hashKey(keyValue) + ".json");
  if (enabled) {
    try {
      return { ...JSON.parse(await readFile(file, "utf8")), fromCache: true };
    } catch {}
  }
  const started = performance.now();
  const result = await fn();
  // A client that measures its own latency (e.g. excluding one-off setup) wins.
  const entry = { latencyMs: Math.round(performance.now() - started), ...result };
  if (enabled) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(entry));
  }
  return { ...entry, fromCache: false };
}
