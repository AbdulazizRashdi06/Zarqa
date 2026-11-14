// The app's one-box report shape (server ReportText + Matcher.ToInput): one text, no title,
// category guessed from keywords. Used by `run.js --shape one` and scripts/shortlist-experiment.js.

import { LEGACY } from "./text.js";

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

// Things called "card" or "bank" that are not wallets or cards (the app's Categories.NotCardRe).
const NOT_CARD = /\b(power ?banks?|(micro ?)?sd ?cards?|sim ?cards?|memory ?cards?|graphics ?cards?|flash ?cards?|playing ?cards?)\b/gi;
const words = (text) => ` ${String(text || "").toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean).join(" ")} `;

export function normalizeCategory(text) {
  const joined = words(text);
  // "power bank" must not count as a bank card: those phrases are hidden from the wallet keywords only.
  const forWallets = LEGACY ? joined : words(String(text || "").replace(NOT_CARD, " "));
  for (const [cat, keys] of KEYWORDS) if (keys.some((w) => (cat === "Wallets & cards" ? forWallets : joined).includes(` ${w} `))) return cat;
  return "";
}

/** One text (what a student would type), category from keywords, no title. */
export const toOne = (r) => {
  const text = (r.title ? `${r.title}. ${r.description || ""}` : r.description || "").trim();
  // Like the app (Matcher.ToInput): the guessed category only feeds the prescore. It is not embedded and
  // the models never see it. Runs before 2026-11-14 put it in `category`, which did both.
  return { ...r, title: "", description: text, category: "", categoryKey: normalizeCategory(text) };
};
