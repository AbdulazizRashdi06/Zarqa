import type React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {CutToBlack, Identity, ThereIs} from './Ending';
import {Soundtrack} from './Soundtrack';
import {Post} from './Post';
import {Ticket} from './Ticket';
import {C} from './theme';
import {FINGER, POST_NOTES, STACK, THERE, TICKET} from './timing';
import {Zarqa} from './Zarqa';

const LABEL = 'GUtech · lost & found';

export const FirstPost: React.FC = () => {
	return (
		<AbsoluteFill
			style={{
				background: `radial-gradient(120% 80% at 50% 45%, ${C.surface} 0%, ${C.ground} 60%, #191c27 100%)`,
				overflow: 'hidden',
			}}
		>
			<Soundtrack />

			<Shake>
				{/* 0–3 s: the first post. Every post lands on a note of the melody. */}
				<Post src="posts/01.jpg" aspect={0.774} onBeat={POST_NOTES[0]} fromX={0} fromY={1500} x={540} y={1000} width={720} rot={-2} stackIndex={0} sticker="Lost" ping={0} />
				<Post src="posts/03.jpg" aspect={0.839} onBeat={POST_NOTES[1]} fromX={1250} fromY={60} x={650} y={1140} width={640} rot={6} stackIndex={1} sticker="Lost" ping={0} />
				<Post src="posts/09.jpg" aspect={0.776} onBeat={POST_NOTES[2]} fromX={-1250} fromY={-60} x={420} y={860} width={640} rot={-6} stackIndex={2} sticker="Lost" ping={0} />

				{/* 3–6 s: the problem grows */}
				<Post src="posts/02.jpg" aspect={0.774} onBeat={POST_NOTES[3]} fromX={0} fromY={-1600} x={300} y={1340} width={600} rot={9} stackIndex={3} sticker="Lost" ping={1} />
				<Post src="posts/04.jpg" aspect={0.774} onBeat={POST_NOTES[4]} fromX={1100} fromY={1300} x={790} y={640} width={600} rot={-10} stackIndex={4} sticker="Lost" ping={1} />
				<Post src="posts/05.jpg" aspect={1.035} onBeat={POST_NOTES[5]} fromX={-1250} fromY={-300} x={320} y={620} width={560} rot={5} stackIndex={5} sticker="Lost" ping={1} />
				<Post src="posts/06.jpg" aspect={0.972} onBeat={POST_NOTES[6]} fromX={1000} fromY={-1500} x={770} y={1430} width={600} rot={-5} stackIndex={6} sticker="Lost" ping={1} />
				<Post src="posts/10.jpg" aspect={0.907} onBeat={POST_NOTES[7]} fromX={-1000} fromY={1300} x={520} y={1580} width={620} rot={11} stackIndex={7} sticker="Lost" ping={1} />

				{/* 6–10 s: complete chaos, the 20 rial pair last */}
				<Post src="posts/07.jpg" aspect={0.841} onBeat={POST_NOTES[8]} fromX={-1100} fromY={-1300} x={250} y={330} width={600} rot={-13} stackIndex={8} sticker="Lost" ping={2} />
				<Post src="posts/08.jpg" aspect={1.169} onBeat={POST_NOTES[9]} fromX={1300} fromY={200} x={830} y={340} width={600} rot={10} stackIndex={9} sticker="Lost" ping={2} />
				<Post src="posts/11.jpg" aspect={0.842} onBeat={POST_NOTES[10]} fromX={0} fromY={1500} x={230} y={1700} width={600} rot={7} stackIndex={10} sticker="Lost" ping={2} />
				<Post src="posts/14.jpg" aspect={1.038} onBeat={POST_NOTES[11]} fromX={1200} fromY={900} x={860} y={1720} width={600} rot={-9} stackIndex={11} sticker="Lost" ping={2} />
				<Post src="posts/15.jpg" aspect={1.434} onBeat={POST_NOTES[12]} fromX={-1300} fromY={0} x={200} y={1050} width={560} rot={14} stackIndex={12} sticker="Found" ping={3} />
				<Post src="posts/16.jpg" aspect={0.936} onBeat={POST_NOTES[13]} fromX={1300} fromY={-400} x={880} y={1020} width={600} rot={-12} stackIndex={13} sticker="Lost" ping={3} />
				<Post src="posts/12.jpg" aspect={0.842} onBeat={POST_NOTES[14]} fromX={200} fromY={-1600} x={560} y={560} width={660} rot={-4} stackIndex={14} sticker="Found" ping={3} />
				<Post src="posts/13.jpg" aspect={0.710} onBeat={POST_NOTES[15]} fromX={-200} fromY={1600} x={540} y={1180} width={680} rot={3} stackIndex={15} sticker="Lost" ping={3} />
			</Shake>

			<Zarqa />

			<Ticket from={POST_NOTES[0] + 6} until={POST_NOTES[3] - 8} label={LABEL} top={120} tilt={-2}>
				Someone lost something.
			</Ticket>
			<Ticket from={POST_NOTES[3] - 4} until={POST_NOTES[8] - 4} label={LABEL} top={120} tilt={2}>
				And they’re not alone.
			</Ticket>
			{/* 10.6–11.8 s: the screenshots fold into this one ticket; 11.8 s it vanishes. */}
			<Ticket from={TICKET} until={THERE} cut label={LABEL} top={STACK.y - 195} tilt={-1.5}>
				There has to be a better way.
			</Ticket>

			<ThereIs />
			<Identity />
			<CutToBlack />
		</AbsoluteFill>
	);
};

// The pile kicks each time a post lands, harder as it piles up, and freezes dead at the finger.
const Shake: React.FC<{readonly children: React.ReactNode}> = ({children}) => {
	const frame = useCurrentFrame();
	const landed = POST_NOTES.filter((f) => f <= frame);
	const last = landed.length ? landed[landed.length - 1] : -100;
	const kick = Math.exp(-(frame - last) / 3.5);
	const amp =
		frame >= FINGER
			? 0
			: interpolate(landed.length, [3, 16], [2, 14], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const dir = landed.length % 2 ? 1 : -1;
	return (
		<AbsoluteFill
			style={{
				translate: `${dir * amp * kick * 0.6}px ${amp * kick}px`,
				scale: String(1 + 0.012 * (amp / 14) * kick),
			}}
		>
			{children}
		</AbsoluteFill>
	);
};
