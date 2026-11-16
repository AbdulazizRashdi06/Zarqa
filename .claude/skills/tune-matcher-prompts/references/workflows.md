# Workflow scripts

Two scripts, passed to the Workflow tool as `script` with the inputs in `args`. Both return plain data for the main agent.

## 1. Critic panel (step 3)

`args`: `{ diagnosis: "<the target failure class as text>", candidates: [{ id, where, before, after, expected_effect }], council: true|false }`. Set `council` to true only when the `agentic-council` plugin's agent types are available.

```js
export const meta = {
  name: 'matcher-prompt-critics',
  description: 'Three critics per candidate wording try to show it should not be tested (recall, overfit, side effects)',
  phases: [{ title: 'Attack', detail: 'one critic per angle per candidate' }],
}

const VERDICT = {
  type: 'object',
  required: ['angle', 'verdict', 'objection', 'examples', 'smallest_fix'],
  properties: {
    angle: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail', 'uncertain'] },
    objection: { type: 'string' },
    examples: { type: 'array', items: { type: 'object', required: ['lost', 'found', 'what_goes_wrong'], properties: { lost: { type: 'string' }, found: { type: 'string' }, what_goes_wrong: { type: 'string' } } } },
    smallest_fix: { type: 'string' },
  },
}
const ANGLES = ['recall', 'overfit', 'side-effects']
const brief = (c, angle) => `Your angle: ${angle}.

The failure this change answers: ${args.diagnosis}

Candidate ${c.id} (applies to: ${c.where}).
BEFORE: ${c.before}
AFTER: ${c.after}
What the drafter expects: ${c.expected_effect}

Judge the change in place: read the current prompt in benchmark/src/reviewers/debate.js. Do not read benchmark/data or benchmark/results.`

const jobs = []
for (const c of args.candidates) {
  for (const angle of ANGLES) jobs.push({ c, angle, agentType: 'match-prompt-critic' })
  if (args.council) {
    jobs.push({ c, angle: 'risk (outside reviewer)', agentType: 'agentic-council:Skeptic' })
    jobs.push({ c, angle: 'prompt craft (outside reviewer)', agentType: 'agentic-council:Oracle' })
  }
}
const out = await parallel(jobs.map((j) => () =>
  agent(brief(j.c, j.angle), { label: `${j.c.id}:${j.angle}`, phase: 'Attack', schema: VERDICT, agentType: j.agentType })
    .then((v) => ({ candidate: j.c.id, angle: j.angle, ...(v || { verdict: 'uncertain', objection: 'critic returned nothing', examples: [], smallest_fix: '' }) }))))
const verdicts = out.filter(Boolean)
if (verdicts.length < jobs.length) log(`${jobs.length - verdicts.length} critics did not answer`)
// The three core angles decide; the outside reviewers inform the revision.
const decision = args.candidates.map((c) => {
  const core = verdicts.filter((v) => v.candidate === c.id && ANGLES.includes(v.angle))
  const fails = core.filter((v) => v.verdict === 'fail').length, unsure = core.filter((v) => v.verdict === 'uncertain').length + (ANGLES.length - core.length)
  return { candidate: c.id, goesForward: fails === 0 && unsure <= 1, fails, unsure }
})
return { decision, verdicts }
```

Why a barrier (`parallel`) here: the decision for a candidate needs all of its verdicts together.

## 2. Blind raters (step 5)

`args`: `{ dir: "<absolute folder holding the batch files>", files: ["independent2-0.json", …] }`. The batch files come from `node scripts/edge-outside.js prepare`.

```js
export const meta = {
  name: 'rate-outside-set',
  description: 'Two independent raters score every pair of a new test set for quality (0-10) and difficulty (1-5), blind to the truth and to the matcher',
  phases: [{ title: 'Rate', detail: 'two raters per batch' }],
}

const SCHEMA = {
  type: 'object',
  required: ['ratings'],
  properties: { ratings: { type: 'array', items: { type: 'object', required: ['n', 'quality', 'difficulty', 'reason'], properties: { n: { type: 'integer' }, quality: { type: 'integer', minimum: 0, maximum: 10 }, difficulty: { type: 'integer', minimum: 1, maximum: 5 }, reason: { type: 'string' } } } } },
}
const brief = (file, rater) => `You are rater ${rater}. Read the batch file ${args.dir}/${file}: a JSON array of pairs, each with a number n, a LOST report and a FOUND report (most found reports carry "photo": a path to open with the Read tool). Rate every pair on the scale in .claude/skills/blind-benchmark/references/rating-scale.md, which you should read first. Read nothing else. Return one rating per pair with its n exactly as given.`

const jobs = args.files.flatMap((file, i) => ['A', 'B'].map((rater) => ({ file, rater, i })))
const out = await parallel(jobs.map((j) => () =>
  agent(brief(j.file, j.rater), { label: `rate-${j.rater}:${j.file}`, phase: 'Rate', schema: SCHEMA, agentType: 'pair-rater' })
    .then((r) => (r ? { batch: j.i, rater: j.rater, ratings: r.ratings } : null))))
const ok = out.filter(Boolean)
log(`${ok.length}/${jobs.length} rating batches returned; ${ok.reduce((s, x) => s + x.ratings.length, 0)} ratings`)
return ok
```

Save the returned array to a file and pass it to `node scripts/edge-outside.js merge`. A batch that did not come back leaves its pairs unrated; re-run the Workflow with `resumeFromRunId` to fill only the missing batches.
