# Independent set 4: design

## What it tests and why

Can the matcher put a found item in front of its owner when the two reports were written by different people, from memory, on a phone, often badly? Most campus losses are dull: a black wallet, keys, AirPods, a Casio calculator, a student card. So most of the set is ordinary items. The difficulty comes from how people write, and from other items that look the same.

The set has 432 reports (219 lost, 213 found) and 335 labelled pairs (208 real, 127 false). All 84 given photos are used, one per found report. The other 129 found reports and every lost report are text only. 27 reports are about cards (student, staff, resident and ID cards, a driving licence, bank cards). They are text only, with first names and no numbers. The posting window is 5 to 18 November 2026. 50 lost and 15 found reports skip the date. Ids are numbered in posting order, so an id says nothing about which reports belong together.

Messy writing is deliberate. Lost reports: 24 Arabic, 27 Arabizi, 2 German, 3 mixing English and Arabizi, 27 with a misspelt key word, 18 of two or three bare words, 15 calling the item by the wrong kind of thing. Found reports: 4 Arabic, 1 Arabizi, 9 bare, 10 that misname the item.

## Situations (lens), with pair counts

Real pairs (208):
- plain / plain-photo (36 / 37): the descriptions agree, or the photo confirms them.
- language-gap (38): one side is Arabic, Arabizi or German and the other English (or Arabizi against Arabic).
- typo (21): misspelt item, brand or model ('spectecles', 'sennhiser', 'calculater', 'hibeler').
- owner-misnames (15): power bank called a charger, pencil case a pouch, card holder a wallet, hard drive a flash, Surface or hub misnamed.
- finder-misnames (11): finder calls a USB stick shaped like a car key a car key, an AirPods case a power bank, a massar a scarf, goggles sunglasses.
- duplicate-post (14): the owner posts twice (often in two languages), or two people post the same found item.
- terse-owner (14) / terse-finder (3): one side says almost nothing ('lost my usb', 'pen', 'لقيت ساعة').
- honest-slip (8): wrong edition, unsure brand, Acer against Chicony, neighbouring place, a found date one or two days before the lost date, a sepia photo that hides the colour.
- photo-carries-detail (4): the finder's words are thin and only the photo shows the mark the owner names.
- card (7): name, holder and place agree on a card report.

False pairs (127):
- lookalike-same-kind (30), colour-differs (20), brand-differs (15): the same sort of item that differs in something the owner would know.
- distinctive-mark-conflict (14): the owner names a mark (sticker, keychain, engraving, sleeve) that the found item lacks, or the found item has one the owner would have mentioned.
- impossible-to-separate (14): two near-identical items (two black Anker power banks, two pairs of white Apple earbuds, AirPods Pro with and without an engraving the finder may have skipped). The truth is false, but the evidence cannot show it.
- both-vague (15): two vague reports about different items.
- one-detail-differs (5), card-name (5: Salim against Saleh, two different Mohammeds), kind-confusion (4), part-vs-whole (3), obvious-different (2).

Messy slices (real / false): vague 27 / 22, misspelt 29 / 11, arabic 27 / 18, arabizi 28 / 7, mixed-language 54 / 25, wrong-kind 25 / 16, text-only 122 / 59.

## How hard

About 38% easy (plain, card, obvious colour or brand differences), 48% medium (typos, languages, wrong names, lookalikes with a stated difference), 14% hard (terse owners, both-vague, impossible-to-separate). The hard band is meant to stay hard: there a good matcher should give a middle score rather than a confident one either way.

## What a good matcher should do on the hardest kinds

- Read Arabic, Arabizi and German the same way it reads English. A language difference is never evidence against a match.
- Treat a wrong name for the kind of item as weak evidence when shape, colour, brand and place agree (a 'charger' with lights from Anker is a power bank). Do not treat it that way when the kinds really differ (a padel racket against a table tennis bat).
- Trust the photo over the finder's words: the 'car key' that is a USB stick, the brown pads on 'black' headphones, the Cyrillic book.
- Count a missing mark as evidence only when the finder would surely have seen it. A hand-sewn red sleeve counts. An engraving inside a case the finder never opened does not.
- On a vague report, show the candidate only if it fits, and give it a middle score. Never treat 'fits' as 'confirmed'.
- Card names: one letter is enough to separate Salim from Saleh. A shared common name such as Mohammed is not enough to call two cards the same.

## What it does not cover

- Owners never attach photos.
- The set has no long threads, edits or reports withdrawn after a handover.
- It has no cards in photos, by rule.
- It has no Hindi or Urdu text.
- Places are given mostly by name, with no room numbers.
- Dates rarely conflict, and only by a day or two.
- 'Found nobody is looking for' and 'lost and never found' appear only as false pairs against lookalikes. A real database would hold many more of both.
- The same author wrote both sides of every real pair, so there are fewer accidental hints than in real life, but also fewer accidental contradictions.
