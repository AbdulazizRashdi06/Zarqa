---
target: other pages (Reports, ReportDetail, Match, Chats, Chat, Profile)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Projects\\LostraAi\\web\\src\\screens"
timestamp: 2026-10-03T06-12-34Z
slug: web-src-screens
---
Method: dual-agent (A: design review · B: detector + browser overlay)
Target: Reports, ReportDetail, Match, Chats, Chat, Profile (web/src/screens). Home excluded (critiqued 2026-10-02). Seeded local data: a suggested AirPods match, an active hoodie chat with a handover suggestion, a searching water bottle.

## Design health: 22/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No loading states (Match/Chat/Detail render a bare back button while loading); new messages not announced |
| 2 | Match to real world | 3 | Tickets/tags/stamps land; the finder is also shown "Got it back" |
| 3 | User control and freedom | 1 | "Got it back" is one tap, irreversible, available to both sides |
| 4 | Consistency and standards | 2 | Two ways to suggest a time; destructive actions styled three different ways |
| 5 | Error prevention | 1 | The irreversible return sits in the chat header as the most prominent control |
| 6 | Recognition over recall | 2 | Owner's own item title hidden under the found tag on Match; chat header truncates item |
| 7 | Flexibility and efficiency | 3 | Quick replies and the suggest-a-time flow are good |
| 8 | Aesthetic and minimalist design | 3 | Disciplined; Chat has ~11 competing actions |
| 9 | Error recovery | 2 | Dead match link: bare "Not found." with no way forward |
| 10 | Help and documentation | 3 | Zarqa's contextual tips work; safety tips buried in Profile |

## Design specificity
Strongly specific at the peaks (Match luggage tags + stamp, the handover ticket, Zarqa's voice). Generic on the admin screens: ReportDetail is a label/value list, Profile settings rows and the Chats list could be any dark-theme app.
Detector: source scan clean (0 findings across 7 files). Live overlay: 29 flags across 5 pages; most are the deliberate 9–10px mono labels, Anton at line-height 1 and ellipsis truncation (false positives / design calls). Real: Match stamp covers the lost tag meta and clips the title; Chat input placeholder uses browser default #757575 (3.3:1); returned-chat avatar initial 1.8:1.

## Priority issues
1. [P0] "Got it back" is one tap, irreversible, and works for both sides (Chat.tsx ~140; ChatEndpoints.cs /returned accepts either party). Closes both reports and stops matching for an owner who may not have the item. Fix: owner-only, shown after/below a confirmed handover ticket, with an on-brand confirm step.
2. [P1] Match at 360px truncates the main button to "IT'S MINE. MESSAGE T…" and the fixed bar covers reason 03. Fix: shorter label ("IT'S MINE") with clamp, bar not covering reasons.
3. [P1] Match hides the owner's own item ("BLACK AIRP…") under the found tag/stamp and never shows the finder's own words. Fix: less overlap or stacked tags at narrow widths; a collapsible "What they wrote"; real alt text on finder photos.
4. [P1] Accessibility at the peaks: strength stamp not announced; Returned dialog has no focus move/trap/Escape/aria-modal; message list has no aria-live; chips/filters 36px, "not it" link 32px; tan-dark labels on paper ~4.2:1; chat placeholder 3.3:1.
5. [P2] Returned looks dead (opacity 0.6 like Closed) and the finder gets no payoff; "Delete my account" is styled bigger than Sign out.

## Persona red flags
- Jordan: "Got it back" in the header reads like the next step; unclear what "It's mine" shares; two ways to suggest a time; date shows US order.
- Sam: strength stamp silent; incoming messages and handover ticket not announced; Returned dialog doesn't take focus.
- Casey: the riskiest control sits at the top of the screen; 36px chips beside Send; plan form covers the pending ticket.

## Minor observations
Reports sticker hides "TODAY"; ReportDetail repeats title and "What it is", has no link to the chat; "I found it myself" has no button shape; Profile Language row looks tappable; "0 UNREAD" header; Chat auto-scroll hides Zarqa's safety opener at 360; "Not found." has no Zarqa voice. Card/ID item rendering not checked (none seeded).

## Questions to consider
- Should "returned" be a mutual handshake, like the handover ticket?
- Should the owner see the finder's own words, not just the AI's reasons?
- What makes finding something feel like a hero moment for the finder?
