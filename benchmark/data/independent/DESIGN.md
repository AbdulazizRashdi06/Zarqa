# Independent matching benchmark: design

Written blind. I did not look at how Zarqa matches reports or at any earlier test sets. The cases come from my own view of what goes wrong when real people at GUtech report lost and found items.

## What it tests and why

A matcher has two jobs. It must connect a lost report to the found report for the same object even when the two people describe it differently. It must also avoid sending an owner to someone else's similar item. On a campus of about 2,000 people, most mistakes are not "wallet vs umbrella". They are "black wallet vs black wallet", "AirPods vs wired Apple earphones", or an owner who misremembers the colour. So most pairs here are within one item kind, and most of the effort went into near-misses on both sides.

Files: `reports.json` holds 271 reports (162 lost, 109 found; 88 found reports have a photo). `pairs.json` holds 276 labelled pairs: 108 matches and 168 non-matches. Every lost report has at most one true match, and every true match is listed. **So any lost/found combination missing from `pairs.json` is also a non-match**, and the set can be used for ranking or retrieval as well as pair scoring. 54 lost reports have no match (the item was never found). One found report, a gold earring, matches nobody. 11 reports have no date. Report ids are opaque, numbered in posting order, so they give nothing away.

## Taxonomy (lens: matches / non-matches)

**True matches that need understanding, not word overlap**
- clear-match 26 / 0: the baseline. Same kind, same details, same place and day.
- vocabulary-gap 17 / 0: different words for the same thing or place. Examples: gym = Sports hall, amphi = Oman Hall, print shop = Copy Centre, Swiss Army = Victorinox, SpaceX = Boca Chica, shayla = hijab/shawl, Dubai tower = Burj Khalifa.
- arabic-script 12 / 0: one side is written in Arabic (kumma, mushaf, misbaha, Arabic place names, Arabic digits).
- arabizi 9 / 0: Arabic in Latin letters and digits (naddarti, shanta mwarrada, mafateeh, sa3a dahabiya, sib7a, khatam fidda, sab3).
- other-language 5 / 0: German (Bartschlüssel, Trinkflasche) and Hindi/Urdu or Indian English (chunni, chikankari, tiffin, pendrive).
- owner-mistake 7 / 0: an honest error by the owner, such as maroon vs red, black vs navy, a wrong building, a wrong OEM brand, or a lost date one day after the found date.
- finder-mistake 6 / 0: the finder names the item wrongly ("AirPods case" for a JBL case, "string" for a cord necklace, "charger thing" for a power bank, "pink" for purple, "car key??" for a USB stick).
- private-detail 7 / 0: the owner gives a detail the finder could not see or did not mention (a name inside the cover, a cracked screen, embroidery inside a bag). It must not count against the match.
- photo-carries 5 / 1: the found text is one or two words and the decisive detail is only in the photo (coin pocket, clover, car-shaped tag, Mariners logo). The one non-match is a "silver phone" that the photo shows is an iPhone, not a Samsung.
- sparse-text 5 / 0: one or both reports are almost empty ("key", "bag", no place, no date).
- partial-or-broken 4 / 0: a broken key, scattered beads, an AirPods case missing one earbud, a card holder whose card fell out.
- place-drift 3 / 0: the item was handed to security or the RSA desk, far from where it was lost.
- multi-item 2 / 0: one report lists two things, and the other report names only one of them.

**Non-matches**
- different-kind 0 / 35: same place and day, different object. Easy, but it catches matchers that weigh place too heavily.
- contradiction 0 / 52: same kind, with at least one clear conflicting fact (brand, colour, material or style).
- twin-same-context 0 / 47: same kind, often the same place and day. Only one detail separates them, sometimes visible only in the photo.
- word-trap 0 / 12: words overlap but the objects differ (padel racket vs table tennis paddle, AirPods vs wired earphones, a white "charger" that is a power bank, a "car key" that is a USB stick, a Superman S vs a Mariners S).
- impossible-timing 0 / 8: everything fits except that the item was found days before the owner says they lost it.
- indistinguishable 0 / 13: generic items (white earphones, a blue ballpoint, a silver watch with a black dial, a black wallet in the canteen) where nothing in the evidence separates them. These measure the floor: a perfect matcher still cannot reject them, and showing them to the owner is acceptable.

## Difficulty (my judgement)

- About 35% easy: most clear-match, different-kind and contradiction pairs.
- About 35% medium: the language, vocabulary, mistake, sparse and photo-carries lenses.
- About 30% hard: twin-same-context, word-trap, impossible-timing and indistinguishable pairs. This also includes a few true pairs: text-only place drift, the owner's date error, the "bag" vs "black bag" pair, and the "key" photo.

## What a good matcher should do on the hardest kinds

- Missing detail is not evidence. "Lost it in GU2" and "found in RSA desk" do not conflict. Neither does a name inside the cover when the finder never opened the book.
- Colour words and brand guesses are weak evidence: maroon/red, navy/black, beige/grey, Acer vs an OEM label. Only clear conflicts should count against a match: Mercedes vs Honda, gold metal vs plastic, wired vs wireless, a cap present vs absent.
- When the found text and the photo disagree, believe the photo. This applies in both directions: the AirPods trap and the Superman/Mariners trap.
- Dates: a found date one day before the lost date is a normal human error. A found date a week before the loss rules out a match.
- For indistinguishable items, rank by place and time and show a few candidates. Do not invent a certainty that the evidence does not support.

## What this benchmark does NOT cover

- Real reports. Everything is written by me. The photos are partly real campus shots and partly stock or online photos, and they do not show GUtech rooms.
- ID cards, bank cards and phones with visible lock screens. One wallet photo with a visible payment card was deliberately left out (its report is text-only). Photos of a circuit board, a key in an ignition and a black-and-white keyring were not used.
- More than one photo per report, photos on lost reports, edits to reports, and duplicate lost reports from the same owner.
- Volume. With about 270 reports this tests pair decisions and small-scale ranking, not retrieval among 1,000 open reports. Most non-matches are hand-picked hard negatives, so a non-match rate measured here will look worse than in daily use.
- Voice-typed text, emoji-only reports, Urdu or Hindi in their own scripts, and Arabic dialects beyond Gulf usage.
- Fraudulent claims, where someone describes an item they saw in order to take it.
- Every number above is a count by construction. Nothing was tuned on any system's output.
