export const meta = {
  name: 'haiku-as-judge',
  description: 'Claude Haiku stands in for the judge model on the outside test set: same prompt, same arguments, same photos, 12 pairs per agent',
  phases: [{ title: 'Judge', detail: 'one Haiku agent per batch of 12 pairs', model: 'haiku' }],
}

const SCHEMA = {
  type: 'object',
  required: ['judgments'],
  properties: {
    judgments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['n', 'same_item_probability', 'stronger_case', 'overall_probabilities'],
        properties: {
          n: { type: 'integer' },
          same_item_probability: { type: 'number' },
          stronger_case: { type: 'string', enum: ['for', 'against', 'balanced'] },
          overall_probabilities: {
            type: 'object',
            required: ['clearly_different', 'probably_different', 'unclear', 'probably_same', 'almost_certainly_same'],
            properties: { clearly_different: { type: 'number' }, probably_different: { type: 'number' }, unclear: { type: 'number' }, probably_same: { type: 'number' }, almost_certainly_same: { type: 'number' } },
          },
        },
      },
    },
  },
}
const brief = (file) => `Read the file ${args.dir}/${file}. It holds "judge_instructions" and "pairs". You are standing in for the judge those instructions describe.

For EACH pair, on its own and without letting any other pair in the file influence you: read its "input" (the two reports, the timing label, the two advocates' cases, and a line saying whose item the photo shows); if the pair has a "photo" path, open that image with the Read tool and look at it (open photos one at a time, each only when you reach its pair, and settle that pair before you open the next photo, so that no photo is attached to the wrong pair); then answer the three questions exactly as "judge_instructions" asks. Do not read any other file. Do not use anything you may know about this project beyond the instructions in the file.

Return one judgment per pair with its n exactly as given: same_item_probability (0 to 1), stronger_case, and overall_probabilities for the five levels (they should sum to 1).`

const out = await parallel(args.files.map((file, i) => () =>
  agent(brief(file), { label: `haiku-judge:${i}`, phase: 'Judge', schema: SCHEMA, model: 'haiku' })
    .then((r) => (r ? { batch: i, judgments: r.judgments } : null))))
const ok = out.filter(Boolean)
log(`${ok.length}/${args.files.length} batches returned; ${ok.reduce((s, x) => s + x.judgments.length, 0)} judgments`)
return ok
