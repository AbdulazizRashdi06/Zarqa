import assert from "node:assert/strict";
import { test } from "node:test";
import { readChoice, readNoul, readScore } from "../src/jevClient.js";
import { OVERALL_LEVELS, decide } from "../src/reviewers/jev.js";
import { buildAliasIndex, dateRelation, matchAliases } from "../src/text.js";

const strong = { sameItemType: 0.95, colorConflict: 0.05, brandConflict: 0.05, distinctive: 0.9, location: "same_place", overall: 0.95 };

test("decide: strong evidence is a visible match", () => {
  const d = decide(strong, 0.8);
  assert.equal(d.isLikelyMatch, true);
  assert.ok(d.finalScore >= 0.72);
});

test("decide: any conflict blocks a match", () => {
  assert.equal(decide({ ...strong, colorConflict: 0.6 }, 0.8).isLikelyMatch, false);
  assert.equal(decide({ ...strong, brandConflict: 0.6 }, 0.8).isLikelyMatch, false);
  assert.equal(decide({ ...strong, location: "different" }, 0.8).isLikelyMatch, false);
  assert.equal(decide({ ...strong, sameItemType: 0.6 }, 0.8).isLikelyMatch, false);
});

test("dateRelation: found before lost is flagged, one day of slack allowed", () => {
  assert.equal(dateRelation({ eventDate: "2026-09-10" }, { eventDate: "2026-09-05" }), "found_before_lost");
  assert.equal(dateRelation({ eventDate: "2026-09-10" }, { eventDate: "2026-09-09" }), "same_or_next_day");
  assert.equal(dateRelation({ eventDate: "2026-09-10" }, { eventDate: "2026-09-15" }), "within_a_week");
});

test("aliases: short aliases match whole words only", () => {
  const idx = buildAliasIndex({ Library: ["LRC"] });
  assert.equal(matchAliases("LRC, 2nd floor", idx)[0]?.canonical, "Library");
  assert.equal(matchAliases("the lrcx room", idx).length, 0);
});

test("jev readers accept documented response variants", () => {
  assert.equal(readNoul({ noul: 0.8 }), 0.8);
  assert.equal(readChoice({ probabilities: { a: 0.2, b: 0.8 } }, ["a", "b"]).choice, "b");
  // expected level from probabilities: all mass on the top level → 1
  assert.equal(readScore({ probabilities: [0, 0, 0, 0, 1] }, OVERALL_LEVELS).normalized, 1);
  // bare 0-based score in the middle → 0.5
  assert.equal(readScore({ score: 2 }, OVERALL_LEVELS).normalized, 0.5);
});
