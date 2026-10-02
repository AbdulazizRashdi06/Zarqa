# Zarqa decisions

The decisions made while turning the uni matching prototype into a real app, and the reasons for them. Newest first. Benchmark code and results: `benchmark/`.

## 2026-10-03: First names on found cards may go to matching

- **Decision:** when someone finds a student, ID or bank card, Home asks them to type the **first name** printed on it, plus the issuer and colour. Owners are asked to mention their first name too. Surnames, ID numbers and card numbers stay out.
- **Why:** a card is near-impossible to match on "blue card" alone, and recall is the deciding metric. A first name alone identifies little on a 2,000-person campus.
- **What doesn't change:** card and ID *photos* are still never sent to any model, are visible only to the uploader, and are never copied into the repo. The text, including the first name, goes through matching like any other report text.
- Chosen by the user during the Home critique (2026-10-03).

## 2026-10-03: Home screen tidy-up after the design critique

- The form comes first: Zarqa's speech bubble, the "TAG 01/02" and "GUTECH CAMPUS" labels and the field numbers are gone. My Reports is a one-line chip. The Lost/Found tags sit above the form, and Zarqa has her own column beside the headline.
- Submit stays enabled; an empty description focuses the box with "Tell me what it is first." The 10-posts-a-day limit shows under the button.
- Unfinished drafts are kept for the browser tab: fields in sessionStorage, photos in IndexedDB.
- Accessibility: the place picker is an ARIA combobox with arrow keys; placeholders meet 4.5:1; focus rings are ink on paper; the × buttons have 44px targets.

## 2026-10-02: Exact sign-in exception for the owner to test

- The owner requested access with their personal Gmail address. Add server-configured exact email exceptions through `AUTH_ALLOWED_EMAILS`; GUtech domain/subdomain acceptance stays the default.
- Apply the same rule to requesting and verifying codes. Exceptions still prove mailbox access with the normal emailed code, receive no extra privileges, and do not enable test mode. Do not publish the owner's address in source or UI copy.

## 2026-10-02: Authenticate Luna with ChatGPT for matching tests

- Owner explicitly chose direct Jev API, ChatGPT/Codex authentication for Luna, and a separate OpenAI API key for embeddings. Preserve the production embedding model and all matching prompts/thresholds.
- Add a separate private Luna gateway using the official CLI; its login credentials remain in a dedicated server volume. The app routes embeddings to OpenAI and Jev directly to TypeSafe. Gateway receives no API keys, exposes no public port and disables model tools.
- Use a real model-generated Debate match in the phone smoke test, rather than an inserted match. Integration checks do not establish recall or precision; no thresholds were retuned.
- Review spend values are API-equivalent estimates because Codex uses ChatGPT plan usage, with CLI overhead/latency included. The existing daily cap remains a conservative pause mechanism.
- Verified on the VPS after owner device login: OpenAI embeddings, both Luna advocates and direct Jev produced a real Debate match at 0.83875. Claim, chat, confirmed handover, returned stats and account deletion passed in the live phone smoke. Its disposable fixtures were removed. The first attempt matched but hit a handover-button timeout; the smoke now waits for the handover HTTP response before checking the finder. This establishes text-only integration, not live vision support or matching accuracy.

## 2026-10-02: Smaller offline download, unchanged artwork

- Keep all original mascot PNGs, including the existing iPhone, per the owner's instruction. Ship WebP copies at display-appropriate sizes; omit PNG mascots from service-worker precache while retaining them for older clients.
- Use Latin font subsets for the English pilot; revisit font coverage when adding Arabic. Precache falls from 2854.67 KiB to approximately 1261 KiB (56% smaller). Mascot files fall from 1,780,200 to 278,980 bytes (84% smaller).
- Reproduce the image conversion with `deploy/optimize-mascots.py` (Python + Pillow). No artwork or branding was changed.

## 2026-10-02: Nightly backups

- Nightly database and photo backups at 02:17 UTC, retained locally for 14 days with owner-only access. Publish only complete, verified archives and prevent concurrent runs with `flock`.
- Verified a restore into a scratch database and disposable photo volume; the production database was untouched. Database and photos are captured sequentially, so recovery must account for intervening uploads/deletions.
- Off-site storage awaits the owner's account. Setup, encryption, lifecycle and restore instructions are in `CLAUDE.md`; no accounts or credentials were created.

## 2026-10-02: Pilot launch pages and moderation

- Public Terms, Privacy, Help and Tips are accessible without signing in. Legal texts visibly remain drafts requiring review before wider launch. Privacy describes actual admin access, overseas providers, sensitive-photo protection and retention, without claiming compliance.
- Admin UI uses the existing protected API: latest 200 reports, explicit close/ban confirmations, unban, and latest 100 log entries per report. Card/ID photos stay private to the uploader.
- Account deletion asks twice, preserves the session on a failed request, and clears it only after successful deletion.
- The owner explicitly requested keeping the existing iPhone mascot. This supersedes the earlier request to replace its Apple-branded phone.
- Verified the PDPL reference against MTCIT: https://www.mtcit.gov.om/sectors/governance/personal . Review must include subsequent amendments, including the ministry's listed Royal Decree 68/2026; no legal compliance assessment has been made.

## 2026-10-03: Match on one text per report

**Decision.** The Home form has one "describe it" box instead of category, name and description. Matching uses that one text:
- No item name goes into the prescore, the embedding or the prompts.
- The category comes from keywords in the text.
- When both reports have no name, the prescore puts the whole text weight (0.24) on the one text. This is a fixed rule, set before measuring.
- A short display name is cut from the text for report cards only.
- Older two-field reports fold their name into the text.

**Checked** with `benchmark/scripts/shortlist-experiment.js` on the campus set (32 true pairs, filler to 100 and 1,000 reports). The question was whether true pairs still reach the review stage:

| Embeddings | Report shape | Top-25 retrieval | Shortlist ≥ 0.56 | Reviews per report (100 / 1,000) |
|---|---|---|---|---|
| MiniLM (the benchmark's) | two fields | 100% | 100% | 4.3 / 9.6 |
| MiniLM | one text | 100% | 100% | 5.1 / 9.8 |
| text-embedding-3-small (production) | two fields | 100% | 100% | 7.6 / 9.9 |
| text-embedding-3-small | one text | 100% | 100% | 8.9 / 10.0 |

**Found on the way.** The luna-debate benchmark run used the local **MiniLM** embeddings, but production uses **text-embedding-3-small**. The shortlist still keeps every true pair with the production model. It is fuller, though: more pairs are reviewed, which costs a little more.

**Not yet re-measured.** The final debate decision (recall, precision, traps) with one-text prompts and production embeddings needs a paid luna-debate re-run, or the pilot's own confirmed/rejected labels. Until then, the 97% recall from 2026-10-01 is an estimate for the app, not a measurement.

## 2026-10-02: Matching in the app (step 4)

**Decision.**
- **A faithful port** of the benchmark's luna-debate, in `server/Zarqa.Api/Matching/`. A golden test checks the C# text helpers and preliminary score against the benchmark's own output for 353 campus pairs (within 1e-9), so the benchmark's numbers apply to the app. The advocate and fallback prompts are copied verbatim.
- **Pipeline per report:** embed, then vector top 25 (other people's open or in-chat reports of the opposite kind), then a prescore shortlist (≥ 0.56, top 10), then review. It runs in both directions.
- **Review:** the debate with Jev when Jev is configured. If Jev is missing or fails, a plain Luna review decides at 0.72. If an advocate call fails, the job is retried (3 tries with backoff).
- **A pair is reviewed once.** Suggested, confirmed and rejected pairs are never reviewed or suggested again.
- **Photos:** the first 2 per report go to the models; card/ID reports send none.
- **Queue:** `match_jobs`, with a single background worker. **Without model keys, jobs wait** and nothing breaks.
- **Spend cap:** matching pauses for the day once logged model cost reaches `MODEL_DAILY_CAP_USD` (default $2). Expected pilot cost is about $3 a year.
- **Audit trail:** every step (embed, shortlist with prescore parts, each review with advocate arguments and Jev answers, reasons) goes to `review_log`.

**Why.** Recall was measured on exactly this pipeline. Re-reviewing rejected pairs would only nag people.

## 2026-10-02: Name, design and product flow

**Decision.**
- **The app is called Zarqa** (formerly Lostra), after Zarqa al-Yamama, who could see riders three days away. The mascot is her.
- **The approved design is in `design/`** (`HANDOFF.md`, 390px screen mockups, mascot cutouts). It's dark only, with no bottom nav, and everything starts from Home. The report form lives on Home with a Lost/Found toggle.
- **Category is free text.** A keyword map normalises it for the prescore's category term. When a side doesn't normalise, the term is 0, so free text never blocks a pair.
- **Card/ID reports** are detected by `\b(cards?|ids?|license|licence|passport|bank)\b` on the category or title, server-side. Their photos never go to a model and are hidden on the Match screen.
- **Only the lost-side owner sees a match** ("Is this yours?"):
  - "It's mine" opens a chat with the finder.
  - "Not mine" rejects that pair for good.
  - Nobody browses found or lost reports.
- **"Got it back"** can be pressed by either side. It marks both reports returned and takes them out of the matching pool.
- **Match strength stamp:** "Strong match" at a final score ≥ 0.80, "Likely match" from 0.65 to 0.80. This is a fixed display rule, not tuned.
- **Match reasons** are generated only for pairs that are shown:
  - code facts: category, building, time gap
  - one short Luna "explain" call for details

  The decision prompts stay identical to the benchmark.

**Why.**
- The design was made for this name and mascot.
- Owner-only matches keep finders and found items from being browsed by people fishing for things that aren't theirs.
- Keeping the decision prompts unchanged keeps the benchmark numbers valid for the app.

**Later.** Add pointing, shrugging and waving poses. Arabic and RTL after the pilot.

**Kept on purpose (2026-10-02).** `mascot/phone.png` (Zarqa holding an iPhone) stays as it is: the owner chose to keep the artwork, so don't replace it with a generic phone.

## 2026-10-01: Build the app from scratch: C# backend, phone-first web app

**Decision.**
- **Fresh codebase.** The old uni code (Firestore, `processReport`, WhatsApp intake) is not reused or consulted. Only the matching design below carries over, re-implemented in C#.
- **Backend:** ASP.NET Core (.NET 10) and EF Core. Matching runs in a background worker fed by a Postgres queue table.
- **Database:** PostgreSQL with pgvector. Vector search replaces Firestore `findNearest`.
- **Front end:** React + Vite + TypeScript, delivered as a phone-first PWA with web push and email as the backup.
- **Hosting:** a cheap VPS running Docker Compose (app, Postgres, Caddy for HTTPS). Ordered 2026-10-02: Contabo Cloud VPS 4, "Hub Europe" region, IPv4 `173.249.40.122`. Access is by SSH key only (`~/.ssh/zarqa_vps` on the dev PC); password login gets disabled. **Domain: `tryzarqa.com`** (bought 2026-10-02, DNS on Cloudflare, records set to "DNS only" so Caddy can get its own certificates); `www` redirects to the bare domain so sign-in cookies live on one host.
- **Sign-in emails: Resend** (HTTP API, free tier 3,000/month). Chosen 2026-10-02 for its simple API and good delivery to Microsoft 365. It needs a verified sending domain. Until the key is set (`bash deploy/set-secret.sh RESEND_API_KEY`), codes go to the server log. The email has no links, so it can't be imitated for phishing.
- **Sign-in:** a one-time code sent by email. Accepted addresses are those whose domain is exactly `gutech.edu.om` or ends in `.gutech.edu.om` (students use `student.gutech.edu.om`). Compare the parsed domain, never a plain string suffix.
- **First milestone:** a campus pilot. No WhatsApp bot, native app or staff dashboard yet.

**Why.**
- A clean start was the user's choice.
- React over Blazor: Blazor WebAssembly is a heavy download on phones, and PWA tooling is more mature.
- VPS over Azure: Azure for Students' $100 a year doesn't cover an always-on app and database, and the free tier sleeps, which stops the worker.
- The university isn't officially involved yet, so finders keep the items and handovers happen between users.

## 2026-10-01: Matching design: luna-debate, cut-off 0.65

**Decision.** Match lost and found reports with *luna-debate*:
1. **Embed** each report with `text-embedding-3-small`.
2. **Vector search** over all open, matched or in-chat reports of the other type (Firestore `findNearest`, top 25).
3. **Shortlist** with the existing preliminary score (≥ 0.56, top 10).
4. **Two gpt-6-luna advocates, run in parallel**, each seeing both reports and their photos:
   - one argues **for** a match;
   - one argues **against**.
5. **Jev reads both cases** and answers typed questions.
6. **Show the match** when `0.5 · same_item + 0.5 · overall ≥ 0.65`.

**Fallback.** Plain gpt-6-luna review (the current system) when Jev is unavailable.

**Why.** Out of all six systems tested, luna-debate had the best combination of recall and precision at GUtech's realistic sizes:

| System | 100 reports | 1,000 reports | Cost per report (1,000) |
|---|---|---|---|
| luna (current) | 100% / 86% / 2 traps | 100% / 76% / 2 | $0.0013 |
| jev alone (honest cut-off) | 97% / 94% / 1 | 97% / 74% / 1 | $0.0002 |
| luna-debate, cut-off 0.60 | 100% / 94% / 1 | 100% / 80% / 1 | $0.0030 |
| **luna-debate, cut-off 0.65** | **97% / 97% / 0** | **97% / 97% / 0** | $0.0030 |

Each cell is recall / strict precision / lookalike traps (out of 18).

**Caveats.**
- **The 0.65 cut-off is partly tuned on the test set.** It was chosen after reviewing the false matches at 1,000 reports, which all scored 0.60–0.66.
- **It misses one true pair:** the blue pen, which scored 0.64. If recall must be 100%, try 0.62–0.63.
- **The test set is small:** 32 true pairs, so one pair is about 3 points.
- **Recall is an upper bound.** The same writer (Claude) wrote both the lost and found texts.
- **Cost doesn't decide anything.** At about 1,000 reports a year, luna-debate costs about $3 a year.

## 2026-10-01: Recall is the deciding metric

**Decision.** Rank matching systems by recall first: the share of true lost/found pairs shown as a match. Precision comes second.

**Why.** A missed match means someone never gets their item back. A wrong match only costs a glance.

## 2026-10-01: Plan for 100–1,000 active reports, not 10,000

**Decision.** Design and benchmark for 100–1,000 active reports.

**Why.**
- GUtech has about 2,000 people, so roughly 400–1,000 reports a year.
- Resolved reports leave the matching pool.
- At these sizes, the current newest-200 limit and vector search give the same results. Vector search is kept as cheap insurance for growth: at 10,000 reports, newest-200 missed 2 of 32 pairs.

## 2026-10-01: Choosing cut-offs "honestly"

**Decision.** Any setting tuned on benchmark data is chosen on one half of the reports and measured on the other half (2-fold cross-fitting). Fixed rules set before seeing results count as honest.

**Why.** Tuning and grading on the same data makes a system look better than it will on new reports. Luna's 0.72 cut-off comes from production code, so it needs no correction.

## 2026-10-01: Jev settings learned from the benchmark

These apply if Jev is ever used on its own:
- **No hard rules on top of the score.** Rules like "same item ≥ 0.8" or "brand conflict < 0.3" blocked true pairs, for example "AirPods" vs. "AirPods Pro".
- **Fit the decision weights on data.** The hand-set formula reached only 53% recall; calibrated weights reached 88–97%.
- **Photo descriptions** (a vision call that turns photos into text attributes) only helped at 10,000 reports.

## 2026-09-30: Benchmark data and privacy

**Decision.**
- The benchmark uses real items photographed on campus (the collection page), plus stock photos and 10 text-only found reports.
- Lost reports are written from the owner's point of view, and lookalike traps and orphan reports are added.
- Photos of real ID cards and bank cards are **never** sent to a model or kept in the project. Those entries are text-only.

**Why.** It's realistic data without leaking personal documents. Three uploaded photos showed a national ID and a debit card, and should be deleted from the collection page.

## 2026-09-30: Use the GUtech campus map for location aliases

**Decision.** `benchmark/data/campus/locations.json` is built from the campus map. For example:
- "Oman Hall" = "amphitheatre";
- "Sab3" = "smoking area" = "7th floor";
- GU2 = UPAD building.

Bare floor names such as "2nd floor" are left out because several places share them.

**Later.** A location specialist agent that turns free-text locations ("554", "Reading area", "Outside") into a building and floor.

## 2026-09-26: Keep embeddings; Jev can't replace the whole pipeline

**Decision.** Jev is used as a decision step, not as the retrieval step.

**Why.**
- Jev is text-only, makes no embeddings, can't write explanations, and is weak on dates and numbers.
- Retrieval stays embedding-based; dates and hard rules stay in code.

## Open items

- [ ] **Long-gap date rule.** 7 of the 8 false matches at cut-off 0.60 had the item lost 1–11 months before it was found.
- [ ] **Re-check the 0.65 cut-off** on freshly collected items that weren't used to choose it.
- [ ] **Re-run luna-debate with the app's real setup:** one-text reports and text-embedding-3-small (see 2026-10-03).
- [ ] **Blind-label false matches** as plausible or wrong, to report a fairer precision.
- [ ] **Location specialist agent.**
- [ ] **Replace the benchmark's reconstructed `luna` baseline** with the real `processReport` code (prompt and overlap weights).
- [ ] **Measure real API latency.** Benchmark Luna timings include Codex CLI start-up.
- [x] **Pilot model access.** OpenAI API embeddings, Luna through a private ChatGPT-authenticated Codex service on the VPS, and direct Jev are configured and live-tested. API-key inference remains the recommended default for production automation; this owner-selected route uses ChatGPT plan allowance.
- [x] **ID and bank card reports in the app.** Photos skip every model and are visible only to the uploader; matching uses text alone.
- [x] **Pilot Privacy and Terms drafts** are public; legal review remains required before wide launch.
- [x] **Jev access for this pilot.** The owner's direct TypeSafe API route succeeded in the live matching test. Keep the plain-Luna fallback for provider failures.
