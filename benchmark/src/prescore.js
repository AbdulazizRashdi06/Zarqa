import { cosine } from "./embeddings.js";
import { daysBetween, expandedLocationTokens, overlap, tokens } from "./text.js";

/**
 * Preliminary score, rebuilt from the documented processReport formula:
 *   clamp01(cosine + category ± + title/detail overlap (≤0.24) + location overlap (≤0.08) + date bonus)
 * The overlap weights are a reconstruction: swap in the real function once the
 * Cloud Functions source is in the repo, so "luna" is exactly the production system.
 */
export function preliminaryScore(a, b, vecA, vecB, aliasIndex) {
  const cos = cosine(vecA, vecB);

  let category = 0;
  const ca = (a.category || "").toLowerCase().trim(), cb = (b.category || "").toLowerCase().trim();
  if (ca && cb) category = ca === cb ? 0.05 : -0.02;

  // One-text reports (the app) have no titles: the whole 0.24 text weight goes on the one text.
  let text;
  if (!a.title && !b.title) text = 0.24 * overlap(tokens(a.description), tokens(b.description));
  else {
    const titleOverlap = overlap(tokens(a.title), tokens(b.title));
    const detailOverlap = overlap(tokens(`${a.title} ${a.description}`), tokens(`${b.title} ${b.description}`));
    text = 0.14 * titleOverlap + 0.10 * detailOverlap;
  }

  const location = 0.08 * overlap(expandedLocationTokens(a, aliasIndex), expandedLocationTokens(b, aliasIndex));

  const days = daysBetween(a.eventDate, b.eventDate);
  const date = days == null ? 0 : days <= 1 ? 0.04 : days <= 7 ? 0.02 : 0;

  const score = Math.min(1, Math.max(0, cos + category + text + location + date));
  return { score, cosine: cos, parts: { category, text, location, date } };
}
