# Outside benchmark 6: design

Written blind: I did not see the matcher, earlier test sets, results or the decision log. 451 reports (247 lost, 204 found, 84 found reports with a photo), 348 labelled pairs (201 real, 147 false). Every pair carries `slices` as asked.

## What I set out to test and why

A campus lost-and-found mostly gets dull posts: "black wallet", "keys found", a charger, a phone in the canteen. I wanted a set where most pairs look like that, with the hard cases mixed in at the rate a real desk might see them, not a puzzle book. Three questions drive the design:

1. **Does it find the real owner when the two people describe the item differently?** Languages (Arabic, Arabizi, German, Urdu/Hindi words, mixed), misspellings, two-word posts, the wrong kind of word (a power bank called a charger, a Kindle called a phone, a key fob called a USB), and owners who misremember a shade, a count, a size or a model number.
2. **Does it keep apart things that only look alike in words?** Same kind, same place and day, but a stated difference (round against rectangular lenses, case against no case, Kia against Hyundai), and different objects that share a word or a name (a SIM card and a bank card, a Swiss Army knife and a Swiss Army watch, a lab coat with the name Huda and a card pouch for Huda).
3. **Does it read the photo for what it shows and no more?** Photos are often close-ups, closed, or from one side. Some owners name details the photo cannot confirm (a sticker inside a closed laptop, a lock-screen picture, an engraving); those are real pairs and should not be marked down for a detail that is simply not visible.

Cards (student, staff, ID, licence, bank, bus) are text only, first names only, no numbers.

## Situations (lens), with counts

| Lens | Pairs | Truth | What it tests |
|---|---|---|---|
| plain | 49 | real | ordinary pairs, nothing tricky |
| photo-confirms | 15 | real | a distinctive mark the photo shows |
| card-text | 10 | real | text-only cards, name and place |
| duplicate-post | 4 | real | two people post the same found item |
| language | 35 | real | the two sides in different languages or scripts |
| messy-text | 16 | real | misspelt item or brand |
| vague-finder / vague-owner / vague-both | 11 / 9 / 3 | 15 real, 8 false | one side says two or three words |
| wrong-kind-name | 12 | real | one side names the wrong kind of thing |
| unseen-detail | 15 | real | owner names something the photo or finder cannot confirm |
| owner-slip | 27 | real | owner states a feature differently (shade, count, size, model, brand, letters) |
| brand-vs-maker, date-mismatch, date-gap, place-moved | 1 each | real | charger maker vs laptop brand, owner date after the found date, undated owner a week later, item found in another building |
| same-kind-other-detail | 50 | false | same kind, clearly different details |
| stated-difference | 38 | false | same kind (mostly same place and day), one feature stated differently |
| shared-word | 31 | false | different objects sharing a word, brand or name |
| twin-lookalike | 12 | false | nothing in the item separates them; only date or place does |
| obvious-different | 7 | false | different kinds in the same place |

Slice counts (a pair can carry several): text-only 193, mixed-language 71, stated-difference 38, arabizi 32, shared-word 31, misspelt 29, vague 27, arabic 27, owner-slip 27, wrong-kind 26.

## Difficulty, my judgement

- Easy, about 40%: plain, photo-confirms, card-text, duplicates, obvious-different and most same-kind-other-detail pairs.
- Medium, about 48%: language, messy text, vague posts, wrong-kind names, unseen details, most stated-difference and shared-word pairs.
- Hard, about 12%: owner slips (an owner who says navy for a black jacket, Jansport for an Eastpak, 33 beads for a long misbaha), twin lookalikes where only the date separates them, and a few stated-difference pairs where the photo cannot show the stated feature (a close-up of an umbrella top).

## What a good matcher should do on the hardest kinds

- **Owner slips:** treat a neighbouring shade, a rough count, a model number one off or an edition as weak evidence when the rest agrees, especially when a distinctive feature (mesh trucker back, Navitimer bezel, Morocco banner) does agree. Still show the pair.
- **Stated differences:** a difference in something the owner would know (round vs rectangular, cover vs no cover, Kia vs Hyundai, another name on the card) should outweigh agreement on colour, place and day.
- **Shared words:** read the item for what it is, not for the words. A "car key" in a finder photo that has a USB plug is a USB stick; a "Notebook" from a German finder is a laptop.
- **Twin lookalikes:** these are honestly unclear. Showing them as low-confidence suggestions is acceptable; the truth is false only because of a date or place the matcher could weigh.
- **Unseen details:** a detail the photo cannot show is not evidence against a match.

## What the set does not cover

- No photos on lost reports, and no cards with photos (by rule).
- Only one photo per found report and no item photographed twice; the duplicate posts are text-only.
- Dates are simulated across 6 to 18 November; about three quarters of reports are dated and 107 are not (the post time still is). Long delays (weeks) are not covered.
- Hindi/Urdu and German appear only in a handful of reports; no Swahili, French or other languages.
- Online photos show items that are unusual for an Omani campus (US baseball caps, a luxury watch, a Russian book); the reports treat them as if they were on campus.
- The same writer wrote both sides of every pair, so phrasing may be more alike than two strangers would write.
