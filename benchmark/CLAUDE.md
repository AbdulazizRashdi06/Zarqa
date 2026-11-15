# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A zero-build Node (ESM, Node ≥ 20) harness that runs several lost/found matching systems on the same dataset at several database sizes, and scores recall, precision, lookalike "traps", cost and latency. Project context and the decision log are in [../CLAUDE.md](../CLAUDE.md) and [../decisions.md](../decisions.md). README.md predates the Codex/Jev/debate work; trust this file and the code over it.

## Commands

Run from `benchmark/`. `npm run bench` loads `.env`; plain `node scripts/run.js` does not.

```
npm test                                                   # unit tests (node --test "test/*.test.js")
node --test --test-name-pattern "decide" "test/*.test.js"  # one test
npm run bench:offline                                      # free dry run on data/sample: pipeline check + cost/latency ESTIMATE
node scripts/run.js --offline --data data/campus --systems luna,jev --sizes 100
npm run bench -- --data data/campus --systems luna-debate --sizes 100,1000 --yes   # live (refuses without --yes)
npm run bench -- ... --max-queries 2 --sizes 10 --yes      # tiny live smoke test
node scripts/build-campus.js                               # rebuild data/campus/{reports,pairs}.json
node scripts/calibrate.js --run results/<dir>              # fit Jev weights, out-of-sample report
node scripts/sweep-jev.js --runs results/<a>,results/<b>   # Jev cut-off sweep + honest cut-off
node scripts/sweep-debate.js --runs results/<dir>          # luna-debate scoring + honest cut-off
node scripts/false-matches.js export|score --runs <dirs>   # blind labelling of false matches
node scripts/inspect-jev.js                                # Jev answers + blocking rule for each true pair
LUNA_PROVIDER=none node scripts/count-reviews.js           # how many Luna reviews a run will need
node scripts/edge.js --data data/edge/round1 --offline     # edge cases: where each labelled pair is lost before the models (free)
node scripts/edge.js --data data/edge/round2 --normalize --vector-limit 100000 --triage 30 --triage-order model --yes   # live, the app's pipeline since 2026-11-14
EDGE_LEGACY=1 node scripts/edge.js --data data/edge/round2 --yes   # live, the app before 2026-11-14 (control)
```

`edge.js` reviews every labelled pair with the models even when retrieval or the shortlist dropped it, so each miss is blamed on the right stage. Three model calls per pair: through the Codex gateway (`OPENAI_BASE_URL=http://127.0.0.1:8090/v1`, `node deploy/codex/gateway.mjs`) about 55 calls a minute is safe; more than that used up the ChatGPT plan's allowance, which production shares. `data/edge/round1` is for tuning and `round2` is the holdout. `scripts/edge-build.js` builds a set from the writers' output. `SIMILARITY_RULE=v2` selects a proposed, unmeasured rewording.

Run options: `--systems`, `--sizes`, `--max-queries`, `--parallel` (reports at once), `--review-concurrency` (reviews per report), `--weights <json>`, `--filler-days`, `--no-cache`.

## Architecture

**Run flow** (`scripts/run.js`):
1. `loadDataset`.
2. Deterministic filler reports (`src/filler.js`) pad the database to each size. `buildDatabase` puts whole gold pairs in first.
3. Setup: embed every report; for photo systems, extract photo attributes.
4. Each real report is processed as if it had just arrived, against counterparts created before it (`eligibleCounterparts`).
5. `src/metrics.js` scores the run. A true pair counts as found if it became visible from either side.
6. Output goes to `results/<time>/summary.json` and `runs.jsonl`. **`runs.jsonl` is only written when the whole run finishes**, so a stopped run loses its per-pair output. Replay from cache instead.

**Systems** (`src/systems.js`, `PIPELINES`). All share embedding → retrieval → preliminary score → shortlist → reviewer:

| System | Retrieval | Reviewer |
|---|---|---|
| `luna` | newest 200 | gpt-6-luna (`src/reviewers/luna.js`); production rebuilt from its description |
| `luna-vector` | vector top 25 | gpt-6-luna |
| `jev` | vector top 25 | Jev typed questions (`src/reviewers/jev.js`); decision = `decide()` in code |
| `jev-photo` | vector top 25 | Jev; adds a one-off vision call per report (`src/photoAttributes.js`) |
| `jev-cascade` | vector top 25 | Jev; unsure pairs go to Luna |
| `luna-debate` | vector top 25 | two Luna advocates (for/against) in parallel, then Jev decides (`src/reviewers/debate.js`); cut-off `PROPOSED.debateThreshold` |
| `luna-debate-terra` | vector top 25 | the same advocates, judged by gpt-6.1-terra (the app's judge since 2026-11-10) |

The preliminary score (`src/prescore.js`) is a reconstruction of production's formula: cosine + category/text/location/date boosts.

**Providers** (`src/openai.js` routing):
- **Luna**, in order of preference: `OPENAI_BASE_URL`, then `OPENAI_API_KEY`, then `OPENROUTER_API_KEY`, else the **Codex CLI** (`src/codexClient.js` runs `codex exec` with `--output-schema`, `-i` images and the prompt on stdin).
- **Embeddings:** an API if configured, else local `Xenova/all-MiniLM-L6-v2` (`src/localEmbed.js`, transformers.js).
- **Jev:** `TYPESAFE_API_KEY`, else OpenRouter (`src/jevClient.js`). Its readers accept the documented answer shapes: `noul`, `choice`/`probabilities`, `score`/`legend`/`probabilities`.

**Codex-specific accounting.**
- A one-off baseline call measures Codex's own prompt overhead (~12k tokens), which is subtracted from token counts.
- Latency is measured as-is and includes CLI start-up, so Luna seconds are not comparable to API or Jev seconds.
- Each call is a separate process of about 150 MB. ~28 at once works on a 16 GB machine at ~75–90 calls/min.
- run.js lowers concurrency for Codex unless `--parallel`/`--review-concurrency` are passed.

**Cache** (`src/cache.js`). Every paid call is cached in `.cache/<kind>/<sha256>.json` with its measured latency, and replays return that latency. Reruns are therefore free and reproducible. Changing a prompt, schema or model name changes the key and triggers new paid calls.

**Cost and latency** (`src/ledger.js`).
- Cost is priced from token counts with `PRICES` in `config.js`. Local embeddings are priced as if `text-embedding-3-small` were used.
- Latency is a critical path: stages run in sequence, while reviews run in parallel batches. A reviewer that runs calls in parallel reports its own `latencyMs`.
- **Firestore time is modelled, not measured** (`FIRESTORE_LATENCY` in `config.js`).

**Offline mode** (`--offline`). Uses hashed bag-of-words vectors, stand-in reviewers and `OFFLINE_ESTIMATE` token counts. Only its cost and latency estimates mean anything.

**Calibration** (`src/calibration.js`).
- Logistic regression on Jev answers + cosine, with 2-fold cross-fitting by lost-report id.
- `calibratedDecision` scores each pair with weights fitted on the other fold.
- "Honest" cut-offs are chosen on one fold and applied to the other.

**`config.js`** is the single place for models, prices, production thresholds (`CURRENT`), proposed thresholds (`PROPOSED`), runtime concurrency and the system list.

## Data

**`data/campus/`** is built by `scripts/build-campus.js` from the collection page. Photos are in `photos/<assetId>.jpg`.

| Content | Count |
|---|---|
| Found reports | 36 (10 text-only `F-P*`) |
| Lost reports | 42 |
| True pairs | 32 |
| Hard-negative ("trap") pairs | 18 |

- **Dates are simulated:** all photos were taken within one hour, so each lost report gets a delay.
- **The same writer (Claude) wrote both sides**, so recall is an upper bound.
- **Reports tagged `sensitive_photo_removed` must stay photo-less.**

**`data/photo-set/`** (2026-11-14) is the found side for photo tests: 92 found reports that each have a photo. 23 are the campus photos (`data/campus/photos/`, rebuilt from the collection page) and 69 are openly licensed photos from Openverse/Flickr (`data/online/photos/`), each looked at by an agent and kept only if it shows one everyday item with no face and no readable card or document. Their texts say only what is visible in the photo. `data/photo-set/round1` and `round2` add blind-written finder and owner reports and graded pairs for those photos (round 2: mostly undated, lookalikes found in the same place); run them with `scripts/edge.js`, with `--no-photos` for the text-only comparison. `PHOTO_LINE` and `PHOTO_RULE` switch on wordings that were tested and not adopted (decisions.md, 2026-11-15). `JUDGE_PHOTOS=1` (the judge sees the photos), `MATCH_DEFINITION=1|2` (drafts of what counts as a match) and `DETAIL_CHECK=1` are experiments for the owner to rule on; `--fold a|b` splits pairs by item kind for tuning on one half and measuring on the other. Read results as good match / bad match (kinds `must`, `trap-soft`, `lookalike` against `trap`, `stretch`), with real items shown as the check on the definition. The photos are not in git: `data/online/manifest.json` lists each online photo's page, author and licence (CC BY, CC BY-SA, CC0 or public domain; credit the author when one is shown), and `node scripts/fetch-online-photos.js restore` downloads them again.

**`data/sample/`** is a tiny text-only set for offline checks. Any pair not listed in `pairs.json` with `isMatch: true` counts as a non-match.
