# When a candidate change is accepted

All scores come from `node scripts/edge-rate.js` with the owner's rules as its defaults (a wrong suggestion counts a quarter of a miss; a miss costs its distance above "show from" to the power 1.2; every mistake is weighed by how easy the pair was). Use the "honest" figure: the line is picked on half the item kinds and scored on the other half.

## What is compared

The **base** is Opus alone with every candidate over the floor reviewed, read at 0.45, run one pair per call through the Claude gateway (council, 2026-11-19; the helper-agent figures are not the base, and 0.45 here is not a ruling on the line). The candidate runs through the same route in the same week. A difference smaller than the run-to-run band measured on that route is no difference. Failed calls are reported and never filled in. The Luna debate stays in every table as a second reference row.

## The rule

A candidate is accepted for the benchmark only if all of these hold on the **outside set**, which was written and sealed before the candidate existed and is opened once:

1. Its honest score at "show from 5" is at least **1 point** above the base's. Less than that is inside the noise: the same model gives slightly different answers on a re-run, and two raters differ by up to a point.
2. At "show from 4" and "show from 6" it is not more than 1 point below the base. A wording that only wins at one setting is tuned to that setting.
3. At the base's own best line it shows **no fewer real items** than the base. Recall is the deciding measure for this project: a missed match means someone never gets their item back.
4. Its best line is stable: the two halves pick lines within 0.10 of each other. A line that jumps (0.10 on one half, 0.75 on the other) means the scores no longer order the pairs sensibly.
5. At the line used for rule 3 it shows **no more stupid matches** than the base: pairs shown although the raters put them at quality 2 or below (`node scripts/edge-stupid.js --runs <base>:<line>,<candidate>:<line>`). Owner, 2026-11-16: "remember that we cant also make stupid matches". Report this count beside real items shown in every loop.

On the **seen sets** it only has to not be worse (step 4 of the skill). Winning there proves little, because the wording was written from their failures.

## A change that only moves the line or hides pairs

Rule 1 can only tie for such a change, and the council would not judge it on real items and stupid matches alone (1-3, 2026-11-19: that prices a wrong suggestion at nothing). So it gets **no pass or fail** from the loop. Report three counts, each beside the chance band: real items shown, other pairs shown, stupid matches. The line and the "To review" band are the owner's; a line move is never a loop candidate.

## What acceptance does not mean

- It does not change the app. Putting a wording, the floor, the number of candidates reviewed or the effort level into the app needs the owner's yes.
- It does not set the line. The two written test sets used so far disagree on where a line loses real items (87% against 61% at 0.75 for the same setup). The line is settled on real pilot reports.

## Ties and losses

If two candidates both pass, keep the shorter wording. If none passes, the base stays and the loop's result is "no change"; record it. Do not run a third candidate on the same outside set: after two looks it is no longer an outside set.
