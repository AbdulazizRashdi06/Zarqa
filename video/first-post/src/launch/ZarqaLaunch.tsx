import type React from 'react';
import {Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from '../theme';
import {LAUNCH, LOST, NOD, PEEK, POINT, WAVE} from './timing';
import {CLIP_A, CLIP_B, CLIP_C, CLIP_D} from './zarqaClips';

// Zarqa's part in the launch video: four Gemini Omni Flash clips (keyed to transparent), each starting
// on the pose the last one ends on. A: peek out, look, tap the stack. B: point at the listing.
// C: an approving nod, hands clasped. D: a small wave. Between clips she holds with an idle sway.

// Each clip's frame is placed so its feet/hem point sits at this component's origin. Clip A's
// first frame is the reference (figure 958 px tall); each next clip's first frame lines up with the
// previous clip's last frame by figure height, hem centre and feet line (bboxes measured).
const SA = 1;
const RA = {left: -297 * SA, top: -981 * SA, width: 649 * SA, height: 1000 * SA};
const SB = (SA * 960) / 778;
const RB = {left: RA.left + 296 * SA - 244 * SB, top: RA.top + 981 * SA - 802 * SB, width: 598 * SB, height: 818 * SB};
const SC = (SB * 784) / 784;
const RC = {left: RB.left + 240 * SB - 250 * SC, top: RB.top + 802 * SB - 800 * SC, width: 614 * SC, height: 816 * SC};
const SD = (SC * 784) / 960;
const RD = {left: RC.left + 250 * SC - 299 * SD, top: RC.top + 800 * SC - 980 * SD, width: 587 * SD, height: 1000 * SD};
const FIGURE = 958;

const still = (prefix: string, map: number[], k: number) =>
	`zarqa/${prefix}${String(map[Math.max(0, Math.min(map.length - 1, k))]).padStart(3, '0')}.webp`;

// Where she stands (feet/hem point, screen px) and how tall she is, through the video.
const KEYS = [0, PEEK, PEEK + 28, 120, 150, LOST + 5, LOST + 35, LAUNCH + 15, LAUNCH + 45];
const XS = [560, 560, 285, 285, -320, -320, 250, 250, 540];
const YS = [1560, 1560, 1560, 1560, 1560, 1840, 1840, 1840, 1890];
const HS = [700, 700, 700, 700, 700, 640, 640, 640, 780];
const ease = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)} as const;

export const ZarqaLaunch: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();

	const clip =
		frame < POINT
			? {src: still('la', CLIP_A, frame - PEEK), rect: RA}
			: frame < NOD
				? {src: still('lb', CLIP_B, frame - POINT), rect: RB}
				: frame < WAVE
					? {src: still('lc', CLIP_C, frame - NOD), rect: RC}
					: {src: still('ld', CLIP_D, frame - WAVE), rect: RD};

	const x = interpolate(frame, KEYS, XS, ease);
	const y = interpolate(frame, KEYS, YS, ease);
	const h = interpolate(frame, KEYS, HS, ease);
	const pop = spring({frame: frame - (LAUNCH + 15), fps, config: {damping: 14, stiffness: 120}});

	return (
		<div
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width: 0,
				height: 0,
				scale: String((h / FIGURE) * (frame >= LAUNCH + 15 ? 0.96 + 0.04 * pop : 1)),
				// idle sway and breathing, pivoting from her feet, so she never looks frozen
				rotate: `${0.7 * Math.sin((2 * Math.PI * frame) / (3.1 * fps))}deg`,
				transformOrigin: '0 0',
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: -560,
					width: 1120,
					top: -140,
					height: 300,
					borderRadius: '50%',
					background: `radial-gradient(closest-side, ${C.ground}d0 0%, transparent 100%)`,
				}}
			/>
			<Img
				src={staticFile(clip.src)}
				style={{
					position: 'absolute',
					...clip.rect,
					scale: `1 ${1 + 0.009 * Math.sin((2 * Math.PI * frame) / (2.4 * fps))}`,
					transformOrigin: `${-clip.rect.left}px ${-clip.rect.top}px`,
				}}
			/>
		</div>
	);
};
