---
name: tune-matcher-prompts
description: "Runs one loop of tuning for Zarqa's lost-and-found matcher, which since 2026-11-16 is one Opus review per pair: measure the base on the app's own route, diagnose by pipeline stage where real items are lost and wrong pairs shown, pick one change at one stage (search, the prescore floor, how many candidates are reviewed, the reviewer's wording, its effort), forecast it for free from recorded answers, attack it with a critic panel, test it one pair per call through the Claude gateway, and accept it only if it also wins on a sealed outside benchmark scored with the owner's formula. A council from the agentic-council plugin sits at three points (what to attack, which candidates to test, what to do after the verdict) so the loop can keep going without waiting for the owner. Use when asked to engineer, tune, improve or re-test the matcher, its prompts, its stages or its line, to plan or run the tuning loop again or non-stop, to convene the loop council, to re-measure the base, to re-check a candidate, to continue from the last loop, or to build and run a new outside check. Not for writing a test set by hand, for the redone debate (match-debate) or for changing the app's matching code directly."
---

# Tune the matcher

This skill is the orchestrator for the matcher-tuning harness. You, the main agent, run it; the specialists are agent types in `.claude/agents/`. The skill keeps its old name; since 2026-11-19 it covers every stage of the pipeline, not only prompt wording.

## Why the loop has this shape

Three things went wrong before, and each step below exists to stop one of them:

- **2026-11-15.** A written "definition of a match" scored 96% on in-house sets and then showed twice as many wrong pairs on a set written by an outside agent. So: the sets a change is tuned on are never the set it is accepted on, and the accepting set is written and rated blind.
- **2026-11-16 to 18.** Four wording loops and a redesigned debate accepted nothing, while the largest loss sat in front of the reviewer: the screen and the cap of 10 dropped strong real pairs before any model read them. So: diagnose by stage first, and let the loop change whichever one stage loses the most.
- **2026-11-18.** Every Opus number came from helper agents reading 10 pairs in one sitting, and nine pairs had been rated with a photo no model saw. So: a result counts only on the app's own route, one pair per call, and raters must have seen exactly what the reviewer is sent.

The pipeline under test (the Opus path of the app): rendering of each report -> embedding search -> prescore floor 0.56 -> every candidate over the floor reviewed by Opus, up to 100 -> shown at 0.45, held for an admin at 0.45 to 0.499.

## Execution mode: mixed

| Step | Mode | Who |
|---|---|---|
| 0. Context check | main agent | you |
| 1. Base on the app's route | main agent runs scripts | you |
| 2. Diagnose by stage | sub-agent, one call | `match-failure-analyst` |
| 2b. Council: agenda | Workflow, four seats and a chair | `agentic-council:Oracle`, `Skeptic`, `Advocate`, `Strategist`; chair `Steward` |
| 3. Draft one change at one stage | sub-agent, one call (called again once if critics object) | `match-prompt-drafter` |
| 4. Free forecast | main agent runs one script | you |
| 5. Attack | Workflow, three critics at once | `match-prompt-critic` × 3 angles |
| 5b. Council: go or no-go | Workflow, the same council | as 2b |
| 6. Test on seen sets, app's route | main agent runs scripts | you |
| 7. Outside check, one opening | sub-agent, then Workflow, then scripts | `outside-benchmark-writer`, `pair-rater` × 2 per batch |
| 8. Decide, record, report | main agent | you |
| 8b. Council: verdict and what next | Workflow, the same council | as 2b |

Invoking this skill is the owner's consent to run the Workflows in steps 2b, 5, 5b, 7 and 8b. The critic and rating scripts are in `references/workflows.md`; the council, its seats, what it may and may not decide, and its script are in `references/council.md`. Read that file before the first sitting of a session.

**The council fills the gaps a person would otherwise fill; it never overrides the mechanical steps.** A critic's `fail` with a concrete example still stops a candidate, and the acceptance rule alone says accepted or rejected. What is the owner's (the app, deploying, the line, the floor, budgets and plan allowance, providers, the report form, card photos) goes on the owner's docket, `benchmark/_workspace/tuning/owner-docket.md`, and the loop carries on with the rest.

## Step 0: context check

Look in `benchmark/_workspace/tuning/` (git-ignored working state):

- `state.json` with an open step -> the owner is continuing: resume at the step it names.
- A request to redo one part ("re-run the critics", "new outside set", "re-measure the base") -> run only that step with the saved inputs.
- Otherwise start at step 1 and keep `state.json` current: `{loop, system, base, candidate, step, seenSets, outsideSet, sealed, namedChecks, stopCount}`.

Read the newest entries of `decisions.md` for what has been tried. Do not re-test a change recorded there as rejected unless something about the test has changed.

Check the route: `curl -s --noproxy '*' http://127.0.0.1:8091/health` must say `signedIn: true` (start the gateway as in `references/costs.md`). Opus runs use the Claude plan; a plan limit stops the run, it never falls back to another model inside a measurement.

## Step 1: the base on the app's route

The base is Opus alone, every candidate over the floor reviewed, read at 0.45 (council, 2026-11-19; using 0.45 here is not a ruling on the line). It must exist as runs through the gateway, one pair per call, before anything is compared with it. Helper-agent numbers are scouting only and are never the base.

- Run each seen set once (`references/costs.md`, "Opus through the gateway"), and one set with `--samples 2` so the run-to-run band on this route is known: how many pairs change side at 0.45 and at 0.40, and how far a score moves between two identical calls.
- Report failed calls per set. A failed pair stays failed; nobody fills it in.
- Keep the Luna debate's numbers in every report as a second reference row (it is what runs today and what a failed Opus call falls back to). It need not be re-run each loop.

A loop that only measures the base, or a proving loop with no candidate, does not count toward the stop rule.

## Step 2: diagnose by stage

Call `match-failure-analyst` once with the base run names. It runs `node scripts/edge-failures.js --run <name> --line 0.45` and reads the reviewer's reasons. Save its JSON to `_workspace/tuning/<loop>_02_diagnosis.json`. Every lost pair is blamed on one stage: rendering, search, the floor, the cap, the reviewer, or the line.

A stage may be opened only when a rated set shows real pairs lost there. A stage the sets cannot test (search and the floor, as long as the sets hold no vague, misspelt, Arabic, Arabizi or wrong-kind reports) waits for a set that can.

## Step 2b: council, agenda

Run the council Workflow with `sitting: "agenda"`, the diagnosis as papers and one motion per weak point. The drafter works only on what the ruling names. A `stop` ruling ends the loop: report and wait for the owner. A change that only moves the line is the owner's and is never a loop candidate: report it on three counts and put it on the docket (`references/acceptance.md`).

## Step 3: draft one change at one stage

Call `match-prompt-drafter` with the diagnosis and the council's target. It returns at most two candidates for the same stage: a one-sentence wording edit with before and after text, or one setting with its old and new value. One stage per loop, so a gain or a loss can be traced to its cause. Save to `<loop>_03_candidates.json`.

## Step 4: free forecast

For a change to the floor or to how many candidates are reviewed: `node scripts/edge-forecast.js --runs <base runs> …` prints what the recorded answers say it would show, what it could cost, and the pairs it has no answer for.

- The gate may only **drop** a candidate (no real item gained and no stupid match removed, even in the best case). A good forecast is never evidence for one.
- Write the forecast into `state.json` before any run and compare it with the result afterwards.
- A wording or effort change, or one aimed at kinds of report the seen sets do not hold, is marked `cannot forecast` and goes on to the critics.

## Step 5: attack (before any model call)

Run the critic Workflow from `references/workflows.md` with the candidates. Each gets three critics, one per angle: `recall`, `overfit`, `side-effects`.

A candidate is stopped if any critic returns `fail` with a concrete example pair. An `uncertain` does not stop it: each `uncertain` objection becomes a **named check** the test in step 6 must report on. Write the checks into `state.json` before running anything, so they cannot be chosen after the numbers are in (owner's ruling, 2026-11-16: a risk that can be measured should be measured, not vetoed).

If a candidate is stopped, send the objections back to the drafter once; if the revision is stopped too, drop it and record why. Never test a candidate the panel stopped.

## Step 5b: council, go or no-go

Run the council Workflow with `sitting: "go"`: papers are each surviving candidate, its forecast and every critic verdict; one motion per candidate. Test what the ruling says, as revised, in its order. Add the council's named checks to `state.json`.

## Step 6: test on the seen sets, on the app's route

Add the change to the benchmark behind a switch that is off by default (a wording as a new version in `benchmark/src/reviewers/debate.js`; a setting as a flag of `scripts/edge.js`). Run it on each seen set through the gateway, one pair per call, one process at a time, in the same week as the base.

Score with `node scripts/edge-rate.js --runs <base>,<candidate> --show-from 4,5,6` and `node scripts/edge-stupid.js --runs <base>:0.45,<candidate>:0.45`.

The candidate passes this step if, on every seen set, its honest score at "show from 5" is not below the base's, it shows no fewer real items and no more stupid matches at 0.45, and the difference is larger than the run-to-run band from step 1. If it fails here, stop: the outside set stays sealed.

## Step 7: the outside check, one opening

The outside set is written **before** any candidate exists and stays sealed (no totals read either) until a candidate has passed step 6.

1. Start `outside-benchmark-writer` fresh (the Agent tool, not a fork: it must not inherit this conversation) with the output folder `benchmark/data/independent<N>`, the photo list, the date window and a scratch folder. It follows the `blind-benchmark` skill. Ask for the reports real students write and earlier sets lack, each marked so it can be counted apart: vague, misspelt, Arabic, Arabizi, mixed-language and wrong-kind reports, and text-only pairs. Card and ID reports are text only.
2. `node scripts/edge-outside.js prepare --data data/independent<N> --out <scratch>/rate`, then the rating Workflow with two `pair-rater` agents on every batch, then `merge`. If the raters are within one point on fewer than 90% of pairs, report that instead of scoring.
3. `node scripts/edge-outside.js check --data data/independent<N>` must find no pair changed since it was rated. A changed pair is rated again, not dropped.
4. Write into `state.json` what will be read (the comparison, the lines, the pass rule) before opening. Then run the base and the candidate on it together through the gateway and score once.

After it has been read, the set is a seen set: add it to `seenSets` and to `benchmark/CLAUDE.md`. No second candidate on the same outside set.

## Step 8: decide, record, report

Apply the rule in `references/acceptance.md`. Then:

- Write a dated entry in `decisions.md`: the stage, the exact change, the forecast beside the result, the critics' verdicts, the scores on every set, failed calls, and the decision. Record rejected candidates too.
- An accepted change is still benchmark-only. Putting it into the app (a wording, the floor, how many candidates are reviewed, the effort level) is the owner's: docket it, never deploy from here.
- Update `benchmark/CLAUDE.md` if a set, switch or script was added. Commit and push.
- Report to the owner in short plain English with one table: setup, real items shown, other pairs shown, stupid matches, honest score, on the seen sets and on the outside set, each beside the chance band. Lead with the loss if the candidate lost.

## Step 8b: council, verdict and what next

Run the council Workflow with `sitting: "verdict"`: papers are the results table with each acceptance rule marked pass or fail, the forecast beside the result, and the named checks' numbers. Then follow the ruling: start the next loop at step 2 with the newly seen set added, or stop. The loop also stops after two loops in a row with no accepted change (`references/council.md`; the count was reset once on 2026-11-19 for the change of system, and any later reset is the owner's).

## Rules that hold at every step

- **Blindness.** Writers and raters get only what the `blind-benchmark` skill gives them. Never paste a candidate, a diagnosis or a result into their prompts.
- **Card photos.** No photo of an ID card or a bank or payment card goes to any model. If a writer or rater reports one, make every report that uses it text-only before any run.
- **Money and allowance.** Opus runs use the Claude plan and nothing else. Calls that still go to OpenAI (embeddings, renderings) run with the spending stop; one such process at a time, the spend file is not safe for two.
- **The route.** Only one-pair-per-call runs through the gateway count. Say the model and the effort level with every result.
- **Honesty about tuning.** Say which sets a number was tuned on. A line cannot be settled on written test sets; do not propose one from them.

## When something fails

- "Agent type not found" for one of the harness's own agents: agent files in `.claude/agents/` are registered when a session starts, so a session that created or changed them cannot call them by name. Use `general-purpose` instead and start its prompt with "First read `.claude/agents/<name>.md`; that file is your role", keeping the model the file names. In the Workflow scripts, drop `agentType` and add the same sentence to the brief.

- An agent returns nothing or malformed data: call it once more. If it fails again, carry on without it and say in the report what is missing. A critic that never answered counts as `uncertain`, not `pass`.
- A usage limit, an expired sign-in or a permission refusal: do not retry. Note how far the step got, tell the owner when the limit resets if it says, and stop the loop there.
- The spending stop ends a run: the cached answers are kept. Do not raise the cap; only the owner sets the budget.
- Never fill in an agent's missing judgement yourself. If a rater skipped pairs, they stay unrated and are left out of the score.

## Test scenarios

**Proving loop (O1, 2026-11-19).** The council's agenda names no candidate, only "measure the base as built" and "write the outside set". Steps 1 and 7.1 to 7.3 run; the set stays sealed or is opened once for a comparison written down beforehand; nothing is accepted or rejected and the stop count does not move.

**Normal loop.** The base exists on the app's route with its run-to-run band. The analyst blames most lost real pairs on one stage. The drafter proposes one change there. The forecast does not drop it. Three critics return pass, pass, uncertain. Every seen set holds or improves by more than the band. The sealed outside set is checked, opened once, and the candidate beats the base there by the margin in `references/acceptance.md`. Result: accepted for the benchmark; the owner is asked whether it goes into the app.

**Dropped at the free gate.** The forecast shows no real item gained and no stupid match removed in the best case. Result: no critic and no model call is spent; the idea and the forecast are recorded in `decisions.md`. A loop whose ideas all die here counts toward the stop.

**Stopped by the panel.** The `recall` critic returns `fail` with three example pairs. The drafter revises once; the critic fails it again. Result: nothing is run, the candidate and the objections are recorded.

**Plan limit mid-run.** The gateway answers 429 on set two of five. Result: the run stops, finished answers stay in the cache, nothing falls back to another model, the report says how far it got and the run is continued later from the cache.

**Loses outside.** The candidate passes the panel and the seen sets, then scores below the base on the outside set. Result: rejected and recorded with all numbers; the outside set becomes a seen set; the report leads with the loss.
