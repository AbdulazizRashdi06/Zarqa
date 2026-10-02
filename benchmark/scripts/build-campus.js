#!/usr/bin/env node
// Builds data/campus/{reports,pairs}.json from the collection-page entries (2026-09-30).
//
// Provenance and caveats:
// - Found reports: photos from the collection page; text written by Claude from the photo,
//   using only what a finder could see. F-P* are text-only found reports (no photo).
// - Lost reports: written by Claude as an owner would, with different wording, alias place
//   names and some vague or late reports. The same writer wrote both sides, so text
//   matching is easier than with real users: treat recall as an upper bound.
// - All entries were photographed within one hour, so dates are simulated: found dates are
//   spread over September, and each lost report gets a delay (days after the found report).
// - Three photos showed a real ID card and a bank card. They were not downloaded into the
//   dataset: those reports are text-only (tag "sensitive_photo_removed").
import { writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "..", "data", "campus");

// [id, photoId|null, title, category, description, location, eventDate, extraTags]
const FOUND = [
  ["F01", "eea57713bdbe40c03b8020ca01ed1f90", "Black Dell laptop", "Electronics", "Found a black Dell laptop on a study desk, charger still plugged in.", "Library", "2026-09-02"],
  ["F02", "9b3870ae606a4d53beb638c4eb9c2027", "Blue pen", "Stationery", "Blue ballpoint pen with a clear body, left on a table.", "Gu2 prayer room", "2026-09-03"],
  ["F03", "92cea6f91f56a8fa088635224d3b7ecd", "Grey backpack", "Bags", "Grey backpack with a black mesh back and mesh side pockets, left on a table.", "Canteen ground", "2026-09-04"],
  ["F04", "ca6923ecf7ec00f6fa2c0f2851406342", "JBL earbuds case", "Electronics", "Silver JBL earbuds case with a black top, found on a desk.", "Gu1 102", "2026-09-05"],
  ["F05", null, "ID card", "Wallets & cards", "Found an Omani ID card on the floor.", "Oman hall", "2026-09-06", ["sensitive_photo_removed"]],
  ["F06", "d8980b77b8778511e5527934263bd0e2", "Dell laptop", "Electronics", "Black Dell laptop with scratches on the lid, charger attached.", "Ampitheatre", "2026-09-08"],
  ["F07", "5e2174bcf72e1f19333c732269dc1630", "Glasses", "Accessories", "Black framed glasses left on a table.", "Canteen", "2026-09-09"],
  ["F08", "bad092cc42ffa4d90787d928df83b011", "Phone charger", "Electronics", "White plug with a long black cable.", "Prayer room", "2026-09-10"],
  ["F09", "3b1a7ca5abd0556a51a1409a46deeb72", "Blue notebook", "Stationery", "Blue hardcover notebook with a marble pattern.", "Main building", "2026-09-11"],
  ["F10", "54efcb52d1d158a4f8b76fed3e3dbbe9", "Card game box", "Other", "Box of the Money Talks card game by Balinca, Arabic and English.", "554", "2026-09-12"],
  ["F11", "2f6f4932b5b67ca2d4035e2f03703aa9", "Ping pong paddle", "Sports", "Table tennis bat, red rubber, orange handle, worn edges.", "Ground floor", "2026-09-13"],
  ["F12", "e500808140eaddbf352b5f367d00fa5d", "TV remote", "Electronics", "Black Oscar TV remote with Netflix and Prime Video buttons.", "Rsa office", "2026-09-14"],
  ["F13", null, "Bank card", "Wallets & cards", "Found a bank debit card.", "Canteen seccond floor", "2026-09-15", ["sensitive_photo_removed"]],
  ["F14", null, "Debit card", "Wallets & cards", "Red and black debit card found near the cars.", "Parkinglot", "2026-09-16", ["sensitive_photo_removed"]],
  ["F15", "7ddfb974e2945ecb9dcf17feab42ed53", "Glasses", "Accessories", "Rimless glasses with thin dark arms.", "Cs department", "2026-09-17"],
  ["F16", "bfd907dd87359215040629df2f87bea3", "Kumma", "Clothing", "White Omani kumma with brown embroidery.", "Reading area", "2026-09-18"],
  ["F17", "738d528d11e4f8a6f05de784ad7cf33d", "Black cable", "Electronics", "Long black charging cable on the floor, no plug.", "Library", "2026-09-19"],
  ["F18", "7f8a35a4203404db36885c50aa4f0d85", "Chemistry textbook", "Books", "Chemistry book by Zumdahl, ninth edition, left by a window.", "Gu2", "2026-09-20"],
  ["F19", "80f50b0938bec1581ceee157dc03b9ac", "Black sandals", "Clothing", "Pair of black leather sandals left by the door.", "Prayer room upad building", "2026-09-21"],
  ["F20", "737dcc1a8f9d5be1ab04c1b628e95d65", "Silver laptop", "Electronics", "Silver MacBook left open on a table.", "Reading area", "2026-09-22", ["stock_photo"]],
  ["F21", "0694a8aa77630d4abf0e8ed85eedb9fb", "Bunch of keys", "Keys", "Keys on a ring with a metal clip, found in the dirt.", "Dirt parking", "2026-09-23", ["stock_photo"]],
  ["F22", "a4348292375c545768fc23049bd9ab5a", "Black pen", "Stationery", "Black metal fountain pen.", "Ampitheatre", "2026-09-24", ["stock_photo"]],
  ["F23", "403e40b96fe29bc244974d48f34e6ee7", "Old book", "Books", "Old book with yellow pages, cover missing.", "I dont remember", "2026-09-24", ["stock_photo"]],
  ["F24", "b5640d9f5ac62ab1959a83a735224045", "Car key", "Keys", "Car key with a car-shaped keychain.", "Gu2 102", "2026-09-25", ["stock_photo"]],
  ["F25", "b3e2fba4fadc0fb71af0e9b5f0e9134a", "Black wallet", "Wallets & cards", "Black leather wallet with some cash inside.", "Cs department", "2026-09-26", ["stock_photo"]],
  ["F26", "f608e6e51131830ef36f1372f5661470", "Brown jacket", "Clothing", "Dark brown zip jacket with a stripe down the front.", "Outside", "2026-09-27", ["stock_photo"]],
  // Text-only found reports: finders who post without a photo.
  ["F-P01", null, "Water bottle", "Bottles", "Found a pink metal water bottle.", "6th floor", "2026-09-05", ["no_photo"]],
  ["F-P02", null, "AirPods", "Electronics", "White AirPods case found on a chair.", "GU1 Library", "2026-09-07", ["no_photo"]],
  ["F-P03", null, "Umbrella", "Other", "Black umbrella left at the entrance.", "main entrance", "2026-09-09", ["no_photo"]],
  ["F-P04", null, "Calculator", "Stationery", "Casio fx-991 calculator left in the lab.", "3rd floor", "2026-09-12", ["no_photo"]],
  ["F-P05", null, "Prayer beads", "Accessories", "Brown masbaha (prayer beads).", "prayer rooms", "2026-09-14", ["no_photo"]],
  ["F-P06", null, "Student ID", "Wallets & cards", "GUtech student card found on the floor.", "GUbridge", "2026-09-16", ["no_photo"]],
  ["F-P07", null, "Scarf", "Clothing", "Black shayla left on a seat.", "Germany Hall", "2026-09-18", ["no_photo"]],
  ["F-P08", null, "Power bank", "Electronics", "White Anker power bank.", "Sab3", "2026-09-20", ["no_photo"]],
  ["F-P09", null, "Hoodie", "Clothing", "Grey hoodie, size M.", "gym", "2026-09-22", ["no_photo"]],
  ["F-P10", null, "Car key", "Keys", "Hyundai car key, no keychain.", "UPAD parking", "2026-09-25", ["no_photo"]],
];

// [id, matchFoundId|null, title, category, description, location, delayDays, difficulty, tags]
// delayDays: lost createdAt minus found createdAt (negative = owner reported first).
const LOST = [
  ["L01", "F01", "Lost my laptop", "Electronics", "Dell Latitude, black. I left it charging on a desk while studying.", "6th floor", 1, "medium", ["alias_location", "lookalike"]],
  ["L02", "F02", "Blue pen", "Stationery", "Cheap blue pen with a rubber grip, I think I left it in the prayer room.", "UPAD building", 0, "medium", ["alias_location"]],
  ["L03", "F03", "Lost my bag", "Bags", "Grey school bag, has my laptop sleeve and lecture notes inside.", "cafeteria", 2, "medium", ["alias_location", "vague"]],
  ["L04", "F04", "JBL earbuds", "Electronics", "My JBL wireless earbuds in their silver case, lost after a lecture.", "GU1 room 102", 1, "easy", []],
  ["L05", "F05", "Lost ID card", "Wallets & cards", "My Omani civil ID card, lost it during the event.", "amphitheatre", 4, "medium", ["alias_location", "no_photo"]],
  ["L06", "F06", "Dell laptop", "Electronics", "Black Dell laptop, the lid has a lot of scratches. Had my charger with it.", "Oman Hall", 3, "medium", ["alias_location", "lookalike"]],
  ["L07", "F07", "My eyeglasses", "Accessories", "Black thick-frame prescription glasses.", "Ground Canteen", 2, "medium", ["alias_location", "lookalike"]],
  ["L08", "F08", "iPhone charger", "Electronics", "White UK plug with a black braided USB-C cable.", "prayer room ground floor", 1, "medium", ["lookalike"]],
  ["L09", "F09", "Notebook", "Stationery", "Hardcover notebook, blue with a marble-like pattern. Has my thesis notes.", "GU1", 2, "medium", ["alias_location"]],
  ["L11", "F11", "Ping pong racket", "Sports", "Red and orange table tennis racket, an old one.", "sports hall", 3, "hard", ["location_vague"]],
  ["L12", "F12", "Remote control", "Electronics", "Oscar remote for the TV in our office.", "RSA office", 1, "easy", []],
  ["L13", "F13", "Bank Muscat card", "Wallets & cards", "Lost my Bank Muscat Visa debit card, red and black.", "canteen upstairs", 0, "hard", ["no_photo", "lookalike"]],
  ["L15", "F15", "Glasses without frame", "Accessories", "Rimless glasses, thin metal legs.", "4th floor", 6, "hard", ["alias_location", "lookalike"]],
  ["L16", "F16", "Kumma", "Clothing", "White kumma with brown embroidery.", "library", 2, "medium", ["location_vague"]],
  ["L17", "F17", "Charging cable", "Electronics", "Long black type-C cable, fell under the desks.", "6th floor", 9, "hard", ["alias_location", "lookalike", "late_report"]],
  ["L18", "F18", "Chemistry textbook", "Books", "Zumdahl Chemistry 9th edition, I use it for Chem 101.", "UPAD building", 5, "medium", ["alias_location"]],
  ["L19", "F19", "Sandals", "Clothing", "Black leather sandals, left them at the prayer room door.", "GU2 prayer room", 0, "easy", []],
  ["L20", "F20", "MacBook Air", "Electronics", "Silver MacBook Air 15 inch, sticker on the bottom.", "reading area", 1, "easy", ["lookalike"]],
  ["L21", "F21", "House keys", "Keys", "Bunch of keys with a silver carabiner clip.", "after the wadi", 12, "hard", ["alias_location", "late_report"]],
  ["L22", "F22", "Fountain pen", "Stationery", "Black fountain pen, a gift from my dad.", "Oman hall", 2, "medium", ["alias_location"]],
  ["L24", "F24", "Toyota key", "Keys", "Toyota remote key with a small car keychain and two metal tags.", "GU2", 1, "medium", ["lookalike"]],
  ["L25", "F25", "Wallet", "Wallets & cards", "Black wallet with a pattern on the leather, had 10 rials in it.", "4th floor", 4, "medium", ["alias_location"]],
  ["L26", "F26", "Brown jacket", "Clothing", "Dark brown work jacket with a white stripe and a LOST patch.", "near the pitch", 7, "hard", ["location_vague", "late_report"]],
  ["L-P01", "F-P01", "Pink bottle", "Bottles", "Pink stainless steel bottle.", "GU1 Library", 1, "easy", ["alias_location", "no_photo"]],
  ["L-P02", "F-P02", "AirPods Pro", "Electronics", "AirPods Pro in their case.", "library", 15, "hard", ["late_report", "no_photo"]],
  ["L-P03", "F-P03", "Umbrella", "Other", "Black folding umbrella.", "main entrance", 3, "easy", ["no_photo"]],
  ["L-P04", "F-P04", "Calculator", "Stationery", "Casio fx-991ES, my name is on the back.", "Faculty of Sciences", 2, "medium", ["alias_location", "no_photo"]],
  ["L-P06", "F-P06", "Student card", "Wallets & cards", "My GUtech student ID.", "GU bridge", -1, "medium", ["owner_first", "no_photo"]],
  ["L-P07", "F-P07", "Shayla", "Clothing", "Black chiffon shayla.", "GU2", 1, "medium", ["location_vague", "no_photo"]],
  ["L-P08", "F-P08", "Power bank", "Electronics", "White Anker 10000mAh power bank.", "smoking area", 2, "easy", ["alias_location", "no_photo"]],
  ["L-P09", "F-P09", "Hoodie", "Clothing", "Grey Nike hoodie, medium.", "sports hall", 20, "hard", ["alias_location", "late_report", "no_photo"]],
  ["L-P10", "F-P10", "Hyundai key", "Keys", "Hyundai Accent key, no keychain.", "GU2 parking", 1, "easy", ["lookalike", "no_photo"]],
  // Hard negatives: similar to a found item, but not it. `nearFound` sets the date.
  ["N1", null, "Lost HP laptop", "Electronics", "Black HP laptop in a grey sleeve.", "library", 1, "hard", ["hard_negative"], "F01"],
  ["N2", null, "Blue notebook", "Stationery", "Blue spiral notebook, A5, my name on the first page.", "GU2", 1, "hard", ["hard_negative"], "F09"],
  ["N3", null, "Sunglasses", "Accessories", "Black Ray-Ban sunglasses in a case.", "canteen", 1, "hard", ["hard_negative"], "F07"],
  ["N4", null, "Brown wallet", "Wallets & cards", "Brown leather wallet with my bank cards.", "main parking", 1, "hard", ["hard_negative"], "F25"],
  ["N5", null, "Grey backpack", "Bags", "Grey North Face backpack with a red logo.", "GU2", 1, "hard", ["hard_negative"], "F03"],
  ["N6", null, "Galaxy Buds", "Electronics", "White Samsung Galaxy Buds case.", "GU1", 1, "hard", ["hard_negative"], "F04"],
  // Orphans: nobody found them.
  ["O1", null, "Gold ring", "Accessories", "Thin gold ring, lost somewhere on campus.", "girls dorms", 0, "orphan", ["orphan"], "F16"],
  ["O2", null, "USB flash drive", "Electronics", "SanDisk 64GB flash drive with my project on it.", "mechatronics lab", 0, "orphan", ["orphan"], "F10"],
  ["O3", null, "Parking card", "Wallets & cards", "Student parking permit card.", "student parking", 0, "orphan", ["orphan"], "F21"],
  ["O4", null, "Casio watch", "Accessories", "Black Casio digital watch.", "gym", 0, "orphan", ["orphan"], "F-P09"],
];

// Which hard negatives compete with which found report (for the false-match count).
const HARD_NEGATIVE_PAIRS = [
  ["N1", "F01"], ["N1", "F06"], ["N2", "F09"], ["N3", "F07"], ["N3", "F15"], ["N4", "F25"], ["N5", "F03"], ["N6", "F04"],
  ["L13", "F14"], ["L24", "F-P10"], ["L-P10", "F24"], ["L01", "F06"], ["L06", "F01"], ["L07", "F15"], ["L15", "F07"],
  ["L08", "F17"], ["L17", "F08"], ["L20", "F01"],
];

const DAY = 86_400_000;
const hourOf = (i) => 8 + ((i * 7) % 10); // spread across the working day

const reports = [];
const foundById = new Map();
FOUND.forEach(([id, photo, title, category, description, location, eventDate, tags = []], i) => {
  const createdAt = new Date(Date.parse(eventDate) + hourOf(i) * 3_600_000).toISOString();
  const r = { id, type: "found", title, category, description, location, campusZone: "", eventDate, createdAt, photos: photo ? [`photos/${photo}.jpg`] : [], status: "open", tags };
  reports.push(r);
  foundById.set(id, r);
});

const pairs = [];
LOST.forEach(([id, match, title, category, description, location, delay, difficulty, tags, near], i) => {
  const anchor = foundById.get(match ?? near);
  const created = Date.parse(anchor.createdAt) + delay * DAY + (i % 5) * 1_800_000;
  const eventDate = new Date(Date.parse(anchor.eventDate) - (i % 3 === 0 ? DAY : 0)).toISOString().slice(0, 10);
  reports.push({ id, type: "lost", title, category, description, location, campusZone: "", eventDate, createdAt: new Date(created).toISOString(), photos: [], status: "open", tags });
  if (match) {
    const foundTags = foundById.get(match).tags;
    pairs.push({ lostId: id, foundId: match, isMatch: true, difficulty, tags: [...new Set([...tags, ...foundTags])] });
  }
});
for (const [lostId, foundId] of HARD_NEGATIVE_PAIRS) pairs.push({ lostId, foundId, isMatch: false, difficulty: "hard", tags: ["hard_negative"] });

await writeFile(path.join(OUT, "reports.json"), JSON.stringify(reports, null, 1));
await writeFile(path.join(OUT, "pairs.json"), JSON.stringify(pairs, null, 1));
const n = (t) => reports.filter((r) => r.type === t).length;
console.log(`Wrote ${reports.length} reports (${n("found")} found, ${n("lost")} lost), ${pairs.filter((p) => p.isMatch).length} true pairs, ${pairs.filter((p) => !p.isMatch).length} hard-negative pairs.`);
