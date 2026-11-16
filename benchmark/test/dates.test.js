import assert from "node:assert/strict";
import test from "node:test";
import { foundDaysBeforeLost, foundOneDayBeforeLost, postedOn } from "../src/text.js";

test("postedOn: the Oman day and weekday of the posting time", () => {
  assert.equal(postedOn({ createdAt: "2026-11-12T08:41:08.000Z" }), "2026-11-12 Thursday");
  assert.equal(postedOn({ createdAt: "2026-11-12T21:30:00.000Z" }), "2026-11-13 Friday"); // after 20:00 UTC it is the next day in Oman
  assert.equal(postedOn({ createdAt: "" }), null);
});

test("foundOneDayBeforeLost: exactly one calendar day, both dates present", () => {
  const pair = (lost, found) => foundOneDayBeforeLost({ eventDate: lost }, { eventDate: found });
  assert.equal(pair("2026-11-06", "2026-11-05"), true);
  assert.equal(pair("2026-11-06", "2026-11-04"), false); // two days: the owner's open question, untouched
  assert.equal(pair("2026-11-05", "2026-11-06"), false); // found after lost
  assert.equal(pair("2026-11-06", "2026-11-06"), false);
  assert.equal(pair(null, "2026-11-05"), false);
  assert.equal(pair("2026-11-06T09:00", "2026-11-05T08:00"), true); // calendar days, not hours
});

test("foundDaysBeforeLost: two or more calendar days early, else null", () => {
  const pair = (lost, found) => foundDaysBeforeLost({ eventDate: lost }, { eventDate: found });
  assert.equal(pair("2026-11-06", "2026-11-04"), 2);
  assert.equal(pair("2026-11-20", "2026-10-30"), 21);
  assert.equal(pair("2026-11-06", "2026-11-05"), null); // one day has its own line
  assert.equal(pair("2026-11-06", "2026-11-06"), null);
  assert.equal(pair("2026-11-04", "2026-11-06"), null); // found after lost
  assert.equal(pair(null, "2026-11-04"), null);
});
