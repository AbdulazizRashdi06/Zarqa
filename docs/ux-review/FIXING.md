# Fixing the UX review findings (Zarqa, 2026-11-13)

Temporary working notes for the fix run. Delete `docs/ux-review/` in the last commit before the PR is opened.

A 14-reviewer UX/UI review produced 211 findings. `docs/ux-review/findings.json` holds the ones that belong to a
screen area (fields: `id`, `sev` P0-P3, `owners`, `screen`, `title`, `what`, `where`, `fix`). They were NOT
independently verified: the fixer is the verification. For each finding assigned to you:

1. Check it is real (read the code it points at). If it is not real, or a recorded decision in `decisions.md`,
   `design/HANDOFF.md` or `CLAUDE.md` makes it deliberate, skip it and say why.
2. Fix the root cause with the smallest change that really solves it. The finding's `fix` is a suggestion, not an
   order: do better if you see better.
3. Check your fix: render it if you can (see Tools), otherwise reason it through against the code and the tests.

## Priorities
- Fix every P0 and P1 you own, then every P2.
- P3: fix only when it is a few lines in a file you are already changing. Otherwise skip it.
- Do NOT build new product features or change product rules on your own. If a finding needs a product decision
  (new screen, new notification type, changed matching or retention rule, changed privacy promise, schema change),
  leave it and report it under `needsOwner` with your recommendation. A small UI affordance for something the API
  already supports is fine.
- Launch is days away. Prefer safe, boring fixes. Never trade a working flow for polish.

## Hard rules
- Card and ID photo privacy is the most important rule in this app (see CLAUDE.md). When unsure whether something
  is a card, treat it as a card. Never weaken a privacy check. Never use real card photos.
- No EF Core migrations and no database schema changes. If a fix needs one, report it under `needsOwner`.
- All user-facing copy goes in `web/src/i18n/en.json`. Add new keys next to the related keys of your screen (same
  prefix), never at the end of the file. Keep the playful, student-made voice; plain words for errors and safety.
- Page links and navigation: `Link` from `web/src/lib/nav`, `useNavigate` from `web/src/lib/transition`.
- Motion: follow the rules at the top of `web/src/motion.css` (transform/opacity only, under ~300ms, reduced motion
  keeps fades and drops movement).
- Do not regenerate or replace mascot art. Do not touch `benchmark/`, `deploy/`, `design/`, matching prompts or
  thresholds.
- Match the existing code style of the file you are in. No new dependencies.
- Stay inside the files you own. If a fix truly needs a line in a file you do not own, make the smallest possible
  change there and list it under `touchedOutsideOwnership`.
- The shared foundation is already on the branch: read `docs/ux-review/FOUNDATION-NOTES.md` and use its pieces
  (loading state, load error with retry, announced inline error, user-text direction, wrapping helpers) instead of
  inventing your own. Do not edit the foundation's files except for a small additive change you list.
- Never deploy, never touch the VPS or the live site, never merge into `main`.

## Tools
- Web checks, from `web/`: `npm ci`, then `npm run lint` and `npm run build`.
- Browser tests: `npx playwright install chromium` then `PW_PORT=<port> npx playwright test` (each checkout uses its
  own port; the suite starts or reuses the Vite dev server on it). If the browser cannot be installed in this
  environment, do not burn time on it: GitHub CI runs the browser tests on the PR.
- Screenshots (only if Chromium installed): copy `docs/ux-review/harness.mjs` to `web/.ux-review/harness.mjs`
  (never commit that folder), start `npx vite --host 127.0.0.1 --port <port> --strictPort` from `web/`, set
  `UX_BASE=http://127.0.0.1:<port>`. The harness mocks every /api call; `web/tests/*.spec.ts` show mock shapes.
- Server: `dotnet build server/Zarqa.slnx` if a .NET 10 SDK is available. Server tests need PostgreSQL through
  Docker (Testcontainers); if that is not available, GitHub CI runs them on the PR. Keep server changes small and
  add or update tests in `server/Zarqa.Tests/` for behaviour you change.
- Update or add tests in `web/tests/` when you change behaviour a test covers; put new tests for your area in
  `web/tests/<area>.spec.ts`.

## What to report
For every finding id assigned to you: fixed (one line on what changed), skipped (the reason: not real / deliberate /
P3 not worth it / someone else's files), or needsOwner (with your recommendation). Also the files you touched
outside your ownership and the result of every check you ran.
