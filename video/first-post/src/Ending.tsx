import type React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from './theme';
import {BLACK, IDENTITY, IS, STICKER, THERE} from './timing';

// A word that lands: drops in big over a third of a second and settles with a small overshoot.
const land = (frame: number, at: number): React.CSSProperties => ({
	scale: String(
		interpolate(frame, [at, at + 12], [1.4, 1], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
			easing: Easing.out(Easing.back(1.6)),
		}),
	),
	translate: `0px ${interpolate(frame, [at, at + 12], [-30, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
		easing: Easing.out(Easing.cubic),
	})}px`,
	opacity: interpolate(frame, [at, at + 3], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
});

// The twist: THERE lands, IS. lands after it, and the two hold together.
export const ThereIs: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < THERE || frame >= IDENTITY) return null;
	const word: React.CSSProperties = {
		fontFamily: FONT.display,
		fontSize: 300,
		lineHeight: 0.92,
		textTransform: 'uppercase',
		letterSpacing: 2,
		textAlign: 'center',
	};
	return (
		<AbsoluteFill
			style={{
				zIndex: 60,
				alignItems: 'center',
				paddingTop: 330,
				// a slow push-in while the two words hold
				scale: String(interpolate(frame, [IS, IDENTITY], [1, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})),
			}}
		>
			<div style={{...word, color: C.paper, ...land(frame, THERE)}}>There</div>
			{frame >= IS ? <div style={{...word, color: C.tan, ...land(frame, IS)}}>is.</div> : null}
		</AbsoluteFill>
	);
};

// The identity: the app's ZARQA logo lands with the big impact, then the tilted COMING SOON sticker slaps on.
export const Identity: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < IDENTITY || frame >= BLACK) return null;
	const sticker = spring({frame: frame - STICKER, fps, config: {damping: 12, stiffness: 140}});
	return (
		<AbsoluteFill style={{zIndex: 60, alignItems: 'center', paddingTop: 430}}>
			<Img
				src={staticFile('logo.png')}
				style={{
					width: 760,
					scale: String(
						interpolate(frame, [IDENTITY, IDENTITY + 18], [1.3, 1], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.out(Easing.back(1.4)),
						}),
					),
					opacity: interpolate(frame, [IDENTITY, IDENTITY + 4], [0, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
				}}
			/>
			<div
				style={{
					marginTop: 46,
					scale: String(sticker),
					rotate: '-4deg',
					background: C.tan,
					color: C.ink,
					fontFamily: FONT.mono,
					fontWeight: 700,
					fontSize: 52,
					letterSpacing: 8,
					textTransform: 'uppercase',
					padding: '14px 40px',
					borderRadius: 999,
					border: `7px solid ${C.ground}`,
					boxShadow: '0 18px 40px rgba(8, 10, 18, 0.5)',
				}}
			>
				Coming soon
			</div>
		</AbsoluteFill>
	);
};

// Hard cut to black, on a note.
export const CutToBlack: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < BLACK) return null;
	return <AbsoluteFill style={{background: '#000', zIndex: 100}} />;
};
