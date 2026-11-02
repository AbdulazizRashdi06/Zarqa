# Handoff: benchmark the Terra judge on the VPS (local session)

**For a Claude Code session on the owner's Windows PC**, which has the SSH key (`~/.ssh/zarqa_vps`) and the campus photos. The cloud session that prepared this could not reach the VPS: it had no SSH key, and outbound SSH was blocked.

## Goal

Run the luna-debate benchmark at 100 campus reports with **two judges side by side**:
- `luna-debate`: the live system, with Jev as the judge.
- `luna-debate-terra`: GPT-6.1 Terra as the judge.

Report the results **by the app's three confidence levels**:
- Small chance: 0.55–0.649
- Looks like it: 0.65–0.799
- Big chance: 0.80+

Then record the numbers.

## What's already done (branch `claude/jolly-wozniak-mvo4q0`)

- **`luna-debate-terra`** (`benchmark/src/reviewers/debate.js`, `systems.js`, `config.js`).
  - Same advocates, shortlist, `0.5·same_item + 0.5·overall` score and 0.55 cut-off as `luna-debate`.
  - Terra gets Jev's exact state and question wording in one structured call, text only, like Jev.
  - Its call is priced at Luna's rates as a placeholder.
- **`benchmark/scripts/levels.js`**: right, wrong and trap suggestions per level, the missed true pairs, and a count of reviews that fell back because a call failed.
- **`deploy/bench-on-vps.sh`**: uploads `benchmark/` to `/opt/zarqa/bench` and runs it in a throwaway `node:22-slim` container on the `zarqa_default` network.
  - Luna and Terra go through the private Codex gateway (`http://codex:8090/v1`) on the server's existing ChatGPT login. Nobody logs in.
  - Embeddings use the server's `OPENAI_API_KEY`, passed only as `EMBEDDING_API_KEY`, never to the gateway. Jev uses `TYPESAFE_API_KEY`. Both are read from `/opt/zarqa/deploy/.env` on the server and never printed.
- **Checked without real models:**
  - All 318 requests in a full 100-report run were accepted by the gateway's own `parseChat`, through a stand-in server.
  - No `Authorization` header reached the gateway, and photos passed.
  - `npm test` passes.
- **The real run has NOT happened yet.** There are no Jev vs Terra numbers.

## Steps

The environment is PowerShell 5.1 (no `&&`). Run the scripts in **Git Bash**.

1. Get the branch:
   ```bash
   git fetch origin claude/jolly-wozniak-mvo4q0
   ```
   ```bash
   git checkout claude/jolly-wozniak-mvo4q0
   ```
2. Check that the 23 campus photos are in `benchmark/data/campus/photos/` (git ignores them). The script refuses to start without them.
   - If they're missing, get them from the collection page `https://claude.ai/artifact/5zgjifC6CEhEeGpahvmnfB`: ArtifactData `list` on `found`, then Artifact `read` with one asset id per call as `path`. Save them as `photos/<assetId>.jpg`.
   - Never add the ID-card or bank-card photos. Those reports are text-only (`sensitive_photo_removed`).
3. Start the run from the repo root:
   ```bash
   bash deploy/bench-on-vps.sh
   ```
   - It checks that the gateway is signed in before starting.
   - It runs in the background on the server and keeps going if the window closes.
   - Defaults: `SIZES=100`, `SYSTEMS=luna-debate,luna-debate-terra`.
   - Don't run 1,000 reports unless the owner asks (open item in `decisions.md`).
4. Follow it with `bash deploy/bench-on-vps.sh logs`. Ctrl+C stops following, not the run.
   - Expect a few hours and roughly 1,000–2,000 Codex calls on the ChatGPT plan; that's a rough guess.
   - The advocate calls are shared: `luna-debate-terra` replays them from the cache and only adds judge calls.
   - Live matching shares the gateway queue and waits behind the run.
5. When `bench.log` says `finished`, run `bash deploy/bench-on-vps.sh result`. It copies the results to `benchmark/results/<time>/` and prints the levels table for each judge.
6. **If the `reviews:` line shows FALLBACK** (for example a Codex usage limit, which shows up as HTTP 429), the run isn't clean. Wait, then start it again. Successful calls are cached on the server in `/opt/zarqa/bench/benchmark/.cache`, so a rerun only retries the failed ones.

## Reporting

- **Give the owner, for each judge:**
  - Recall (x / 32 true pairs).
  - Suggestions per level as right / wrong (traps).
  - The missed pairs.
  - Any fallbacks.
- **Compare with the last measured run** (2026-10-03: 97% recall, 100% precision, 0/18 traps). That run used the old prompt wording and a 0.65 cut-off, so the two aren't directly comparable.
- **Add an entry to `decisions.md`** (newest first) and the numbers to `benchmark/RESULTS.md`. Say that:
  - 0.55 and the level bands are owner-chosen fixed rules, not tuned on this data.
  - Recall is an upper bound, because the same writer wrote both sides of each pair.
  - 32 true pairs means one pair is about 3 points.
- **Deploying Terra stays the owner's call.** The bar set on 2026-10-31 was a score above 0.70 on the Soundcore earbud pair (Terra got 0.67375). This run adds evidence but doesn't change the live judge by itself.

## Rules

- Never print, read or copy key values, `deploy/.env` contents or the Codex `auth.json`.
- Don't commit `benchmark/results/`, `.cache/` or photos (all git-ignored).
- Commit to `claude/jolly-wozniak-mvo4q0`. Don't open a PR unless asked.

## Optional follow-up

So future runs need no laptop: add the VPS key as a `VPS_SSH_KEY` Actions secret on the Zarqa repo, the same way Schedule (`DEPLOY_SSH_KEY`) and DriveAlt (`VPS_SSH_KEY`) already do. Then add a manual "Benchmark on VPS" workflow that runs the remote half of `deploy/bench-on-vps.sh`. Ask the owner first. The photos stay on the server after the first run, so the workflow only needs to upload code.
