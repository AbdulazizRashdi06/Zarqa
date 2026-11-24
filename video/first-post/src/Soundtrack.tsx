import type React from 'react';
import {Audio} from '@remotion/media';
import {staticFile} from 'remotion';
import {COLLAPSE, FINGER, IDENTITY, IS, MERGE, STICKER, THERE} from './timing';

// The score, played as composed, start to finish: ElevenLabs music_v2_5 (Starter plan,
// commercial licence), scripts/elevenlabs-final-plan.json. The first 10.23 s are the original
// worried-to-satisfying take (scripts/elevenlabs-plan.json, kept by inpainting); after the finger
// it was composed for this timing: a hush, a return hit on THERE, a full outro, and a ring-out
// that plays on under the black.
const SCORE = 'audio/elevenlabs-score-final.mp3';

// Sound effects: real CC0 recordings picked with the sound-effects skill (credits in CREDITS.txt).
// One sound per cue; the logo impact is the loudest. The bed sits under the effects.
export const Soundtrack: React.FC = () => {
	return (
		<>
			<Audio name="Score" src={staticFile(SCORE)} volume={0.82} />
			<Audio name="Collapse" src={staticFile('sfx/woosh.ogg')} from={COLLAPSE - 2} volume={0.45} />
			<Audio name="Fold into ticket" src={staticFile('sfx/fold.ogg')} from={MERGE} volume={0.35} />
			{/* THERE and IS.: a heavy punch over a low boom. */}
			<Audio name="THERE punch" src={staticFile('sfx/there.ogg')} from={THERE} volume={0.36} />
			<Audio name="THERE boom" src={staticFile('sfx/boom-short.ogg')} from={THERE} volume={0.4} />
			<Audio name="IS. punch" src={staticFile('sfx/is.ogg')} from={IS} volume={0.45} />
			<Audio name="IS. boom" src={staticFile('sfx/boom-short.ogg')} from={IS} volume={0.5} />
			{/* The logo: the biggest hit of the video, a dramatic hit over a long low explosion and a punch. */}
			<Audio name="Logo hit" src={staticFile('sfx/logo-impact.ogg')} from={IDENTITY} volume={0.42} />
			<Audio name="Logo boom" src={staticFile('sfx/boom-long.ogg')} from={IDENTITY} volume={0.42} />
			<Audio name="Logo punch" src={staticFile('sfx/logo-punch.ogg')} from={IDENTITY} volume={0.32} />
			<Audio name="Coming soon" src={staticFile('sfx/sticker-pop.ogg')} from={STICKER} volume={0.28} />
			{/* Her superpower: a shimmer as her eyes glint at the freeze, a pop as she plucks the phone. */}
			<Audio name="Eye glint" src={staticFile('sfx/glint.ogg')} from={FINGER - 2} volume={0.3} />
			<Audio name="Pluck" src={staticFile('sfx/pluck.ogg')} from={IDENTITY + 6} volume={0.2} />
			<Audio name="Phone ding" src={staticFile('sfx/phone-ding.ogg')} from={IDENTITY + 50} volume={0.35} />
		</>
	);
};
