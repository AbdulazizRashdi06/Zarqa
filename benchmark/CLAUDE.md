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
node scripts/edge-read.js --runs <name>,<name> --lines 0.55,0.75   # read finished edge runs as good match / bad match (free)
node scripts/edge-failures.js --run <name> --show-from 5 --line 0.55   # a run's costliest mistakes by the owner's rules, with the debates (free)
node scripts/edge-diff.js --base <run> --cand <run> --gate one-day|relative|undated|early   # what a change moved, on the pairs it is aimed at and on the rest (free)
node scripts/edge-outside.js prepare|merge --data data/<set> ...       # check a set written by an outside agent, cut rating batches, merge the raters' scores
node scripts/edge-rate.js --runs <name>,<name> --show-from 4,5,6   # best line for each run from the 0-10 quality ratings (round 3 sets; free). Owner's rules are the defaults: a wrong suggestion counts a quarter of a miss, mistakes on easy pairs count most
```

`edge.js` reviews every labelled pair with the models even when retrieval or the shortlist dropped it, so each miss is blamed on the right stage. Three model calls per pair: through the Codex gateway (`OPENAI_BASE_URL=http://127.0.0.1:8090/v1`, `node deploy/codex/gateway.mjs`) about 55 calls a minute is safe; more than that used up the ChatGPT plan's allowance, which production shares. `data/edge/round1` is for tuning and `round2` is the holdout; `round3` (2026-11-15) is a fresh text set, mostly undated with lookalikes in the same place, labelled good match / bad match from the start. `scripts/edge-build.js` builds a set from the writers' output. `SIMILARITY_RULE=v2` selects a proposed, unmeasured rewording.

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

**Spending stop** (`src/spend.js`). With `SPEND_CAP_USD` set, every live API call is priced from the usage the API reports (Luna, Terra and embedding prices in `config.js`) and added to `.cache/spend.json`, which carries over between runs; at the cap the process exits with code 3. The owner set a 10 dollar budget for testing on 2026-11-15 and added 10 more the same day (20 in all): run API tests with `SPEND_CAP_USD=19.5 OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=proxy-injected` (the cloud environment adds the real key), one process at a time, and do not reset the file unless the owner sets a new budget.

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

**`data/photo-set/`** (2026-11-14) is the found side for photo tests: 92 found reports that each have a photo. 23 are the campus photos (`data/campus/photos/`, rebuilt from the collection page) and 69 are openly licensed photos from Openverse/Flickr (`data/online/photos/`), each looked at by an agent and kept only if it shows one everyday item with no face and no readable card or document. Their texts say only what is visible in the photo. `data/photo-set/round1` and `round2` add blind-written finder and owner reports and graded pairs for those photos (round 2: mostly undated, lookalikes found in the same place); run them with `scripts/edge.js`, with `--no-photos` for the text-only comparison. `PHOTO_LINE` and `PHOTO_RULE` switch on wordings that were tested and not adopted (decisions.md, 2026-11-15). `JUDGE_PHOTOS=1` (the judge sees the photos), `MATCH_DEFINITION=1|2|3` (drafts of what counts as a match) and `DETAIL_CHECK=1` are experiments for the owner to rule on; `--fold a|b` splits pairs by item kind for tuning on one half and measuring on the other. Read results as good match / bad match with `scripts/edge-read.js`: it uses `definitionLabel` in `pairs.json` (the written definition applied by labellers who saw neither the truth nor the app's answers; kinds `must`, `trap-soft`, `lookalike` against `trap`, `stretch` where a set has no labels), counts pairs two labellers split on (`disputed`) apart, and reports real items shown as the check on the definition. `data/photo-set/round3` was labelled this way from the start and is the unseen set for the judge-sees-photos arm. The photos are not in git: `data/online/manifest.json` lists each online photo's page, author and licence (CC BY, CC BY-SA, CC0 or public domain; credit the author when one is shown), and `node scripts/fetch-online-photos.js restore` downloads them again.

**`data/independent/`** (2026-11-15) is a benchmark written by an agent with no knowledge of the matching work or the earlier sets: 271 reports, 276 pairs, its own taxonomy (`DESIGN.md`). It uses the same photos, minus four it rejected. Run it with `scripts/edge.js --data data/independent`.

**`data/independent2/`** (2026-11-16) is the second outside set, written through the `outside-benchmark-writer` agent and rated with the light version (one rater, a second on two of seven batches). `data/photo-set/luna-captions.json` holds one gpt-6-luna description per found photo (`scripts/caption-photos.js`), for `edge.js --photo-captions`. `EARLY_LINE=1`, `ONE_DAY_LINE=1` and `POSTED_ON=1` switch on the date candidates from the tuning loops; none is accepted yet (decisions.md, 2026-11-16).

**Testing another model on the Claude plan** (2026-11-16, `scripts/plan-agents/`). With no API key for a model, helper agents can stand in for it: `export-advocates.mjs <set> <out> <prefix> 10` writes exactly what the app's advocates get, `advocates-workflow.js` (a Workflow script, args `{dir, files}`) has one agent per side per file argue, `merge.py` joins the task outputs, `build-judge.mjs <set> <advocates.json> <out> <prefix> 12` builds the judge's inputs from those arguments, `judge-workflow.js` judges them, and `assemble.py <base run> <new run> <judge.json> <advocates.json>` writes a `results/edge-<new run>` folder the usual scripts score (search and screen results come from the base run). `ONE_DAY_LINE=1 EARLY_LINE=1` on the two export scripts writes only the pairs a date note applies to. A workflow runs only two or so agents at once on this machine, so split the files over several workflows. It is a rough test: an agent sees 10 to 12 pairs in one sitting, agents sometimes skip a pair (check for missing `n` and re-run those), and one attached a photo to the wrong neighbouring pair. Results for Claude Haiku 5.5: decisions.md, 2026-11-16 (its line is about 0.35, not 0.55). `ADVOCATE_PLACE_SHADE=1` and `JUDGE_CONFLICT=1` switch on loop H2's two wordings (both rejected on the seen sets); `node scripts/edge-stupid.js --runs <run>:<line> [--not-against]` counts stupid matches (shown although rated 2 or below) and, with `--not-against`, applies the rule that a pair is hidden when the judge's own `stronger_case` is against.

**`data/sample/`** is a tiny text-only set for offline checks. Any pair not listed in `pairs.json` with `isMatch: true` counts as a non-match.
