# Independent set 5: design

## What it tests and why
The question is whether the matcher gets the right found item to the owner when the reports look like real campus posts. That means short, misspelt, in Arabic or Arabizi, mixed with German or Hindi, often with the wrong name for the thing, and often with no date or the wrong date. Next to that, it tests whether the matcher keeps quiet when two items are alike but not the same. I wrote every report knowing which object it was about and decided the truth (`isMatch`) myself. A pair is true only when the found object physically is the lost one.

Size: 429 reports (223 lost, 206 found; 84 found reports carry a photo, all other reports are text only) and 341 labelled pairs (220 true, 121 false). Every lost report is in at least one pair. 8 lost reports have no true partner (items never found), and 3 found reports have none (items nobody claimed).

## Ordinary cases, on purpose
About 30 true pairs are dull: a black Timberland wallet at the gym, a blue Cubs cap at the pitch, a Bulova in its box. 48 true pairs carry no messy tag at all. A matcher that fails these has a basic problem. Messy cases only matter once these pass.

## Taxonomy of situations (`lens`), with counts
True pairs (220):
- plain-photo 29, plain-text 4: both sides clear and in agreement.
- distinctive-mark 8: one unique detail named on both sides (sewn cable sleeve, sumo charm, snapped key blade, adjustable glasses).
- card 10: student, staff, national ID and bank cards, all text only, first names only, no numbers.
- duplicate-post 23: the owner posts again (often in another language), a friend posts for them, or RSA or security logs the same item a second time.
- arabic 28, arabizi 28, mixed-language 5: the language is the main difficulty.
- misspelt 28: the brand or the kind is mistyped ("chemestry book zumdal", "mercedez key ... panik button").
- vague 23: one side says two or three words ("grey bag", "key", "my mac").
- wrong-kind 28: the item is called by the wrong kind of thing (power bank called a charger, laptop called a notebook, Kindle called a tablet, pencil case called a makeup bag, a car-key-shaped USB stick called a car key, an iPod called a phone).
- memory-slip 4: an honest slip about the item (white for light grey, gold for bronze, black for navy, Acer for a Chicony brick).
- photo-limits 2: the photo cannot settle the point in dispute (a sepia photo of a striped pencil case; an iPhone that looks gold or silver).

False pairs (121):
- false-detail 29, false-brand 15, false-colour 11, false-kind 11, false-card 6, false-obvious 1: one clear difference.
- false-lookalike 21: same kind, colour and setting, separated only by a detail a careful reader must catch (Victorinox against Breitling, two black prescription frames, a 33-bead wrist misbaha against a full one).
- false-indistinguishable 16: the reports cannot tell them apart. Two pairs of white Apple earbuds, two black chiffon shaylas, two pairs of black sandals at the musalla, "phone" against "iphone black case" in the same canteen. These are false because I decided so. A matcher may fairly show them, and raters should score them in the middle.
- false-vague 8, false-same-place 3: a vague owner or the same place makes a wrong item tempting.

## Slices (`slices` field)
Each tag is set when either report of the pair has the property. Counts are true / false:
- vague 33 / 24
- misspelt 29 / 13
- arabic 38 / 24
- arabizi 37 / 14
- mixed-language 76 / 40
- wrong-kind 31 / 20
- text-only 123 / 58

`mixed-language` is set whenever the two reports are in different languages. Arabic script and Arabizi count as the same language, so Arabic against English counts and Arabic against Arabizi does not.

## Dates
Dates are careless, as on a real campus, and for true and false pairs alike. 77 lost and 23 found reports have no date. Some owners give the day they noticed the loss, one or two days late. Some are a day or two early. In 28 true pairs where both dates are given, the found date is before the lost date. `createdAt` is always on or after the report's own `eventDate`, and reposts come a day or two after the first post.

## Easy, medium, hard (my judgement)
- Easy, about 27%: plain, distinctive-mark, card, duplicate-post, plus the false pairs separated by colour, kind or name.
- Medium, about 60%: the language, misspelt, vague, wrong-kind and brand or detail cases.
- Hard, about 13%: memory-slip, photo-limits, false-lookalike, false-indistinguishable, false-same-place.

## What a good matcher should do on the hardest kinds
- Wrong-kind: read the description and the photo, not just the noun. A "charger, black Anker, with 4 blue lights" is a power bank, and the photo of a "car key remote" shows a USB plug.
- Arabizi and Arabic: "ma7fatha sawda" is a black wallet and "nathara bdoon etar" is rimless glasses. Treat these exactly like English.
- Vague owners: do not reject a two-word report because it lacks detail, but do not rank it above a candidate that fits better.
- Lookalikes: when the owner names a detail (scratches, a blue case, a red sleeve) and the found side shows the opposite, that detail decides the pair, not brand or colour.
- Indistinguishable pairs: showing them is a fair suggestion, not a stupid one. They should not be counted as bad mistakes.
- Photo against finder: when the finder's words and the photo disagree ("blue pencil" against a ballpoint pen), the photo wins.

## What the set does not cover
- No lost report has a photo.
- No long conversations or later edits to a report.
- No found report covers several items at once.
- Hindi/Urdu and German appear only in a few reports.
- Card reports are text only by rule, so photo handling of covered cards is not tested.
- About half the photos are online stock photos rather than campus shots. Their backgrounds (a jeans pocket, a mosque gate, a display box) do not match the campus place in the report.
- Places are free text, and several items move between places (an item handed to the RSA desk). Place is never the only thing that separates a true pair from a false one, except in the indistinguishable pairs, where that is the point.
