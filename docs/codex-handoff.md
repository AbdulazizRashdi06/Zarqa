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
- Matching model access configured and verified on 2026-10-02: `text-embedding-3-small` through the OpenAI API, `gpt-6-luna` through the private ChatGPT-authenticated Codex gateway, and direct TypeSafe `jev-1.13.0`. The owner completed VPS device login and split routing is enabled. A real Debate match scored 0.83875; the complete phone flow, return stats and account deletion passed. All 88 server tests and 5 gateway tests pass; routing implementation CI is green.
- Precache optimized from 2854.67 KiB to about 1261 KiB using WebP mascots and Latin font subsets. Original PNG artwork, including the iPhone, is unchanged.
- Backups installed: nightly 02:17 UTC as `deploy`, database + photos, 14-day retention, checksum verification. Scratch DB and photo-volume restore passed on 2026-10-02. Off-site setup instructions in `CLAUDE.md` await owner storage.
- Launch web completed: `/admin` stats, moderation and per-report logs; two-confirmation account deletion; public Terms, Privacy, Help and Tips. Four mobile browser regression tests added; all 86 server tests pass. Pushed to main and deployed; live phone flow and account deletion verified with disposable users and a synthetic match.
- User instruction (2026-10-02): **keep the existing iPhone mascot**. Do not regenerate or replace it; file-size optimization is still in scope.
- Done: step 1 (skeleton, deploy, CI), step 2 (email-code sign-in through Resend from `hello@tryzarqa.com`, sessions, first-name step), the domain `tryzarqa.com`, and the logo.
- Step 3 (reports) **done and live**: API (`POST /api/reports` multipart with up to 4 photos, `GET /api/reports/mine`, `GET/PATCH/DELETE /api/reports/{id}`, `POST .../close`, `GET /api/home`, `GET /api/photos/{id}` with `PhotoAccess` rules, `/api/me/stats`, avatar upload) and web (Home form posts with photo previews, `Reports`, `ReportDetail`, `Profile` screens). Photos are re-encoded server-side with EXIF stripped. New reports enqueue a `MatchJob`.
- Step 4 (matching) **done and deployed**: `server/Zarqa.Api/Matching/` (TextRules + Prescore ported with a golden test against `benchmark/` output, ModelClients, Reviewers (debate, Luna fallback, Jev readers), Reasons, Matcher, MatchWorker). Matching requires embeddings and Luna routes; Jev is configured for debate. The owner-selected split routes are documented in `CLAUDE.md`. Tests use `FakeModels`; `app.DrainMatchingAsync()` runs the worker. `INotifier` (`Matching/Matcher.cs`) is the hook for step 7.
- Steps 5–6 (Match screen, chats) **done and live**: `Chat/MatchEndpoints.cs` (GET match for the lost owner, confirm opens a conversation, reject), `Chat/ChatEndpoints.cs` (list with unread, thread with `?after=` polling, messages, handover suggest/confirm, read markers, returned, not-it). Web: `Match.tsx`, `Chats.tsx`, `Chat.tsx` (polls every 4 s; Returned overlay).
- Step 7 (notifications) **done and live**: `Notifications/` (VAPID keys generated into `app_settings`, `WebPushSender`, background `NotificationQueue`/`NotificationWorker`, `NotificationSender` with push + emails for matches and claims, `/api/push/key|subscribe|unsubscribe`). Web: `public/push-sw.js` (imported by the generated SW), `lib/push.ts`, `components/AlertsNudge.tsx` on Home, Profile's Match alerts switch asks permission.
- Step 8 **server done** (tested, deployed): `Admin/AdminEndpoints.cs` (`/api/admin/stats|reports|reports/{id}/close|users/{id}/ban|unban|log`, policy `admin`; admins come from `ADMIN_EMAILS` and get the role at sign-in), `Admin/Retention.cs` (daily: expire open reports after 60 days with an email, delete finished data after 6 months, housekeeping) and `DELETE /api/me` (delete account). `ADMIN_EMAILS` on the server is set to the owner's address.
- Live check without email: `bash deploy/smoke.sh` signs in a throwaway user by writing a login code straight into the DB, posts a report with a photo, then cleans up.

## Remaining work

Launch web and local VPS backups are complete. The existing iPhone mascot is retained at the owner's explicit request.

- Model integration is ready for testing. Run `node deploy/live-check.mjs --live --models` for another disposable real-match check. Benchmark recall/precision on fresh data remains separate work; the integration smoke did not retune thresholds. If Codex login expires or plan usage is exhausted, complete owner login or wait for allowance before retrying.
- Owner: supply an off-site storage account and follow the encrypted backup instructions in CLAUDE.md. Local nightly backups and scratch restoration are verified.
- Before wide launch: review the visible draft Terms and Privacy against current Oman PDPL requirements and overseas processing arrangements.

## Done means
Verification on 2026-10-02: 88 server tests, 5 gateway tests and 4 phone UI tests passed. The live 390 x 844 flow below passed with a real model-generated Debate match (score 0.83875). A previous attempt produced a match but timed out at handover; the smoke now waits for the handover HTTP response before checking the finder. Disposable users, reports and chats were deleted afterward. Photo upload/access passed separately in `deploy/smoke.sh`; this model smoke used text-only reports.

All steps built, tests green, CI green, deployed to https://tryzarqa.com and checked end to end on a phone-sized viewport:
1. sign in
2. post a lost report
3. a second user posts the found report
4. (with model keys) the match appears for the owner
5. "It's mine", chat, handover confirm, "Got it back"
6. stats update

Update `CLAUDE.md`, `decisions.md` (new decisions) and the Status section above. Finish with a short report of what was done and what still needs the user (off-site backups and wider-launch legal review).
