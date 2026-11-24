const STOPWORDS = new Set(
  "a an the and or of in on at to for with my i it is was this that near by from lost found item some".split(" "),
);

// EDGE_LEGACY=1 reproduces the app as it was before the 2026-11-14 fixes below (the control arm of edge runs).
export const LEGACY = process.env.EDGE_LEGACY === "1";

export function tokens(text) {
  const split = String(text || "").toLowerCase().normalize("NFKD");
  // NFKD splits "أ" and "ü" into a letter plus a combining mark. Drop the marks, or they turn into spaces
  // and break the word ("أسود" → "سود", "Hülle" → "hu" + "lle").
  return (LEGACY ? split : split.replace(/\p{M}/gu, ""))
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
    // A name matches as whole words only. Matching inside words made "Female Residences" also match
    // Boys Dorms (alias "male residences").
    if (text.includes(` ${name} `) || (LEGACY && name.length > 3 && text.includes(name))) out.set(group.canonical, group);
  }
  return [...out.values()];
}

/** Location tokens with every alias of every matched place added. */
export function expandedLocationTokens(report, aliasIndex) {
  const place = report.rankLocation ?? report.location;
  const base = tokens(`${place || ""} ${report.campusZone || ""}`);
  for (const g of matchAliases(place, aliasIndex)) for (const n of g.names) base.push(...tokens(n));
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

// ---- loop 2 input candidates (decisions.md, 2026-11-16); both off unless their switch is set ----
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** POSTED_ON=1: the day a report was posted, in Oman time (UTC+4, no daylight saving), with its weekday. */
export function postedOn(r) {
  const t = Date.parse(r.createdAt);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + 4 * 3_600_000);
  return `${d.toISOString().slice(0, 10)} ${WEEKDAYS[d.getUTCDay()]}`;
}
export const POSTED_ON = process.env.POSTED_ON === "1";
export const POSTED_NOTE = 'postedOn is the day each report was posted, in campus time. Words in a report such as "today", "yesterday" or "last week" count from that day, not from your own today.';

/** ONE_DAY_LINE=1: true only when both event dates are calendar dates and the found one is exactly one day earlier. */
export function foundOneDayBeforeLost(lost, found) {
  const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || "") ? Date.parse(s.slice(0, 10)) : NaN);
  return day(lost.eventDate) - day(found.eventDate) === DAY;
}
export const ONE_DAY_LINE = process.env.ONE_DAY_LINE === "1";
export const ONE_DAY_TEXT = 'Dates: the FOUND date is one calendar day before the LOST date. The lost date may be the day the owner noticed the loss rather than the day it happened, so this order is not a point against a match, alone or together with other points, and not a point for one. It counts against a match only if the LOST report\'s own words say the owner still had or used the item on the LOST date. Repeating that date or saying when the loss was noticed does not, and words such as "today", "this morning" or "yesterday" count from the day the report was posted, which may not be the LOST date.';

/** EARLY_LINE=1 (loop 3, owner's ruling 2026-11-16): calendar days the found date is before the lost date, when two or more; else null. */
export function foundDaysBeforeLost(lost, found) {
  const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || "") ? Date.parse(s.slice(0, 10)) : NaN);
  const days = Math.round((day(lost.eventDate) - day(found.eventDate)) / DAY);
  return Number.isFinite(days) && days >= 2 ? days : null;
}
export const EARLY_LINE = process.env.EARLY_LINE === "1";
export const earlyText = (days) => `Dates: the FOUND date is ${days} calendar days before the LOST date. The lost date is typed from memory and is often the day the loss was noticed or reported, so this order does not rule a match out. It is a point against a match, never a point for one, and it weighs more the longer the gap: a few days count for little, but over a long gap the same kind of item in the same place is not enough without something distinctive in common. It is a strong point against only if the LOST report's own words clearly say the owner still had or used the item after the FOUND date; repeating the LOST date does not say that.`;
export const earlyJudgeText = (days) => `timing: the FOUND date is ${days} calendar days before the LOST date. This is not a veto: lost dates are typed from memory and are often the day the loss was noticed. Count it as a point against a match that weighs more the longer the gap, and let the item details and photos decide; over a long gap, the same kind of item in the same place is not enough without something distinctive in common.`;
export const EARLY_TRIAGE_TEXT = "A FOUND date before the LOST date does not by itself rule a candidate out; owners often give the day they noticed the loss. Keep such a candidate unless something else rules it out, and rank it lower the longer the gap.";

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
  // rankText / rankLocation: the person's words plus a plain-English rendering (src/normalize.js), when one exists.
  const place = report.rankLocation ?? report.location;
  const aliases = matchAliases(place, aliasIndex).flatMap((g) => g.names);
  const lines = [
    `type: ${report.type}`,
    `title: ${report.title || ""}`,
    `category: ${report.category || ""}`,
    `description: ${report.rankText ?? report.description ?? ""}`,
    `location: ${place || ""}`,
    `campus zone: ${report.campusZone || ""}`,
    aliases.length ? `location aliases: ${[...new Set(aliases)].join(", ")}` : "",
    `date: ${report.eventDate || ""}`,
  ];
  if (withPhotoAttributes && report.photoAttributes) lines.push(`photo: ${photoAttributesText(report.photoAttributes)}`);
  return lines.filter(Boolean).join("\n");
}

export const truncate = (s, n) => (String(s || "").length > n ? String(s).slice(0, n) + "…" : String(s || ""));

export const counterpartType = (t) => (t === "lost" ? "found" : "lost");
