export const meta = {
  name: 'haiku-panel',
  description: 'A panel of Claude Haiku members: each checks one thing about a lost/found pair and scores how well the pair follows its rule, 10 pairs per agent',
  phases: [{ title: 'Score', detail: 'one Haiku agent per member per batch of pairs', model: 'haiku' }],
}

const MEMBERS = {
  kind: { photos: true, rule: `KIND OF OBJECT. Are the two reports about the same kind of object? A different word, another language, or a looser word for the same thing agrees (wallet and card holder; earbuds and an AirPods case with the buds in it; "bag" and backpack). A plainly different object differs (keys and a watch; a phone and earphones). A case, holder, part or contents of the other item is "not_stated" with a score near 0.6.` },
  marks: { photos: true, rule: `NAMES, WRITING AND ONE-OFF MARKS. Anything written on the item (a personal name, initials, a number, a sticker, an engraving) and marks that make this one item unlike others of its kind (a crack, a dent, a keychain or charm, a tag, a repair, what is attached to it). Do not judge brand names, colour or the kind of object: other members do. If both sides give such a mark and they fit, it agrees; another spelling or script of the same name agrees. If both sides give marks of the same sort that do not fit (a different name, a different keychain), it differs. If only one side mentions a mark, or the photo cannot show it, it is "not_stated".` },
  brand: { photos: true, rule: `BRAND AND MODEL. The maker's name, the model, the size or capacity printed on the item. Do not judge anything else. Same brand agrees. Owners often remember a brand wrongly and finders often guess one, so a brand that differs is rarely a clear 0: score it low only when both sides clearly read it off the item, and in between when one side is recalling or unsure. Same brand with a different model or capacity is a partial fit. If one side gives no brand, it is "not_stated".` },
  colour: { photos: true, rule: `COLOUR, MATERIAL AND SHAPE. What the item looks like apart from any writing on it. Do not judge brand, marks or the kind of object. The same colour and material agree. A neighbouring shade (navy and black, grey and silver, maroon and brown, beige and white), or a colour you can only judge from the photo's lighting, is a partial fit near 0.6. A colour from a clearly different family that both sides state or show (red and black) differs. If one side gives no colour or material, it is "not_stated".` },
  place: { photos: false, rule: `PLACE. Where the item was lost and where it was found, using the location aliases given with each pair (they name the same place). Judge nothing else. The same place, or two names for it, agrees. A nearby place, or a desk or office where found things are handed in, is a partial fit near 0.6. Two unrelated places on this small campus are a weak fit near 0.3, never 0, because items are carried. If one side gives no usable place, it is "not_stated".` },
  time: { photos: false, rule: `TIME. When the item was lost and when it was found, from the two dates and from time words in the reports. Judge nothing else. Found on the same day or within some days after it was lost agrees. Found one day before the lost date is "not_stated" (owners often give the day they noticed). Found two or more days before the lost date is a weak fit that gets weaker the longer the gap, never 0. Found many weeks after is a weak fit. If a date is missing and the words give no time, it is "not_stated".` },
}
const SCHEMA = {
  type: 'object',
  required: ['scores'],
  properties: { scores: { type: 'array', items: { type: 'object', required: ['n', 'verdict', 'score'], properties: { n: { type: 'integer' }, verdict: { type: 'string', enum: ['agrees', 'not_stated', 'differs'] }, score: { type: 'number' } } } } },
}
const brief = (file, key) => `You are one member of a panel in a university lost-and-found app. The panel checks whether a LOST report and a FOUND report could be about the same physical item. You check ONE thing only and ignore everything else; other members check the rest, and someone else decides.

Your one rule: ${MEMBERS[key].rule}

Read the file ${args.dir}/${file} and use only its "pairs" list (ignore the two "advocate" instruction texts in it; they are for someone else). For EACH pair, on its own and without letting any other pair influence you: read its "input" (the two reports, the place names that mean the same place, and a line about photos).${MEMBERS[key].photos ? ' If the pair has a "photo" path, open that image with the Read tool and look at it (it is the FOUND report\'s photo); open photos one at a time, each only when you reach its pair, and settle that pair before you open the next.' : ' Do not open any photo: your rule does not need one.'} Do not read any other file. Do not use anything you may know about this project.

For each pair return: n exactly as given; verdict: "agrees" (both sides say or show it and it fits), "not_stated" (one side or both say nothing about it, or you cannot tell) or "differs" (both sides say or show it and it does not fit); and score from 0 to 1 for how well the pair follows your rule: 1 = clearly agrees, 0.5 = nothing to go on, 0 = clearly differs, with values in between for partial fits.`

const jobs = args.files.flatMap((file) => (args.members ?? Object.keys(MEMBERS)).map((key) => ({ file, key })))
const out = await parallel(jobs.map((j) => () =>
  agent(brief(j.file, j.key), { label: `${j.key}:${j.file}`, phase: 'Score', schema: SCHEMA, model: 'haiku' })
    .then((r) => (r ? { file: j.file, member: j.key, scores: r.scores } : null))))
const ok = out.filter(Boolean)
log(`${ok.length}/${jobs.length} member batches returned; ${ok.reduce((s, x) => s + x.scores.length, 0)} scores`)
return ok
