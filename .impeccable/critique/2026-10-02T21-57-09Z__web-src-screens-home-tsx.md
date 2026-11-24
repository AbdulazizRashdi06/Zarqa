---
target: home screen
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Projects\\LostraAi\\web\\src\\screens\\Home.tsx"
target_fingerprint: "sha256:eff8f26c1691a454deb5d143fa3a1c50aba716d3cfcfd610747b260e2106184b"
target_path: "C:\\Projects\\LostraAi\\web\\src\\screens\\Home.tsx"
timestamp: 2026-10-02T21-57-09Z
slug: web-src-screens-home-tsx
---
Method: dual-agent (A: a334b68d0276bff6f · B: a18d536e19c0c47d2)

# Critique: Home screen (web/src/screens/Home.tsx)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | "0 ACTIVE" before the counts load; disabled submit with no reason; no feedback while a photo is processed |
| 2 | Match with the real world | 3 | Tags/ticket/campus places strong; "TAG 01/02", field numbers and "GUTECH CAMPUS" read like data |
| 3 | User control and freedom | 2 | No draft is kept; leaving mid-form loses the text and photos |
| 4 | Consistency and standards | 3 | "When did you lose it?" label vs an on/off switch meaning "Do you know when?" |
| 5 | Error prevention | 2 | Disabled submit with no reason; empty photo slots look tappable; 10-a-day limit only shows after posting |
| 6 | Recognition rather than recall | 3 | Place list opens with the first five names alphabetically, not likely places |
| 7 | Flexibility and efficiency | 2 | No recent places, no draft, full scroll every time |
| 8 | Aesthetic and minimalist design | 2 | Two Zarqas plus "TAG 0x", "GUTECH CAMPUS" and field numbers compete with four fields |
| 9 | Error recovery | 2 | Server errors above the button; a failed photo shrink (HEIC) fails silently |
| 10 | Help and documentation | 3 | Hint, speech bubble and card notice give help in context, in voice |
| Total | | 24/40 | Acceptable |

## Design specificity verdict
Authored for Zarqa: luggage tags, ticket with tear line, campus places, the mascot legend and voice. The problem is the order: the first ~860px is identity, and the first field you can type in starts at y=867 on a 390x844 phone. Scan: CLI clean (0 findings) for Home.tsx and web/src/components. In-browser scan, 4 findings in both modes: placeholder contrast 2.6:1 (#9a948c on #F2EEE8) on the describe box and the place box (real, design review agrees); "Evening, Tester" flagged as a marketing eyebrow (false positive: personal greeting, about 5.6:1); 10px "ZARQA" on the speech bubble below the 11px floor (minor).

## What's working
1. Luggage-tag Lost/Found switch: tilt, fill and accent colour carried through the screen; state shown by more than colour.
2. Card/ID privacy notice, shown inline at the moment a card is mentioned.
3. One required box with a concrete example; date/time behind "Do you know when?".

## Priority issues
- [P1] The form starts below the first screen. Fix: remove the speech-bubble Zarqa, shrink My Reports to a chip at 0 active, move the tags up and drop "TAG 01/02", so photos and the describe box show without scrolling. Commands: /impeccable distill, then /impeccable layout.
- [P1] Submit disabled with no reason, and no draft is saved. Fix: keep the button tappable and focus the box with "Tell me what it is first"; save text, place, mode and photos on the device. Command: /impeccable harden.
- [P2] The mascot overlaps the headline at 390px and below. Fix: give her a reserved column or let the headline wrap to 3 lines. Command: /impeccable layout.
- [P2] Accessibility: placeholders 2.6:1; focus ring about 1.4:1 on the ticket; the place picker isn't a proper screen-reader list (no arrow keys, 150ms blur workaround); noisy mode-button names; redundant alt text on the bubble image. Commands: /impeccable audit, then /impeccable harden.
- [P2] Found-mode card notice tells finders to leave out names, which hurts recall for a found ID card; it is also worded for the owner. Fix: a Found-specific notice (keep the first name, skip ID and card numbers). Needs the owner's privacy decision. Command: /impeccable clarify.

## Persona red flags
- Casey: about 860px of scrolling to the first field; empty photo slots look tappable; photo-remove x is 26px and time-clear x is 32px; submit at the bottom of a 1,351px page.
- Jordan: "TAG 0x" and "01–04" look like IDs; unclear which mode is selected; the disabled button gives no reason; the switch off reads as "No"; "0 ACTIVE" before load.
- Sam: the place list can't be reached as a list; focus ring invisible on the ticket; noisy mode-button names; mode switch not announced; the visible date isn't what the screen reader hears.
- A student who lost AirPods, 5 minutes before class: billboard first; the place list is alphabetical; leaving loses the draft; no "when will I hear" at submit.

## Minor observations
Empty photo slots tilted; "GUTECH CAMPUS" redundant; error colour hard-coded with a negative margin; the card notice ignores photos; keep the "~" tilde for rough times; desktop centring OK.

## Questions to consider
- If Zarqa "does the looking", why does Home open with the user looking instead of a text box and camera?
- Should a finder land straight on the camera?
- Does My Reports earn its place on Home, or should a match sticker appear only when needed?
