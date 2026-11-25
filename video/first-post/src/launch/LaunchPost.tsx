import type React from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {Ticket as TeaserTicket} from '../Ticket';
import {QR_CELLS, QR_SIZE} from './qr';
import {DropCodeScreen, HomeScreen, type Listing, ReportsScreen} from './screens';
import * as L from './timing';
import {ItemThumb, type ItemKind, LuggageTag, MonoLabel, Phone, T} from './ui';
import {ZarqaLaunch} from './ZarqaLaunch';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const io = {...clamp, easing: Easing.inOut(Easing.cubic)} as const;
const out = {...clamp, easing: Easing.out(Easing.cubic)} as const;

// The teaser's posts, in its stack order (13.jpg, the lost 20 rial, on top).
const POSTS = ['01', '03', '09', '02', '04', '05', '06', '10', '07', '08', '11', '14', '15', '16', '12', '13'];
const STACK = {x: 600, y: 1080, width: 560, height: 560 * 0.72};

const GLASSES: Listing = {id: 'glasses', kind: 'lost', title: 'Black glasses', where: 'GU1 Library', when: 'Today', pill: 'Searching', icon: 'glasses'};
const CALCULATOR: Listing = {id: 'calc', kind: 'found', title: 'Calculator', where: 'GU2', when: 'Today', pill: 'Bring to RSA', icon: 'calc'};
const CAMPUS: Listing[] = [
	CALCULATOR,
	GLASSES,
	{id: 'wallet', kind: 'found', title: 'Pink wallet', where: 'Ground Canteen', when: 'Today', pill: 'Possible match', icon: 'card', spotted: true},
	{id: 'charger', kind: 'lost', title: 'Type-C charger', where: 'Temporary parking', when: 'Yesterday', pill: 'Chatting', icon: 'buds'},
	{id: 'bottle', kind: 'found', title: 'Blue water bottle', where: 'GU2', when: 'Yesterday', pill: 'At the RSA', icon: 'bottle'},
	{id: 'pencil', kind: 'lost', title: 'iPad pencil', where: 'GU2', when: '29 Oct', pill: 'Returned', icon: 'tag'},
];

export const LaunchPost: React.FC = () => (
	<AbsoluteFill style={{background: `radial-gradient(120% 80% at 50% 45%, ${C.surface} 0%, ${C.ground} 60%, #191c27 100%)`, overflow: 'hidden', fontFamily: FONT.body}}>
		<LaunchSound />
		<Headlines />
		<Stack />
		<PairCards />
		<PhoneRig />
		<FoundTag />
		<OrbitChips />
		<Finale />
		<ZarqaLaunch />
		<TeaserTicket from={L.REMEMBER} until={L.FLIP - 10} label="GUtech · lost & found" top={150} tilt={-2}>
			Remember these?
		</TeaserTicket>
	</AbsoluteFill>
);

// ---------- 1. the callback: the stack folds into one small ticket ----------
const Stack: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame > L.COMPRESS_END) return null;
	return (
		<>
			{POSTS.map((p, i) => {
				const t = interpolate(frame, [L.TAP + i * 0.4, L.TAP + 10 + i * 0.4], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
				const rot = i === POSTS.length - 1 ? 0 : (i % 2 ? 1 : -1) * (1 + (i % 3));
				return (
					<Img
						key={p}
						src={staticFile(`posts/${p}.jpg`)}
						style={{
							position: 'absolute',
							left: STACK.x - STACK.width / 2,
							top: STACK.y - STACK.height / 2 - i * 3,
							width: STACK.width,
							height: STACK.height,
							objectFit: 'cover',
							borderRadius: STACK.width * 0.058,
							boxShadow: '0 26px 60px rgba(8, 10, 18, 0.6)',
							rotate: `${rot * (1 - t)}deg`,
							scale: String(1 - 0.75 * t),
							opacity: 1 - t,
							zIndex: 10 + i,
						}}
					/>
				);
			})}
		</>
	);
};

/** The one small ticket the screenshots fold into; it flips over into the app. */
const SmallTicket: React.FC<{readonly frame: number}> = ({frame}) => {
	const {fps} = useVideoConfig();
	const pop = spring({frame: frame - (L.TAP + 6), fps, config: {damping: 12, stiffness: 160}});
	const turn = interpolate(frame, [L.FLIP, L.FLIP_MID], [0, 90], {...clamp, easing: Easing.in(Easing.quad)});
	return (
		<div
			style={{
				position: 'absolute',
				left: STACK.x - 170,
				top: STACK.y - 110,
				width: 340,
				zIndex: 30,
				scale: String(pop * interpolate(frame, [L.FLIP, L.FLIP_MID], [1, 1.5], clamp)),
				transform: `perspective(1400px) rotateY(${turn}deg) rotateZ(${-4 + 4 * turn / 90}deg)`,
			}}
		>
			<div style={{background: T.paper, color: T.ink, borderRadius: 26, padding: '22px 26px 26px', boxShadow: '0 26px 60px rgba(8, 10, 18, 0.6)'}}>
				<MonoLabel color={C.tanLabel} style={{fontSize: 16, letterSpacing: 3}}>
					GUtech · lost &amp; found
				</MonoLabel>
				<div style={{borderTop: `3px dashed ${T.paperLine}`, margin: '16px -26px 18px'}} />
				<div style={{fontFamily: FONT.display, fontSize: 58, lineHeight: 1, textTransform: 'uppercase'}}>16 lost posts</div>
			</div>
		</div>
	);
};

// ---------- the phone: everything the app does, on one screen ----------
const PhoneRig: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < L.TAP + 6) return null;
	if (frame < L.FLIP_MID) return <SmallTicket frame={frame} />;
	if (frame >= L.FOUND + 22 && frame < L.F_TAG_FLIP + 11) return null; // off screen while the FOUND tag takes its place
	if (frame > L.LAUNCH + 22) return null;

	// position, size and turn through the video
	const reveal = frame < L.LOST;
	const back = frame >= L.F_TAG_FLIP + 11;
	const scale = reveal
		? interpolate(frame, [L.PULL_BACK, L.PULL_BACK_END], [2.4, 1.32], io)
		: frame < L.PAIR
			? interpolate(frame, [L.LOST, L.LOST + 35], [1.32, 1.42], io)
			: frame < L.ONE_PLACE + 30
				? interpolate(frame, [L.PAIR, L.PAIR + 12], [1.42, 1.3], io)
				: interpolate(frame, [L.ONE_PLACE + 30, L.ONE_PLACE + 60, L.LAUNCH, L.LAUNCH + 20], [1.42, 1.1, 1.1, 1.0], io);
	const cx = reveal
		? 540
		: !back
			? interpolate(frame, [L.LOST, L.LOST + 35, L.FOUND, L.FOUND + 22], [540, 650, 650, -520], io)
			: interpolate(frame, [L.ONE_PLACE + 30, L.ONE_PLACE + 60], [650, 660], io);
	const cy = reveal
		? interpolate(frame, [L.PULL_BACK, L.PULL_BACK_END], [1060, 1200], io)
		: interpolate(frame, [L.ONE_PLACE + 30, L.ONE_PLACE + 60], [1200, 1150], io);
	const turnIn = reveal
		? interpolate(frame, [L.FLIP_MID, L.PULL_BACK], [-90, 0], out)
		: back
			? interpolate(frame, [L.F_TAG_FLIP + 11, L.F_TAG_FLIP + 22], [-90, 0], out)
			: interpolate(frame, [L.LOST, L.LOST + 15, L.LOST + 45], [0, -16, -4], io); // turns toward the viewer
	const dim = interpolate(frame, [L.PAIR, L.PAIR + 10, L.ONE_PLACE + 10, L.ONE_PLACE + 30], [1, 0.3, 0.3, 1], clamp);
	const fade = interpolate(frame, [L.LAUNCH, L.LAUNCH + 20], [1, 0], clamp);

	const w = (390 + 24) * scale;
	const h = (844 + 24) * scale;
	return (
		<div
			style={{
				position: 'absolute',
				left: cx - w / 2,
				top: cy - h / 2,
				zIndex: 20,
				opacity: dim * fade,
				transform: `perspective(2600px) rotateY(${turnIn}deg)`,
			}}
		>
			<Phone scale={scale} scrollY={scrollAt(frame)}>
				<Screen frame={frame} fps={fps} />
			</Phone>
		</div>
	);
};

const scrollAt = (f: number) => {
	if (f < L.FOUND) return interpolate(f, [L.L_SCROLL, L.L_SCROLL + 20], [0, 420], io) * (f < L.L_POSTED ? 1 : 0);
	if (f < L.F_POSTED) return interpolate(f, [L.F_SCROLL, L.F_SCROLL + 15, L.F_RSA - 8, L.F_RSA], [0, 420, 420, 560], io);
	return 0;
};

const typed = (text: string, f: number, start: number, perFrame: number) => text.slice(0, Math.max(0, Math.floor((f - start) * perFrame)));

const Screen: React.FC<{readonly frame: number; readonly fps: number}> = ({frame: f, fps}) => {
	// 3. Lost: what, where, post, then the listing.
	if (f < L.L_POSTED) {
		const where = f >= L.L_PICK ? 'GU1 Library' : typed('Libr', f, L.L_WHERE + 3, 0.34);
		return (
			<HomeScreen
				mode="lost"
				frame={f}
				text={typed('Black glasses in a brown case', f, L.L_TYPE, 0.7)}
				textFocus={f >= L.L_TYPE - 6 && f < L.L_WHERE}
				loc={where}
				locFocus={f >= L.L_WHERE && f < L.L_PICK}
				suggestions={f >= L.L_WHERE + 15 && f < L.L_PICK ? ['GU1 Library'] : []}
				activeSuggestion={f >= L.L_PICK - 5 ? 0 : -1}
				press={interpolate(f, [L.L_PRESS, L.L_PRESS + 3, L.L_PRESS + 8], [0, 1, 0], clamp)}
			/>
		);
	}
	if (f < L.F_TAG_FLIP) {
		return (
			<ReportsScreen
				reports={[GLASSES]}
				posted="lost"
				bubbleIn={spring({frame: f - (L.L_POSTED + 4), fps, config: {damping: 16}})}
				cardIn={() => spring({frame: f - (L.L_POSTED + 14), fps, config: {damping: 14}})}
			/>
		);
	}
	// 4. Found: what, where, drop it at the RSA desk, post, then the drop-off code.
	if (f < L.F_POSTED) {
		const where = f >= L.F_PICK ? 'GU2 UPAD Building' : typed('GU2', f, L.F_WHERE + 2, 0.4);
		return (
			<HomeScreen
				mode="found"
				frame={f}
				reports={2}
				text={typed('Calculator next to an orange notebook', f, L.F_TYPE, 1)}
				textFocus={f >= L.F_TYPE - 4 && f < L.F_WHERE}
				loc={where}
				locFocus={f >= L.F_WHERE && f < L.F_PICK}
				suggestions={f >= L.F_WHERE + 10 && f < L.F_PICK ? ['GU2 UPAD Building', 'GU2 UPAD Hall', 'GU2 Prayer Room'] : []}
				activeSuggestion={f >= L.F_PICK - 4 ? 0 : -1}
				rsa={interpolate(f, [L.F_RSA, L.F_RSA + 6], [0, 1], io)}
				press={interpolate(f, [L.F_PRESS, L.F_PRESS + 3, L.F_PRESS + 6], [0, 1, 0], clamp)}
			/>
		);
	}
	if (f < L.ONE_PLACE + 30) {
		return (
			<DropCodeScreen
				bubbleIn={spring({frame: f - (L.F_POSTED + 2), fps, config: {damping: 16}})}
				codeIn={spring({frame: f - (L.F_POSTED + 8), fps, config: {damping: 13}})}
			/>
		);
	}
	// 5. One campus, one place: the list fills as the orbiting items snap in.
	return <ReportsScreen reports={CAMPUS} cardIn={(i) => interpolate(f, [L.SNAP + 8 + i * 2, L.SNAP + 16 + i * 2], [0, 1], out)} />;
};

// ---------- 4. the FOUND tag that takes the phone's place, then flips into the found flow ----------
const FoundTag: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < L.FOUND + 8 || frame >= L.F_TAG_FLIP + 11) return null;
	const x = interpolate(frame, [L.FOUND + 8, L.FOUND + 30], [1500, 650], out);
	const turn = interpolate(frame, [L.F_TAG_FLIP, L.F_TAG_FLIP + 11], [0, 90], {...clamp, easing: Easing.in(Easing.quad)});
	return (
		<div style={{position: 'absolute', left: x - 260, top: 1200 - 130, width: 520, zIndex: 25, transform: `perspective(1600px) rotateY(${turn}deg) rotate(${3 * (1 - turn / 90)}deg)`}}>
			<LuggageTag notch={50} hole={30} style={{height: 260, padding: '24px 24px 24px 90px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, background: T.sage, color: T.ink}}>
				<span style={{fontFamily: FONT.display, fontSize: 120, lineHeight: 0.95}}>FOUND</span>
				<span style={{fontSize: 34, fontWeight: 700}}>I found something</span>
			</LuggageTag>
		</div>
	);
};

// ---------- 4/5. LOST and FOUND, side by side, then into the app ----------
const ItemCard: React.FC<{readonly r: Listing; readonly title: string}> = ({r, title}) => (
	<div style={{width: 430, background: T.paper, color: T.ink, borderRadius: 34, padding: '30px 30px 34px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 30px 70px rgba(8, 10, 18, 0.6)'}}>
		<span style={{alignSelf: 'flex-start', fontFamily: FONT.mono, fontSize: 22, fontWeight: 700, letterSpacing: 3, padding: '8px 16px', borderRadius: 999, background: r.kind === 'lost' ? T.tan : T.sage}}>
			{r.kind === 'lost' ? 'LOST' : 'FOUND'}
		</span>
		<div style={{alignSelf: 'center'}}>
			<ItemThumb kind={r.kind} icon={r.icon} size={220} />
		</div>
		<div style={{fontFamily: FONT.display, fontSize: 58, lineHeight: 0.95, textTransform: 'uppercase'}}>{title}</div>
		<MonoLabel color={T.tanDark} style={{fontSize: 20, letterSpacing: 3}}>
			{r.where} · {r.when}
		</MonoLabel>
	</div>
);

const PairCards: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < L.PAIR || frame > L.ONE_PLACE + 32) return null;
	const into = interpolate(frame, [L.ONE_PLACE, L.ONE_PLACE + 30], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
	return (
		<>
			{[
				{r: GLASSES, title: 'Black glasses', x: 300, delay: 0, rot: -4},
				{r: CALCULATOR, title: 'Calculator', x: 790, delay: 6, rot: 4},
			].map(({r, title, x, delay, rot}) => {
				const s = spring({frame: frame - L.PAIR - delay, fps, config: {damping: 13, stiffness: 140}});
				return (
					<div
						key={r.id}
						style={{
							position: 'absolute',
							left: interpolate(into, [0, 1], [x, 650]) - 215,
							top: 640 + (1 - s) * 500 + into * 300,
							zIndex: 26,
							rotate: `${rot * (1 - into)}deg`,
							scale: String(s * (1 - 0.75 * into)),
							opacity: 1 - into,
						}}
					>
						<ItemCard r={r} title={title} />
					</div>
				);
			})}
		</>
	);
};

// ---------- 5. items orbit the phone, then snap into its list ----------
const CHIPS: {kind: 'lost' | 'found'; icon: ItemKind}[] = [
	{kind: 'found', icon: 'calc'},
	{kind: 'lost', icon: 'glasses'},
	{kind: 'found', icon: 'card'},
	{kind: 'lost', icon: 'buds'},
	{kind: 'found', icon: 'bottle'},
	{kind: 'lost', icon: 'tag'},
	{kind: 'found', icon: 'buds'},
	{kind: 'lost', icon: 'card'},
];
const OrbitChips: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < L.ORBIT || frame > L.SNAP + 40) return null;
	// The phone at this point: scale 1.1, centred at (660, 1150). List row i's thumbnail, in screen px.
	const s = 1.1;
	const ox = 660 - (414 * s) / 2 + 12 * s;
	const oy = 1150 - (868 * s) / 2 + 12 * s;
	return (
		<>
			{CHIPS.map((c, i) => {
				const appear = interpolate(frame, [L.ORBIT + i * 2, L.ORBIT + 12 + i * 2], [0, 1], out);
				const a = (i / CHIPS.length) * Math.PI * 2 + (frame - L.ORBIT) * 0.035;
				const ax = 660 + Math.cos(a) * 470;
				const ay = 1150 + Math.sin(a) * 640;
				const snap = interpolate(frame, [L.SNAP + i * 2, L.SNAP + 12 + i * 2], [0, 1], io);
				const tx = ox + 62 * s;
				const ty = oy + (312 + i * 94) * s;
				const x = ax + (tx - ax) * snap;
				const y = ay + (ty - ay) * snap;
				const size = 120 - (120 - 60 * s) * snap;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: x - size / 2,
							top: y - size / 2,
							zIndex: 27,
							scale: String(appear),
							opacity: i < 6 ? interpolate(frame, [L.SNAP + 12 + i * 2, L.SNAP + 18 + i * 2], [1, 0], clamp) : 1 - snap,
							filter: 'drop-shadow(0 14px 24px rgba(8, 10, 18, 0.5))',
						}}
					>
						<ItemThumb kind={c.kind} icon={c.icon} size={size} />
					</div>
				);
			})}
		</>
	);
};

// ---------- headlines ----------
const Line: React.FC<{readonly at: number; readonly until: number; readonly children: React.ReactNode; readonly style: React.CSSProperties}> = ({at, until, children, style}) => {
	const frame = useCurrentFrame();
	if (frame < at || frame > until + 8) return null;
	return (
		<div
			style={{
				...style,
				opacity: interpolate(frame, [at, at + 4, until, until + 8], [0, 1, 1, 0], clamp),
				translate: `0px ${interpolate(frame, [at, at + 12], [-28, 0], out)}px`,
				scale: String(interpolate(frame, [at, at + 12], [1.25, 1], {...clamp, easing: Easing.out(Easing.back(1.5))})),
				transformOrigin: '0% 50%',
			}}
		>
			{children}
		</div>
	);
};

const big = (color: string, size = 118): React.CSSProperties => ({fontFamily: FONT.display, fontSize: size, lineHeight: 0.95, textTransform: 'uppercase', color});
const sub: React.CSSProperties = {fontFamily: FONT.body, fontSize: 46, fontWeight: 800, color: T.textSoft, marginTop: 18};

const Headlines: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const logo = spring({frame: frame - L.BRAND, fps, config: {damping: 11, stiffness: 170}});
	return (
		<>
			{/* 2. behind the phone */}
			<div style={{position: 'absolute', left: 70, right: 70, top: 150, zIndex: 15, textAlign: 'center'}}>
				<Line at={L.BETTER_WAY} until={L.BRAND - 6} style={{...big(T.paper, 128), transformOrigin: '50% 50%'}}>
					There’s a <span style={{color: T.tan}}>better way.</span>
				</Line>
			</div>
			{frame >= L.BRAND && frame < L.LOST + 14 ? (
				<Img
					src={staticFile('logo.png')}
					style={{
						position: 'absolute',
						left: 540 - 330,
						top: 230,
						width: 660,
						zIndex: 15,
						scale: String(interpolate(logo, [0, 1], [1.6, 1])),
						opacity: interpolate(frame, [L.BRAND, L.BRAND + 3, L.LOST, L.LOST + 14], [0, 1, 1, 0], clamp),
					}}
				/>
			) : null}
			{/* 3-5, top left */}
			<div style={{position: 'absolute', left: 70, top: 120, zIndex: 50}}>
				<Line at={L.LOST + 8} until={L.FOUND - 6} style={big(T.tan)}>
					Lost
				</Line>
				<Line at={L.LOST + 12} until={L.FOUND - 6} style={big(T.paper, 96)}>
					something?
				</Line>
				<Line at={L.LOST + 30} until={L.FOUND - 6} style={sub}>
					Get the word out.
				</Line>
			</div>
			<div style={{position: 'absolute', left: 70, top: 120, zIndex: 50}}>
				<Line at={L.FOUND + 14} until={L.ONE_PLACE - 6} style={big(T.sage)}>
					Found
				</Line>
				<Line at={L.FOUND + 18} until={L.ONE_PLACE - 6} style={big(T.paper, 96)}>
					something?
				</Line>
				<Line at={L.FOUND + 36} until={L.ONE_PLACE - 6} style={sub}>
					Help it find its way back.
				</Line>
			</div>
			<div style={{position: 'absolute', left: 70, top: 110, zIndex: 50}}>
				<Line at={L.ONE_PLACE + 20} until={L.LAUNCH - 6} style={big(T.paper, 104)}>
					One campus.
				</Line>
				<Line at={L.ONE_PLACE + 52} until={L.LAUNCH - 6} style={big(T.tan, 104)}>
					One place.
				</Line>
				<Line at={L.SNAP} until={L.LAUNCH - 6} style={{...sub, fontSize: 40}}>
					Less searching. More finding.
				</Line>
			</div>
		</>
	);
};

// ---------- 6. the launch ----------
const Finale: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < L.LOGO_BIG) return null;
	const settle = interpolate(frame, [L.LOGO_SETTLE, L.LOGO_SETTLE + 22], [0, 1], io);
	const appear = spring({frame: frame - L.LOGO_BIG, fps, config: {damping: 16, stiffness: 90}});
	const w = interpolate(settle, [0, 1], [1000, 600]);
	const cy = interpolate(settle, [0, 1], [880, 300]);
	const site = spring({frame: frame - L.SITE, fps, config: {damping: 14, stiffness: 130}});
	return (
		<>
			<Img
				src={staticFile('logo.png')}
				style={{
					position: 'absolute',
					left: 540 - w / 2,
					top: cy - (w * 200) / 523 / 2,
					width: w,
					zIndex: settle > 0.5 ? 60 : 5, // behind her, then up front once it has settled
					opacity: interpolate(appear, [0, 1], [0, 1]) * interpolate(settle, [0, 0.3, 1], [0.45, 0.7, 1]),
					scale: String(interpolate(appear, [0, 1], [1.25, 1])),
				}}
			/>
			<div style={{position: 'absolute', left: 60, right: 60, top: 470, zIndex: 60, textAlign: 'center'}}>
				<Line at={L.LIVE} until={9999} style={{...big(T.paper, 124), transformOrigin: '50% 50%'}}>
					Zarqa is <span style={{color: T.tan}}>live.</span>
				</Line>
				<Line at={L.LIVE + 18} until={9999} style={{...sub, fontSize: 44, transformOrigin: '50% 50%'}}>
					Your lost &amp; found, reimagined.
				</Line>
			</div>
			{frame >= L.SITE ? (
				<div style={{position: 'absolute', left: 0, right: 0, top: 770, zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 34, scale: String(site), opacity: Math.min(1, site * 2)}}>
					<div style={{background: T.paper, borderRadius: 26, padding: 18, boxShadow: '0 22px 50px rgba(8, 10, 18, 0.55)'}}>
						<svg width={200} height={200} viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} shapeRendering="crispEdges">
							{QR_CELLS.map(([x, y]) => (
								<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={T.ink} />
							))}
						</svg>
					</div>
					<div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
						<MonoLabel color={T.tan} style={{fontSize: 22, letterSpacing: 4}}>
							Scan or visit
						</MonoLabel>
						<span style={{fontFamily: FONT.display, fontSize: 64, lineHeight: 1, color: T.paper}}>tryzarqa.com</span>
					</div>
				</div>
			) : null}
		</>
	);
};

// ---------- sound ----------
const sfx = (name: string) => staticFile(`sfx/${name}`);
const LaunchSound: React.FC = () => {
	const lostKeys = Array.from({length: 10}, (_, i) => L.L_TYPE + i * 4);
	const foundKeys = Array.from({length: 12}, (_, i) => L.F_TYPE + i * 3);
	return (
		<>
			{/* The music comes in on the ZARQA reveal; the callback plays in silence. */}
			<Audio name="Music" src={staticFile('audio/launch-score.mp3')} from={L.BRAND} volume={0.8} />
			{/* 1 */}
			<Audio name="Tap" src={sfx('tap.ogg')} from={L.TAP} volume={0.5} />
			<Audio name="Fold" src={sfx('fold.ogg')} from={L.TAP + 2} volume={0.35} />
			<Audio name="Ticket" src={sfx('ticket-in.mp3')} from={L.TAP + 6 - 7} volume={1} />
			{/* 2 */}
			<Audio name="Flip" src={sfx('ticket-out.mp3')} from={L.FLIP - 2} volume={0.7} />
			<Audio name="Pull back" src={sfx('woosh.ogg')} from={L.PULL_BACK} volume={0.45} />
			<Audio name="Brand hit" src={sfx('logo-impact.ogg')} from={L.BRAND} volume={0.38} />
			<Audio name="Brand punch" src={sfx('logo-punch.ogg')} from={L.BRAND} volume={0.3} />
			{/* 3 */}
			{lostKeys.map((f) => (
				<Audio key={f} src={sfx('key-tick.ogg')} from={f} volume={0.22} />
			))}
			<Audio name="Pick place" src={sfx('tap.ogg')} from={L.L_PICK} volume={0.35} />
			<Audio name="Find my stuff" src={sfx('tap.ogg')} from={L.L_PRESS} volume={0.45} />
			<Audio name="Listed" src={sfx('phone-ding.ogg')} from={L.L_POSTED + 14} volume={0.35} />
			{/* 4 */}
			<Audio name="Phone out" src={sfx('woosh.ogg')} from={L.FOUND} volume={0.4} />
			<Audio name="FOUND tag" src={sfx('ticket-in.mp3')} from={L.FOUND + 22 - 7} volume={1} />
			<Audio name="Tag flip" src={sfx('ticket-out.mp3')} from={L.F_TAG_FLIP - 2} volume={0.7} />
			{foundKeys.map((f) => (
				<Audio key={f} src={sfx('key-tick.ogg')} from={f} volume={0.22} />
			))}
			<Audio name="Pick place 2" src={sfx('tap.ogg')} from={L.F_PICK} volume={0.35} />
			<Audio name="RSA switch" src={sfx('tap.ogg')} from={L.F_RSA} volume={0.35} />
			<Audio name="Post found item" src={sfx('tap.ogg')} from={L.F_PRESS} volume={0.45} />
			<Audio name="Drop code" src={sfx('phone-ding.ogg')} from={L.F_POSTED + 8} volume={0.35} />
			<Audio name="LOST card" src={sfx('sticker-pop.ogg')} from={L.PAIR} volume={0.25} />
			<Audio name="FOUND card" src={sfx('sticker-pop.ogg')} from={L.PAIR + 6} volume={0.25} />
			{/* 5 */}
			<Audio name="Into the app" src={sfx('woosh.ogg')} from={L.ONE_PLACE + 4} volume={0.45} />
			{Array.from({length: 6}, (_, i) => (
				<Audio key={i} src={sfx('key-tick.ogg')} from={L.SNAP + 10 + i * 2} volume={0.3} />
			))}
			{/* 6 */}
			<Audio name="Fade out" src={sfx('woosh.ogg')} from={L.LAUNCH} volume={0.35} />
			<Audio name="Brand sound" src={sfx('brand.mp3')} from={L.BRAND_SOUND} volume={0.6} />
		</>
	);
};
