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

if (process.argv[2] === "search") {
  // Openverse searches time out now and then: a second run fetches only the kinds still missing.
  let all = [];
  try { all = JSON.parse(await readFile(path.join(ROOT, "candidates.json"), "utf8")); } catch {}
  const have = new Set(all.map((c) => c.kind));
  for (const [kind, query] of Object.entries(ITEMS)) {
    if (have.has(kind)) continue;
    const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q: query, license: "cc0,pdm,by,by-sa", source: "flickr", page_size: "14", mature: "false" })}`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) { console.log(`${kind}: search HTTP ${res.status}`); await sleep(20_000); continue; }
    const dir = path.join(ROOT, "candidates", kind);
    await mkdir(dir, { recursive: true });
    let got = 0;
    const authors = new Set();
    for (const r of (await res.json()).results) {
      if (authors.has(r.creator) || (r.width && r.width < 500)) continue; // one photo per photographer, no tiny files
      const file = path.join(dir, `${r.id}.jpg`);
      try { await download(r.url, file); } catch { continue; }
      authors.add(r.creator);
      all.push({ kind, id: r.id, file: path.relative(ROOT, file), title: r.title, author: r.creator, licence: `${r.license} ${r.license_version || ""}`.trim(), licenceUrl: r.license_url, page: r.foreign_landing_url, source: r.url });
      got++;
    }
    console.log(`${kind}: ${got} candidates`);
    await sleep(4000); // anonymous Openverse use is rate limited
  }
  await writeFile(path.join(ROOT, "candidates.json"), JSON.stringify(all, null, 1));
  console.log(`${all.length} candidates in ${path.relative(process.cwd(), ROOT)}`);
} else if (process.argv[2] === "restore") {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "manifest.json"), "utf8"));
  await mkdir(path.join(ROOT, "photos"), { recursive: true });
  let ok = 0;
  for (const p of manifest) { try { await download(p.source, path.join(ROOT, p.file)); ok++; } catch (e) { console.log(`${p.file}: ${e.message}`); } }
  console.log(`${ok}/${manifest.length} photos restored`);
} else console.log("usage: fetch-online-photos.js search | restore");
