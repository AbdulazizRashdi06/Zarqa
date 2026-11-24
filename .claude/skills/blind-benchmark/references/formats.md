# File formats for a test set

## reports.json

A JSON array. Each report is exactly:

```json
{
  "id": "<unique; lost reports start with L-, found reports with F->",
  "type": "lost",
  "title": "",
  "category": "",
  "description": "<what the person typed>",
  "location": "<what they typed in the place box; may be empty>",
  "campusZone": "",
  "eventDate": "<YYYY-MM-DD, or null if they skipped it>",
  "createdAt": "<ISO time the report was posted; every one different>",
  "photos": [],
  "status": "open",
  "tags": []
}
```

`type` is `"lost"` or `"found"`. `photos` holds zero or one `photoForReport` string; lost reports normally have none. Keep `createdAt` inside the window you are given, and never before the report's own `eventDate`.

## pairs.json

A JSON array of the lost/found pairs to be scored. Each is exactly:

```json
{
  "lostId": "...",
  "foundId": "...",
  "isMatch": true,
  "itemKind": "<one word for the kind of item, e.g. wallet>",
  "lens": "<short name of the situation this pair tests; your own taxonomy>",
  "why": "<one sentence: what makes this pair interesting or hard; for a false pair, what really separates the two items, or that nothing in the evidence does>"
}
```

`isMatch` is the truth you decide as author: `true` means the found object physically is the lost object. Every lost report should appear in at least one pair. Lost reports whose item was never found, and found reports nobody is looking for, belong in a good set.

The orchestrator adds `kind`, `conflict` and `tags` after you finish, and later the raters' `quality` and `difficulty`. Do not add them yourself.

## DESIGN.md

One page in plain English:
- what you set out to test and why;
- your taxonomy of situations, with counts;
- what share you judge easy, medium and hard;
- what a good matcher should do on the hardest kinds;
- what the set does not cover.
