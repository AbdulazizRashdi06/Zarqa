import type React from 'react';
import {Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {C, FONT} from './theme';
import {COLLAPSE, MERGE, STACK} from './timing';

// One lost-and-found screenshot: flies in from off screen and lands on its beat with a ping,
// lands at (x, y), freezes with the finger, then joins the neat stack that folds into the ticket.
export const Post: React.FC<{
	readonly src: string;
	readonly aspect: number;
	readonly onBeat: number;
	readonly fromX: number;
	readonly fromY: number;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly rot: number;
	readonly stackIndex: number;
	readonly sticker: 'Lost' | 'Found';
	readonly ping: number;
}> = ({src, aspect, onBeat, fromX, fromY, x, y, width, rot, stackIndex, sticker, ping}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const enter = onBeat - 4; // the card lands as the ping hits

	const land = spring({frame: frame - enter, fps, config: {damping: 15, stiffness: 140, mass: 0.9}});
	const tuck = spring({
		frame: frame - COLLAPSE - stackIndex * 0.7,
		fps,
		config: {damping: 18, stiffness: 110},
	});
	const stickerIn = spring({frame: frame - enter - 7, fps, config: {damping: 10, stiffness: 180}});

	const flyX = x + fromX * (1 - land);
	const flyY = y + fromY * (1 - land);
	const flyRot = rot + (fromX >= 0 ? 24 : -24) * (1 - land);

	const stackRot = stackIndex === 15 ? 0 : (stackIndex % 2 ? 1 : -1) * (1 + (stackIndex % 3));
	const cx = flyX + (STACK.x - flyX) * tuck;
	const cy = flyY + (STACK.y - stackIndex * 3 - flyY) * tuck;
	const r = flyRot + (stackRot - flyRot) * tuck;
	const w = width + (STACK.width - width) * tuck;
	// Every card takes the same shape in the stack so it reads as one neat pile.
	const h = width * aspect + (STACK.width * STACK.aspect - width * aspect) * tuck;

	return (
		<>
			<Audio src={staticFile(`audio/ping-${ping}.wav`)} from={onBeat} volume={0.85} />
			{frame >= enter && frame < MERGE + 10 ? (
				<div
					style={{
						position: 'absolute',
						left: cx,
						top: cy,
						width: w,
						translate: '-50% -50%',
						rotate: `${r}deg`,
						zIndex: 10 + stackIndex,
						// The stack folds into the ticket that pops out of the same spot.
						scale: interpolate(frame, [MERGE, MERGE + 9], [1, 0.35], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.in(Easing.cubic),
						}),
						opacity: interpolate(frame, [MERGE + 4, MERGE + 10], [1, 0], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						}),
					}}
				>
					<Img
						src={staticFile(src)}
						style={{
							display: 'block',
							width: '100%',
							height: h,
							objectFit: 'cover',
							borderRadius: w * 0.058,
							boxShadow: '0 26px 60px rgba(8, 10, 18, 0.6), 0 0 0 2px rgba(255,255,255,0.04)',
						}}
					/>
					<div
						style={{
							position: 'absolute',
							right: -14,
							top: -26,
							scale: String(stickerIn * (1 - tuck)),
							rotate: '9deg',
							background: sticker === 'Lost' ? C.tan : C.sage,
							color: C.ink,
							fontFamily: FONT.mono,
							fontWeight: 700,
							fontSize: 30,
							letterSpacing: 3,
							textTransform: 'uppercase',
							padding: '8px 22px',
							borderRadius: 999,
							border: `5px solid ${C.ground}`,
						}}
					>
						{sticker}
					</div>
				</div>
			) : null}
		</>
	);
};
