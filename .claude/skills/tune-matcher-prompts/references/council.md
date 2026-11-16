# The loop council

The owner asked (2026-11-16) for the tuning loop to run without waiting for them, with a council from the `agentic-council` plugin making the judgement calls a person would otherwise make. The council sits at three points in every loop. It does not replace the critics, the tests or the acceptance rule: those stay mechanical. It decides only what they leave open.

## Seats

Four voting seats and a chair, all agent types from the `agentic-council` plugin. Each seat gets the same papers and answers alone; seats never see each other's answers before voting.

| Seat | Agent type | What it speaks for |
|---|---|---|
| Evidence | `agentic-council:Oracle` | Is the measurement sound? Sample size, noise between runs, whether a wording can do what is claimed. |
| Risk | `agentic-council:Skeptic` | What breaks. Stupid matches, overfitting to the sets, side effects on text-only and non-English reports. |
| People | `agentic-council:Advocate` | The student who lost something and the one who found it: a missed item against a silly suggestion. |
| Priority | `agentic-council:Strategist` | Is this worth a loop and an outside set before launch, or is something else worth more? |
| Chair | `agentic-council:Steward` | Counts the votes, writes the ruling and its conditions. Does not vote. |

A motion carries with three of four votes. Two against two is "no": the base stays. The chair may not change a vote count; it may only word the ruling.

## The three sittings

**1. Agenda** (after step 1, the diagnosis). Papers: the diagnosis, the list of wordings already tried and rejected in `decisions.md`, the owner's rules below. Each seat names up to two failure classes to attack this loop, or votes `stop` if nothing left is worth a loop. Ruling: the target class or classes for the drafter, or stop.

**2. Go or no-go** (after step 3, the critics). Papers: each candidate's exact before and after text and every critic verdict. Each seat votes per candidate: `test`, `revise` (with the clause to cut or change) or `drop`. Seats also add named checks the test must report. Ruling: which candidates are tested, in what order, with which clauses and checks.

**3. Verdict** (after step 5, the outside set). Papers: one table per candidate with the five acceptance rules already worked out by `edge-rate.js` and `edge-stupid.js` (pass or fail each), plus the named checks' numbers. The acceptance rule decides accepted or rejected. The council rules on the rest: what the loop taught, whether the next loop starts and on what, and what goes on the owner's docket.

## What the council may not do

These hold whatever the vote:

- It cannot accept a candidate the acceptance rule rejects, or reject one it accepts. Numbers decide; the council explains and plans.
- It cannot send to test a candidate a critic stopped with a `fail` and a concrete example. The drafter gets one revision; the critics see it again.
- It cannot change the owner's rules: a missed real item costs more than a wrong suggestion; a mistake on an easy pair costs more than one on a hard pair; no stupid matches; a change is accepted only on a fresh outside set.
- It cannot change the app, deploy, set the line or the "show from" level, raise a budget, add a provider or touch anything about card and ID photos.

Anything in the last group goes on the **owner's docket**: `benchmark/_workspace/tuning/owner-docket.md`, one line each with the question, the council's recommendation and the vote. The loop carries on with whatever does not depend on the answer.

## When the loop stops

- The council votes `stop` at an Agenda sitting.
- Two loops in a row end with no accepted change.
- No fresh outside set can be made (no writer, or the photos are used up).
- A usage limit, an expired sign-in or the spending stop.

Report to the owner at every stop, and after every Verdict sitting, in the usual short form with numbers.

## Records

Save each sitting's full return to `benchmark/_workspace/tuning/<loop>_council_<sitting>.json`. The `decisions.md` entry for the loop carries one line per sitting: the ruling and the vote (for example "Go or no-go: J1 test 4-0, A1 test without its third sentence 3-1"). A seat that did not answer counts as a vote against.

## The Workflow

`args`: `{ sitting: "agenda" | "go" | "verdict", loop: "<name>", papers: "<the papers as text, or absolute paths to read>", motions: ["<one line per thing to vote on>"] }`.

```js
export const meta = {
  name: 'loop-council',
  description: 'Four council seats vote alone on the open questions of a tuning loop; the chair counts and writes the ruling',
  phases: [{ title: 'Vote', detail: 'four seats, each alone' }, { title: 'Rule', detail: 'the chair counts and words the ruling' }],
}

const SEATS = [
  { seat: 'Evidence', type: 'agentic-council:Oracle', lens: 'Is the measurement sound: sample size, noise between runs, whether the wording can do what is claimed.' },
  { seat: 'Risk', type: 'agentic-council:Skeptic', lens: 'What breaks: stupid matches, overfitting to the test sets, side effects on text-only and non-English reports.' },
  { seat: 'People', type: 'agentic-council:Advocate', lens: 'The student who lost something and the one who found it: a missed item against a silly suggestion.' },
  { seat: 'Priority', type: 'agentic-council:Strategist', lens: 'Whether this is worth a loop and an outside test set before launch, or something else is worth more.' },
]
const RULES = `The owner's rules, which no vote can change: (1) a missed real item costs more than a wrong suggestion; (2) a mistake on an easy pair costs more than one on a hard pair; (3) the app must not show stupid matches (pairs raters put at 2 of 10 or lower); (4) a wording is accepted only if it wins on a fresh outside test set, by the written acceptance rule; (5) changing the app, deploying, the line, budgets, providers and anything about card or ID photos are the owner's alone: put them on the docket, do not decide them.`
const VOTE = {
  type: 'object',
  required: ['votes', 'reasoning'],
  properties: {
    votes: { type: 'array', items: { type: 'object', required: ['motion', 'vote', 'why'], properties: { motion: { type: 'string' }, vote: { type: 'string' }, why: { type: 'string' }, condition: { type: 'string' } } } },
    named_checks: { type: 'array', items: { type: 'string' } },
    docket: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
}
const RULING = {
  type: 'object',
  required: ['rulings', 'summary'],
  properties: {
    rulings: { type: 'array', items: { type: 'object', required: ['motion', 'ruling', 'count'], properties: { motion: { type: 'string' }, ruling: { type: 'string' }, count: { type: 'string' }, conditions: { type: 'array', items: { type: 'string' } } } } },
    named_checks: { type: 'array', items: { type: 'string' } },
    docket: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}
const HOW = {
  agenda: 'For each motion (a failure class), vote "attack" or "skip". You may attack at most two. If nothing is worth a loop, vote "stop" on every motion and say why.',
  go: 'For each motion (a candidate wording), vote "test", "revise" (put the clause to cut or change in "condition") or "drop". Add any number you want the test to report under named_checks. You cannot send to test a candidate a critic stopped with a fail and a concrete example.',
  verdict: 'The acceptance rule has already decided accepted or rejected; you cannot change that. For each motion (what to do next), vote "yes" or "no". Put anything that is the owner\'s to decide under docket, with your recommendation.',
}
const brief = (s) => `You hold the ${s.seat} seat on the council that governs the tuning of a lost-and-found matcher's prompts (loop ${args.loop}, sitting: ${args.sitting}). Your lens: ${s.lens}

${RULES}

The papers:
${args.papers}

The motions:
${args.motions.map((m, i) => `${i + 1}. ${m}`).join('\n')}

${HOW[args.sitting]}

Answer alone, from your lens, in plain words. Copy each motion's text exactly into "motion". Keep "why" to two sentences. Do not edit any file.`

phase('Vote')
const ballots = (await parallel(SEATS.map((s) => () =>
  agent(brief(s), { label: `seat:${s.seat}`, phase: 'Vote', schema: VOTE, agentType: s.type })
    .then((b) => (b ? { seat: s.seat, ...b } : null))))).filter(Boolean)
if (ballots.length < SEATS.length) log(`${SEATS.length - ballots.length} seats did not answer; each counts as a vote against`)

phase('Rule')
const ruling = await agent(`You chair the council that governs the tuning of a lost-and-found matcher's prompts (loop ${args.loop}, sitting: ${args.sitting}). You do not vote. Count the ballots below and write the ruling.

Counting: four seats; a motion carries with three votes for it ("attack", "test" or "yes"). Two against two is no. A seat that did not answer counts as a vote against. For "revise" votes: if "test" plus "revise" reach three, the ruling is "test as revised" and the conditions are the clauses at least two seats asked to cut or change. Never report a count the ballots do not show.

${RULES}

The motions:
${args.motions.map((m, i) => `${i + 1}. ${m}`).join('\n')}

The ballots (${ballots.length} of ${SEATS.length} seats answered):
${JSON.stringify(ballots)}

Return one ruling per motion with the count written like "3-1", the union of the seats' named checks without repeats, the docket items, and a summary of at most four sentences that names any dissent.`, { label: 'chair', phase: 'Rule', schema: RULING, agentType: 'agentic-council:Steward' })
return { sitting: args.sitting, loop: args.loop, ruling, ballots }
```

Why a barrier (`parallel`) for the votes: the chair needs every ballot at once. If the `agentic-council` plugin is off, the seats cannot be called: run the loop without the council, stop at each point where it would have sat, and ask the owner.
