# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

GUtech (Halban, Oman) students first, on their phones, usually right after they've lost or found something on campus. Staff can sign in (any `gutech.edu.om` address) but aren't the design focus. A lost-and-found desk or security role may become a user later if the university joins. Not decided yet.

Two roles on the same account:
- **Owner:** lost something. Wants to post it in under a minute, then be told when it turns up.
- **Finder:** found something. Wants to hand it back without becoming responsible for proving whose it is.

## Product Purpose

Zarqa matches **lost** reports against **found** reports on one campus, then puts owner and finder in a chat to arrange the handover. It exists because campus lost-and-found runs on scattered group chats and luck.

Success for the pilot is **items returned to their owners**. Recall matters more than precision: a missed match means someone never gets their item back, while a wrong match only costs a glance.

## Positioning

- **The AI matches for you.** You never browse anyone else's posts or scroll a list of found items. The matcher compares each new report with the other side and only surfaces likely pairs, with short reasons.
- **Owner-first and private by design.** Only the person who lost something sees a possible match ("Is this yours?"), and only they can claim it. Finders and found items are never browsable, so nobody can fish for things that aren't theirs.
- **Made by GUtech students for GUtech students.** It's unofficial, not a university service. That's the reason for its playful, student-made voice.

## Operating Context

- **Phone first:** an installable web app (PWA) at tryzarqa.com, used one-handed on campus.
- **Posting** happens from Home:
  - a Lost/Found switch
  - up to 4 photos
  - one free-text "describe it" box: what it is, plus colour, brand, stickers or marks
  - a campus place, picked from the campus-map list (aliases like "Sab3" or "Oman Hall") or typed freely
  - an optional "Do you know when?" date and time
- **Matching** runs in the background in a few minutes:
  1. embedding retrieval
  2. a prescore shortlist
  3. two AI advocates (for and against)
  4. a decision model at a 0.65 cut-off (decisions.md)
- **The handover** happens in a chat: Zarqa's safety opener, a suggested time and place that the other person confirms, then "Got it back" closes both reports.
- **Sign-in** uses a 6-digit email code to a GUtech address. Alerts come by web push and email.
- **The campus** is GUtech's GU1, GU2 and outdoor areas. Times are shown in Muscat time.

## Capabilities and Constraints

- Built: sign-in, posting, My Reports, AI matching with reasons, the Match screen, chat with handover tickets, notifications, Profile (stats, toggles, avatar, delete account), an admin screen, retention (reports expire after 60 days, data is deleted after 6 months), nightly backups.
- **Card and ID items:** photos of ID or bank cards are never sent to any model, are visible only to the uploader, and are never copied into the repo.
- Photos are re-encoded on upload with EXIF and GPS stripped.
- Users see first names only, and can hide them ("GUtech student"). Emails are never shown.
- At most 10 posts per user per day.
- The language for the pilot is **English only**. Arabic and right-to-left come after the pilot, so every UI string already lives in `web/src/i18n/en.json`.
- Not decided yet: university involvement, a staff desk role, off-site backups.

## Brand Commitments

- **Name:** Zarqa (formerly Lostra), after Zarqa al-Yamama, the woman from Arabian legend who could see riders three days away.
- **Mascot:** Zarqa herself. Cream veil, blue eyes, two braids with gold cuffs, gold forehead coins, a side ornament. Her look is fixed by `.claude/skills/zarqa-mascot/assets/character-sheet.png`; new images come only from the `zarqa-mascot` skill. The iPhone she holds in `phone.png` is kept on purpose.
- **Logo:** the block ZARQA wordmark with the eye in the Z (`web/public/logo.png`).
- **Voice:** playful, unofficial, student-made, never corporate. Zarqa speaks in the first person ("I can spot it from three days away"). Privacy and safety messages stay plain and clear even when casual.
- **Approved visual design:** `design/` (HANDOFF.md and the screen mockups). Changes the user asked for since then (one text box, the mascot beside the Home headline, the logo in the sign-in headline, no bottom nav) take precedence.

## Evidence on Hand

- The benchmark in `benchmark/`:
  - 32 true lost/found pairs and 18 lookalike traps from real campus items
  - luna-debate measured at 97% recall and 97% strict precision on that set
  - the 0.65 cut-off is partly tuned on that same set
  - the final decision step hasn't been re-measured with the app's one-text, production-embedding setup
- A live end-to-end check with one real matched pair (debate decided).
- No users, testimonials, press, university endorsement or return counts exist yet. Don't invent them.

## Product Principles

1. **Recall first.** Never trade away finding true pairs for neatness. When in doubt, show the match.
2. **Private by default.** People only see what a match entitles them to. Card and ID details never leave the uploader.
3. **A minute to post.** Every extra field or step costs reports, and fewer reports means fewer matches.
4. **Zarqa does the looking.** The person describes; the app searches, explains and nudges. No browsing.
5. **Students' own thing.** Warm, funny, campus-local. Never a university form.
