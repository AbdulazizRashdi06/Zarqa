export const meta = {
  name: 'one-model-no-debate',
  description: 'One model alone reviews each lost/found pair (no advocates, no separate judge): same rule wording as the debate judge, same photos, 10 pairs per agent',
  phases: [{ title: 'Review', detail: 'one agent per file of 10 pairs' }],
}

// args: { dir, files, model? }  (model defaults to "opus"). Reads the same pair files as the advocates
// (export-advocates.mjs) and uses only their "pairs" list. The rule sentence is the app's SIMILARITY_RULE v1,
// word for word, and the two questions are the judge's same_item and overall with the advocates taken out.
const RULE = `People describe the same kind of item in different ways and often give very few details. Interpret item names in context; different words, levels of detail, or singular and plural forms alone neither prove nor disprove a match. Missing specifics are not evidence against a match. A missed real match may prevent an item being returned, while the owner can reject a wrong suggestion, so prefer recall when the evidence makes a match plausible. Still weigh concrete contradictions honestly.`
const INSTRUCTIONS = `You review possible matches in a university lost-and-found app: a LOST report and a FOUND report. Use only evidence in the reports and photos: item type, colour, brand/model, distinctive marks, place (location aliases name the same place), and timing (an item cannot be found before it was lost). For each pair answer three questions.
same_item: Do the LOST and FOUND reports describe the same physical item? ${RULE} Give the probability (0 to 1) that the answer is yes.
leaning: Which way does the concrete evidence in the reports and photos lean? "for" = it better supports a match; "against" = it better supports different items; "balanced" = about equal.
overall: How likely is it that the found item is exactly the item described in the lost report? ${RULE} Give a probability (0 to 1) for each level; they should sum to 1. Levels: clearly_different = "Clearly different items"; probably_different = "Probably different items"; unclear = "Unclear, could be either"; probably_same = "Probably the same item"; almost_certainly_same = "Almost certainly the same physical item".
When a photo is attached, look at it yourself and go by what it shows.`

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
const brief = (file) => `${INSTRUCTIONS}

Read the file ${args.dir}/${file} and use only its "pairs" list (ignore the two "advocate" instruction texts in it; they are for someone else). For EACH pair, on its own and without letting any other pair in the file influence you: read its "input" (the two reports, the place names that mean the same place, and a line about photos); if the pair has a "photo" path, open that image with the Read tool and look at it (it is the FOUND report's photo; open photos one at a time, each only when you reach its pair, and settle that pair before you open the next photo, so that no photo is attached to the wrong pair). Do not read any other file. Do not use anything you may know about this project.

Return one judgment per pair with its n exactly as given: same_item_probability (0 to 1), stronger_case (your answer to "leaning"), and overall_probabilities for the five levels.`

const model = args.model ?? 'opus'
const out = await parallel(args.files.map((file, i) => () =>
  agent(brief(file), { label: `${model}-alone:${file}`, phase: 'Review', schema: SCHEMA, model })
    .then((r) => (r ? { batch: i, file, judgments: r.judgments } : null))))
const ok = out.filter(Boolean)
log(`${ok.length}/${args.files.length} files returned; ${ok.reduce((s, x) => s + x.judgments.length, 0)} judgments`)
return ok
