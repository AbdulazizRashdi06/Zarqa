# When a candidate wording is accepted

All scores come from `node scripts/edge-rate.js` with the owner's rules as its defaults (a wrong suggestion counts a quarter of a miss; a miss costs its distance above "show from" to the power 1.2; every mistake is weighed by how easy the pair was). Use the "honest" figure: the line is picked on half the item kinds and scored on the other half.

## The rule

A candidate is accepted for the benchmark only if all of these hold on the **outside set**, which neither the drafter nor the main agent had looked at when the wording was written:

1. Its honest score at "show from 5" is at least **1 point** above the base's. Less than that is inside the noise: the same model gives slightly different answers on a re-run, and two raters differ by up to a point.
2. At "show from 4" and "show from 6" it is not more than 1 point below the base. A wording that only wins at one setting is tuned to that setting.
3. At the base's own best line it shows **no fewer real items** than the base. Recall is the deciding measure for this project: a missed match means someone never gets their item back.
4. Its best line is stable: the two halves pick lines within 0.10 of each other. A line that jumps (0.10 on one half, 0.75 on the other) means the scores no longer order the pairs sensibly.

On the **seen sets** it only has to not be worse (step 4 of the skill). Winning there proves little, because the wording was written from their failures.

## What acceptance does not mean

- It does not change the app. Porting needs the owner's yes.
- It does not set the line. The two written test sets used so far disagree on where a line loses real items (87% against 61% at 0.75 for the same setup). The line is settled on real pilot reports.

## Ties and losses

If two candidates both pass, keep the shorter wording. If none passes, the base stays and the loop's result is "no change"; record it. Do not run a third candidate on the same outside set: after two looks it is no longer an outside set.
