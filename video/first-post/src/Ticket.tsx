import type React from 'react';
import {Audio} from '@remotion/media';
import {Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from './theme';

const NOTCH = 34;

type TicketProps = {
	readonly from: number;
	readonly until?: number;
	readonly cut?: boolean;
	readonly label: string;
	readonly children: React.ReactNode;
	readonly top: number;
	readonly tilt: number;
	readonly popSound?: string;
	readonly popLead?: number;
};

// The app's off-white ticket: mono label, dashed tear with side notches, Anton headline.
// Pops in at `from` with its sound, leaves at `until` (if given): animated out with a woosh,
// or gone in one frame with `cut`.
export const Ticket: React.FC<TicketProps> = (props) => {
	// The paper snap sits 7 frames into its file, so it starts early to land on the arrival.
	const {from, until, cut, popSound = 'sfx/ticket-in.mp3', popLead = 7} = props;
	return (
		<>
			<Audio name="Ticket in" src={staticFile(popSound)} from={from - popLead} volume={1} />
			{until !== undefined && !cut ? (
				<Audio name="Ticket out" src={staticFile('sfx/ticket-out.mp3')} from={until - 3} volume={0.6} />
			) : null}
			<TicketCard {...props} />
		</>
	);
};

const TicketCard: React.FC<TicketProps> = ({from, until, cut, label, children, top, tilt}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < from || (until !== undefined && frame > until + 0.55 * fps)) return null;
	if (cut && until !== undefined && frame >= until) return null;
	const leaving = until !== undefined && frame > until;

	return (
		<div
			style={{
				position: 'absolute',
				left: 90,
				right: 90,
				top,
				display: 'flex',
				justifyContent: 'center',
				zIndex: 50,
				scale: leaving
					? interpolate(frame, [until, until + 0.5 * fps], [1, 0.6], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.in(Easing.cubic),
						})
					: interpolate(frame, [from, from + 0.8 * fps], [0.6, 1], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.spring({damping: 16}),
							output: 'perceptual-scale',
						}) *
						// a slow drift while it's held, so it never sits dead still
						interpolate(frame, [from, from + 3 * fps], [1, 1.04], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						}),
				opacity: leaving
					? interpolate(frame, [until, until + 0.5 * fps], [1, 0], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						})
					: interpolate(frame, [from, from + 0.2 * fps], [0, 1], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						}),
				rotate: leaving
					? interpolate(frame, [until, until + 0.5 * fps], [`${tilt}deg`, `${tilt - 14}deg`], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						})
					: interpolate(frame, [from, from + 0.8 * fps], [`${tilt + 6}deg`, `${tilt}deg`], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
							easing: Easing.spring({damping: 16}),
						}),
			}}
		>
			<div
				style={{
					background: C.paper,
					color: C.ink,
					borderRadius: 48,
					padding: '34px 56px 46px',
					boxShadow: '0 30px 70px rgba(10, 12, 20, 0.55)',
					maxWidth: 900,
				}}
			>
				<div
					style={{
						fontFamily: FONT.mono,
						fontWeight: 700,
						fontSize: 30,
						letterSpacing: 4,
						textTransform: 'uppercase',
						color: C.tanLabel,
						textAlign: 'center',
						paddingBottom: 26,
					}}
				>
					{label}
				</div>
				<div
					style={{
						position: 'relative',
						borderTop: `5px dashed ${C.paperLine}`,
						margin: '0 -56px 30px',
					}}
				>
					<div
						style={{
							position: 'absolute',
							left: -NOTCH / 2,
							top: -NOTCH / 2 - 3,
							width: NOTCH,
							height: NOTCH,
							borderRadius: '50%',
							background: C.ground,
						}}
					/>
					<div
						style={{
							position: 'absolute',
							right: -NOTCH / 2,
							top: -NOTCH / 2 - 3,
							width: NOTCH,
							height: NOTCH,
							borderRadius: '50%',
							background: C.ground,
						}}
					/>
				</div>
				<div
					style={{
						fontFamily: FONT.display,
						fontSize: 104,
						lineHeight: 1.02,
						textTransform: 'uppercase',
						textAlign: 'center',
						letterSpacing: 1,
					}}
				>
					{children}
				</div>
			</div>
		</div>
	);
};
