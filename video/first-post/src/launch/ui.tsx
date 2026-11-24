// The Zarqa app's building blocks, ported from web/src/components (ui.tsx, ui.module.css,
// icons.tsx, ItemThumb.tsx) as plain inline-styled React, so every part can be animated.
// Sizes are the app's own CSS px on its 390 px-wide phone layout.
import type React from 'react';
import {Img, staticFile} from 'remotion';
import {FONT} from '../theme';

// web/src/index.css
export const T = {
	ground: '#222634',
	surface: '#2e3343',
	slate: '#434e5f',
	line: '#3a4152',
	paper: '#f2eee8',
	paperLine: '#cfc6ba',
	tan: '#bd9777',
	tanDark: '#74573f',
	tanLight: '#e3c4a8',
	sage: '#8e9da0',
	text: '#f2eee8',
	textMuted: '#a9b4b6',
	textSoft: '#c3cbcc',
	ink: '#222634',
	inkMuted: '#5e6472',
	gutter: 20,
	tap: 44,
} as const;

export const accentOf = (mode: 'lost' | 'found') => (mode === 'lost' ? T.tan : T.sage);

// ---------- icons (web/src/components/icons.tsx) ----------
type IconProps = {readonly size?: number; readonly color?: string; readonly strokeWidth?: number};
const Svg: React.FC<IconProps & {readonly children: React.ReactNode}> = ({size = 20, color = 'currentColor', strokeWidth = 2, children}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
		{children}
	</svg>
);
export const ArrowRight = (p: IconProps) => (
	<Svg strokeWidth={2.6} {...p}>
		<path d="M5 12h14M13 6l6 6-6 6" />
	</Svg>
);
export const ChevronLeft = (p: IconProps) => (
	<Svg strokeWidth={2.2} {...p}>
		<path d="M15 6l-6 6 6 6" />
	</Svg>
);
export const ChevronRight = (p: IconProps) => (
	<Svg {...p}>
		<path d="M9 6l6 6-6 6" />
	</Svg>
);
export const ChatBubble = (p: IconProps) => (
	<Svg {...p}>
		<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5z" />
	</Svg>
);
export const Camera = (p: IconProps) => (
	<Svg {...p}>
		<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
		<circle cx="12" cy="13" r="3.5" />
	</Svg>
);
export const Pin = (p: IconProps) => (
	<Svg strokeWidth={2.2} {...p}>
		<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
		<circle cx="12" cy="10" r="2.3" />
	</Svg>
);
export const TagIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M9 3.5h10.5V20.5H9L3.5 15V9z" />
		<circle cx="8" cy="12" r="1.4" />
		<path d="M12.5 9.5h4M12.5 14.5h4" />
	</Svg>
);
export const CalcIcon = (p: IconProps) => (
	<Svg strokeWidth={1.7} {...p}>
		<rect x="5" y="2.5" width="14" height="19" rx="2.5" />
		<rect x="8" y="5.5" width="8" height="4" rx="1" />
		<path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01" />
	</Svg>
);
export const BottleIcon = (p: IconProps) => (
	<Svg strokeWidth={1.7} {...p}>
		<rect x="9.5" y="2.5" width="5" height="3" rx="1" />
		<path d="M9 5.5h6l1 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-11z" />
		<path d="M8 12h8" />
	</Svg>
);
export const CardIcon = (p: IconProps) => (
	<Svg strokeWidth={1.7} {...p}>
		<rect x="3" y="5" width="18" height="14" rx="2.5" />
		<circle cx="8.5" cy="11" r="2" />
		<path d="M5.8 16c.6-1.4 1.6-2 2.7-2s2.1.6 2.7 2" />
		<path d="M14 10h4" />
		<path d="M14 13.5h3" />
	</Svg>
);
export const BudsIcon = (p: IconProps) => (
	<Svg strokeWidth={1.7} {...p}>
		<rect x="4" y="7" width="16" height="12" rx="5" />
		<path d="M4 12h16" />
		<path d="M11 14.5h2" />
	</Svg>
);
// Glasses aren't one of the app's categories; drawn in the same 1.7-stroke line style.
export const GlassesIcon = (p: IconProps) => (
	<Svg strokeWidth={1.7} {...p}>
		<circle cx="7" cy="14" r="3.5" />
		<circle cx="17" cy="14" r="3.5" />
		<path d="M10.5 13.5c1-.8 2-.8 3 0M3.5 13l1.5-5M20.5 13L19 8" />
	</Svg>
);

export type ItemKind = 'tag' | 'calc' | 'bottle' | 'card' | 'buds' | 'glasses';
const ICONS: Record<ItemKind, (p: IconProps) => React.ReactElement> = {
	tag: TagIcon,
	calc: CalcIcon,
	bottle: BottleIcon,
	card: CardIcon,
	buds: BudsIcon,
	glasses: GlassesIcon,
};

/** web/src/components/ItemThumb.tsx: the category icon on a Lost/Found tint. */
export const ItemThumb: React.FC<{readonly kind: 'lost' | 'found'; readonly icon: ItemKind; readonly size?: number}> = ({kind, icon, size = 60}) => {
	const Icon = ICONS[icon];
	return (
		<span
			style={{
				width: size,
				height: size,
				flexShrink: 0,
				borderRadius: size / 5,
				background: kind === 'lost' ? '#E8D6C6' : '#D3DBDC',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			<Icon size={Math.round(size / 2)} color={T.ink} />
		</span>
	);
};

// ---------- primitives (web/src/components/ui.tsx + ui.module.css) ----------
export const MonoLabel: React.FC<{readonly children: React.ReactNode; readonly color?: string; readonly style?: React.CSSProperties}> = ({children, color, style}) => (
	<span style={{fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color, ...style}}>{children}</span>
);

/** Luggage tag: notched left corners and a punched hole. */
export const LuggageTag: React.FC<{readonly notch?: number; readonly hole?: number; readonly holeColor?: string; readonly style?: React.CSSProperties; readonly children: React.ReactNode}> = ({
	notch = 20,
	hole = 12,
	holeColor = T.ground,
	style,
	children,
}) => (
	<div
		style={{
			position: 'relative',
			clipPath: `polygon(${notch}px 0, 100% 0, 100% 100%, ${notch}px 100%, 0 calc(100% - ${notch}px), 0 ${notch}px)`,
			...style,
		}}
	>
		<span style={{position: 'absolute', left: notch * 0.6, top: '50%', width: hole, height: hole, marginTop: -hole / 2, borderRadius: '50%', background: holeColor}} />
		{children}
	</div>
);

export const Ticket: React.FC<{readonly children: React.ReactNode; readonly style?: React.CSSProperties}> = ({children, style}) => (
	<div style={{position: 'relative', background: T.paper, color: T.ink, borderRadius: 24, padding: '20px 20px 22px', ...style}}>{children}</div>
);

/** Dashed tear line with side notches, spanning the ticket edge to edge. */
export const TearLine: React.FC<{readonly inset?: number; readonly notch?: number; readonly notchColor?: string}> = ({inset = 20, notch = 28, notchColor = T.ground}) => (
	<div style={{position: 'relative', height: 0, borderTop: `2px dashed ${T.paperLine}`, margin: `4px -${inset}px 0`}}>
		<div style={{position: 'absolute', left: -notch / 2, top: -notch / 2 - 1, width: notch, height: notch, borderRadius: '50%', background: notchColor}} />
		<div style={{position: 'absolute', right: -notch / 2, top: -notch / 2 - 1, width: notch, height: notch, borderRadius: '50%', background: notchColor}} />
	</div>
);

export const Sticker: React.FC<{readonly children: React.ReactNode; readonly rotate?: number}> = ({children, rotate = -3}) => (
	<span
		style={{
			display: 'inline-block',
			transform: `rotate(${rotate}deg)`,
			background: T.tan,
			color: T.ink,
			fontFamily: FONT.mono,
			fontSize: 10,
			fontWeight: 700,
			letterSpacing: 1.2,
			textTransform: 'uppercase',
			padding: '3px 8px',
			borderRadius: 999,
			border: `2px solid ${T.ground}`,
			whiteSpace: 'nowrap',
		}}
	>
		{children}
	</span>
);

/** The app's switch; `on` from 0 to 1 slides the knob and blends the colour. */
export const Switch: React.FC<{readonly on: number}> = ({on}) => (
	<span style={{position: 'relative', width: 54, height: 32, flexShrink: 0, borderRadius: 16, padding: 3, display: 'flex', background: on > 0.5 ? T.tan : T.slate}}>
		<span style={{width: 26, height: 26, borderRadius: 13, background: T.paper, translate: `${on * 22}px 0px`}} />
	</span>
);

export type Pill = 'Searching' | 'Possible match' | 'Chatting' | 'Returned' | 'Bring to RSA' | 'At the RSA';
const PILL: Record<Pill, {bg: string; fg: string; dot: string}> = {
	Searching: {bg: '#E4DED6', fg: '#3F4652', dot: '#7D898C'},
	'Possible match': {bg: '#222634', fg: '#E3C4A8', dot: '#BD9777'},
	Chatting: {bg: '#D3DBDC', fg: '#222634', dot: '#434E5F'},
	Returned: {bg: '#D6E6DA', fg: '#1F4A2E', dot: '#3F8A57'},
	'Bring to RSA': {bg: '#E4DED6', fg: '#3F4652', dot: '#BD9777'},
	'At the RSA': {bg: '#D3DBDC', fg: '#222634', dot: '#7D898C'},
};
export const StatusPill: React.FC<{readonly status: Pill}> = ({status}) => {
	const c = PILL[status];
	return (
		<span style={{alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '3px 9px 3px 7px', borderRadius: 999, background: c.bg, color: c.fg}}>
			<span style={{width: 7, height: 7, borderRadius: 4, background: c.dot}} />
			{status}
		</span>
	);
};

export const RoundButton: React.FC<{readonly children: React.ReactNode}> = ({children}) => (
	<span style={{width: T.tap, height: T.tap, flexShrink: 0, borderRadius: 22, background: T.surface, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{children}</span>
);

export const Avatar: React.FC<{readonly name: string; readonly size?: number}> = ({name, size = 46}) => (
	<span
		style={{
			width: size,
			height: size,
			flexShrink: 0,
			borderRadius: '50%',
			background: T.tan,
			color: T.ink,
			fontFamily: FONT.display,
			fontSize: Math.round(size * 0.48),
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			boxShadow: `0 0 0 3px ${T.ground}, 0 0 0 5px ${T.tan}`,
		}}
	>
		{name[0].toUpperCase()}
	</span>
);

/** Big primary button (dark variant): Anton label + round arrow in the Lost/Found accent. `press` dips it like a tap. */
export const BigButton: React.FC<{readonly label: string; readonly accent?: string; readonly labelSize?: number; readonly press?: number}> = ({
	label,
	accent = T.tan,
	labelSize = 27,
	press = 0,
}) => (
	<span
		style={{
			height: 66,
			borderRadius: 16,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: 12,
			padding: '0 10px 0 22px',
			width: '100%',
			background: T.ground,
			color: T.paper,
			scale: String(1 - 0.04 * press),
			boxSizing: 'border-box',
		}}
	>
		<span style={{fontFamily: FONT.display, fontSize: labelSize, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap'}}>{label}</span>
		<span style={{width: 46, height: 46, flexShrink: 0, borderRadius: 23, display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent}}>
			<ArrowRight size={22} color={T.ink} />
		</span>
	</span>
);

export const BackHeader: React.FC<{readonly label?: string}> = ({label}) => (
	<header style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
		<RoundButton>
			<ChevronLeft size={20} />
		</RoundButton>
		{label ? <MonoLabel color={T.textMuted}>{label}</MonoLabel> : null}
	</header>
);

/** Zarqa with a speech bubble. */
export const ZarqaBubble: React.FC<{readonly mascot: string; readonly width?: number; readonly children: React.ReactNode}> = ({mascot, width = 64, children}) => (
	<div style={{display: 'flex', alignItems: 'flex-end', gap: 6}}>
		<Img src={staticFile(`app/${mascot}.webp`)} style={{width, flexShrink: 0, height: 'auto'}} />
		<div style={{flexGrow: 1, background: T.surface, borderRadius: '18px 18px 18px 4px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14}}>
			<span style={{fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: T.tan}}>ZARQA</span>
			<span style={{fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: T.text}}>{children}</span>
		</div>
	</div>
);

/**
 * A phone showing a 390 x 844 app screen, drawn at `scale`. The screen content is laid out at the
 * app's own px and scrolled by `scrollY`.
 */
export const Phone: React.FC<{readonly scale: number; readonly scrollY?: number; readonly children: React.ReactNode; readonly style?: React.CSSProperties}> = ({
	scale,
	scrollY = 0,
	children,
	style,
}) => {
	const bezel = 12;
	return (
		<div
			style={{
				width: (390 + bezel * 2) * scale,
				height: (844 + bezel * 2) * scale,
				borderRadius: 58 * scale,
				background: '#0e1016',
				padding: bezel * scale,
				boxSizing: 'border-box',
				boxShadow: `0 ${40 * scale}px ${90 * scale}px rgba(5, 7, 12, 0.6), inset 0 0 0 ${2 * scale}px #3a3f4c`,
				...style,
			}}
		>
			<div style={{width: 390 * scale, height: 844 * scale, borderRadius: 46 * scale, overflow: 'hidden', position: 'relative', background: T.ground}}>
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: 390,
						height: 844,
						transformOrigin: '0 0',
						transform: `scale(${scale}) translateY(${-scrollY}px)`,
						color: T.text,
						fontFamily: FONT.body,
						WebkitFontSmoothing: 'antialiased',
					}}
				>
					{children}
				</div>
				{/* the dynamic island */}
				<div style={{position: 'absolute', left: '50%', top: 11 * scale, width: 110 * scale, height: 32 * scale, marginLeft: -55 * scale, borderRadius: 16 * scale, background: '#0e1016'}} />
			</div>
		</div>
	);
};

/** A typing caret that blinks every half second. */
export const Caret: React.FC<{readonly frame: number; readonly color?: string; readonly height?: number}> = ({frame, color = T.ink, height = 22}) => (
	<span style={{display: 'inline-block', width: 2, height, marginLeft: 1, verticalAlign: 'text-bottom', background: color, opacity: Math.floor(frame / 15) % 2 ? 0 : 1}} />
);
