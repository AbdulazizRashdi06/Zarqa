export const meta = {
  name: 'haiku-as-advocates',
  description: 'Claude Haiku stands in for the two advocate models: the app\'s exact prompts and inputs, a separate agent for each side, 10 pairs per agent',
  phases: [{ title: 'Argue', detail: 'one Haiku agent per side per batch of 10 pairs', model: 'haiku' }],
}

const SCHEMA = {
  type: 'object',
  required: ['arguments'],
  properties: {
    arguments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['n', 'argument', 'strength'],
        properties: { n: { type: 'integer' }, argument: { type: 'string' }, strength: { type: 'string', enum: ['weak', 'moderate', 'strong'] } },
      },
    },
  },
}
const brief = (file, side) => `Read the file ${args.dir}/${file}. It holds "advocate_for_instructions", "advocate_against_instructions" and "pairs". You are standing in for the advocate described by "advocate_${side}_instructions": follow those instructions exactly and ignore the other set.

For EACH pair, on its own and without letting any other pair in the file influence you: read its "input" (the two reports, the place names that mean the same place, and a line about the photos); if the pair has a "photo" path, open that image with the Read tool and look at it (it is the FOUND report's photo; open photos one at a time, each only when you reach its pair, and settle that pair before you open the next photo, so that no photo is attached to the wrong pair); then write your argument and rate its strength exactly as the instructions ask. Do not read any other file. Do not use anything you may know about this project beyond the instructions in the file.

Return one entry per pair with its n exactly as given: argument and strength (weak, moderate or strong).`

const jobs = args.files.flatMap((file) => ['for', 'against'].map((side) => ({ file, side })))
const out = await parallel(jobs.map((j) => () =>
  agent(brief(j.file, j.side), { label: `haiku-${j.side}:${j.file}`, phase: 'Argue', schema: SCHEMA, model: 'haiku' })
    .then((r) => (r ? { file: j.file, side: j.side, arguments: r.arguments } : null))))
const ok = out.filter(Boolean)
log(`${ok.length}/${jobs.length} advocate batches returned; ${ok.reduce((s, x) => s + x.arguments.length, 0)} arguments`)
return ok
