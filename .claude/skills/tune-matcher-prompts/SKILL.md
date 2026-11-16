---
name: tune-matcher-prompts
description: "Runs one loop of prompt tuning for Zarqa's lost-and-found matcher (the two advocate models and the judge): diagnose failures from finished benchmark runs, draft one small wording change, attack it with a critic panel before spending money, test it on already-seen sets, and accept it only if it also wins on a fresh outside benchmark scored with the owner's formula. A council from the agentic-council plugin sits at three points (what to attack, which candidates to test, what to do after the verdict) so the loop can keep going without waiting for the owner. Use when asked to engineer, tune, improve or re-test the matcher's prompts or line, to run the tuning loop again or non-stop, to convene the loop council, to re-check a candidate, to continue from the last loop, or to build and run a new outside check. Not for writing a test set by hand or changing the app's matching code directly."
---

# Tune the matcher's prompts

This skill is the orchestrator for the matching prompt-tuning harness. You, the main agent, run it; the specialists are agent types in `.claude/agents/`.

## Why the loop has this shape

On 2026-11-15 a written "definition of a match" scored 96% on in-house test sets and then showed twice as many wrong pairs as the plain setup on a benchmark written by an outside agent. The in-house sets were written by agents briefed by the same person who wrote the definition. Every step below exists to stop that happening again:

- changes come from failures that were observed, not from ideas;
- one small change at a time, so its effect can be read;
- a critic panel must fail to break it before any model call is paid for;
- the sets it is tuned on are never the set it is accepted on;
- the accepting set is written and rated by agents who know nothing about the change.

## Execution mode: mixed

| Step | Mode | Who |
|---|---|---|
| 0. Context check | main agent | you |
| 1. Diagnose | sub-agent, one call | `match-failure-analyst` |
| 1b. Council: agenda | Workflow, four seats and a chair | `agentic-council:Oracle`, `Skeptic`, `Advocate`, `Strategist`; chair `Steward` |
| 2. Draft | sub-agent, one call (called again once if critics object) | `match-prompt-drafter` |
| 3. Attack | Workflow, three critics at once | `match-prompt-critic` × 3 angles (+ `agentic-council:Skeptic` and `agentic-council:Oracle` when that plugin is on) |
| 3b. Council: go or no-go | Workflow, the same council | as 1b |
| 4. Test on seen sets | main agent runs scripts | you |
| 5. Outside check | sub-agent, then Workflow | `outside-benchmark-writer`, then `pair-rater` × 2 per batch |
| 6. Decide, record, report | main agent | you |
| 6b. Council: verdict and what next | Workflow, the same council | as 1b |

Invoking this skill is the owner's consent to run the Workflows in steps 1b, 3, 3b, 5 and 6b. The critic and rating scripts are in `references/workflows.md`; the council, its seats, what it may and may not decide, and its script are in `references/council.md`. Read that file before the first sitting of a session.

**The council fills the gaps a person would otherwise fill; it never overrides the mechanical steps.** A critic's `fail` with a concrete example still stops a candidate, and the acceptance rule alone says accepted or rejected. What is the owner's (the app, deploying, the line, budgets, providers, card photos) goes on the owner's docket and the loop carries on with the rest.

## Step 0: context check

Look in `benchmark/_workspace/tuning/` (create it if missing; it is git-ignored working state):

- `state.json` present with an open candidate → the owner is continuing: resume at the step it names.
- A request to redo one part ("re-run the critics", "new outside set") → run only that step with the saved inputs.
- Nothing there, or a new failure to work on → start at step 1 and write `state.json` as you go: `{loop, base, candidate, step, seenSets, outsideSet, spentBefore}`.

Read `decisions.md` (newest entries) for what has already been tried. Do not re-test a wording recorded there as rejected unless something about the test has changed.

Check the budget: `benchmark/.cache/spend.json` against the cap in `benchmark/CLAUDE.md`. One loop costs about 4 to 6 dollars on the API (see `references/costs.md`). If the loop will not fit, say so before starting.

## Step 1: diagnose

Call `match-failure-analyst` once with the names of the base runs on the seen sets (for example `ind-judge-photos`, `p3-judge-photos`, `r3t-jp`). It runs `node scripts/edge-failures.js` and reads the debates. Save its JSON to `_workspace/tuning/<loop>_01_diagnosis.json`.

Stop here and report if the largest failure class is not a prompt problem (search, the shortlist, the line, or the rating scale). Fixing it with wording would be the wrong tool.

## Step 1b: council, agenda

Run the council Workflow with `sitting: "agenda"`, the diagnosis as papers and one motion per failure class the analyst says wording could move. The drafter works only on the classes the ruling names. A `stop` ruling ends the loop: report and wait for the owner.

## Step 2: draft

Call `match-prompt-drafter` with the diagnosis and the council's target classes. It returns at most two candidates, each a one-sentence edit with before and after text. Save to `<loop>_02_candidates.json`.

## Step 3: attack (before any paid call)

Run the critic Workflow from `references/workflows.md` with the candidates. Each candidate gets three critics, one per angle: `recall`, `overfit`, `side-effects`.

A candidate is stopped if any of the three core critics returns `fail` with a concrete example pair. An `uncertain` does not stop it: each `uncertain` objection becomes a **named check** that the paid test in step 4 must report on (for example "real pairs with a two-day-early found date, before and after"). Write the checks into `state.json` before spending anything, so they cannot be chosen after the numbers are in.

If a candidate is stopped, send the objections back to the drafter once (step 2 again, same candidate id); if the revision is stopped too, drop it and record why. Never test a candidate the panel stopped: the panel is the cheap filter, and overriding it is how weak ideas reach the expensive step.

Why `uncertain` is not a stop (owner's ruling, 2026-11-16): the critics are told to answer `uncertain` unless they can show a change is safe, and from wording alone they rarely can. In loop 1 a sound timing fix drew no `fail` in two rounds and was still dropped under the first version of this rule. A risk that can be measured should be measured, not vetoed.

## Step 3b: council, go or no-go

Run the council Workflow with `sitting: "go"`: papers are each surviving candidate's before and after text and every critic verdict; one motion per candidate. Test what the ruling says, as revised, in its order. Add the council's named checks to `state.json` beside the critics'. A candidate the critics stopped is not put to the council.

## Step 4: test on the seen sets

Add the surviving wording to `benchmark/src/reviewers/debate.js` as a new `SIMILARITY_RULE` version (or the switch that fits), leaving the app's wording as the default. Then run the base and the candidate on each seen set, one process at a time, with the environment from `references/costs.md`.

Score with `node scripts/edge-rate.js --runs <base>,<candidate> --show-from 4,5,6`.

The candidate passes this step if, on every seen set, its honest score at "show from 5" is not below the base's and it shows no fewer real items at the base's line. If it fails here, stop: do not spend an outside set on it.

## Step 5: the outside check

1. Start `outside-benchmark-writer` fresh (the Agent tool, not a fork: it must not inherit this conversation) with: the output folder `benchmark/data/independent<N>`, the photo list, the date window, and a scratch folder. It follows the `blind-benchmark` skill.
2. `node scripts/edge-outside.js prepare --data data/independent<N> --out <scratch>/rate`.
3. Run the rating Workflow from `references/workflows.md`: two `pair-rater` agents per batch. Save the returned array to a file and `node scripts/edge-outside.js merge --data data/independent<N> --ratings <file>`. If the raters are within one point on fewer than 90% of pairs, the scale is not holding on this set: report that instead of scoring.
4. Run the base and the candidate on the new set and score them with `edge-rate.js`.

An outside set is used once as an accepting set. After you have read its failures it is a "seen" set: add it to `seenSets` in `state.json` and to `benchmark/CLAUDE.md`.

## Step 6: decide, record, report

Apply the rule in `references/acceptance.md`. Then:

- Write a dated entry in `decisions.md`: the failure class, the exact wording, the critics' verdicts, the scores on every set, the money spent, and the decision. Record rejected candidates too; a rejected wording nobody wrote down gets tested again.
- An accepted wording is still benchmark-only. Porting it to `server/Zarqa.Api/Matching/Reviewers.cs` changes owner-set wording, so ask the owner first and never deploy from here.
- Update `benchmark/CLAUDE.md` if a set, switch or script was added. Commit and push.
- Report to the owner in short plain English with one table: setup, score on the seen sets, score on the outside set, real items shown, stupid matches shown, wrong pairs shown. Say plainly if the candidate lost.

## Step 6b: council, verdict and what next

Run the council Workflow with `sitting: "verdict"`: papers are the results table with each acceptance rule marked pass or fail, and the named checks' numbers. Motions are the open questions, for example "start another loop on class X", "retire class Y as not fixable by wording", "ask the owner to port J1". Then follow the ruling: start the next loop at step 1 with the newly seen set added, or stop. The loop also stops after two loops in a row with no accepted change (`references/council.md`).

## Rules that hold at every step

- **Blindness.** Writers and raters get only what the `blind-benchmark` skill gives them. Never paste a candidate wording, a diagnosis or a result into their prompts.
- **Card photos.** No photo of an ID card or a bank or payment card goes to any model. If a writer or rater reports one, make every report that uses it text-only before any run.
- **Money.** Always run with the spending stop. One paid process at a time; the spend file is not safe for two.
- **Honesty about tuning.** Say which sets a number was tuned on. A line cannot be settled on written test sets; do not propose one from them.

## When something fails

- "Agent type not found" for one of the harness's own agents: agent files in `.claude/agents/` are registered when a session starts, so a session that created or changed them cannot call them by name. Use `general-purpose` instead and start its prompt with "First read `.claude/agents/<name>.md`; that file is your role", keeping the model the file names. In the Workflow scripts, drop `agentType` and add the same sentence to the brief.

- An agent returns nothing or malformed data: call it once more. If it fails again, carry on without it and say in the report what is missing. A critic that never answered counts as `uncertain`, not `pass`.
- A usage limit, an expired sign-in or a permission refusal: do not retry. Note how far the step got, tell the owner when the limit resets if it says, and stop the loop there.
- The spending stop ends a run: the cached answers are kept. Do not raise the cap; only the owner sets the budget.
- Never fill in an agent's missing judgement yourself. If a rater skipped pairs, they stay unrated and are left out of the score.

## Test scenarios

**Normal loop.** Base runs exist for two seen sets with ratings. The analyst reports "stated difference treated as a missing detail" as the largest class. The drafter proposes one added sentence. Three critics return pass, pass, uncertain. Both seen sets hold or improve. A new outside set is written and rated (raters within one point on 95% or more). The candidate beats the base there by the margin in `references/acceptance.md`. Result: recorded as accepted for the benchmark; the owner is asked whether to port it.

**Stopped by the panel.** The `recall` critic returns `fail` with three example pairs that the wording would push down. The drafter revises once; the critic fails it again. Result: no paid call is made, the candidate and the objections are recorded in `decisions.md`, and the report says so.

**Council splits.** At go or no-go two seats vote `test` and two `drop` on a candidate. Result: two against two is no; the candidate is not tested, the vote and both sides' reasons are recorded, and the loop goes on with the other candidate.

**Loses outside.** The candidate passes the panel and the seen sets, then scores below the base on the outside set. Result: rejected and recorded with all numbers; the outside set becomes a seen set; the report leads with the loss.
