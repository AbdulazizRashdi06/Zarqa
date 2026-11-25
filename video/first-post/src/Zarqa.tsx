import type React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from './theme';
import {FINGER, IDENTITY, THERE, TICKET, ZARQA_ENTER} from './timing';
import {CLIP_A, CLIP_B, CLIP_C} from './zarqaFrames';

// Her superpower, as one performance in three Gemini Omni Flash clips (keyed to transparent):
// A: she scans the chaos like a lookout, spots something, and her finger goes up at the freeze;
// B: on THERE IS she points up proudly; C: she plucks the lost phone out of thin air and holds it
// out to the viewer, its burgundy back facing out the whole time. Each clip starts on the pose the last one ends on, and holds with an idle sway.

const HEIGHT = 860;
const WIDTH = (HEIGHT * 599) / 1000;

// Key moments inside each clip (clip frames) and where they land in the video.
const A_FINGER = 76; // finger fully up
const B_POINT = 55; // arm up, pointing
const C_PLUCK = 10; // the phone appears in her hand
const A_START = FINGER - A_FINGER;
const B_START = THERE - B_POINT;
const PLUCK = IDENTITY + 10; // just after the logo's hit
const C_START = PLUCK - C_PLUCK;

// Placement, in this container's px. Clip A's first frame keeps her previous size and spot
// (feet at y 843.7, hem centre x 270, figure 824 px tall); each next clip's first frame lines up
// with the previous clip's last frame by figure height, hem centre and feet line (bboxes measured).
const SA = 824 / 955;
const RECT_A = {left: 270 - 345.5 * SA, top: 843.7 - 981 * SA, width: 658 * SA, height: 1000 * SA};
const SB = (SA * 952) / 893;
const RECT_B = {
	left: RECT_A.left + 338.5 * SA - 239 * SB,
	top: RECT_A.top + 981 * SA - 982 * SB,
	width: 501 * SB,
	height: 1000 * SB,
};
const SC = (SB * 955) / 951;
const RECT_C = {
	left: RECT_B.left + 240.5 * SB - 255.5 * SC,
	top: RECT_B.top + 983 * SB - 983 * SC,
	width: 488 * SC,
	height: 1000 * SC,
};

// Her eyes in clip A at the finger frame, and the phone where it appears in clip C (clip px).
const EYES = [
	{x: 302, y: 175},
	{x: 377, y: 175},
];
const PLUCK_AT = {x: 399, y: 90};

const still = (prefix: string, map: number[], k: number) =>
	`zarqa/${prefix}${String(map[Math.max(0, Math.min(map.length - 1, k))]).padStart(3, '0')}.webp`;

export const Zarqa: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < ZARQA_ENTER) return null;

	const rise = spring({frame: frame - ZARQA_ENTER, fps, config: {damping: 13, stiffness: 110}});
	const clip =
		frame < B_START
			? {src: still('sa', CLIP_A, frame - A_START), rect: RECT_A}
			: frame < C_START
				? {src: still('sb', CLIP_B, frame - B_START), rect: RECT_B}
				: {src: still('sc', CLIP_C, frame - C_START), rect: RECT_C};

	return (
		<div
			style={{
				position: 'absolute',
				left: 540 - WIDTH / 2,
				bottom: -10,
				width: WIDTH,
				height: HEIGHT,
				zIndex: 40,
				translate: `0px ${(1 - rise) * (HEIGHT + 40)}px`,
				// A small knowing head-tilt while the ticket says it, on top of an idle sway so she
				// never looks frozen while a clip holds its last frame.
				rotate: `${
					interpolate(frame, [TICKET - 2, TICKET + 8, THERE - 4, THERE], [0, 3, 3, 0], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}) +
					0.7 * Math.sin((2 * Math.PI * frame) / (3.1 * fps))
				}deg`,
				// Idle breathing, pivoting from her feet.
				scale: `1 ${1 + 0.009 * Math.sin((2 * Math.PI * frame) / (2.4 * fps))}`,
				transformOrigin: '50% 100%',
			}}
		>
			{/* Soft floor glow so she reads against the pile of screenshots */}
			<div
				style={{
					position: 'absolute',
					left: '-35%',
					right: '-35%',
					bottom: -140,
					height: 420,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${C.ground} 0%, ${C.ground}e6 45%, transparent 100%)`,
				}}
			/>
			<Img src={staticFile(clip.src)} style={{position: 'absolute', ...clip.rect}} />
			{/* The glint in her eyes as she spots it, at the freeze */}
			{frame >= FINGER - 2 && frame < FINGER + 24
				? EYES.map((eye) => (
						<Sparkle
							key={eye.x}
							x={RECT_A.left + eye.x * SA}
							y={RECT_A.top + eye.y * SA}
							t={frame - (FINGER - 2)}
							size={70}
						/>
					))
				: null}
			{frame >= PLUCK - 3 && frame < PLUCK + 26 ? (
				<PluckBurst x={RECT_C.left + PLUCK_AT.x * SC} y={RECT_C.top + PLUCK_AT.y * SC} t={frame - (PLUCK - 3)} />
			) : null}
		</div>
	);
};

// A four-point star that flashes on and fades.
const Sparkle: React.FC<{readonly x: number; readonly y: number; readonly t: number; readonly size: number}> = ({
	x,
	y,
	t,
	size,
}) => (
	<svg
		width={size}
		height={size}
		viewBox="-50 -50 100 100"
		style={{
			position: 'absolute',
			left: x - size / 2,
			top: y - size / 2,
			scale: String(interpolate(t, [0, 5, 26], [0, 1, 0.2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})),
			rotate: `${t * 2}deg`,
			opacity: interpolate(t, [0, 3, 16, 26], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
			filter: 'drop-shadow(0 0 8px rgba(190, 230, 255, 0.9))',
		}}
	>
		<path d="M0 -50 C 6 -8 8 -6 50 0 C 8 6 6 8 0 50 C -6 8 -8 6 -50 0 C -8 -6 -6 -8 0 -50 Z" fill="#f4fbff" />
	</svg>
);

// A burst at her hand as the phone appears out of thin air: a star and a ring of tan strokes.
const PluckBurst: React.FC<{readonly x: number; readonly y: number; readonly t: number}> = ({x, y, t}) => {
	const out = interpolate(t, [0, 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const fade = interpolate(t, [0, 3, 14, 26], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<>
			<Sparkle x={x} y={y} t={t} size={120} />
			{[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
				<div
					key={angle}
					style={{
						position: 'absolute',
						left: x - 5,
						top: y - 18,
						width: 10,
						height: 36,
						borderRadius: 5,
						background: C.tan,
						opacity: fade,
						transformOrigin: '5px 18px',
						transform: `rotate(${angle}deg) translateY(${-(40 + 50 * out)}px) scaleY(${1 - 0.6 * out})`,
					}}
				/>
			))}
		</>
	);
};
