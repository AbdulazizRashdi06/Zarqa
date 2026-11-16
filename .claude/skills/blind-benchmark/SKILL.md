---
name: blind-benchmark
description: "How to write and how to rate a blind test set for Zarqa's lost-and-found matcher: what the app collects, campus places, the exact reports.json and pairs.json formats, photo rules, the self-check, and the 0-10 quality and 1-5 difficulty rating scale. Use when building a fresh outside benchmark, rating its pairs, or checking that a set is fit to run. Not for running models on a set or scoring runs (that is the tune-matcher-prompts skill)."
---

# Blind benchmark: writing and rating a test set

A test set is only worth running if the people who wrote and rated it did not know what was being tested. This skill holds everything a writer or rater needs so that the orchestrator never has to explain the matching work to them.

## What the app collects (writers)

A person who FOUND something fills in one free-text box ("describe it"), a place box (free text), an optional date, and usually attaches a photo. A person who LOST something fills in the same boxes from memory and usually has no photo. There is no title or category.

People type on phones: short, sloppy, in English, Arabic, Arabic in Latin letters with digits (Arabizi), sometimes German or Hindi/Urdu words. Many write very little and skip the date. The campus is GUtech in Halban, Oman: about 2,000 students and staff, Omani, Indian, Pakistani, other Arab, East African and German.

Campus places and the other names people use are in `references/places.md`.

## Files to produce (writers)

Write into the folder you are given. Formats are exact; the runner reads them as they are. See `references/formats.md` for the two JSON shapes and for what `DESIGN.md` must cover.

Aim for about 250 to 320 labelled pairs. Realism matters more than the count.

## Photos (writers)

You are given a JSON list of photos: `photo` is the path to look at, `photoForReport` is the exact string to put in a found report's `photos` array.

- Open each photo you use on its own at full size and write down what it shows before writing about it. An earlier writer judged photos from small previews and described a Cyrillic book as an Arabic novel.
- A found report that uses a photo is about the item in that photo, though a careless finder may describe it badly. The owner's report for it must fit what the photo really shows, apart from honest memory mistakes you add on purpose.
- Never use a photo that shows a face, an ID card, or a bank or payment card. The project rule is that no card photo is ever sent to a model. Leave it out and report it.
- Use each photo for at most one found report. Found reports with no photo are fine.

## Self-check before finishing (writers)

Run a short script that confirms: both JSON files parse; ids are unique; every pair's ids exist with the right types; every photo string is one of the listed `photoForReport` values and is used by at most one report; `createdAt` values are distinct. Keep your scripts in the scratch folder you are given, not in the repository.

## Rating (raters)

Raters score every pair on the scale in `references/rating-scale.md`. Two raters score each batch independently; the orchestrator averages them and checks how often they are within one point.

Why a scale and not right/wrong: a close pair may or may not be the same item, and the app cannot know. What it can be judged on is whether a pair deserved to be shown on the evidence. The owner's formula then weighs a missed good pair more than a wrong suggestion, and a mistake on an easy pair more than one on a hard pair.

## What never goes in a test set

ID numbers, card numbers, phone numbers, surnames, or any real person's report.
