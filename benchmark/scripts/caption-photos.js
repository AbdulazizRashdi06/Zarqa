#!/usr/bin/env node
// Has the matching model describe each found photo once, so search and the text-only screen have words to work
// with when a finder types "found this" under a photo (decisions.md, 2026-11-16: 6 of 26 missed good matches never
// reached the debate for this reason).
//
//   node scripts/caption-photos.js --data data/independent,data/independent2 --out data/photo-set/luna-captions.json
//
// One gpt-6-luna call per photo file (cached like every other call), keyed by the photo's file name so every set
// that uses the photo shares the description. Photos of ID or bank cards are never in these sets; a report tagged
// card_photo_removed has no photo and is skipped by construction.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { MODELS, RUNTIME } from "../config.js";
import { chatJson } from "../src/openai.js";

const { values: args } = parseArgs({ options: { data: { type: "string" }, out: { type: "string", default: "data/photo-set/luna-captions.json" }, parallel: { type: "string", default: "6" } } });
if (!args.data) throw new Error("--data <set>[,<set>] is required");

export const CAPTION_SYSTEM = `You describe a photo of a found item for a university lost-and-found search. Say only what the photo shows: the kind of object, its colours and material, any brand, name or other text readable on it, and distinctive marks, parts or attachments. One or two plain sentences, at most 40 words. Do not guess who owns it, where it was found or what is inside if that is not visible. If the photo does not show a clear item, say so in a few words.`;
const SCHEMA = { type: "object", additionalProperties: false, required: ["description"], properties: { description: { type: "string" } } };

const photos = new Map(); // file name → absolute path
for (const dir of args.data.split(",")) {
  for (const r of JSON.parse(await readFile(path.resolve(dir, "reports.json"), "utf8"))) {
    if (r.type !== "found") continue;
    for (const ph of r.photos ?? []) photos.set(path.basename(ph), path.resolve(dir, ph));
  }
}
let out = {};
try {
  out = JSON.parse(await readFile(path.resolve(args.out), "utf8"));
} catch {}
const todo = [...photos].filter(([name]) => !out[name]);
console.log(`${photos.size} photos, ${todo.length} to describe`);
let i = 0, failed = 0;
await Promise.all(Array.from({ length: Number(args.parallel) }, async () => {
  while (i < todo.length) {
    const [name, file] = todo[i++];
    try {
      const res = await chatJson({ model: MODELS.luna, system: CAPTION_SYSTEM, text: "Describe the item in the attached photo.", imagePaths: [file], imageDetail: RUNTIME.lunaImageDetail, schemaName: "photo_caption", schema: SCHEMA });
      out[name] = res.parsed.description.trim();
      process.stdout.write(".");
    } catch (err) {
      failed++;
      process.stdout.write("x");
    }
  }
}));
await writeFile(path.resolve(args.out), JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 1));
console.log(`\n${Object.keys(out).length} descriptions in ${args.out}${failed ? ` · ${failed} failed` : ""}`);
