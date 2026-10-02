# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Zarqa** (formerly Lostra; the folder is still `LostraAi`) is a university lost-and-found app for GUtech (Halban, Oman) being turned from a uni project into a real app. It matches **lost** reports against **found** reports. It's named after Zarqa al-Yamama, and the mascot is her.

The real app is being **built from scratch**: an ASP.NET Core (.NET 10) backend with PostgreSQL + pgvector, a React + Vite phone-first PWA, and a cheap VPS running Docker. The first milestone is a campus pilot. **Do not read, port or copy the old uni code** (Firestore, `processReport`, WhatsApp). Only the matching design carries over. The repo currently holds:
- `design/`: the approved visual design. [design/HANDOFF.md](design/HANDOFF.md) has the screen flow, form rules and visual system; `screens/*.dc.html` are 390px mockups (layout, colour and type source of truth, not code to ship); `mascot/*.png` are the cutouts.
- `server/` (ASP.NET Core API + matching worker), `web/` (React PWA) and `deploy/` (Docker Compose): being built.
- `benchmark/`: a Node harness that compares matching systems on real campus data. It has its own [benchmark/CLAUDE.md](benchmark/CLAUDE.md).
- [decisions.md](decisions.md): the decision log. **Read it before planning or changing matching.** It records the chosen design, why, the benchmark numbers and the open items.

## Current matching decision (details in decisions.md)

- **luna-debate.**
  1. Embedding retrieval: vector search, top 25.
  2. The existing preliminary-score shortlist: ≥ 0.56, top 10.
  3. Two gpt-6-luna advocates, one arguing for a match and one against, run in parallel and see the photos.
  4. Jev (TypeSafe's typed-decision model) decides. A match is shown when `0.5·same_item + 0.5·overall ≥ 0.65`.
- **Fallback:** plain gpt-6-luna review when Jev is unavailable. Jev is in early access.
- **Recall is the deciding metric.** A missed match means someone never gets their item back. Precision is secondary.
- **Design for 100–1,000 active reports.** GUtech has about 2,000 people, so 10,000 is unrealistic.

## Project rules that aren't obvious from the code

- **Never send photos of ID cards or bank cards to any model, and never copy them into the repo.** The collection page held a real national ID and a debit card; those entries are text-only in the dataset.
- **Choose any setting tuned on benchmark data "honestly":** on one half of the reports, measured on the other (2-fold cross-fitting). Fixed rules set before seeing results are fine. Say so whenever a number was tuned on the data it's reported on.
- **Location aliases come from the GUtech campus map** (`benchmark/data/campus/locations.json`). Bare floor names like "2nd floor" are deliberately excluded because several places share them.
- **Benchmark data comes from a collection page:** a private claude.ai artifact, `https://claude.ai/artifact/5zgjifC6CEhEeGpahvmnfB`. It stores db collection `found` (`locationName`, `photoIds`, `createdAt`) and its photos as artifact assets. Read it with the Artifact tools (ArtifactData `list` on `found`; Artifact `read` with an asset id as `path`, one id per call, because `paths` does not accept asset ids).

## Mascot images

The mascot is a girl inspired by Zarqa Al-Yamama: cream veil, blue eyes, two braids, gold forehead coins. Make images of her with the **`zarqa-mascot` skill** ([.claude/skills/zarqa-mascot/SKILL.md](.claude/skills/zarqa-mascot/SKILL.md)). Don't write mascot prompts by hand.
- Her look is fixed by `assets/character-sheet.png` and a locked prompt (`assets/prompt-template.md`). Only five things change per image: pose, expression, gaze, props and framing. The background is always a transparent PNG. Ask before changing anything locked, like her outfit, a background or a 3D style.
- `scripts/generate.py` fills the prompt and generates the image through the Codex CLI's image generation. It needs Pillow for the transparency check. Output goes to `mascot-output/`: the PNG, the exact prompt, a preview on white and the Codex log.
- Judge images by `<name>.preview.jpg`. Some viewers show the transparent PNG with a dark glow that isn't really there.
- Known drift: the gold cuffs on her braids sometimes disappear.

## Running and deploying

- Launch pages: `/terms`, `/privacy`, `/help`, `/tips` are public; `/admin` is restricted to admins. Profile has account deletion with two confirmations. All new copy lives in `web/src/i18n/en.json`.
- Browser regression tests: `cd web` then `npx playwright install chromium` and `npx playwright test` (390 × 844 viewport, mocked API for launch UI). CI runs these alongside lint/build and server tests.
- Owner override (2026-10-02): keep the existing iPhone mascot. Do not replace its phone or regenerate the artwork.
- Public mascot WebPs are reproducible with `python deploy/optimize-mascots.py` (Pillow). PNG originals stay unchanged; the PWA excludes those PNGs from precache. English pilot fonts use Latin subsets.
- Optional live browser smoke test: `node deploy/live-check.mjs --live` after installing web dependencies and Playwright Chromium. It verifies two disposable users at 390 × 844, suppresses sign-in email via a DB code fixture, routes automatic fixture mail to the reserved `.invalid` domain, and deletes its accounts afterward. Its inserted synthetic match tests the handover flow, **not model accuracy or live model integration**.

- Local: `docker compose -f deploy/docker-compose.dev.yml up -d` (Postgres + pgvector on port 5433), then the `api` and `web` entries in `.claude/launch.json`. Vite proxies `/api` to the API on port 5284.
- Tests: `dotnet test server/Zarqa.slnx`; web: `npm --prefix web run lint` and `npm --prefix web run build`.
- **Deploy:** `bash deploy/deploy.sh` (Git Bash). It uploads the source to the VPS, rebuilds with Docker Compose, and checks `/api/health`. Live at **https://tryzarqa.com** (`www.` redirects there; the old `173-249-40-122.sslip.io` address still works).
- **Secrets on the server:** the user runs `bash deploy/set-secret.sh NAME` (hidden prompt; restarts the API). Never ask for secret values in chat. Non-secret settings (`EMAIL_PROVIDER`, `EMAIL_FROM`, `ZARQA_DOMAIN`) can be edited directly in `/opt/zarqa/deploy/.env`.
- **VPS:** Contabo, Ubuntu 24.04. SSH is `ssh -i ~/.ssh/zarqa_vps deploy@173.249.40.122` (passwordless sudo). It's key-only: root and password login are off. The firewall allows 22/80/443 only, and security updates are automatic. The app lives in `/opt/zarqa`, with secrets in `/opt/zarqa/deploy/.env` (server only, never in the repo).

## Backups and recovery

- Installed for `deploy`: nightly at **02:17 UTC** (06:17 Oman), running `deploy/backup.sh`. Reinstall idempotently with `bash /opt/zarqa/deploy/install-backups.sh` on the VPS.
- `/opt/zarqa/backups/<UTC timestamp>/` contains `database.sql.gz`, `photos.tar.gz` and `SHA256SUMS`, with owner-only permissions. A lock prevents overlapping runs; incomplete runs stay unpublished and are cleaned up. Successful runs remove completed backups older than 14 days. Check `backups/cron.log` and backup timestamps regularly; cron failures do not currently send alerts.
- `bash /opt/zarqa/deploy/restore-check.sh` verifies checksums, imports the latest dump with SQL errors treated as failures into a uniquely named scratch database, and extracts photos into a disposable Docker volume. Both scratch resources are removed afterward. **Verified on 2026-10-02**, including DB and photo archive restoration; production data was not replaced.
- The dump is transactionally consistent, but DB and photo archives are sequential, not one atomic snapshot. Pause writes for a coordinated recovery snapshot if exact synchronization is needed. Secrets and deployment configuration are deliberately excluded and must be recovered separately by the owner.
- For real disaster recovery: stop the API to prevent writes and retention jobs, preserve the current database/photo volume, verify checksums, restore to a new database and volume, check photo references, apply deletion requests made since the snapshot, then switch configuration and restart. Do not import over the running production database. The scratch script is only a restore test.

### Off-site copies (owner storage account required)

1. Choose storage under your own account in an appropriate region; review its handling of personal data. No account or off-site destination has been created.
2. Install `rclone` on the VPS and run its interactive `rclone config` yourself as `deploy`; keep credentials out of this repo and chat. Give the destination a dedicated prefix and enable an encrypted `crypt` remote named `zarqa-backups`. Store its recovery password and configuration separately in your password manager.
3. After a successful nightly backup, run `rclone copy /opt/zarqa/backups zarqa-backups:pilot --include '/20*/**'`. Use **copy**, not sync, and inspect the first upload and download. Do not include `.env` or cron logs.
4. Configure destination lifecycle expiry to 14 days (including old versions) so deleted personal data does not remain indefinitely. If longer retention is needed, review and update the privacy notice first. Add monitoring for failed uploads.
5. Download a complete dated set, verify `SHA256SUMS`, and perform the same scratch restore before relying on off-site recovery. Repeat restore drills periodically.

## Matching model routes (2026-10-02 testing setup)

- The owner chose **OpenAI API embeddings + Luna via ChatGPT-authenticated Codex + direct TypeSafe/Jev**. `OPENAI_API_KEY` is used for `text-embedding-3-small`; `TYPESAFE_API_KEY` selects direct `jev-1.13.0`. Neither key is passed to the Codex service.
- `LUNA_BASE_URL=http://codex:8090/v1` sends only Luna calls to the private gateway. Without this override, the existing OpenAI/OpenRouter API routing still works. Model names, prompts, shortlist and decision thresholds are unchanged.
- The `codex` Compose service has no host port and no database/photo mounts. It uses official CLI 0.160.0 with its own `zarqa_codex_auth` volume, non-root user, read-only root filesystem, ephemeral sessions and disabled shell, web search, apps, agents and hooks. Temporary review files are removed. CLI diagnostics are not returned to users or logged by the gateway.
- Owner login on VPS: `cd /opt/zarqa && docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec codex codex login --device-auth`. Complete the browser/device flow yourself. Never read/copy `auth.json` or any tokens into this repo or chat. The CLI handles token refresh. The auth volume is deliberately excluded from data backups; recovery needs a fresh owner login.
- Enable routing with `bash /opt/zarqa/deploy/enable-codex.sh` after login. Pause matching with `MATCHING_ENABLED=false` in server `deploy/.env` and recreate the API. A configured route does not prove account entitlement; verify a real inference.
- Gateway tests: `node --test deploy/codex/gateway.test.mjs`. Actual matching smoke: `node deploy/live-check.mjs --live --models`; it waits for a **real Debate match**, confirms handover and both return stats, then deletes its disposable users. Default `--live` still inserts a synthetic match.
- Codex review costs logged in the matching ledger are conservative **API-equivalent token estimates**, including CLI instruction overhead; actual reviews use ChatGPT plan allowance. Latency includes CLI startup. This setup validates integration, not benchmark recall or precision.
- Official authentication: https://learn.chatgpt.com/docs/auth ; CLI feature controls: https://learn.chatgpt.com/docs/config-file/config-basic . API keys remain the recommended default for production automation; this user-requested Codex route is for pilot testing.

## Environment

- Windows 11, PowerShell 5.1 (no `&&`). Node 22.
- Model access is in `benchmark/.env`. Never print key values.
- gpt-6-luna is reached through the **Codex CLI** (`npm i -g @openai/codex`), signed in with ChatGPT. The Codex binary bundled with the desktop app is too old and refuses gpt-6-luna.
- OpenRouter had technical issues; there is no OpenAI API key yet.
