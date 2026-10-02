# LostraAi matching benchmark

Runs five matching systems on the same reports at database sizes 10 / 100 / 1k / 10k, and compares them on quality, cost and speed.

| System | Retrieval | Reviewer |
|---|---|---|
| `luna` | newest 200 counterparts (current production) | gpt-6-luna, text + photos |
| `luna-vector` | vector top-25 over all counterparts | gpt-6-luna |
| `jev` | vector top-25 + date rule in code | Jev typed questions + composite score |
| `jev-photo` | same, photo attributes in text | Jev |
| `jev-cascade` | same as `jev-photo` | Jev, unsure pairs go to Luna |

## Run
```
npm run bench:offline                     # free: checks the pipeline, prints a cost/latency ESTIMATE
cp .env.example .env                      # add OPENAI_API_KEY and TYPESAFE_API_KEY
npm run bench -- --data data/campus --sizes 10,100 --max-queries 20 --yes
```
- Every paid call is cached in `.cache/`, so a rerun is free and replays the latency measured the first time.
- A live run refuses to start without `--yes`. Run `--offline` first to see what it will cost.
- Results are written to `results/<time>/summary.json` (per-system metrics, missed pairs, McNemar vs `luna`) and `runs.jsonl`.

## Dataset format (`data/<name>/`)
- `reports.json`: `{id, type: lost|found, title, category, description, location, campusZone, eventDate, createdAt, photos: ["photos/x.jpg"]}`
- `pairs.json`: `{lostId, foundId, isMatch, difficulty, tags}`. Tags include `photo_needed` and `hard_negative`. Any pair not listed is a non-match.
- `locations.json`: `{"Library": ["LRC", ...]}`. The sample file is an example; use the real alias list.

Filler reports pad the database. How many report per day decides whether the 200-report cap drops real matches, so set `--filler-days` to a realistic campus rate.

## Known gaps
- **`luna` is rebuilt from the written description.** The prompt and word-overlap weights are reconstructions; drop in the real `processReport` code for an exact baseline.
- **Firestore latency is modelled** in `config.js`, not measured.
- **Jev's response format is new.** `src/jevClient.js` reads the documented variants; check it against a real response first.
- **Offline quality numbers are meaningless.** Only the cost and latency estimates mean anything offline.
