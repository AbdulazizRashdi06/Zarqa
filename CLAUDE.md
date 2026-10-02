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

- Local: `docker compose -f deploy/docker-compose.dev.yml up -d` (Postgres + pgvector on port 5433), then the `api` and `web` entries in `.claude/launch.json`. Vite proxies `/api` to the API on port 5284.
- Tests: `dotnet test server/Zarqa.slnx`; web: `npm --prefix web run lint` and `npm --prefix web run build`.
- **Deploy:** `bash deploy/deploy.sh` (Git Bash). It uploads the source to the VPS, rebuilds with Docker Compose, and checks `/api/health`. Live at **https://tryzarqa.com** (`www.` redirects there; the old `173-249-40-122.sslip.io` address still works).
- **Secrets on the server:** the user runs `bash deploy/set-secret.sh NAME` (hidden prompt; restarts the API). Never ask for secret values in chat. Non-secret settings (`EMAIL_PROVIDER`, `EMAIL_FROM`, `ZARQA_DOMAIN`) can be edited directly in `/opt/zarqa/deploy/.env`.
- **VPS:** Contabo, Ubuntu 24.04. SSH is `ssh -i ~/.ssh/zarqa_vps deploy@173.249.40.122` (passwordless sudo). It's key-only: root and password login are off. The firewall allows 22/80/443 only, and security updates are automatic. The app lives in `/opt/zarqa`, with secrets in `/opt/zarqa/deploy/.env` (server only, never in the repo).

## Environment

- Windows 11, PowerShell 5.1 (no `&&`). Node 22.
- Model access is in `benchmark/.env`. Never print key values.
- gpt-6-luna is reached through the **Codex CLI** (`npm i -g @openai/codex`), signed in with ChatGPT. The Codex binary bundled with the desktop app is too old and refuses gpt-6-luna.
- OpenRouter had technical issues; there is no OpenAI API key yet.
