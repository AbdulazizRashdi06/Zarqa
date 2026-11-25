import type React from 'react';
import {loadFont} from '@remotion/fonts';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {C, FONT} from '../theme';

// "Who is Zarqa?" carousel: ten 1080x1350 stills in the app's visual system
// (design/HANDOFF.md), in English and Arabic. Shared pieces live here.

export const W = 1080;
export const H = 1350;
export const TOTAL = 10;

// The blue of her eyes (sampled from the mascot art); the carousel's one extra colour.
export const BLUE = '#1d66a3';
export const BLUE_DEEP = '#164f80';
export const SAND = '#ead9c0';
export const MUTED_ON_DARK = '#a9b4b6';
export const MUTED_ON_PAPER = '#5e6472';

// Arabic companions to Anton / Figtree: Lalezar for display, IBM Plex Sans Arabic for
// reading, Aref Ruqaa for the proverb's calligraphy.
export const AR = {
	display: 'Lalezar, sans-serif',
	body: '"IBM Plex Sans Arabic", sans-serif',
	calli: '"Aref Ruqaa", serif',
} as const;

loadFont({family: 'Lalezar', url: staticFile('fonts/lalezar-arabic-400-normal.woff2'), weight: '400'});
loadFont({family: 'Aref Ruqaa', url: staticFile('fonts/aref-ruqaa-arabic-700-normal.woff2'), weight: '700'});
for (const weight of ['500', '600', '700']) {
	loadFont({
		family: 'IBM Plex Sans Arabic',
		url: staticFile(`fonts/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`),
		weight,
	});
}

export const art = (name: string) => staticFile(`story/${name}.webp`);

type Box = React.CSSProperties;

/** Arabic text: right-to-left, never letter-spaced or upper-cased. */
export const Ar: React.FC<{readonly style?: Box; readonly children: React.ReactNode}> = ({style, children}) => (
	<div dir="rtl" lang="ar" style={{fontFamily: AR.body, fontWeight: 600, textAlign: 'right', ...style}}>
		{children}
	</div>
);

/** Anton headline. */
export const Shout: React.FC<{readonly style?: Box; readonly children: React.ReactNode}> = ({style, children}) => (
	<div style={{fontFamily: FONT.display, textTransform: 'uppercase', lineHeight: 0.98, letterSpacing: 1, ...style}}>
		{children}
	</div>
);

/** Figtree reading text. */
export const Say: React.FC<{readonly style?: Box; readonly children: React.ReactNode}> = ({style, children}) => (
	<div style={{fontFamily: FONT.body, fontWeight: 700, lineHeight: 1.28, ...style}}>{children}</div>
);

export const Mono: React.FC<{readonly style?: Box; readonly children: React.ReactNode}> = ({style, children}) => (
	<div
		style={{
			fontFamily: FONT.mono,
			fontWeight: 700,
			fontSize: 26,
			letterSpacing: 3.5,
			textTransform: 'uppercase',
			...style,
		}}
	>
		{children}
	</div>
);

/** The app's luggage tag: notched left corners and a punched hole. Carries the slide's title in both languages. */
export const Tag: React.FC<{
	readonly en: string;
	readonly ar: string;
	readonly bg: string;
	readonly fg: string;
	readonly hole: string;
	readonly style?: Box;
}> = ({en, ar, bg, fg, hole, style}) => {
	const notch = 26;
	return (
		<div
			style={{
				position: 'relative',
				display: 'inline-flex',
				alignItems: 'center',
				gap: 18,
				height: 78,
				padding: '0 30px 0 62px',
				background: bg,
				color: fg,
				clipPath: `polygon(${notch}px 0, 100% 0, 100% 100%, ${notch}px 100%, 0 calc(100% - ${notch}px), 0 ${notch}px)`,
				borderRadius: '0 16px 16px 0',
				...style,
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: 22,
					top: '50%',
					width: 18,
					height: 18,
					marginTop: -9,
					borderRadius: '50%',
					background: hole,
				}}
			/>
			<span style={{fontFamily: FONT.display, fontSize: 36, letterSpacing: 1.5, textTransform: 'uppercase', lineHeight: 1}}>
				{en}
			</span>
			<span style={{width: 8, height: 8, borderRadius: '50%', background: fg, opacity: 0.55}} />
			<span dir="rtl" lang="ar" style={{fontFamily: AR.display, fontSize: 38, lineHeight: 1, paddingBottom: 4}}>
				{ar}
			</span>
		</div>
	);
};

/** The app's small tilted sticker. */
export const Sticker: React.FC<{
	readonly rotate?: number;
	readonly bg?: string;
	readonly edge?: string;
	readonly size?: number;
	readonly style?: Box;
	readonly children: React.ReactNode;
}> = ({rotate = -4, bg = C.tan, edge = C.ground, size = 30, style, children}) => (
	<div
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: 12,
			background: bg,
			color: C.ink,
			fontFamily: FONT.mono,
			fontWeight: 700,
			fontSize: size,
			letterSpacing: size * 0.12,
			textTransform: 'uppercase',
			padding: `${size * 0.3}px ${size * 0.8}px`,
			borderRadius: 999,
			border: `${Math.max(4, size * 0.16)}px solid ${edge}`,
			rotate: `${rotate}deg`,
			whiteSpace: 'nowrap',
			...style,
		}}
	>
		{children}
	</div>
);

/** Zarqa's speech bubble from the app: surface colour, her name in mono tan, one small corner toward her. */
export const Bubble: React.FC<{readonly style?: Box; readonly children: React.ReactNode}> = ({style, children}) => (
	<div
		style={{
			position: 'absolute',
			background: C.surface,
			borderRadius: '56px 56px 56px 12px',
			padding: '34px 46px 40px',
			color: C.paper,
			boxShadow: '0 30px 70px rgba(10, 12, 20, 0.45)',
			...style,
		}}
	>
		<div style={{display: 'flex', alignItems: 'baseline', gap: 14, color: C.tan, marginBottom: 14}}>
			<Mono style={{fontSize: 28}}>Zarqa</Mono>
			<span dir="rtl" lang="ar" style={{fontFamily: AR.display, fontSize: 32, lineHeight: 1}}>
				زرقاء
			</span>
		</div>
		{children}
	</div>
);

/** A flat single-colour silhouette of a piece of art (its alpha as a mask). */
export const Silhouette: React.FC<{readonly name: string; readonly color: string; readonly style: Box}> = ({
	name,
	color,
	style,
}) => (
	<div
		style={{
			position: 'absolute',
			background: color,
			WebkitMaskImage: `url(${art(name)})`,
			WebkitMaskSize: '100% 100%',
			WebkitMaskRepeat: 'no-repeat',
			maskImage: `url(${art(name)})`,
			maskSize: '100% 100%',
			maskRepeat: 'no-repeat',
			...style,
		}}
	/>
);

export const Art: React.FC<{readonly name: string; readonly style: Box}> = ({name, style}) => (
	<Img src={art(name)} style={{position: 'absolute', ...style}} />
);

/** One slide: background, the title tag, and the counter. */
export const Slide: React.FC<{
	readonly n: number;
	readonly bg: string;
	readonly en: string;
	readonly ar: string;
	readonly tone: 'dark' | 'blue' | 'paper' | 'dawn';
	readonly children: React.ReactNode;
}> = ({n, bg, en, ar, tone, children}) => {
	const tag =
		tone === 'dark'
			? {bg: C.tan, fg: C.ink}
			: tone === 'blue'
				? {bg: C.paper, fg: C.ink}
				: {bg: C.ink, fg: C.paper};
	const counter = tone === 'dark' ? MUTED_ON_DARK : tone === 'blue' ? C.paper : C.ink;
	return (
		<AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
			{children}
			<Tag en={en} ar={ar} bg={tag.bg} fg={tag.fg} hole={bg} style={{position: 'absolute', left: 64, top: 60}} />
			<Mono style={{position: 'absolute', right: 64, top: 84, color: counter, opacity: tone === 'dark' ? 1 : 0.8}}>
				{String(n).padStart(2, '0')} / {TOTAL}
			</Mono>
		</AbsoluteFill>
	);
};
