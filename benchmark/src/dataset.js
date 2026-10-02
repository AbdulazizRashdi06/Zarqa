import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A dataset folder holds:
 *   reports.json   [{id, type: "lost"|"found", title, category, description, location, campusZone,
 *                    eventDate, createdAt, photos: ["photos/x.jpg"], status?, hidden?}]
 *   pairs.json     [{lostId, foundId, isMatch, difficulty?, tags?: ["photo_needed", "hard_negative", ...]}]
 *   locations.json {"Canonical name": ["alias", ...]}   (optional)
 * Any lost/found pair not listed with isMatch: true counts as a non-match.
 */
export async function loadDataset(dir) {
  const read = async (f, fallback) => {
    try {
      return JSON.parse(await readFile(path.join(dir, f), "utf8"));
    } catch (err) {
      if (fallback !== undefined && err.code === "ENOENT") return fallback;
      throw new Error(`${path.join(dir, f)}: ${err.message}`);
    }
  };
  const reports = await read("reports.json");
  const pairs = await read("pairs.json", []);
  const locations = await read("locations.json", {});
  const ids = new Set(reports.map((r) => r.id));
  for (const p of pairs) {
    if (!ids.has(p.lostId) || !ids.has(p.foundId)) throw new Error(`pairs.json references a missing report: ${p.lostId} / ${p.foundId}`);
  }
  for (const r of reports) {
    if (!["lost", "found"].includes(r.type)) throw new Error(`Report ${r.id} has type "${r.type}"; expected lost or found.`);
    if (Number.isNaN(Date.parse(r.createdAt))) throw new Error(`Report ${r.id} has no valid createdAt.`);
    r.source ??= "real";
  }
  return { reports, pairs, locations };
}

/**
 * Picks the real reports for a database of `size`: whole gold pairs first (so every
 * included positive can be found), then other real reports, then filler up to `size`.
 */
export function buildDatabase(dataset, filler, size) {
  const byId = new Map(dataset.reports.map((r) => [r.id, r]));
  const chosen = new Map();
  for (const p of dataset.pairs.filter((p) => p.isMatch)) {
    if (chosen.size + 2 > size) break;
    for (const id of [p.lostId, p.foundId]) chosen.set(id, byId.get(id));
  }
  for (const p of dataset.pairs.filter((p) => !p.isMatch)) {
    for (const id of [p.lostId, p.foundId]) if (chosen.size < size) chosen.set(id, byId.get(id));
  }
  for (const r of dataset.reports) if (chosen.size < size) chosen.set(r.id, r);

  const real = [...chosen.values()];
  const need = Math.max(0, size - real.length);
  if (need > filler.length) throw new Error(`Need ${need} filler reports for size ${size}, have ${filler.length}. Generate more with npm run filler.`);
  const reports = [...real, ...filler.slice(0, need)];
  const inDb = new Set(reports.map((r) => r.id));
  const pairs = dataset.pairs.filter((p) => inDb.has(p.lostId) && inDb.has(p.foundId));
  return { size, reports, pairs, queries: real };
}
