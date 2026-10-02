// Does a true pair reach the review stage? Measures retrieval and shortlist recall (the ceiling on
// luna-debate's recall) for: embedding model × report shape ("two" = title + description as benchmarked,
// "one" = a single free-text box as in the app). No Luna/Jev calls: only embeddings, cached as usual.
//
//   EMBEDDING_PROVIDER=local node --env-file=.env scripts/shortlist-experiment.js --shape two
//   node --env-file=.env scripts/shortlist-experiment.js --shape one        (API embeddings)
import { parseArgs } from "node:util";
import path from "node:path";
import { CURRENT, PROPOSED } from "../config.js";
import { buildDatabase, loadDataset } from "../src/dataset.js";
import { cosine } from "../src/embeddings.js";
import { makeFiller, placesFrom } from "../src/filler.js";
import { embed, embeddingModelName } from "../src/openai.js";
import { preliminaryScore } from "../src/prescore.js";
import { buildAliasIndex, counterpartType, daysBetween, embeddingText, expandedLocationTokens, overlap, tokens } from "../src/text.js";

const { values: args } = parseArgs({
  options: {
    data: { type: "string", default: "data/campus" },
    sizes: { type: "string", default: "100,1000" },
    shape: { type: "string", default: "two" },
    thresholds: { type: "string", default: "0.40,0.45,0.50,0.56" },
  },
});

// Same keyword map as server/Zarqa.Api/Reports/Categories.cs (first hit wins).
const KEYWORDS = [
  ["Wallets & cards", ["wallet", "purse", "card", "cards", "id", "ids", "license", "licence", "passport", "bank", "visa", "mastercard", "permit"]],
  ["Keys", ["key", "keys", "keychain", "keyring", "car key"]],
  ["Electronics", ["tech", "electronics", "electronic", "phone", "iphone", "samsung", "galaxy", "laptop", "macbook", "notebook pc", "charger", "cable", "earbuds", "airpods", "buds", "headphones", "headset", "earphones", "powerbank", "power bank", "ipad", "tablet", "remote", "usb", "flash", "drive", "mouse", "keyboard", "speaker", "camera", "jbl", "beats"]],
  ["Bottles", ["bottle", "bottles", "flask", "tumbler", "thermos", "cup", "mug"]],
  ["Bags", ["bag", "bags", "backpack", "handbag", "tote", "pouch", "satchel", "suitcase", "luggage"]],
  ["Books", ["book", "books", "textbook", "novel", "quran", "mushaf"]],
  ["Stationery", ["stationery", "pen", "pens", "pencil", "notebook", "notes", "calculator", "casio fx", "ruler", "highlighter", "folder", "binder"]],
  ["Clothing", ["clothes", "clothing", "jacket", "hoodie", "sweater", "shirt", "tshirt", "t-shirt", "scarf", "shayla", "hijab", "abaya", "dishdasha", "kumma", "massar", "cap", "hat", "shoe", "shoes", "sandals", "slippers", "sneakers", "coat", "jumper"]],
  ["Accessories", ["accessories", "accessory", "glasses", "eyeglasses", "sunglasses", "spectacles", "watch", "ring", "bracelet", "necklace", "earring", "earrings", "jewelry", "jewellery", "umbrella", "beads", "masbaha", "tasbih", "misbaha"]],
  ["Sports", ["sports", "sport", "ball", "football", "racket", "racquet", "paddle", "gym", "padel", "shuttlecock"]],
  ["Other", ["other", "misc", "miscellaneous"]],
];
function normalizeCategory(text) {
  const joined = ` ${String(text || "").toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean).join(" ")} `;
  for (const [cat, words] of KEYWORDS) if (words.some((w) => joined.includes(` ${w} `))) return cat;
  return "";
}

/** The app's one-box shape: one text (what a student would type), category from keywords, no title. */
const toOne = (r) => {
  const text = `${r.title}. ${r.description || ""}`.trim();
  return { ...r, title: "", description: text, category: normalizeCategory(text) };
};

/** Prescore for one-box reports: with no titles, the whole 0.24 text weight goes on the one text. */
function prescoreOne(a, b, va, vb, aliasIndex) {
  const cos = cosine(va, vb);
  let category = 0;
  if (a.category && b.category) category = a.category === b.category ? 0.05 : -0.02;
  const text = 0.24 * overlap(tokens(a.description), tokens(b.description));
  const location = 0.08 * overlap(expandedLocationTokens(a, aliasIndex), expandedLocationTokens(b, aliasIndex));
  const days = daysBetween(a.eventDate, b.eventDate);
  const date = days == null ? 0 : days <= 1 ? 0.04 : days <= 7 ? 0.02 : 0;
  return Math.min(1, Math.max(0, cos + category + text + location + date));
}

const dataDir = path.resolve(args.data);
const dataset = await loadDataset(dataDir);
const aliasIndex = buildAliasIndex(dataset.locations);
const sizes = args.sizes.split(",").map(Number);
const thresholds = args.thresholds.split(",").map(Number);
const latestReal = dataset.reports.reduce((m, r) => Math.max(m, Date.parse(r.createdAt)), 0);
const filler = makeFiller({ count: Math.max(...sizes), places: placesFrom(dataset), endIso: new Date(latestReal).toISOString(), days: 365 });

console.log(`shape=${args.shape} embeddings=${embeddingModelName()}`);
for (const size of sizes) {
  const db = buildDatabase(dataset, filler, size);
  const reports = db.reports.map((r) => (args.shape === "one" ? toOne(r) : { ...r }));
  const texts = reports.map((r) => embeddingText(r, aliasIndex));
  const vectors = [];
  for (let i = 0; i < texts.length; i += 500) vectors.push(...(await embed(texts.slice(i, i + 500))).vectors);
  const vec = new Map(reports.map((r, i) => [r.id, vectors[i]]));
  const byId = new Map(reports.map((r) => [r.id, r]));
  const score = (a, b) =>
    args.shape === "one" ? prescoreOne(a, b, vec.get(a.id), vec.get(b.id), aliasIndex) : preliminaryScore(a, b, vec.get(a.id), vec.get(b.id), aliasIndex).score;

  // The later-created report of a pair is processed while the earlier one exists (as in the benchmark).
  const truePairs = db.pairs.filter((p) => p.isMatch);
  let retrieved = 0;
  const shortlisted = Object.fromEntries(thresholds.map((t) => [t, 0]));
  const sizesAt = Object.fromEntries(thresholds.map((t) => [t, []]));
  for (const q of db.queries.map((r) => byId.get(r.id))) {
    const pool = reports.filter((r) => r.type === counterpartType(q.type) && Date.parse(r.createdAt) < Date.parse(q.createdAt));
    const top = pool.map((r) => ({ r, s: cosine(vec.get(q.id), vec.get(r.id)) })).sort((x, y) => y.s - x.s).slice(0, PROPOSED.vectorLimit);
    const scored = top.map(({ r }) => ({ r, p: score(q, r) })).sort((x, y) => y.p - x.p);
    for (const t of thresholds) sizesAt[t].push(Math.min(CURRENT.maxCandidates, scored.filter((x) => x.p >= t).length));
    for (const pair of truePairs) {
      const other = q.id === pair.lostId ? pair.foundId : q.id === pair.foundId ? pair.lostId : null;
      if (!other) continue;
      if (top.some((x) => x.r.id === other)) retrieved++;
      for (const t of thresholds) if (scored.filter((x) => x.p >= t).slice(0, CURRENT.maxCandidates).some((x) => x.r.id === other)) shortlisted[t]++;
    }
  }
  const n = truePairs.length;
  const pct = (k) => `${Math.round((100 * k) / n)}% (${k}/${n})`;
  console.log(`\nsize ${size}: retrieval top-25 recall ${pct(retrieved)}`);
  for (const t of thresholds) {
    const avg = sizesAt[t].reduce((s, x) => s + x, 0) / sizesAt[t].length;
    console.log(`  shortlist ≥ ${t.toFixed(2)}: recall ${pct(shortlisted[t])}, avg ${avg.toFixed(1)} reviews per report`);
  }
}
