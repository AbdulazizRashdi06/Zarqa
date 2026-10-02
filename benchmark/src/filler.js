// Deterministic filler reports that pad the database to 100 / 1k / 10k.
// They never match a benchmark report, but they share categories, colours and
// places with real items, so they act as realistic distractors.

const ITEMS = [
  ["Water bottle", "Bottles", ["Hydro Flask", "Stanley", "Contigo", "", ""]],
  ["Backpack", "Bags", ["JanSport", "Nike", "Adidas", "North Face", ""]],
  ["Laptop charger", "Electronics", ["Apple", "Dell", "HP", "Lenovo", ""]],
  ["Phone", "Electronics", ["iPhone", "Samsung", "Huawei", "Xiaomi"]],
  ["AirPods case", "Electronics", ["Apple"]],
  ["Earbuds", "Electronics", ["Samsung", "Sony", "JBL", ""]],
  ["Wallet", "Wallets & cards", ["", "Tommy Hilfiger", "Guess", ""]],
  ["Student ID card", "Wallets & cards", [""]],
  ["Car keys", "Keys", ["Toyota", "Nissan", "Hyundai", "Kia", "Mitsubishi"]],
  ["House keys", "Keys", [""]],
  ["Glasses", "Accessories", ["Ray-Ban", "", ""]],
  ["Sunglasses", "Accessories", ["Ray-Ban", "Oakley", ""]],
  ["Watch", "Accessories", ["Casio", "Apple Watch", "Fossil", ""]],
  ["Umbrella", "Other", [""]],
  ["Notebook", "Stationery", ["Moleskine", ""]],
  ["Calculator", "Stationery", ["Casio", "Texas Instruments"]],
  ["Pencil case", "Stationery", [""]],
  ["Jacket", "Clothing", ["Zara", "H&M", "Nike", ""]],
  ["Scarf", "Clothing", [""]],
  ["USB stick", "Electronics", ["SanDisk", "Kingston", ""]],
  ["Power bank", "Electronics", ["Anker", "Xiaomi", ""]],
  ["Lunch box", "Other", [""]],
  ["Prayer mat", "Other", [""]],
  ["Textbook", "Books", [""]],
];
const COLORS = ["black", "white", "navy", "blue", "grey", "silver", "red", "green", "pink", "brown", "beige", "purple"];
const MARKS = ["a sticker on it", "a small scratch", "a keychain attached", "my initials written on it", "a clear case", "a cracked corner", "a name tag", ""];
const LOST_OPENERS = ["I lost my", "Missing:", "Can't find my", "Left my", "Lost a"];
const FOUND_OPENERS = ["Found a", "Someone left a", "Picked up a", "Found this", "Found"];

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param count   number of reports
 * @param places  [{name, zone}] — use the real campus places so filler competes with real reports
 * @param endIso  newest possible createdAt
 * @param days    history spread; report density = count / days is what makes the 200-report cap bite
 */
export function makeFiller({ count, places, endIso, days = 365, seed = 42 }) {
  const rnd = mulberry32(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const end = Date.parse(endIso);
  const out = [];
  for (let i = 0; i < count; i++) {
    const type = rnd() < 0.5 ? "lost" : "found";
    const [item, category, brands] = pick(ITEMS);
    const color = pick(COLORS);
    const brand = pick(brands);
    const mark = pick(MARKS);
    const place = pick(places);
    const created = end - rnd() * days * 86_400_000;
    const event = created - rnd() * 2 * 86_400_000;
    const name = `${brand ? brand + " " : ""}${item.toLowerCase()}`;
    const description =
      type === "lost"
        ? `${pick(LOST_OPENERS)} ${color} ${name}${mark ? " with " + mark : ""}. Last had it around ${place.name}.`
        : `${pick(FOUND_OPENERS)} ${color} ${name}${mark && rnd() < 0.5 ? " with " + mark : ""} at ${place.name}. Handed to security.`;
    out.push({
      id: `filler-${String(i).padStart(5, "0")}`,
      source: "filler",
      type,
      title: `${color[0].toUpperCase() + color.slice(1)} ${name}`,
      category,
      description,
      location: place.name,
      campusZone: place.zone || "",
      eventDate: new Date(event).toISOString().slice(0, 10),
      createdAt: new Date(created).toISOString(),
      photos: [],
      status: "open",
    });
  }
  return out;
}

/** Places for filler: canonical names from locations.json, plus every location/zone seen in the dataset. */
export function placesFrom(dataset) {
  const seen = new Map();
  for (const name of Object.keys(dataset.locations || {})) if (!name.startsWith("_")) seen.set(name, { name, zone: "" });
  for (const r of dataset.reports) if (r.location && !seen.has(r.location)) seen.set(r.location, { name: r.location, zone: r.campusZone || "" });
  return seen.size ? [...seen.values()] : [{ name: "Main building", zone: "" }];
}
