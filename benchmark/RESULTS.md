# Benchmark results (2026-10-01)

Every result from the LostraAi matching benchmark. The decisions taken from these are in [../decisions.md](../decisions.md).

## Setup

- **Dataset `data/campus`:** 78 real reports (36 found, 42 lost), with **32 true pairs** and **18 lookalike "trap" pairs**. Size 10 contains only 5 true pairs and no traps.
- **Filler reports** pad the database to 100 / 1,000 / 10,000. They're generated, use real campus places and are never true matches.
- **Models:**
  - gpt-6-luna through the Codex CLI;
  - Jev 1.13 through the TypeSafe API;
  - embeddings from a local all-MiniLM-L6-v2. Production uses text-embedding-3-small, so retrieval numbers are approximate.
- **Metrics:**
  - **Recall:** true pairs shown as a match.
  - **Precision:** shown matches that are true pairs. It's strict: any pair not in the answer key counts as wrong, including plausible filler candidates.
  - **Traps:** lookalike pairs wrongly shown.
- **Cost** per report is priced at API rates. **Latency** for Luna includes Codex CLI start-up and heavy parallel load, so it's far above real API latency. Compare trends, not seconds.
- **Caveats:**
  - 32 true pairs, so one pair is about 3 points.
  - The same writer (Claude) wrote the lost and found texts, so recall is an upper bound.

## 1. Main run: every system at every size

| Size | System | Recall | Retrieved | Precision | Shown | Wrong | Traps | $/report | p50 | p95 | Luna calls/report | Jev calls/report | DB reads/report |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | luna | 100% | 100% | 100% | 5 | 0 | 0/0 | 0.00014 | 9.4 s | 15.0 s | 0.6 | 0 | 3 |
| 10 | luna-vector | 100% | 100% | 100% | 5 | 0 | 0/0 | 0.00014 | 9.5 s | 15.1 s | 0.6 | 0 | 3 |
| 10 | jev (v1) | 40% | 100% | 100% | 2 | 0 | 0/0 | 0.00005 | 0.8 s | 1.1 s | 0 | 1.4 | 3 |
| 10 | jev-photo (v1) | 40% | 100% | 100% | 2 | 0 | 0/0 | 0.00012 | 0.9 s | 6.7 s | 0 | 1.2 | 3 |
| 10 | jev-cascade | 80% | 100% | 100% | 4 | 0 | 0/0 | 0.00020 | 6.7 s | 10.3 s | 0.4 | 1.2 | 3 |
| 100 | luna | 100% | 100% | 86% | 37 | 5 | 2/18 | 0.00072 | 13.7 s | 28.7 s | 4.4 | 0 | 29 |
| 100 | luna-vector | 100% | 100% | 86% | 37 | 5 | 2/18 | 0.00071 | 13.7 s | 28.8 s | 4.4 | 0 | 22 |
| 100 | jev (v1) | 53% | 100% | 100% | 17 | 0 | 0/18 | 0.00020 | 1.1 s | 1.7 s | 0 | 5.5 | 22 |
| 100 | jev-photo (v1) | 53% | 100% | 100% | 17 | 0 | 0/18 | 0.00022 | 1.2 s | 9.2 s | 0 | 4.8 | 22 |
| 100 | jev-cascade | 88% | 100% | 97% | 29 | 1 | 1/18 | 0.00029 | 7.9 s | 14.1 s | 0.3 | 4.8 | 22 |
| 100 | luna-debate @0.60 | 100% | 100% | 94% | 34 | 2 | 1/18 | 0.00165 | 17.4 s | 46.1 s | 8.9 | 4.4 | 22 |
| 100 | **luna-debate @0.65** | **97%** | 100% | **97%** | 32 | 1 | **0/18** | 0.00165 | 29.8 s | 73.7 s | 8.9 | 4.4 | 22 |
| 1,000 | luna | 100% | 100% | 76% | 42 | 10 | 2/18 | 0.00129 | 31.0 s | 43.5 s | 9.4 | 0 | 200 |
| 1,000 | luna-vector | 100% | 100% | 73% | 44 | 12 | 2/18 | 0.00123 | 32.3 s | 47.0 s | 9.6 | 0 | 25 |
| 1,000 | jev (v1) | 53% | 100% | 100% | 17 | 0 | 0/18 | 0.00019 | 1.1 s | 2.7 s | 0 | 5.3 | 25 |
| 1,000 | jev-photo (v1) | 53% | 100% | 100% | 17 | 0 | 0/18 | 0.00024 | 0.9 s | 9.9 s | 0 | 5.1 | 25 |
| 1,000 | jev-cascade | 84% | 100% | 87% | 31 | 4 | 1/18 | 0.00034 | 8.7 s | 21.9 s | 0.6 | 5.1 | 25 |
| 1,000 | luna-debate @0.60 | 100% | 100% | 80% | 40 | 8 | 1/18 | 0.00301 | 86.1 s | 103.0 s | 19.2 | 9.6 | 25 |
| 1,000 | **luna-debate @0.65** | **97%** | 100% | **97%** | 32 | 1 | **0/18** | 0.00302 | 87.9 s | 110.0 s | 19.2 | 9.6 | 25 |
| 10,000 | luna | 94% | 94% | 58% | 52 | 22 | 2/18 | 0.00125 | 31.7 s | 43.4 s | 9.4 | 0 | 200 |
| 10,000 | luna-vector | 100% | 100% | 44% | 72 | 40 | 0/18 | 0.00122 | 31.8 s | 47.4 s | 9.7 | 0 | 25 |
| 10,000 | jev (v1) | 53% | 100% | 94% | 18 | 1 | 0/18 | 0.00019 | 1.1 s | 2.3 s | 0 | 5.2 | 25 |
| 10,000 | jev-photo (v1) | 53% | 100% | 94% | 18 | 1 | 0/18 | 0.00023 | 0.9 s | 9.6 s | 0 | 5.1 | 25 |
| 10,000 | jev-cascade | 84% | 100% | 48% | 56 | 29 | 0/18 | 0.00048 | 9.1 s | 34.2 s | 1.4 | 5.1 | 25 |

luna-debate was not run at 10,000 (judged unrealistic for GUtech) or at 10. In "jev (v1)", the decision is a hand-set formula with hard rules; most of its misses come from that formula, not from Jev's answers (section 2).

## 2. Jev, calibrated (out of sample)

Decision weights fitted with logistic regression. Each half of the reports is scored by weights fitted on the other half.

**With the hard rules on and the production 0.72 cut-off:**

| System | 100 | 1,000 | 10,000 |
|---|---|---|---|
| jev | 88% / 97% / 0 | 84% / 79% / 0 | 78% / 83% / 0 |
| jev-photo | 81% / 96% / 0 | 81% / 79% / 0 | 66% / 84% / 0 |

**Cut-off sweep, hard rules off** (recall / precision / traps; full table in `results/jev-sweep.csv`):

| Cut-off | jev 100 | jev 1,000 | jev 10,000 | jev-photo 100 | jev-photo 1,000 | jev-photo 10,000 |
|---|---|---|---|---|---|---|
| 0.50 | 100/82/5 | 100/62/2 | 97/39/0 | 100/82/5 | 100/62/1 | 97/43/0 |
| 0.55 | 100/82/5 | 97/66/0 | 94/42/0 | 100/84/4 | 97/66/1 | 97/48/0 |
| 0.60 | 100/82/5 | 97/67/0 | 94/46/0 | 100/89/3 | 97/72/0 | 97/52/0 |
| 0.65 | 100/89/3 | 97/70/0 | 88/53/0 | 100/94/1 | 97/72/0 | 94/60/0 |
| 0.70 | 100/94/1 | 94/77/0 | 78/69/0 | 100/94/1 | 97/78/0 | 81/76/0 |
| 0.75 | 97/97/0 | 88/85/0 | 66/91/0 | 97/97/0 | 94/83/0 | 59/95/0 |

With the hard rules on, recall stays at 81–88% whatever the cut-off.

**Honest cut-off, hard rules off** (cut-off chosen on the other half for ≥ 95% recall):

| System | 100 | 1,000 | 10,000 |
|---|---|---|---|
| jev | 97% / 94% / 1 | 97% / 74% / 1 | 97% / 40% / 0 |
| jev-photo | 94% / 94% / 1 | 94% / 75% / 1 | 94% / 45% / 0 |

## 3. luna-debate: decision rule variants

| Rule | 100 | 1,000 |
|---|---|---|
| Fixed, 0.5·same_item + 0.5·overall ≥ 0.60 (set before results) | 100% / 94% / 1 | 100% / 80% / 1 |
| Fixed ≥ 0.65 (raised after reviewing the false matches; partly tuned) | 97% / 97% / 0 | 97% / 97% / 0 |
| Fitted model + honest cut-off (fitted on half the data) | 97% / 89% / 3 | 91% / 60% / 1 |

- **Fitting a model on 32 pairs made luna-debate worse.** The simple fixed rule is the version to trust.
- **At 1,000 reports, the true pairs' scores bottom out at 0.64** (blue pen), 0.67, 0.68, 0.69, 0.69 and 0.73.
- **The 8 wrong matches at cut-off 0.60 all scored 0.60–0.66.**
  - One was the sunglasses-vs-glasses trap.
  - The other 7 were plausible filler candidates, and 6 of those were lost 1–11 months before the found date.

## 4. Diagnostics

- **Jev v1 misses at size 100:** 15 of 32 true pairs.
  - 15 were blocked by finalScore < 0.72 (the hand-set formula).
  - Some were also blocked by a hard rule: brand conflict 2 (AirPods vs AirPods Pro, fx-991 vs fx-991ES), same item type < 0.8 once (JBL earbuds vs earbuds case), and location = different once (Germany Hall vs GU2, an alias gap).
- **jev-cascade at 10,000:** all 29 false matches were accepted by Luna in the cascade step, all involving vague real found reports (mostly the text-only ones) vs. filler.
- **Newest-200 vs. vector search:** identical up to 1,000 reports. At 10,000, newest-200 never reviewed 2 late-reported pairs (94% retrieved), while vector search reached 100%.

## 5. Cost of running the benchmark

- **Luna:** 4,740 gpt-6-luna calls through Codex (ChatGPT plan allowance, $0 billed). Throughput was 13 → 87 calls/min as parallelism rose; no throttling seen at 28 concurrent.
- **Jev:** 2,805 calls (TypeSafe key). At roughly 750 input tokens each, that's well under $0.10.

## Result folders

| Folder (`results/2026-10-01T…`) | Contents |
|---|---|
| `06-07-37-741Z` | sizes 10 and 100, five systems |
| `06-07-39-576Z` | size 1,000, five systems |
| `06-07-41-222Z` | size 10,000, five systems |
| `06-08-39-694Z`, `06-08-41-248Z` | Jev systems at 1,000 / 10,000 (with `calibration.json` and weights) |
| `07-07-20-226Z`, `07-12-38-433Z` | luna-debate @0.60 at 100 / 1,000 |
| `07-54-56-687Z` | luna-debate @0.65 at 100 and 1,000 |
| `results/jev-sweep.csv`, `jev-honest.json`, `debate-sweep.json` | sweeps |
