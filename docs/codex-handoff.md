# Zarqa: handoff prompt for finishing the app

Run from the repo root (PowerShell or Git Bash):

```
codex -m gpt-6-astra -c model_reasoning_effort=medium "Read docs/codex-handoff.md and follow it."
```

Everything below this line is the prompt.

---

You are finishing **Zarqa**, a lost-and-found PWA for GUtech university (Oman). The repo is `C:\Projects\LostraAi` (a git repo pushed to `github.com/AbdulazizRashdi06/Zarqa`, branch `main`). It runs live at **https://tryzarqa.com**.

## Read first
1. `CLAUDE.md`: project rules, how to run, test and deploy, the server.
2. `decisions.md`: every decision and why. The matching design is fixed there (luna-debate, cut-off 0.65).
3. `design/HANDOFF.md` and `design/screens/*.dc.html`: the approved visual design. Match it closely. The mockups are layout, colour and type references, not code to ship.
4. This file's **Status** and **Remaining work** sections.

## Hard rules
- **Never read, port or copy the old uni code** (Firestore, `processReport`, WhatsApp). Only the matching design in `decisions.md` and the `benchmark/` harness are sources.
- **Never send photos of ID cards or bank cards to any model.** Reports whose category or title matches the card regex are `IsSensitive`; their photos are skipped for every model call and visible only to the uploader.
- **Never handle secret values.** Don't print, paste or write API keys. The user stores secrets on the server with `powershell -ExecutionPolicy Bypass -File .\deploy\set-secret.ps1 NAME` (or `bash deploy/set-secret.sh NAME` in Git Bash). Non-secret settings go in `/opt/zarqa/deploy/.env`.
- **Recall is the deciding metric** for matching. Any threshold tuned on benchmark data must be chosen honestly (2-fold cross-fitting). Say so if a number was tuned on the data it's reported on.
- Keep the voice playful and student-made (see the `en.json` strings and the design). Every UI string goes in `web/src/i18n/en.json`.
- Commit in small logical steps with clear messages ending with `Co-Authored-By` lines as the existing history does, push to `main`, and deploy with `bash deploy/deploy.sh` (Git Bash) after each finished step. CI (`.github/workflows/ci.yml`) must stay green.

## Stack and layout
- `server/Zarqa.Api`: ASP.NET Core (.NET 10) minimal APIs, EF Core + Npgsql + pgvector, snake_case naming. Folders: `Auth/`, `Users/`, `Reports/`, `Photos/`, `Matching/`, `Chat/`, `Email/`, `Data/` (entities, `ZarqaDb`, migrations, seeder). Errors are returned as `{ "error": "message" }` via `Errors.*` in `Auth/AuthEndpoints.cs`.
- `server/Zarqa.Tests`: xUnit. `TestApp` spins up the real app on a throwaway Postgres DB (`ZARQA_TEST_DB` env var, or Testcontainers when Docker works). `app.SignedIn(email)` returns a signed-in client; `app.Db()` gives a context for assertions.
- `web/`: React 19 + Vite + TypeScript PWA, React Router, CSS modules, fonts via @fontsource. Shared components in `web/src/components/ui.tsx`, icons in `icons.tsx`, API helper in `web/src/lib/api.ts`, session in `web/src/auth/`.
- `deploy/`: `Dockerfile`, `docker-compose.yml` (api, postgres, caddy), `deploy.sh`, `set-secret.*`, `set-env-remote.sh`.
- Local DB: Docker Desktop on the dev PC was broken (stale sockets, needs a Windows restart). Fallback: a dev Postgres on the VPS bound to localhost, reached with `ssh -i ~/.ssh/zarqa_vps -N -L 5433:127.0.0.1:5433 deploy@173.249.40.122`. Then run tests with `ZARQA_TEST_DB="Host=localhost;Port=5433;Database=zarqa;Username=zarqa;Password=zarqa-dev" dotnet test server/Zarqa.slnx`.

## Status (update this section as you go)
- Done: step 1 (skeleton, deploy, CI), step 2 (email-code sign-in through Resend from `hello@tryzarqa.com`, sessions, first-name step), the domain `tryzarqa.com`, and the logo.
- Step 3 (reports) **done and live**: API (`POST /api/reports` multipart with up to 4 photos, `GET /api/reports/mine`, `GET/PATCH/DELETE /api/reports/{id}`, `POST .../close`, `GET /api/home`, `GET /api/photos/{id}` with `PhotoAccess` rules, `/api/me/stats`, avatar upload) and web (Home form posts with photo previews, `Reports`, `ReportDetail`, `Profile` screens). Photos are re-encoded server-side with EXIF stripped. New reports enqueue a `MatchJob`.
- Live check without email: `bash deploy/smoke.sh` signs in a throwaway user by writing a login code straight into the DB, posts a report with a photo, then cleans up.

## Remaining work
Build each step to the design, with tests, then commit, push and deploy.

**Step 4, matching worker** (`server/Zarqa.Api/Matching/`). Port faithfully from `benchmark/` and don't redesign:
- `benchmark/src/text.js` → tokens, overlap, alias index, `expandedLocationTokens`, `daysBetween`, `dateRelation`, `embeddingText`.
- `benchmark/src/prescore.js` → preliminary score. The category term uses `Report.CategoryNorm`; null on either side means 0.
- Retrieval: opposite kind, status Open or InChat, other users' reports, pgvector cosine top 25. Shortlist with prescore ≥ 0.56, top 10 (`CURRENT` in `benchmark/config.js`).
- `benchmark/src/reviewers/debate.js`: two gpt-6-luna advocates (for and against) in parallel, JSON-schema output, photos (first 2 per report, low detail, never sensitive ones) as data URLs. Then Jev (`benchmark/src/jevClient.js`, model `jev-1.13.0`, readers `readNoul`/`readChoice`/`readScore`). Match when `0.5·same_item + 0.5·overall ≥ 0.65`.
- Fallback when Jev is unconfigured or fails: `benchmark/src/reviewers/luna.js` review at 0.72.
- Providers via config/env: `OPENAI_API_KEY` or `OPENAI_BASE_URL` (Luna + embeddings `text-embedding-3-small`, 1536 dims), or `OPENROUTER_API_KEY`; Jev via `TYPESAFE_API_KEY` or OpenRouter's decisions endpoint. **With no keys, the worker leaves jobs pending and logs once**; nothing breaks.
- A `BackgroundService` polls `match_jobs` (lock with `locked_until`, 3 tries with backoff). It writes a `review_log` row per step (prescore parts, advocate outputs, Jev answers, tokens, latency) and creates `Match` rows (unique pair, never re-suggest a rejected pair). It runs in both directions: a new found report is matched against open lost reports too.
- Match reasons (only for created matches): code facts (same category, same campus place via aliases, time gap) plus one short Luna "explain" call for 1–2 detail bullets. Keep the decision prompts identical to the benchmark.
- Daily model-spend cap in config.
- Tests: a golden prescore test. Write a small Node script in `benchmark/scripts/` that exports `preliminaryScore` inputs and outputs for the campus reports using deterministic synthetic vectors; C# must match within 1e-9. Plus worker tests with fake model clients.

**Step 5, Match screen** (`Match.dc.html`): `GET /api/matches/{id}` (lost owner only), `POST /api/matches/{id}/confirm` (creates a `Conversation` plus a Zarqa system message, sets both reports to InChat, returns the conversation id), `POST /api/matches/{id}/reject`. Strength stamp: ≥ 0.80 "STRONG MATCH", else "LIKELY MATCH". Show found photos only if not sensitive.

**Step 6, Chats** (`Chats.dc.html`, `Chat.dc.html`, `Returned.dc.html`): conversation list with unread counts (`Chat/Chats.cs`), messages (polling every few seconds is fine; SignalR optional), quick replies, a handover ticket (suggest time and place, confirm, suggest another), "Got it back" → both reports Returned, other suggested matches expire, Returned overlay. Display names follow `ShowFirstName` (`MeEndpoints.DisplayName`).

**Step 7, Notifications**: web push (VAPID keys generated by the app and stored in the DB, `WebPush` NuGet, a service-worker push handler) for new matches (if `MatchAlerts`), claims, messages and handover updates. Email (Resend, existing `IEmailSender`, add methods) for new matches and claims. Add an "Add to Home Screen" nudge for iOS.

**Step 8, launch prep**: admin page (users with `IsAdmin`: report list and moderation, ban user, match log from `review_log`, metrics). Terms, Privacy (Oman PDPL, Royal Decree 6/2022), Help and Safe-handover-tips pages linked from SignIn and Profile. Retention job: reports expire after 60 days with a "still looking?" email; delete returned or expired data after 6 months. Nightly `pg_dump` and photo-volume backup on the VPS (cron, keep 14 days; off-site storage needs the user's account, so leave instructions). Replace `design/mascot/phone.png` (it shows an Apple logo) using the `zarqa-mascot` skill if available, otherwise list it as a TODO.

## Done means
All steps built, tests green, CI green, deployed to https://tryzarqa.com and checked end to end on a phone-sized viewport:
1. sign in
2. post a lost report
3. a second user posts the found report
4. (with model keys) the match appears for the owner
5. "It's mine", chat, handover confirm, "Got it back"
6. stats update

Update `CLAUDE.md`, `decisions.md` (new decisions) and the Status section above. Finish with a short report of what was done and what still needs the user (model keys, Jev access, off-site backups).
