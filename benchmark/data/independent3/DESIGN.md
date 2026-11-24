# independent3: design

## What this set tests and why

It tests whether a lost-and-found matcher can do what a campus desk does every day. That means pairing a short, sloppy owner report written from memory with a finder's report that often says even less but usually has a photo, and not offering a stranger's look-alike item. Most of the set is ordinary: black wallets, white earphones, keys, chargers, caps, laptops. The hard part is rarely a clever puzzle. It is the case where two people lose nearly the same thing in nearby places, or where the deciding detail is only in the photo.

There are 269 reports: 145 lost and 124 found. 84 of the found reports have a photo; 40 are text only. There are 285 labelled pairs: 113 true and 172 false. 32 lost reports have no true partner (the item was never handed in). 11 found reports have no owner looking for them, and 2 of those are in no pair at all. 29 reports have no date. About 17 reports are wholly or partly in Arabic, Arabizi, German or Hindi/Urdu. Every true pair is one-to-one: no found item has two true owners.

The truth (`isMatch`) is mine as author. For false pairs that the evidence cannot separate, the `why` says so plainly.

## Situations (`lens`), with counts

| lens | pairs | true / false | what it is |
|---|---|---|---|
| plain | 61 | 61 / 0 | Clear true match; the main features agree. |
| same-kind-diff | 95 | 0 / 95 | Same kind of item, often in the same place and on the same day, with one real difference: brand, colour family, model or a distinctive part. |
| different-kind | 25 | 0 / 25 | Same place or day, plainly a different object. A floor check. |
| sparse | 27 | 15 / 12 | One or both sides say almost nothing ("keys", "found a usb", "lost my wallet"). |
| twin | 19 | 0 / 19 | Near-identical items (two black Dells, two pairs of white Apple earphones, two Dell chargers, two Toyota keys, two steel watches with black dials taken off for wudu). Only small cues separate them, sometimes only place or time. |
| photo-decides | 19 | 13 / 6 | The finder's words are vague or wrong, and the photo settles it: a "car remote" that is a USB stick, a "book, not English" that is Cyrillic, a "black bottle" that says Boca Chica. |
| language | 10 | 7 / 3 | Arabic, Arabizi, German or Hindi/Urdu on one or both sides. Other pairs in other lenses also cross languages. |
| memory-slip | 8 | 8 / 0 | The owner gets a small thing wrong: edition 10 vs 9, black vs navy, dark blue vs light blue, white vs light grey, Acer vs the Chicony adapter that ships with it. |
| kind-trap | 8 | 1 / 7 | The item kind is easy to mix up: a glasses case vs glasses, a Kindle vs a flat power bank, AirPods vs wired Apple earphones, a kumma the finder could not name. |
| place-date-off | 5 | 5 / 0 | True, but the place guess or date disagrees (found a day before the owner's date, the owner guessed the wrong building, posted days later). |
| part-found | 4 | 1 / 3 | Only part of what was lost turns up (an empty AirPods case), or a cable is attached to a plug the owner never had. |
| photo-cannot-tell | 3 | 1 / 2 | The deciding detail is not in the photo: a sepia photo hides the colours of a striped pencil case, or a backpack is shot from the back so its brand stripes cannot be seen. |
| place-alias | 1 | 1 / 0 | "sab3" vs "7th floor". |

## Difficulty, as I judge it

- About 60% easy (plain, different-kind and most same-kind-diff).
- About 25% medium (sparse true pairs, photo-decides, memory-slip, language, place-date-off).
- About 15% hard (twin, photo-cannot-tell, part-found, kind-trap, and the sparse false pairs where nothing rules the item out).

## What a good matcher should do on the hardest kinds

- **Twins:** read every concrete cue. Examples: logo colour, a scratched lid, a keychain or the lack of one, the brand printed on a watch dial, a price tag on a "worn" wallet. Place and day should break ties only weakly. Where nothing separates two items, a good matcher should still show the pair to the owner, because a missed match costs more than a wrong suggestion. It should not rank it as confidently as a pair with a confirming detail.
- **Photo-decides:** trust the photo over the finder's words in both directions. It should lift a true pair the text alone undersells (Cubs C, LOST patch, sumo charm). It should drop a false pair whose text fits perfectly (a Michael Kors owner against the photo of a "motto" wallet, a Hydro Flask owner against a Boca Chica bottle, an Arabic-novel owner against Cyrillic pages).
- **Memory slips:** do not treat a neighbouring shade, an edition guess, or the adapter maker against the laptop brand as a difference. Do treat a different colour family or brand as one.
- **Photo-cannot-tell:** a missing view is not evidence. A good matcher should neither reject a sepia pencil case for "no colour" nor confirm it.
- **Sparse:** two near-empty reports with the same kind and place deserve to be shown with low confidence and not dropped.

## What the set does not cover

- No photos on lost reports and no reports with several photos.
- No ID cards, bank cards, phones with lock-screen details, or people; three online photos were left out as unusable (a circuit board, a key in a vehicle ignition, an abstract keyring macro).
- No edits to reports, no claims, nothing about how two reports flow through the app over time beyond their posting times.
- Few long, chatty reports. Most are short, because that is what people type on phones.
- No pair checks one owner against many candidates at once, beyond the two to four candidates each lost report has here. Ranking at scale is untested.
- Item kinds are limited by the photos available. Clothing, jewellery and documents appear only as text-only found reports.
