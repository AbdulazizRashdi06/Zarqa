// The Zarqa app's screens, rebuilt from web/src/screens (Home, Reports, ReportDetail) and their
// CSS modules at the app's own 390 px layout, with every moving part exposed as a prop.
import type React from 'react';
import {Img, staticFile} from 'remotion';
import {FONT} from '../theme';
import {
	accentOf,
	Avatar,
	BackHeader,
	BigButton,
	Camera,
	Caret,
	ChatBubble,
	ChevronRight,
	ItemThumb,
	type ItemKind,
	LuggageTag,
	MonoLabel,
	type Pill,
	Pin,
	RoundButton,
	StatusPill,
	Sticker,
	Switch,
	T,
	TagIcon,
	TearLine,
	Ticket,
	ZarqaBubble,
	ArrowRight,
} from './ui';

type Mode = 'lost' | 'found';
const TILTS = [-3, 2, -1.5, 2.5];
const COPY = {
	lost: {
		headA: 'What went',
		headB: 'missing?',
		photos: 'Got a photo of it? (optional)',
		photoCta: 'ADD',
		name: 'What did you lose?',
		placeholder: 'e.g. Black AirPods Pro case with a cat sticker on the back',
		where: 'Where did you last have it?',
		when: 'When did you lose it?',
		submit: 'Find my stuff',
	},
	found: {
		headA: 'Who lost',
		headB: 'this?',
		photos: 'Snap a photo of it',
		photoCta: 'SNAP',
		name: 'What did you find?',
		placeholder: 'e.g. Black umbrella with a wooden handle',
		where: 'Where did you find it?',
		when: 'When did you find it?',
		submit: 'Post found item',
	},
} as const;

const fieldLabel: React.CSSProperties = {display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 17, fontWeight: 800};
const field: React.CSSProperties = {display: 'flex', flexDirection: 'column', gap: 10};
const hint: React.CSSProperties = {marginTop: -4, fontSize: 13, lineHeight: 1.4, color: T.inkMuted};

export type HomeState = {
	readonly mode: Mode;
	readonly frame: number; // for the caret blink
	readonly text?: string;
	readonly textFocus?: boolean;
	readonly loc?: string;
	readonly locFocus?: boolean;
	readonly suggestions?: readonly string[];
	readonly activeSuggestion?: number;
	readonly rsa?: number; // 0..1, found only
	readonly press?: number; // submit tap, 0..1
	readonly modeTilt?: number; // 0..1, how far the selected tag has tipped
	readonly reports?: number;
};

/** web/src/screens/Home.tsx: greeting, Lost/Found tags, My reports, and the report form ticket. */
export const HomeScreen: React.FC<HomeState> = ({
	mode,
	frame,
	text = '',
	textFocus,
	loc = '',
	locFocus,
	suggestions = [],
	activeSuggestion = -1,
	rsa = 0,
	press = 0,
	modeTilt = 1,
	reports = 1,
}) => {
	const c = COPY[mode];
	const accent = accentOf(mode);
	return (
		<main style={{padding: `18px ${T.gutter}px 40px`, display: 'flex', flexDirection: 'column', gap: 20, background: T.ground}}>
			<header style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
				<Img src={staticFile('app/logo.webp')} style={{height: 46, width: 'auto', display: 'block'}} />
				<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
					<RoundButton>
						<ChatBubble size={20} />
					</RoundButton>
					<Avatar name="Salma" />
				</div>
			</header>

			<div style={{position: 'relative', minHeight: 156, marginBottom: -6, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 24}}>
				<div style={{position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 10}}>
					<span style={{fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: T.tan}}>Afternoon, Salma</span>
					<h1 style={{margin: 0, fontFamily: FONT.display, fontWeight: 400, fontSize: 49.9, lineHeight: 0.92, letterSpacing: 0.5, textTransform: 'uppercase'}}>
						{c.headA}
						<br />
						<span style={{color: accent}}>{c.headB}</span>
					</h1>
				</div>
				<Img
					src={staticFile(mode === 'lost' ? 'app/home-searching.webp' : 'app/home-found-keys.webp')}
					style={{position: 'absolute', zIndex: 0, bottom: 0, right: -T.gutter + 2, width: 156, height: 'auto'}}
				/>
			</div>

			<div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: '4px 0'}}>
				{(['lost', 'found'] as const).map((m) => {
					const on = m === mode;
					return (
						<div key={m} style={{rotate: on ? `${(m === 'lost' ? -2.5 : 2.5) * modeTilt}deg` : '0deg'}}>
							<LuggageTag
								style={{
									height: 84,
									padding: '10px 10px 10px 33px',
									display: 'flex',
									flexDirection: 'column',
									justifyContent: 'center',
									gap: 4,
									background: on ? accentOf(m) : T.surface,
									color: on ? T.ink : T.textMuted,
								}}
							>
								<span style={{fontFamily: FONT.display, fontSize: 40, lineHeight: 0.95}}>{m === 'lost' ? 'LOST' : 'FOUND'}</span>
								<span style={{fontSize: 12.9, whiteSpace: 'nowrap', fontWeight: 700}}>{m === 'lost' ? 'I lost something' : 'I found something'}</span>
							</LuggageTag>
						</div>
					);
				})}
			</div>

			<div
				style={{
					position: 'relative',
					zIndex: 1,
					alignSelf: 'flex-start',
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					minHeight: T.tap,
					padding: '0 12px',
					border: `1.5px solid ${T.slate}`,
					borderRadius: 999,
					background: T.surface,
					color: T.text,
				}}
			>
				<TagIcon size={20} color={T.text} />
				<span style={{fontFamily: FONT.display, fontSize: 19, lineHeight: 1, letterSpacing: 0.5, textTransform: 'uppercase'}}>My reports</span>
				<span
					style={{
						minWidth: 24,
						height: 24,
						padding: '0 7px',
						borderRadius: 12,
						background: T.slate,
						fontFamily: FONT.mono,
						fontSize: 12,
						fontWeight: 700,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						boxSizing: 'border-box',
					}}
				>
					{reports}
				</span>
				<ArrowRight size={18} color={T.textMuted} />
			</div>

			<div style={{position: 'relative', marginTop: -8, isolation: 'isolate'}}>
				<Img src={staticFile('app/home-camera-peek.webp')} style={{position: 'absolute', zIndex: -1, right: 6, bottom: 'calc(100% - 14px)', width: 100, height: 'auto'}} />
				<Ticket>
					<div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
						<div style={field}>
							<div style={fieldLabel}>
								<span>{c.photos}</span>
								<span style={{marginLeft: 'auto', fontFamily: FONT.mono, fontSize: 12, fontWeight: 400, color: T.inkMuted}}>0/4</span>
							</div>
							<div style={{display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, padding: '6px 2px 2px'}}>
								<div
									style={{
										height: 76,
										borderRadius: 10,
										border: `2px dashed ${T.ink}`,
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										justifyContent: 'center',
										gap: 5,
										fontFamily: FONT.mono,
										fontSize: 11,
										fontWeight: 700,
										letterSpacing: 1,
										rotate: `${TILTS[0]}deg`,
									}}
								>
									<Camera size={24} color={T.ink} />
									<span>{c.photoCta}</span>
								</div>
								{[1, 2, 3].map((i) => (
									<div key={i} style={{height: 76, borderRadius: 10, border: `2px dashed ${T.paperLine}`, rotate: `${TILTS[i]}deg`}} />
								))}
							</div>
						</div>

						<div style={field}>
							<span style={fieldLabel}>{c.name}</span>
							<div
								style={{
									minHeight: 92,
									borderBottom: `2px solid ${T.ink}`,
									padding: '8px 2px',
									fontSize: 18,
									fontWeight: 500,
									lineHeight: 1.4,
									color: text ? T.ink : '#6f6a63',
									outline: textFocus ? `2px solid ${T.ink}` : undefined,
									outlineOffset: 0,
									boxSizing: 'border-box',
								}}
							>
								{text || (textFocus ? '' : c.placeholder)}
								{textFocus ? <Caret frame={frame} /> : null}
							</div>
							<span style={hint}>Say what it is, plus colour, brand, stickers or marks. The more detail, the better I match.</span>
						</div>

						<div style={field}>
							<span style={fieldLabel}>{c.where}</span>
							<div
								style={{
									position: 'relative',
									display: 'flex',
									alignItems: 'center',
									height: 48,
									borderBottom: `2px solid ${T.ink}`,
									paddingLeft: 30,
									fontSize: 20,
									fontWeight: 600,
									color: loc ? T.ink : '#6f6a63',
									outline: locFocus ? `2px solid ${T.ink}` : undefined,
								}}
							>
								<span style={{position: 'absolute', left: 0, display: 'flex'}}>
									<Pin size={20} color={T.ink} />
								</span>
								{loc || (locFocus ? '' : 'Library, cafeteria…')}
								{locFocus ? <Caret frame={frame} height={24} /> : null}
							</div>
							{suggestions.length ? (
								<div style={{borderRadius: 14, background: T.ground, display: 'flex', flexDirection: 'column', padding: 6}}>
									{suggestions.map((sname, i) => (
										<div
											key={sname}
											style={{
												minHeight: 44,
												display: 'flex',
												alignItems: 'center',
												borderRadius: 10,
												padding: '0 12px',
												fontSize: 16,
												fontWeight: 600,
												color: T.paper,
												background: i === activeSuggestion ? T.surface : undefined,
											}}
										>
											{sname}
										</div>
									))}
								</div>
							) : null}
						</div>

						<div style={field}>
							<div style={{...fieldLabel, alignItems: 'center'}}>
								<span>{c.when}</span>
								<span style={{marginLeft: 'auto'}}>
									<Switch on={0} />
								</span>
							</div>
						</div>

						{mode === 'found' ? (
							<div style={field}>
								<div style={{...fieldLabel, alignItems: 'center'}}>
									<span>I'll drop it at the RSA desk</span>
									<span style={{marginLeft: 'auto'}}>
										<Switch on={rsa} />
									</span>
								</div>
								{rsa > 0.5 ? (
									<span style={{...hint, opacity: Math.min(1, (rsa - 0.5) * 4)}}>
										No chat, no meetup: you hand it in, the owner collects it from the RSA. You'll get a drop code.
									</span>
								) : null}
							</div>
						) : null}

						<TearLine />
						<BigButton label={c.submit} accent={accent} labelSize={28} press={press} />
						<p style={{margin: '-12px 0 0', textAlign: 'center', fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.inkMuted}}>
							9 of 10 posts left today
						</p>
					</div>
				</Ticket>
			</div>
		</main>
	);
};

export type Listing = {
	readonly id: string;
	readonly kind: Mode;
	readonly title: string;
	readonly where: string;
	readonly when: string;
	readonly pill: Pill;
	readonly icon: ItemKind;
	readonly spotted?: boolean;
};

/** A report card from web/src/screens/Reports.tsx. */
export const ReportCard: React.FC<{readonly r: Listing; readonly style?: React.CSSProperties}> = ({r, style}) => (
	<div style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 12, background: T.paper, color: T.ink, borderRadius: 18, padding: '12px 14px 12px 12px', ...style}}>
		<ItemThumb kind={r.kind} icon={r.icon} />
		<span style={{flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4}}>
			<span style={{fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: T.tanDark, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
				{[r.kind === 'lost' ? 'LOST' : 'FOUND', r.where, r.when].join(' · ')}
			</span>
			<span style={{fontFamily: FONT.display, fontSize: 22, lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap'}}>{r.title}</span>
			<StatusPill status={r.pill} />
		</span>
		<ChevronRight size={18} color={T.inkMuted} />
		{r.spotted ? (
			<span style={{position: 'absolute', bottom: -10, right: 14}}>
				<Sticker rotate={3}>Zarqa spotted a match</Sticker>
			</span>
		) : null}
	</div>
);

/** web/src/screens/Reports.tsx: "Your reports", an optional posted bubble, filters and the cards.
 *  `cardIn(i)` gives each card's entrance (0..1) so they can land one by one. */
export const ReportsScreen: React.FC<{
	readonly reports: readonly Listing[];
	readonly posted?: Mode;
	readonly bubbleIn?: number;
	readonly cardIn?: (i: number) => number;
}> = ({reports, posted, bubbleIn = 1, cardIn = () => 1}) => (
	<main style={{minHeight: 844, padding: `16px ${T.gutter}px 24px`, display: 'flex', flexDirection: 'column', gap: 16, background: T.ground, boxSizing: 'border-box'}}>
		<BackHeader label={`${reports.length} ${reports.length === 1 ? 'REPORT' : 'REPORTS'}`} />
		<h1 style={{margin: 0, fontFamily: FONT.display, fontWeight: 400, fontSize: 64, lineHeight: 0.92, textTransform: 'uppercase'}}>
			Your
			<br />
			<span style={{color: T.tan}}>reports</span>
		</h1>
		{posted ? (
			<div style={{opacity: bubbleIn, translate: `0px ${(1 - bubbleIn) * 16}px`}}>
				<ZarqaBubble mascot="wink">
					{posted === 'lost' ? "Posted! I'm on the lookout. You'll hear from me the second something turns up." : "Posted! You're a legend. I'll find whoever's missing it."}
				</ZarqaBubble>
			</div>
		) : null}
		<div style={{display: 'flex', gap: 8}}>
			{['ALL', 'LOST', 'FOUND'].map((f, i) => (
				<span
					key={f}
					style={{
						minHeight: T.tap,
						padding: '0 14px',
						borderRadius: 999,
						border: `1.5px solid ${i === 0 ? T.paper : '#4a5468'}`,
						background: i === 0 ? T.paper : 'transparent',
						color: i === 0 ? T.ink : T.paper,
						fontFamily: FONT.mono,
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: 1.2,
						display: 'flex',
						alignItems: 'center',
					}}
				>
					{f}
				</span>
			))}
		</div>
		<div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
			{reports.map((r, i) => {
				const p = cardIn(i);
				return <ReportCard key={r.id} r={r} style={{opacity: Math.min(1, p * 1.5), translate: `${(1 - p) * 60}px 0px`}} />;
			})}
		</div>
	</main>
);

/** web/src/screens/ReportDetail.tsx for a found item handed to the RSA desk: the item ticket,
 *  Zarqa's line and the drop-off code. `codeIn` reveals the code. */
export const DropCodeScreen: React.FC<{readonly bubbleIn?: number; readonly codeIn?: number}> = ({bubbleIn = 1, codeIn = 1}) => (
	<main style={{minHeight: 844, padding: `16px ${T.gutter}px 24px`, display: 'flex', flexDirection: 'column', gap: 18, background: T.ground, boxSizing: 'border-box'}}>
		<BackHeader label="TODAY" />
		<Ticket>
			<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
				<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10}}>
					<span style={{fontFamily: FONT.mono, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, padding: '6px 10px', borderRadius: 999, color: T.ink, background: T.sage}}>FOUND ITEM REPORT</span>
					<StatusPill status="Bring to RSA" />
				</div>
				<h1 style={{margin: 0, fontFamily: FONT.display, fontWeight: 400, fontSize: 40, lineHeight: 0.95, textTransform: 'uppercase'}}>Calculator</h1>
				<div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
					{[
						['WHAT IT IS', 'Calculator next to an orange notebook'],
						['WHERE', 'GU2 UPAD Building'],
						['WHEN', 'Not sure'],
					].map(([k, v]) => (
						<div key={k}>
							<MonoLabel color={T.inkMuted}>{k}</MonoLabel>
							<div style={{margin: '0 0 10px', fontSize: 17, fontWeight: 600, lineHeight: 1.4}}>{v}</div>
						</div>
					))}
				</div>
			</div>
		</Ticket>
		<div style={{opacity: bubbleIn, translate: `0px ${(1 - bubbleIn) * 16}px`}}>
			<ZarqaBubble mascot="wink">Posted! Take it to the RSA desk and show this code. You're a legend.</ZarqaBubble>
		</div>
		<div style={{opacity: codeIn, scale: String(0.9 + 0.1 * codeIn)}}>
			<Ticket>
				<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
					<MonoLabel color={T.inkMuted}>DROP CODE</MonoLabel>
					<p style={{fontFamily: FONT.display, fontSize: 52, lineHeight: 1, letterSpacing: 4, margin: '10px 0 12px', color: T.ink}}>K7P-4QM</p>
					<p style={{margin: 0, fontSize: 13, lineHeight: 1.45, color: T.inkMuted}}>Take it to the RSA desk and show this code. They'll mark it received.</p>
				</div>
			</Ticket>
		</div>
	</main>
);
