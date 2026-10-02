# Zarqa — design handoff

Mobile web app: a lost-and-found for GUtech (Muscat, Oman), made by students for students. People post items they lost or found, an AI matches lost posts with found posts, and the owner and finder chat to arrange the handover. Named after Zarqa al-Yamama, the woman from Arabian legend who could see riders three days away. The mascot is her.

This folder is the approved visual design. Build the real app from it; match it closely.

## What's in here

- `screens/*.dc.html`: one file per screen, each a 390px-wide phone mockup. Markup and inline styles are the source of truth for layout, spacing, colour and type. They use a small template syntax (`{{hole}}`, `<sc-for>`, `<sc-if>`, a `class Component extends DCLogic` block with `renderVals()`). Read that as the intended UI states and sample data, not as code to ship.
- `mascot/*.png`: transparent mascot cutouts used in the screens.

## Screens and flow

No bottom navigation bar. Everything starts from Home.

| File | Screen | Notes |
|---|---|---|
| SignIn.dc.html | Sign in | University email (@gutech.edu.om) + 6-digit code. Hero: `lookout.png` (mirrored, bottom faded). |
| Main.dc.html | Home | Header: logo, Chats button (unread badge), profile avatar → Profile. Greeting + giant headline. "MY REPORTS" bar → Reports. Lost/Found toggle (tag-shaped buttons). Zarqa speech bubble (`thinking.png`). Report form as an off-white "ticket". |
| HomeFound.dc.html | Home, Found mode | Same component with mode=found and category "Cards & IDs" to show the privacy notice. |
| Reports.dc.html | My reports | User's posts with ALL/LOST/FOUND filter. Status: Searching, Possible match, Chatting, Returned. Match card → Match. |
| Match.dc.html | AI match | "IS THIS YOURS?", lost + found items as overlapping tags, reasons list, "It's mine" → Chat. `happy.png`. |
| Chats.dc.html | Chat list | Conversations with unread counts → Chat. |
| Chat.dc.html | Chat | Item tag in header, "Got it back" button, bubbles, handover suggestion ticket with Confirm. Zarqa system message (`reading.png`), wink on confirm (`wink.png`). "Got it back" opens the Returned overlay. |
| Returned.dc.html | Returned overlay | Chat with the overlay open: `phone.png`, "RETURNED.", Back home. |
| Profile.dc.html | Profile | Avatar, stats, Match alerts + show-first-name toggles, language, tips, help, Sign out → Sign in. |

## Home form rules

Labels switch with the Lost/Found toggle:

| Field | Lost | Found |
|---|---|---|
| Photos (up to 4) | Got a photo of it? (optional) | Snap a photo of it |
| Category (free text) | Category | Category |
| Item name | What did you lose? | What did you find? |
| Description | hint: color, brand, stickers, marks | same |
| Location (searchable campus list) | Where did you last have it? | Where did you find it? |
| Date and time | When did you lose it? | When did you find it? |
| Submit | Find my stuff | Post found item |

If the category text mentions a card or ID (card, ID, license, passport, bank), show the notice: card photos are only shown to the proven owner; describe the card instead.

## Visual system

- Colours: ground `#222634` (charcoal), surface `#2E3343`, slate `#434E5F`, sage `#8E9DA0` (Found accent), tan `#BD9777` (Lost accent, primary buttons), off-white `#F2EEE8` (ticket cards, main text). Muted text on dark `#A9B4B6`; muted text on off-white `#5E6472`; tan-dark label on off-white `#8A6A4F`. Text on tan or sage buttons is charcoal, never white.
- Type: Anton (display, uppercase headlines and buttons), Figtree (body), JetBrains Mono (small uppercase labels). All from Google Fonts.
- Motifs: luggage-tag shapes (notched left corners with a punched hole), off-white "tickets" with dashed tear lines and side notches, small tilted stickers, a tan eye glyph after the ZARQA wordmark.
- Touch targets at least 44px.

## Mascot files

portrait, thinking, happy, wink, question, reading (busts from the character sheet); full (front full body); lookout (shading eyes, waist-up, mirrored, faded bottom); phone (full body holding up a phone; swap for a generic phone before a public release, since it shows an Apple logo).

Still wanted: pointing, shrugging with nothing found (for a "no matches yet" screen), waving.

## Sample data

Names, campus locations, times and counts in the screens are placeholders.
