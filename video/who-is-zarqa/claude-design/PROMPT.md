# "Who is Zarqa?" carousel: prompt for Claude Design

Only the three brand files in `assets/` go with this prompt: the mascot's character sheet, a screenshot of the app, and the logo. All illustrations are described in words for Claude Design to draw.

---

Design a 10-page PDF: an Instagram carousel called "Who is Zarqa?" that tells the legend of Zarqa al-Yamama in English and Arabic. Each page is one slide, 1080 × 1350 px (4:5), full bleed, RGB, no margins or crop marks. Also give me each page as a PNG if you can. You draw all the illustrations yourself, from the descriptions below.

## Skills to use

- **canvas-design** (Anthropic's poster skill). Follow its craft rules: write a short design philosophy first, make it visual-first with text as a design element, keep every element inside the page with breathing room, let nothing overlap by accident, then do a second pass that refines what is there instead of adding more.
- **pdf** for the export.
- If you have an illustration or image-generation skill, use it for the pictures, and keep one consistent drawing style across all ten slides.

## Who Zarqa is

Zarqa is a student-made lost-and-found app for GUtech, a university in Oman. It matches lost reports with found reports. It is named after Zarqa al-Yamama, the woman of Arabian legend who could see a rider three days away. The mascot is her. The look is playful, unofficial and student-made, never corporate.

## The story

Long ago in central Arabia lived a woman of the Jadis tribe, called Zarqa, "the blue-eyed one", for the blue of her eyes. Legend says her land was called Jaww and was later renamed al-Yamama after her. Her gift was her sight: they say she could spot a rider three days' journey away, and she used it to warn her people.

One day an army marched on them. Its commander knew about her eyes, so he ordered every soldier to cut down a tree and carry it in front of him as cover. From her lookout, Zarqa saw a forest moving across the desert and cried out: "I see trees walking!" She looked closer and added a detail no one could have invented: "And I see a man mending his sandal." Her people laughed and told her she was seeing things. The next morning, the army arrived.

Arabs still say "sharper-sighted than Zarqa al-Yamama". The point for us: she saw what no one else did, and this time, we're listening.

Tone: a folk tale told with a wink. Light, charming and a little funny. Stop at the army's arrival; show no violence and no aftermath.

## Brand system (locked)

- **Colours:** charcoal `#222634` (main background), surface `#2E3343`, slate `#434E5F`, tan `#BD9777` (accent), sage `#8E9DA0`, off-white `#F2EEE8` (ticket cards and main text). Muted text on dark `#A9B4B6`, on off-white `#5E6472`. One extra colour for this carousel: the blue of her eyes, `#1D66A3`, used rarely. Flat fills only: no gradients, glows, 3D or photo textures.
- **English type:** Anton for headlines (uppercase, tight), Figtree for small text, JetBrains Mono for small uppercase labels.
- **Arabic type:** the headline face must be the Arabic counterpart of Anton: heavy, tall, condensed, thick even strokes, squared geometric Kufi construction, the same visual weight and height as the English next to it. Good starting points: Noto Kufi Arabic Black, Kufam Black or Changa ExtraBold, condensed slightly if needed. **Not** rounded, bubbly or brushy (no Lalezar). Small Arabic text: IBM Plex Sans Arabic. The proverb on slide 9 is the one exception: bold Arabic calligraphy.
- **Arabic setting:** right to left, letters joined, every diacritic kept, no letter-spacing, real text.
- **Motifs from the app's UI** (see the attached app screenshot): luggage-tag shapes with notched corners and a punched hole, off-white "tickets" with a dashed tear line and round side notches, small tilted tan pill stickers with a dark outline, Zarqa's speech bubble, chat bubbles, small monospace labels.

## The mascot (locked)

Zarqa appears on most slides and must be the same character every time. The attached character sheet is the authority; match it exactly.

- A young woman drawn as a flat 2D cartoon with clean dark outlines, friendly and expressive, like a mobile-app mascot.
- Warm tan skin, large bright blue eyes, a small smile.
- Two long black braids hanging in front of her shoulders, each with gold cuffs.
- A cream veil over her head, falling behind her shoulders, edged with a navy-and-turquoise triangle pattern and a row of gold coins.
- A navy-and-turquoise geometric headband with gold coins across her forehead.
- One round side ornament by her temple: cream rings around a blue centre, with small cream beads under it. It sits on one side only, so never mirror her.
- Gold hoop earrings, a gold coin necklace, and a long navy dress with cream, turquoise and gold trim and a gold belt.
- Do not age her up, restyle her, change her outfit or cover her face, braids, coins or ornament.

## Illustration style

Everything else is drawn in her style: flat 2D cartoon, clean dark navy outlines of even weight, flat colour fills from the palette (plus a muted olive green for leaves), simple friendly shapes. People wear plain ancient Arabian dress: cream headwraps, navy or cream robes, leather sandals. No weapons raised, nothing frightening.

## Hard rules

- Use the text below **exactly as written**, in both languages, on every slide. Do not translate, reword, shorten or add text.
- **No slide titles and no slide numbers or page counters.**
- No logo except on slide 10.
- The threat always comes from the right, the direction the carousel is swiped.

## Be brave

This is a set of posters, not a slide deck. I want enormous type, strong scale contrast, type and illustration interlocking, and generous empty space. Ideas I like, to use or beat:

- Tell the legend through the app's own UI: her warning as one giant Zarqa speech bubble, her people's reply as chat bubbles, a dashed "sightline" like a ticket's tear line.
- Let scale carry the story: the rider is a speck in an almost empty slide; the trees are dots on the horizon on slide 5 and fill the frame by slide 8.
- One fully blue slide (slide 2), because Zarqa means the blue-eyed one.
- Let slides leak into each other: on slide 7 a walking tree is already sneaking in at the right edge, and it continues at the left edge of slide 8.
- Set Arabic and English as one lockup of equal weight, not a translation tucked underneath.

## The ten slides

**1. Hook**
- Picture: Zarqa stands tall, one hand flat at her brow shading her eyes like a lookout, the other on her hip, peering into the far distance to the right with a small confident smile. The two questions are set enormous and fill the poster, with her standing among the lines. The second question is in tan, the first in off-white. A couple of blank tickets and luggage tags can sit in the corners.
- EN: You know the name. Do you know the story?
- AR: تعرف الاسم… فهل تعرف القصة؟

**2. Her name**
- Picture: the blue slide. The whole background is the blue of her eyes, with off-white type. A large close-up of her face, turned three-quarters, her blue eyes the focus. Along the bottom, a flat darker-blue silhouette of a desert town: a crenellated mud-brick wall, flat-roofed houses and palm tops.
- EN: "Zarqa" means the blue-eyed one. She was a woman of the Jadis tribe. Legend says her land was called Jaww, until it was renamed al-Yamama after her.
- AR: «زرقاء» لقبٌ لزُرقة عينيها، وهي امرأة من جَديس. ويُروى أن بلدها كان يُسمّى «جَوّاً»، ثم سُمّي «اليمامة» باسمها.

**3. Her gift**
- Picture: scale is the idea. At the left, a tall, slender mud-brick watchtower with a crenellated top; Zarqa stands on it from the waist up, shading her eyes. A vast, almost empty charcoal sky. At the far right of the horizon, one rider on a horse, no bigger than a speck. A dashed tan line runs from her eyes to the rider.
- EN: They say she could spot a rider three days' journey away, and warn her people.
- AR: قيل: كانت تُبصر الراكب من مسيرة ثلاثة أيام، فتُنذر قومها.

**4. The trick**
- Picture: an off-white paper slide with charcoal type, laid out as one giant ticket with a dashed tear line and round side notches. Three foot soldiers stand in a row, each sheepishly holding a big leafy branch in front of himself and peeking over the leaves with embarrassed eyes. Their legs and sandals show below the branches. Zarqa is not on this slide.
- EN: An army marched on them. It knew about her eyes, so every man was ordered to cut a tree and hide behind it.
- AR: فسار إليهم جيشٌ قد عَلِم بحدّة بصرها، فأُمر كلُّ رجلٍ أن يقطع شجرةً يستتر بها.

**5. The warning**
- Picture: Zarqa leans forward, one arm stretched out pointing at the far horizon to the right, the other hand cupped at her mouth, eyes wide, shouting. On the horizon where she points, a few leafy trees are tiny dots. Her words fill one giant speech bubble in the app's style (surface colour, rounded, one small corner toward her) that takes up most of the poster.
- EN: "I see trees walking!"
- AR: «إني أرى شجراً يسير!»

**6. The sandal**
- Picture: we look through her eye. One giant round lens in the middle of the poster, framed by concentric cream and blue rings like her side ornament. Inside the lens, on sand: a leafy tree with a man hidden behind it. Only his legs and hands show below the leaves; he stands on one leg and lifts the other foot to fix the strap of his sandal. Her words sit in a speech bubble under the lens. Zarqa is not on this slide.
- EN: "And I see a man mending his sandal."
- AR: «وأرى رجلاً يخصف نعله.»

**7. Disbelief**
- Picture: told like the app's chat screen. Four townspeople, two men and two women, stand together laughing hard and pointing at her; one holds his belly, one wipes a tear. Zarqa stands apart with her arms crossed, deadpan, one eyebrow raised: an "I told you" look. Their reply sits in off-white chat bubbles, like incoming messages. At the far right edge, half out of frame and unnoticed, a leafy tree walking on a pair of human legs in sandals is already sneaking in.
- EN: Her people didn't believe her. "You're seeing things, Zarqa."
- AR: فكذّبها قومها وقالوا: «خَرِفتِ يا زرقاء.»

**8. The arrival**
- Picture: dawn. A pale sand-coloured sky with one big flat off-white sun rising behind the town's arched wooden gate and crenellated wall. Right at the gate stands a row of leafy trees, each walking on a pair of human legs in sandals, drawn big so they fill the bottom of the poster. The tree from slide 7's edge continues at this slide's left edge. A beat of silence: lots of quiet sky, modest charcoal type. Zarqa is not on this slide.
- EN: The next morning, the trees arrived.
- AR: فلمّا أصبحوا… صبّحهم الجيش.

**9. The proverb**
- Picture: an off-white paper slide, like one big ticket with a dashed tear line and side notches near the bottom. At the top, a small arched window with a blue background shows a close view of her eyes as she shades them with her hand. Below it, the proverb set enormous in bold Arabic calligraphy in charcoal ink, with the word زرقاء in blue. The English and the small Arabic line sit under the tear line.
- Large type: أبصرُ من زرقاء اليمامة
- EN: "Sharper-sighted than Zarqa al-Yamama." Arabs have said it for centuries.
- AR: مثلٌ تضربه العرب في حدّة البصر.

**10. The point**
- Picture: a clean charcoal background. The attached ZARQA logo, used exactly as it is and large. Zarqa winks with a proud grin and points up at it. "GUtech lost & found" as a small monospace label and "coming soon" as a tilted tan sticker.
- EN: She saw what no one else did. This time, we're listening. · GUtech lost & found · coming soon
- AR: أبصرت ما لم يُبصره أحد. وهذه المرّة… سنصدّقها.

## Before you hand it over

Check every page: all text matches the list above letter for letter (including Arabic diacritics), nothing is cut off or overlapping, Zarqa matches her character sheet on every slide, there are no titles or numbers, and the ten pages read as one set.
