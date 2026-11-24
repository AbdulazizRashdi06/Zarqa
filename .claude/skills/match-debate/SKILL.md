---
name: match-debate
description: "Runs Zarqa's redesigned matching debate (debate v2) on a rated test set with helper agents on the Claude plan: a claimant and a skeptic each write a short note per lost/found pair, either may say it has no case, and a referee reads the evidence first and the notes second. Use when asked to run, re-run or compare debate v2, the redone debate, the claimant/skeptic/referee team, a Haiku or an Opus version of the debate, or to check debate v2 against one model alone. Not for the app's own Luna and Terra debate (benchmark/scripts/edge.js), not for tuning its wording (tune-matcher-prompts), and not for writing or rating a test set (blind-benchmark)."
---

# Debate v2: claimant, skeptic, referee

## Why it exists

The first debate paid one advocate to argue for a match and one against, and a judge weighed the two arguments. On 2026-11-16 one model alone, with the same rule sentence, matched or beat it with a third of the calls. Three faults were visible in the runs:

1. The advocate for a match had to produce a case even for a junk pair, and the judge then weighed a persuasive case for nonsense.
2. The judge decided from the two arguments, not from the evidence.
3. Advocates filed a stated difference and a missing detail under the same heading.

Debate v2 changes the roles, not the rule sentence (the owner's fixed wording stays word for word in all three roles):

| Role | Agent file | What changed |
|---|---|---|
| Claimant, speaks for the owner | `.claude/agents/match-claimant.md` | May say "no case" (strength `none`); ties must be stated or shown; a slip is offered only when one explains the difference |
| Skeptic, speaks for the desk | `.claude/agents/match-skeptic.md` | May name only differences both sides state or show; a missing detail is never mentioned; may say "no difference" (strength `none`) |
| Referee | `.claude/agents/match-referee.md` | Reads the reports and the photo first and forms a view, then uses the notes only to check for something missed; never averages the notes |

The model is the thing under test, so the agent files carry a default and the workflow sets the model per run (`haiku` or `opus`) for all three roles.

## Execution mode

**Workflow orchestration.** The order is fixed and can be written as code: per file of 10 pairs, the claimant and the skeptic run side by side (a small barrier, because the referee needs both notes), then the referee. Files run through `pipeline()`, so one file's referee does not wait for another file's notes. The script is `scripts/debate-workflow.js`; pass it to the Workflow tool with `scriptPath`.

## Steps

0. **What already exists.** Look in `benchmark/results/` for `edge-<set>-debate2-<model>`. If the user asks for a re-run of part of a set, re-run only those files and collect again; later outputs win. A new set starts at step 1.
1. **Pair files.** Use the files `benchmark/scripts/plan-agents/export-advocates.mjs <set dir> <out dir> <prefix> 10` writes (only their `pairs` list is read). Card and ID photos are never in these lists; if a writer or rater reports another such photo, make every report using it text-only before any run.
2. **Fix what will be read before any score exists.** Write to `benchmark/_workspace/tuning/state.json`: the sets, the runs it will be compared with (the same model alone, the first debate, today's app) and the measures (honest score at "show from 5", real items, other pairs, stupid matches).
3. **Run.** One Workflow call per group of about seven files with `args: { dir, files, model, roles: "<repo>/.claude/agents" }`. A workflow runs only about two agents at once on this machine, so launch the groups together.
4. **Collect.** `python3 scripts/collect.py <prefix> <pairs in the set> <task output files>` writes `<prefix>-judge.json` and `<prefix>-notes.json` and lists every missing pair number. Re-run the files that hold missing pairs and collect again before scoring. It also prints how often each side said `none`: if a side never does, the role text is not being followed.
5. **Assemble and score.** `python3 benchmark/scripts/plan-agents/assemble.py <base run> <set>-debate2-<model> <prefix>-judge.json <prefix>-notes.json`, then `node scripts/edge-rate.js --runs … --show-from 5` and `node scripts/edge-stupid.js --runs <run>:<line>` from `benchmark/`.
6. **Report and record.** Numbers in the usual short table, beside the same model alone. Record in `decisions.md`. Seen sets prove little: a claim that v2 is better needs a fresh outside set and the acceptance rule in `.claude/skills/tune-matcher-prompts/references/acceptance.md`.

## Data handoff

| From | To | How |
|---|---|---|
| Pair files | claimant, skeptic, referee | each agent reads the file itself |
| Claimant and skeptic | referee | their notes, by pair number, inside the referee's brief |
| Workflow | main agent | the task output file (a list of `{file, model, claimant, skeptic, judgments}`) |
| `collect.py` | `assemble.py` | `<prefix>-judge.json`, `<prefix>-notes.json` |

## When something goes wrong

- A note writer or the referee returns nothing for a file: that file is dropped from the workflow's result. Re-run it once; if it fails again, score without it and say which pairs are missing.
- An agent skips a pair: `collect.py` lists it. Re-run that file.
- A usage limit or an expired sign-in: do not retry. Record what finished, tell the owner and give the time the limit lifts.
- Never fill a missing answer by hand.

## Limits to state with every result

Helper agents see 10 pairs in one sitting; the app sends one pair per call. One run per set unless a repeat is asked for. Search and screen results come from the base run. The roles were written after looking at failures on the five rated sets, so those sets are seen sets for v2.

## Test scenarios

**Normal.** "Run debate v2 with Haiku on outside set 3." Pair files exist in the scratchpad; four workflows of about seven files; `collect.py` reports 285 of 285 for all three roles and some `none` on both sides; `assemble.py` writes `edge-ind3-debate2-haiku`; the table shows it beside Haiku alone.

**A file fails.** One workflow returns six of seven files. `collect.py` lists ten missing pair numbers for all three roles. Re-run that one file, collect with both task outputs, check nothing is missing, then score.
