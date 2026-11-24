# Instagram post: a letter from Zarqa

A 1080 × 1350 (4:5) post: a letter from Zarqa to a student who made a lost report ("Dear student, I think I spotted something that might be yours…"). Zarqa's picture changes from post to post; the layout stays the same.

- `template.html`: the layout (app colours, Anton / Figtree / JetBrains Mono, Caveat for the handwritten greeting and signature, Alexandria for optional Arabic).
- `posts.json`: one entry per post. Each picture is its own entry.
- `render.mjs`: saves every entry as `out/<id>.png`.

```
node social/email-post/render.mjs                             # every post in posts.json
node social/email-post/render.mjs spotted-rsa                 # one post
node social/email-post/render.mjs lost-reports.json           # a carousel, into out/lost-reports/
node social/email-post/render.mjs lost-reports.json 08-future # one slide of it
```

## Carousels

A carousel is its own file: `{ "defaults": { … }, "posts": [ … ] }`. Fields in `defaults` apply to every slide. `lost-reports.json` is the "Lost: pen… Lost: will to live" one: a cover and 12 square slides, each with its own Zarqa picture from `mascots/`. Those pictures were made with the `zarqa-mascot` skill (the prompts are in `mascot-output/letter-*.prompt.md` on the machine that made them).

It uses the web app's Playwright, so `web/` needs `npm install` and `npx playwright install chromium` once. Caveat and Alexandria come from Google Fonts, so rendering needs internet.

## Fields in posts.json

Leave a field out to keep the default.

| Field | What it is |
|---|---|
| `id` | File name of the PNG. |
| `mascot.src` | Zarqa's picture, a transparent PNG, path from the repo root. Leave it `""` to see the empty slot. |
| `mascot.scale`, `mascot.x`, `mascot.y`, `mascot.flip` | Nudge her inside the slot: size, px right, px down, mirror. |
| `sticker` | The tilted pill at the top left ("YOU GOT MAIL"). |
| `heading`, `headingSize` | Anton heading ("A letter from Zarqa"). `[word]` takes the accent colour, `\|` breaks the line. |
| `arabic`, `arabicSize` | Optional Arabic line above the heading. |
| `from`, `date` | The letterhead. |
| `greeting` | Handwritten opening ("Dear student,"). |
| `opening` | The first sentence. |
| `ticketLabel`, `item` | Label and the report title on the luggage tag. |
| `body` | The paragraph under the tag. |
| `stampTop`, `stamp`, `stampBottom` | The round postmark. |
| `signOff`, `signature`, `role` | "Keeping an eye out for you," / handwritten "Zarqa" / an optional small line under the name (empty by default). |
| `found` | `true` switches tan to sage, for letters to finders. |
| `shape` | `"portrait"` (1080 × 1350, default) or `"square"` (1080 × 1080). In a square the letter's top edge is fixed, so everything sits in the same place on every slide. |
| `itemQuotes` | `false` shows the tag text as written, without quote marks ("Lost: pen"). |
| `bigBody`, `bodySize` | `true` sets the paragraph under the tag large and bold, centred in the space left. Keep one `bodySize` for a whole carousel. |

`opening`, `ticketLabel`, `signOff`, `sticker`, `item` and `stamp` disappear when they are `""`.

### The first page (cover)

`"layout": "cover"` replaces the letter with a big heading, a large Zarqa on the right and a sealed envelope. It uses `heading` / `headingSize`, `coverHand` (handwriting on the envelope, "Dear student,"), `coverLine` (the bold line under it), `swipe` (the pill at the bottom right) and `mascot`.

## The place for Zarqa

A 480 × 560 box at the top right. Her picture fits inside it and sits on its bottom edge, and that edge is hidden behind the letter, so half-body cutouts look like she's peeking over it. Make new pictures with the `zarqa-mascot` skill. Ones that face or point left, toward the heading, work best.
