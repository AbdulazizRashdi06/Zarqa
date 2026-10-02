const STOPWORDS = new Set(
  "a an the and or of in on at to for with my i it is was this that near by from lost found item some".split(" "),
);

export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Overlap coefficient |A∩B| / min(|A|,|B|): short titles aren't punished for being short. */
export function overlap(a, b) {
  const A = new Set(Array.isArray(a) ? a : tokens(a));
  const B = new Set(Array.isArray(b) ? b : tokens(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.min(A.size, B.size);
}

/**
 * Location aliases: { "Library": ["LRC", "learning resource centre"], ... }.
 * Returns a lookup from any lower-cased name or alias to its canonical group.
 */
const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function buildAliasIndex(locations) {
  const index = new Map();
  for (const [canonical, aliases] of Object.entries(locations || {})) {
    if (canonical.startsWith("_")) continue; // "_note" etc.
    const group = { canonical, names: [canonical, ...aliases] };
    for (const n of group.names) index.set(norm(n), group);
  }
  return index;
}

/** Canonical groups whose name or alias appears inside the location text. */
export function matchAliases(location, aliasIndex) {
  const text = ` ${norm(location)} `;
  const out = new Map();
  for (const [name, group] of aliasIndex) {
    // Short aliases ("LRC") must match as a whole word; longer names may match inside a phrase.
    if (text.includes(` ${name} `) || (name.length > 3 && text.includes(name))) out.set(group.canonical, group);
  }
  return [...out.values()];
}

/** Location tokens with every alias of every matched place added. */
export function expandedLocationTokens(report, aliasIndex) {
  const base = tokens(`${report.location || ""} ${report.campusZone || ""}`);
  for (const g of matchAliases(report.location, aliasIndex)) for (const n of g.names) base.push(...tokens(n));
  return base;
}

export const DAY = 86_400_000;
export function daysBetween(a, b) {
  const x = Date.parse(a), y = Date.parse(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.abs(x - y) / DAY;
}

/** Code-side date label, so Jev never has to compare dates itself. */
export function dateRelation(lost, found) {
  const l = Date.parse(lost.eventDate), f = Date.parse(found.eventDate);
  if (Number.isNaN(l) || Number.isNaN(f)) return "unknown";
  const d = (f - l) / DAY;
  if (d < -1) return "found_before_lost";
  if (Math.abs(d) <= 1) return "same_or_next_day";
  if (d <= 7) return "within_a_week";
  return "more_than_a_week";
}

export function photoAttributesText(attrs) {
  if (!attrs) return "";
  const parts = [
    attrs.itemType && `type ${attrs.itemType}`,
    attrs.colors?.length && `colours ${attrs.colors.join(", ")}`,
    attrs.brand && `brand ${attrs.brand}`,
    attrs.distinctiveMarks?.length && `marks ${attrs.distinctiveMarks.join(", ")}`,
  ].filter(Boolean);
  return parts.join("; ");
}

/** The structured string that gets embedded (same fields as processReport, plus optional photo attributes). */
export function embeddingText(report, aliasIndex, { withPhotoAttributes = false } = {}) {
  const aliases = matchAliases(report.location, aliasIndex).flatMap((g) => g.names);
  const lines = [
    `type: ${report.type}`,
    `title: ${report.title || ""}`,
    `category: ${report.category || ""}`,
    `description: ${report.description || ""}`,
    `location: ${report.location || ""}`,
    `campus zone: ${report.campusZone || ""}`,
    aliases.length ? `location aliases: ${[...new Set(aliases)].join(", ")}` : "",
    `date: ${report.eventDate || ""}`,
  ];
  if (withPhotoAttributes && report.photoAttributes) lines.push(`photo: ${photoAttributesText(report.photoAttributes)}`);
  return lines.filter(Boolean).join("\n");
}

export const truncate = (s, n) => (String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || ""));

export const counterpartType = (t) => (t === "lost" ? "found" : "lost");
