export const meta = {
  name: 'match-debate-v2',
  description: 'Debate v2 for lost/found pairs: a claimant and a skeptic each write a short note per pair (either may say it has no case), then a referee reads the evidence first and the notes second and decides; 10 pairs per file',
  phases: [{ title: 'Notes', detail: 'claimant and skeptic, side by side, one agent each per file' }, { title: 'Referee', detail: 'one agent per file, after both notes' }],
}

// args: { dir, files, model, roles }
//   dir    folder of pair files written by benchmark/scripts/plan-agents/export-advocates.mjs (only their "pairs" list is used)
//   files  the pair files to run in this workflow (split a set over several workflows: only about two agents run at once)
//   model  "haiku" or "opus": the model under test, used for all three roles
//   roles  absolute path of .claude/agents, where match-claimant.md, match-skeptic.md and match-referee.md live
// The role texts are read from the agent files at run time, so there is one copy of each role.
const STRENGTH = ['none', 'weak', 'moderate', 'strong']
const NOTES = {
  type: 'object', required: ['notes'],
  properties: { notes: { type: 'array', items: { type: 'object', required: ['n', 'argument', 'strength'], properties: { n: { type: 'integer' }, argument: { type: 'string' }, strength: { type: 'string', enum: STRENGTH } } } } },
}
const LEVELS = ['clearly_different', 'probably_different', 'unclear', 'probably_same', 'almost_certainly_same']
const JUDGMENTS = {
  type: 'object', required: ['judgments'],
  properties: { judgments: { type: 'array', items: { type: 'object', required: ['n', 'same_item_probability', 'stronger_case', 'overall_probabilities'], properties: {
    n: { type: 'integer' }, same_item_probability: { type: 'number' }, stronger_case: { type: 'string', enum: ['for', 'against', 'balanced'] },
    overall_probabilities: { type: 'object', required: LEVELS, properties: Object.fromEntries(LEVELS.map((k) => [k, { type: 'number' }])) },
  } } } },
}
const pairsLine = (file) => `Then read ${args.dir}/${file} and use only its "pairs" list (if the file also holds instruction texts for "advocates", ignore them: they are for someone else). Each pair has an "n", an "input" (the two reports, the place names that mean the same place, and a line about photos) and sometimes a "photo" path, which is the FOUND report's photo: open it with the Read tool when you reach that pair.`
const noteBrief = (role, file) => `Read ${args.roles}/${role}.md and take the role it describes, exactly as written, from the first heading on. ${pairsLine(file)} Do not read any other file. Do not use anything you may know about this project.

Return one note per pair with its n exactly as given: argument and strength.`
const refereeBrief = (file, notes) => `Read ${args.roles}/match-referee.md and take the role it describes, exactly as written, from the first heading on. ${pairsLine(file)} Do not read any other file. Do not use anything you may know about this project.

The two notes for each pair, by n ("(no note)" means that writer returned nothing for the pair):
${JSON.stringify(notes)}

Return one judgment per pair with its n exactly as given.`

const model = args.model
const byN = (list) => Object.fromEntries((list || []).map((x) => [x.n, x]))
const out = await pipeline(
  args.files,
  async (file) => {
    const [c, s] = await parallel([
      () => agent(noteBrief('match-claimant', file), { label: `claimant:${file}`, phase: 'Notes', schema: NOTES, model }),
      () => agent(noteBrief('match-skeptic', file), { label: `skeptic:${file}`, phase: 'Notes', schema: NOTES, model }),
    ])
    if (!c || !s) throw new Error(`a note writer returned nothing for ${file}`)
    return { claimant: c.notes, skeptic: s.notes }
  },
  async (notes, file) => {
    const c = byN(notes.claimant), s = byN(notes.skeptic)
    const ns = [...new Set([...Object.keys(c), ...Object.keys(s)])].map(Number).sort((a, b) => a - b)
    const table = ns.map((n) => ({ n, claimant: c[n] ? { note: c[n].argument, strength: c[n].strength } : '(no note)', skeptic: s[n] ? { note: s[n].argument, strength: s[n].strength } : '(no note)' }))
    const r = await agent(refereeBrief(file, table), { label: `referee:${file}`, phase: 'Referee', schema: JUDGMENTS, model })
    if (!r) throw new Error(`the referee returned nothing for ${file}`)
    return { file, model, claimant: notes.claimant, skeptic: notes.skeptic, judgments: r.judgments }
  },
)
const ok = out.filter(Boolean)
log(`${ok.length}/${args.files.length} files done; ${ok.reduce((t, x) => t + x.judgments.length, 0)} judgments`)
return ok
