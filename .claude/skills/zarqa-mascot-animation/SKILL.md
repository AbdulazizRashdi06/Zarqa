---
name: zarqa-mascot-animation
description: Animate the Zarqa mascot (the Zarqa Al-Yamama-inspired girl with the cream veil, blue eyes, two braids and gold forehead coins) instead of making a single still. Gives transparent animated WebP, a GIF preview, a reduced-motion poster and, for simple motion, a few-KB CSS animation. Three routes: procedural motion of existing art (bob, breathe, sway, bounce, wiggle, pop), Codex keyframe sprite sheets, and video-model clips (Gemini Omni Flash, or Veo 3.1 Lite / Seedance on fal.ai) from a start frame to an end frame on green, keyed out. Use whenever the user wants her to move, wave, bounce, celebrate, loop, blink, or wants an animated sticker, GIF, loading or empty-state animation, even if they don't say "animation" (e.g. "make her wave on the match screen", "can the sad mascot sway a bit").
---

# Zarqa mascot animation

This builds on the **zarqa-mascot** skill. Her look is locked there (`../zarqa-mascot/assets/prompt-template.md` and `character-sheet.png`), and every rule in that skill still applies: only pose, expression, gaze, props and framing change; nothing locked gets "improved"; props stay generic; cards are blank cartoon cards. Read that skill first if you haven't this session. This skill never edits those files. It fills the same template.

The danger in animation is the same as in stills, multiplied: every newly drawn frame is a new chance for her face, coins or side ornament to drift. So prefer the route that redraws her the least.

## Pick the route

| Want | Route | Redraws her? | Cost |
|---|---|---|---|
| Idle life on art that already exists: floating, breathing, a happy hop, a sway, an excited wiggle, a pop-in | `motion` | **No.** It moves the still. | Free, instant |
| A few distinct poses that snap between each other: blink, two-pose wave, thumbs-up flip | `sheet` | Yes, once: all frames in **one** Codex image, so they match each other | ChatGPT allowance, ~1–2 min |
| Real movement with smooth in-betweens: a full wave, picking something up, turning, cloth and braids swinging | `video` | Yes, every frame, by a video model | Paid clip (needs billing), a few min |

Default to `motion` when the user just wants her "alive" on a screen. Use `video` when the action needs real movement. Keyframes alone snap and look choppy, so never hand a `sheet` animation over as "smooth". Use `sheet` for the start and end frames the video model needs, or on its own for snappy two-to-four-pose loops. The routes combine: `--motion` works on top of `sheet` and `video` frames, and `pingpong` makes a loop out of any frame order.

## Commands

Run from the project root. Everything goes to `mascot-output/`.

**motion**: animate an existing transparent PNG (app art in `design/mascot/`, or a still from the mascot skill):
```
python .claude/skills/zarqa-mascot-animation/scripts/animate.py motion --name happy-hop --image design/mascot/happy.png --motion bounce
```
Presets: `bob` (float), `breathe`, `sway`, `bounce` (crouch, hop, squash), `wiggle` (excited shake, then rest), `pop` (scale-in with overshoot; plays once). `--length` sets seconds, `--cycles` sets repeats per loop. Bust-cropped art (cut off at the bottom, like `home-found-keys`) should use `breathe`, `sway` or `wiggle`: `bob` and `bounce` lift the cut edge off whatever it sits on.

**sheet**: Codex draws 2, 3, 4, 6 or 8 keyframes in one image, then the script slices them and pins her feet to one spot:
```
python .claude/skills/zarqa-mascot-animation/scripts/animate.py sheet --name blink \
  --frame "Standing relaxed, arms down, eyes open." --frame "Exactly the same pose, eyes closed in a blink." \
  --sequence 1:2400,2:120 --expression "Gentle smile." --props "None."
```
- Write one `--frame` per keyframe. Each says only what differs. Everything else is held identical by the locked sheet layout (`assets/sheet-layout.md`).
- Fewer keyframes animate better: 2–4. Use `--sequence` to reorder and time them (`frame:ms`, comma-separated), e.g. a wave `1:300,2:160,3:160,2:160,3:160`, or `--pingpong`.
- `--anchor cell` keeps each figure where Codex put it (for jumps). The default, `feet`, pins her feet.
- Change timing or motion later without calling Codex again: `animate.py assemble --name blink --sequence 1:3000,2:100`.
- `--prompt-only` writes `<name>.sheet.prompt.md` for an approved exception or for ChatGPT by hand.

**video**: start frame → end frame, animated by a video model:
```
python .claude/skills/zarqa-mascot-animation/scripts/animate.py video --name wave --from-sheet wave-keys   --prompt "She lifts her right hand and waves hello twice, smiling, then holds the wave."
```
- Providers (`--provider`):
  - `omni` (default): Google's Gemini Omni Flash. Needs `GEMINI_API_KEY`, and the key's Google AI Studio project needs **billing on**, because the free tier allows 0 requests a day for this model. There's no audio switch, so the prompt asks for silence; the WebP is silent anyway. Google shut down Veo 3.1 (including Lite) in the Gemini API on 2026-10-22, so Veo goes through fal.ai.
  - `veo-lite`: Veo 3.1 Lite first/last frame on fal.ai, with audio off. fal says it retires this endpoint on 2026-11-17.
  - `seedance`: Seedance 2.0 on fal.ai. The `seedance` command is an alias that picks it.
- Keyframes come from `--from-sheet NAME` (the first and last frames of a `sheet` run: the best match), or `--start PNG [--end PNG]`. With no end frame, it ends on the start frame, so the clip loops.
- `--prompt` is the motion only. The locked video rules (`assets/video-prompt.md`) handle the rest: fixed camera, flat green background, same character, silent, about `--duration` seconds.
- The script places both frames identically on pure green (#00FF00; her palette has no green), sends them, saves `<name>.mp4` and `<name>.video.json` (the response without the video data), removes the green (with despill), and samples frames at `--fps` (default 12).
- Always run `--dry-run` first on a new request. It writes `<name>.start.png`, `<name>.end.png` and `<name>.video-prompt.md` without paying. Look at the two green frames before spending money.
- `--video <name>.mp4` re-keys or re-times an existing clip for free. Also try `--duration` (default 4; veo-lite takes 4, 6 or 8), `--resolution` (default 720p), `--aspect` (omni and veo-lite: 9:16 only), and `--model` to override the model id.
- Keys are read from the environment or `benchmark/.env`. If one is missing, ask the user to add it there themselves. Never ask for the value in chat, and never print it.
- Only mascot art goes to these services. Never send user photos, item photos or anything from the app's database.

## Outputs

| File | Use |
|---|---|
| `<name>.webp` | The animation: transparent, looping (or once) |
| `<name>.preview.gif` | Same on white: **judge motion with this** (transparent previews can show a fake dark glow) |
| `<name>.frames.jpg` | Keyframes on white, numbered (8 samples for video): **judge identity with this** |
| `<name>.poster.png` | Still frame at rest, for `prefers-reduced-motion` and as the image the CSS animates |
| `<name>.motion.css` | Only with `--motion`: the same motion as CSS keyframes, with transform-origin on her feet and reduced motion respected |
| `<name>.anim.json` | Every setting, for re-running |

## Check before showing

1. Open `<name>.frames.jpg` and check every frame against the identity anchors from the mascot skill: face, blue eyes, two braids, cream veil, headband, forehead coins, **side ornament**, palette, proportions, cartoon style. For video clips, look hardest at the middle frames, because the first and last are pinned and the in-betweens are not. Known drift: the gold cuffs on her braids.
2. Read every `WARNING:` the script prints. A height warning means scale drift between frames, or just a raised arm. A missing-gap warning means figures touched in the sheet, so the slicing may have clipped a braid or sleeve.
3. If a drawn frame drifts, regenerate once with the same prompt before changing anything. For video, try once more before changing the prompt. Each try costs money, so tell the user before a third.
4. Show the user the GIF preview and the frames sheet, and say what drifted, if anything.

## Putting it in the app

- Don't replace anything in `web/public/mascot/` unless the user asks. The owner wants the iPhone mascot (`phone.png`) kept as is: `motion` on it is fine because nothing is redrawn, but don't regenerate it.
- For a looping idle on screen, prefer **CSS on the poster**. Copy the `.motion.css` rules into the component's CSS module and use the poster as a normal WebP: a few KB instead of 0.5–3 MB, sharp at any size. Animated WebP is for real frame changes (`sheet`, `video`) and for stickers or sharing outside the app.
- For in-app animated WebP, use `--size 400 --quality 70` (about 0.3 MB per second of motion) and play it once or only on a moment (a match found, a handover). Show the poster under `prefers-reduced-motion: reduce`.
- New copy (alt text) goes in `web/src/i18n/en.json`. Check it at 390 × 844 with Playwright (see the project CLAUDE.md).

## If something fails

- Codex sheet fails: read `<name>.sheet.codex-log.txt` (same causes as the mascot skill: not signed in, quota). You can give the user `<name>.sheet.prompt.md` to paste into ChatGPT with the character sheet attached, then run `assemble --sheet <their image> --count N`.
- API errors print the status code and message. A 401 or 403 means the key. A 429 from Gemini that says "limit: 0 ... Free Tier" means billing isn't on for that key's project. A 400 or 422 means a parameter: check the model's current docs, since endpoints and options change.
- Keying leaves green around the edges or holes in her outfit: the clip's background wasn't flat green. Check `<name>.mp4`. If the background drifts, regenerate. Don't loosen the key until it eats into her veil.
