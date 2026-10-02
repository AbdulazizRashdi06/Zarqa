import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const memo = new Map();

/** Data URLs for a report's first `max` photos. Paths are relative to the dataset folder. */
export async function photoDataUrls(report, dataDir, max) {
  const out = [];
  for (const p of (report.photos || []).slice(0, max)) {
    const file = path.resolve(dataDir, p);
    if (!memo.has(file)) {
      const mime = MIME[path.extname(file).toLowerCase()] || "image/jpeg";
      memo.set(file, readFile(file).then((b) => `data:${mime};base64,${b.toString("base64")}`).catch(() => null));
    }
    const url = await memo.get(file);
    if (url) out.push(url);
  }
  return out;
}
