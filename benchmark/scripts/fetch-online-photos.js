#!/usr/bin/env node
// Collects openly licensed photos of commonly lost items for photo tests.
//
//   node scripts/fetch-online-photos.js search     Openverse search → data/online/candidates/ (+ candidates.json)
//   node scripts/fetch-online-photos.js restore    re-download the kept photos listed in data/online/manifest.json
//
// Source: Openverse (CC0, public domain, CC BY, CC BY-SA only), files from Flickr. The photos stay out of
// git; data/online/manifest.json records each kept photo's page, author and licence, which is what the
// licences ask for when a photo is shown or shared.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "data", "online");
const UA = "lost-found-dataset-builder/1.0 (non-commercial research)";
const ITEMS = {
  wallet: "leather wallet", "car-key": "car key fob", keys: "bunch of keys keyring", phone: "smartphone on table", earbuds: "wireless earbuds case",
  headphones: "headphones", bottle: "metal water bottle", backpack: "backpack", charger: "laptop charger", "usb-stick": "usb flash drive",
  "power-bank": "power bank", glasses: "eyeglasses", sunglasses: "sunglasses", watch: "wrist watch", umbrella: "folding umbrella",
  calculator: "scientific calculator", notebook: "paper notebook", "pencil-case": "pencil case", hoodie: "hoodie", jacket: "jacket on chair",
  scarf: "scarf", ring: "ring jewellery", "prayer-beads": "prayer beads", textbook: "textbook", laptop: "laptop computer", "tote-bag": "tote bag",
  cap: "baseball cap", sneakers: "sneakers shoes",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url, file) {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok || !(res.headers.get("content-type") || "").startsWith("image/")) throw new Error(`HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

// A second wording per kind: one search rarely gives enough photos of a single item on its own.
const MORE = {
  wallet: "wallet on table", "car-key": "car keys", keys: "house keys", phone: "mobile phone", earbuds: "earbuds", headphones: "headphones on desk",
  bottle: "water bottle", backpack: "backpack on floor", charger: "phone charger", "usb-stick": "usb stick", "power-bank": "portable charger battery",
  glasses: "glasses on table", sunglasses: "sunglasses on table", watch: "wristwatch", umbrella: "umbrella", calculator: "calculator",
  notebook: "notebook", "pencil-case": "pencil pouch", hoodie: "hooded sweatshirt", jacket: "jacket", scarf: "scarf on chair", ring: "silver ring",
  "prayer-beads": "tasbih", textbook: "book on desk", laptop: "laptop on desk", "tote-bag": "canvas tote bag", cap: "cap hat", sneakers: "pair of sneakers",
};

async function search(query, page) {
  const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q: query, license: "cc0,pdm,by,by-sa", source: "flickr", page_size: "20", page: String(page), mature: "false" })}`;
  // Openverse searches time out now and then: try a few times before giving up on a query.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA } }).catch(() => null);
    if (res?.ok) return (await res.json()).results;
    await sleep(15_000 * (attempt + 1));
  }
  return null;
}

if (process.argv[2] === "search") {
  // Adds to what is already there: run it again to fetch what an earlier run missed.
  let all = [];
  try { all = JSON.parse(await readFile(path.join(ROOT, "candidates.json"), "utf8")); } catch {}
  const seen = new Set(all.map((c) => c.id));
  for (const kind of Object.keys(ITEMS)) {
    const dir = path.join(ROOT, "candidates", kind);
    await mkdir(dir, { recursive: true });
    const authors = new Set(all.filter((c) => c.kind === kind).map((c) => c.author));
    let got = 0;
    for (const [query, page] of [[ITEMS[kind], 1], [MORE[kind], 1], [ITEMS[kind], 2]]) {
      if (all.filter((c) => c.kind === kind).length >= Number(process.env.PER_KIND || 30)) break;
      const results = await search(query, page);
      if (!results) { console.log(`${kind}: "${query}" page ${page} timed out`); continue; }
      for (const r of results) {
        if (seen.has(r.id) || authors.has(r.creator) || (r.width && r.width < 500)) continue; // one photo per photographer, no tiny files
        const file = path.join(dir, `${r.id}.jpg`);
        try { await download(r.url, file); } catch { continue; }
        seen.add(r.id);
        authors.add(r.creator);
        all.push({ kind, id: r.id, file: path.relative(ROOT, file), title: r.title, author: r.creator, licence: `${r.license} ${r.license_version || ""}`.trim(), licenceUrl: r.license_url, page: r.foreign_landing_url, source: r.url });
        got++;
      }
      await writeFile(path.join(ROOT, "candidates.json"), JSON.stringify(all, null, 1));
      await sleep(4000); // anonymous Openverse use is rate limited
    }
    console.log(`${kind}: +${got}, ${all.filter((c) => c.kind === kind).length} in all`);
  }
  console.log(`${all.length} candidates in ${path.relative(process.cwd(), ROOT)}`);
} else if (process.argv[2] === "restore") {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
  await mkdir(path.join(ROOT, "photos"), { recursive: true });
  let ok = 0;
  for (const p of manifest) { try { await download(p.source, path.join(ROOT, p.file)); ok++; } catch (e) { console.log(`${p.file}: ${e.message}`); } }
  console.log(`${ok}/${manifest.length} photos restored`);
} else console.log("usage: fetch-online-photos.js search | restore");
