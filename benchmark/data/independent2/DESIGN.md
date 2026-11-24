# Independent benchmark 2: design

## What this set tests and why

A campus lost-and-found matcher has one job: put the right found item in front of its owner, and not bury them in look-alikes. I wrote this set as an outsider, without knowing how the matcher works, and tried to make it look like two weeks of real posts at GUtech (1 to 14 November 2026). Most posts are dull and short: "lost my keys", "black wallet", "blue pen". Some owners mix up a colour or a model number. Finders often don't know what they picked up. Items get carried to the security desk or another building. Several people lose the same common item in the same canteen on the same day. The set has 257 reports (153 lost, 104 found; 87 found reports carry a photo, 17 are text only) and 267 labelled pairs (105 same item, 162 different). 142 of the 257 reports have no date.

Every photo was opened on its own at full size before I wrote the finder's text. The finder's text is often weaker than the photo, so a matcher that reads the photo can recover detail the words leave out (a brand, a printed word, a broken blade, a snapped-on battery holder). Owners never have photos.

## Taxonomy of situations (pairs)

Same item (`isMatch: true`), 105:
- **plain** (51): both sides describe the item honestly and agree.
- **language** (15): one side is in Arabic, Arabizi with digits, German, or Hindi/Urdu written in Latin letters.
- **memory-slip** (11): the owner gets one thing wrong that people often get wrong: navy remembered as black, purple zip as pink, 1GB as 2GB, 9th edition as 10th, ES as EX, orange handle as yellow, chrome tag as gold.
- **moved-or-misdated** (5): the owner names a different building or day from where and when the item was found.
- **sparse-finder** (5), **sparse-owner** (4), **sparse-both** (4): one or both sides say almost nothing. A finder who writes "key" with a photo, or an owner who writes "laptop lost. black".
- **finder-misnames** (3): the finder calls it the wrong thing. A key-shaped USB stick is posted as "a car key??", a kumma as "white cloth, maybe a scarf?", and an optician's trial frame as "weird round glasses".
- **different-word-same-thing** (2): "portable charger" against "power bank", and "pen drive" against "USB".
- **duplicate-found** (2) and **duplicate-lost** (2): the same item posted twice, once by the IT or security desk in a few words, or the same owner posting again with "STILL looking".
- **second-hand** (1): a roommate reports for the owner.

Different items (`isMatch: false`), 162:
- **lookalike-detail** (69): same kind of item, often in the same place, but one thing the owner would know differs: full-rim against half-rim, wired against AirPods, a flip key against a fixed blade, a red C against a white C.
- **lookalike-brand** (34): same kind and colour, but the brand differs (Sennheiser against AKG in the same studio, Breitling against Omega at the same courts, Timberland against Tommy Hilfiger).
- **nothing-separates** (28): the lost report is so vague, or the two items so common, that nothing in the evidence tells them apart, yet they are not the same object. Example: two pairs of white wired Apple earbuds found in the canteen on the same day. These pairs show how the matcher behaves when it cannot know, not whether it is right.
- **clear-mismatch** (23): obviously different, often the same place but a different kind of item. These are the dull negatives a matcher must never show.
- **different-kind-shared-word** (8): the same word means a different thing. "Remote" (car fob or TV remote), "cap" (camera lens cap), "pen drive" against a fountain pen, a Dooney & Bourke handbag against a Dooney & Bourke wallet, a kumma against a massar, an abaya against a shayla, a car key against a USB stick shaped like a car key.

51 lost reports have no true match in the set: their item was never handed in. Two found reports (a cheap blue pen, a white Lightning cable) are wanted by nobody.

## Easy, medium, hard (my judgement)

About a third are easy: plain pairs with a brand or a distinctive detail on both sides, and clear mismatches. About 37% are medium: most language pairs and lookalike-brand pairs, where you have to read the photo or the other language. About a third are hard: nothing-separates, memory slips, moved items, sparse reports, finder-misnames, and lookalikes in the same place where only a small part differs.

## What a good matcher should do on the hardest kinds

- **Memory slips and moved items:** show them. A neighbouring shade, a wrong edition, a guessed building or a day off by one should lower confidence, not block the match. Recall matters most, because a missed match means the owner never gets the item back.
- **Finder-misnames:** trust the photo over the finder's words. The "car key" photo shows a USB plug; the "weird glasses" are exactly the trial frame the optometry lab is missing.
- **Lookalikes in the same place:** read the photo for the one distinguishing part (a sumo charm, a red fabric sleeve, CCB letters, a snapped blade, a price tag) and use it both ways: show the item when the part matches, hold back when it contradicts.
- **Nothing-separates:** showing such a candidate to a vague owner is reasonable, because the owner can tell at a glance. A matcher should not be very confident, and should rank a candidate with a confirming detail above it.
- **Shared words:** read the noun in context: "remote" next to "car", "cap" next to "lens", "pen drive".

## What the set does not cover

- No photos on lost reports, no photos of people, ID cards, bank cards or cash with portraits (four photos were left out for these reasons).
- Few multi-item losses (a bag with things inside where only one thing is found) and no partial finds.
- Abayas, shaylas, rings and earrings are text only. Real campus losses of these are frequent, but no photos were provided.
- Most found photos are clean stock-like shots. Real finder photos are blurrier and darker.
- Dates span only two weeks, so long delays (an item found a month later) are not tested.
- The truth labels are mine. On nothing-separates pairs the evidence cannot settle them, and raters may fairly disagree with me on some memory-slip pairs.
