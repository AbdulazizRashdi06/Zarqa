// The app's one-box report shape (server ReportText + Matcher.ToInput): one text, no title,
// category guessed from keywords. Used by `run.js --shape one` and scripts/shortlist-experiment.js.

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

export function normalizeCategory(text) {
  const joined = ` ${String(text || "").toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean).join(" ")} `;
  for (const [cat, words] of KEYWORDS) if (words.some((w) => joined.includes(` ${w} `))) return cat;
  return "";
}

/** One text (what a student would type), category from keywords, no title. */
export const toOne = (r) => {
  const text = `${r.title}. ${r.description || ""}`.trim();
  return { ...r, title: "", description: text, category: normalizeCategory(text) };
};
