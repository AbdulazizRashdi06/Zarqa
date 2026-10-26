# Zarqa: handoff for the next session

Start a new Claude Code session with **Claude Opus**, opened in the repo root `C:\Projects\LostraAi` so `CLAUDE.md` and the memory load. Then send:

> Read docs/handoff.md and follow it.

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
- **The VPS is shared.** `deploy/Caddyfile` also routes other apps on the same server: Uni Schedule (`schedule.tryzarqa.com`, `schedule.173-249-40-122.sslip.io`) and Zoor (`zoor.173-249-40-122.sslip.io`). Keep those blocks when editing the Caddyfile, and don't stop or touch their containers. Deploys recreate Caddy when the Caddyfile changes.
- Leave the untracked `.github/hooks/` and `.impeccable/` folders alone: they belong to the owner's design tooling. Don't commit or delete them.
- SSH (port 22) is blocked on the GUtech campus Wi-Fi. If deploy or SSH hangs, the owner has to switch to a phone hotspot; the server itself is fine.

## Stack and layout
- `server/Zarqa.Api`: ASP.NET Core (.NET 10) minimal APIs, EF Core + Npgsql + pgvector, snake_case naming. Folders: `Auth/`, `Users/`, `Reports/`, `Photos/`, `Matching/`, `Chat/`, `Email/`, `Data/` (entities, `ZarqaDb`, migrations, seeder). Errors are returned as `{ "error": "message" }` via `Errors.*` in `Auth/AuthEndpoints.cs`.
- `server/Zarqa.Tests`: xUnit. `TestApp` spins up the real app on a throwaway Postgres DB (`ZARQA_TEST_DB` env var, or Testcontainers when Docker works). `app.SignedIn(email)` returns a signed-in client; `app.Db()` gives a context for assertions.
- `web/`: React 19 + Vite + TypeScript PWA, React Router, CSS modules, fonts via @fontsource. Shared components in `web/src/components/ui.tsx`, icons in `icons.tsx`, API helper in `web/src/lib/api.ts`, session in `web/src/auth/`.
- `deploy/`: `Dockerfile`, `docker-compose.yml` (api, postgres, caddy), `deploy.sh`, `set-secret.*`, `set-env-remote.sh`.
- Local DB: Docker Desktop on the dev PC was broken (stale sockets, needs a Windows restart). Fallback: a dev Postgres on the VPS bound to localhost, reached with `ssh -i ~/.ssh/zarqa_vps -N -L 5433:127.0.0.1:5433 deploy@173.249.40.122`. Then run tests with `ZARQA_TEST_DB="Host=localhost;Port=5433;Database=zarqa;Username=zarqa;Password=zarqa-dev" dotnet test server/Zarqa.slnx`.

## Status (update this section as you go)

Last updated **2026-10-26**. The app is built and live; the pilot work left is checks and owner tasks (see Remaining work).

**Git state on 2026-10-26:**
- `main` is pushed, and `codex-model-choice` is reviewed and merged (9 of 9 gateway tests pass). A gateway 429 makes the app retry the match job, the same as a 502. Deployed: health OK, and Uni Schedule and Zoor still respond.
- The live `zarqa-codex-1` container has a **pids limit of 1024**, while compose says 256. Someone probably changed it by hand. It was left as it is because DriveAlt shares the gateway. Ask the owner before recreating that container.
- `node deploy/live-check.mjs --live --models` passed on 26 Oct: a real Debate match at **0.90875**, handover, stats and two-confirmation deletion at 390 × 844.
- **The owner said not to run the 1,000-report benchmark (26 Oct).** One run was started and stopped after about a minute, and its VPS copy was deleted. Don't start it again unless the owner asks.

**RSA desk (26 Oct):** finders can hand found items to the RSA (drop code), the RSA marks them received, owners collect them with a pickup code (no chat), and staff can read chats read-only. Code is in `server/Zarqa.Api/Rsa/` and `web/src/screens/Rsa.tsx`; tests are `RsaFlowTests.cs` and `web/tests/rsa.spec.ts`. Owner to-dos: add the first RSA staff email on `/rsa` → Team, and send the RSA desk's exact location and hours (the pickup ticket currently says "RSA desk · GUtech campus").

**Since 2026-10-02:**
- **One text per report (3 Oct).** The Home form has a single "describe it" box. The server derives a short display name and the category. Matching uses the one text, with the prescore's 0.24 text weight all on it (`server/Zarqa.Api/Reports/ReportText.cs`, `Matching/TextRules.cs`).
- **Benchmark re-run with the app's real setup (3 Oct):** `benchmark/scripts/run.js --shape one`, at 100 reports: 97% recall, 100% precision, 0 of 18 traps. The 1,000-report re-run is still open.
- **Card finds (3 Oct):** Home asks for the first name printed on a found card, plus the issuer and colour; surnames and numbers stay out. Card photos still never reach a model.
- **Full QA (3 Oct), all passing:** 106 server, 9 browser and 6 gateway tests; 69 security probes; axe accessibility checks. Fixed along the way:
  - the Codex gateway now runs at most 4 Codex processes (`CODEX_MAX_RUNNING`) and queues the rest; the app waits up to 5 minutes for Luna;
  - sign-in limits raised for shared campus Wi-Fi;
  - CSP and anti-framing headers added;
  - faster first load.
- **Home redesign after the design critique (3 Oct):** form first; drafts kept in sessionStorage and IndexedDB; an accessible place picker. Returned is now a two-person handshake in chat.
- **Deploy fix (4 Oct):** deploys recreate Caddy when the Caddyfile changes and never upload local photos.
- **Other apps proxied on the shared VPS (13–20 Oct):** see Hard rules.

**Earlier status (2026-10-02):**
- Owner testing sign-in: `AUTH_ALLOWED_EMAILS` permits the owner's requested personal address as an exact exception to the GUtech-domain rule. Normal email-code verification remains required; this setting does not grant admin rights or enable test mode.
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

In order:
1. ~~Push, merge `codex-model-choice`, deploy~~ (done 26 Oct).
2. ~~Gateway queue and live model check~~ (done 26 Oct: 4 running, 1 GB; Debate match 0.90875).
3. ~~Benchmark at 1,000 reports~~: **on hold at the owner's request (26 Oct).** If the owner asks for it, run it on the VPS in a throwaway container on `zarqa_default` (Luna through `http://codex:8090/v1` with no key, embeddings through the OpenAI API, Jev direct). Don't retune 0.65 on it.
4. **Long-gap date rule (open item in `decisions.md`):** 7 of 8 false matches at cut-off 0.60 had the item lost 1–11 months before it was found. If you add a rule, fix it before measuring (for example, pass Jev a "lost more than 30 days before found" signal) and report it honestly; recall must not drop.
5. **Collect the pilot's confirm/reject outcomes** as the honest check of the 0.65 cut-off. Don't change thresholds without that data.

Still needs the owner:
- Model integration is ready for testing. Run `node deploy/live-check.mjs --live --models` for another disposable real-match check. Benchmark recall/precision on fresh data remains separate work; the integration smoke did not retune thresholds. If Codex login expires or plan usage is exhausted, complete owner login or wait for allowance before retrying.
- Owner: supply an off-site storage account and follow the encrypted backup instructions in CLAUDE.md. Local nightly backups and scratch restoration are verified.
- Before wide launch: review the visible draft Terms and Privacy against current Oman PDPL requirements and overseas processing arrangements.

## Done means
Latest verification (2026-10-03 QA): 106 server, 9 browser and 6 gateway tests passed, plus the security, accessibility and screen-size checks recorded in `decisions.md`. Earlier verification on 2026-10-02: 88 server tests, 5 gateway tests and 4 phone UI tests passed. The live 390 x 844 flow below passed with a real model-generated Debate match (score 0.83875). A previous attempt produced a match but timed out at handover; the smoke now waits for the handover HTTP response before checking the finder. Disposable users, reports and chats were deleted afterward. Photo upload/access passed separately in `deploy/smoke.sh`; this model smoke used text-only reports.

All steps built, tests green, CI green, deployed to https://tryzarqa.com and checked end to end on a phone-sized viewport:
1. sign in
2. post a lost report
3. a second user posts the found report
4. (with model keys) the match appears for the owner
5. "It's mine", chat, handover confirm, "Got it back"
6. stats update

Update `CLAUDE.md`, `decisions.md` (new decisions) and the Status section above. Finish with a short report of what was done and what still needs the user (off-site backups and wider-launch legal review).
