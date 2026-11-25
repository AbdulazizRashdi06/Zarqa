import type React from 'react';
import {Img, staticFile} from 'remotion';
import {C} from '../theme';
import {
	AR,
	Ar,
	Art,
	BLUE,
	BLUE_DEEP,
	Bubble,
	H,
	Mono,
	MUTED_ON_DARK,
	MUTED_ON_PAPER,
	SAND,
	Say,
	Shout,
	Silhouette,
	Slide,
	Sticker,
	W,
} from './kit';

// The ten slides. The text is the owner's final wording, in both languages, unchanged.
// The threat always comes from the right, the way the carousel is swiped.

const abs = (style: React.CSSProperties): React.CSSProperties => ({position: 'absolute', ...style});

// 1. Hook
export const S01: React.FC = () => (
	<Slide n={1} bg={C.ground} en="Who is Zarqa?" ar="من هي زرقاء؟" tone="dark">
		<div style={abs({left: 0, right: 0, top: 1130, bottom: 0, background: C.surface})} />
		<Shout style={abs({left: 64, top: 196, fontSize: 178, color: C.paper})}>
			You know
			<br />
			the name.
		</Shout>
		<Shout style={abs({left: 64, top: 566, fontSize: 112, color: C.tan})}>
			Do you know
			<br />
			the story?
		</Shout>
		<Ar style={abs({left: 64, width: 590, top: 836, fontFamily: AR.display, fontWeight: 400, fontSize: 92, lineHeight: 1.26, color: C.paper, whiteSpace: 'nowrap'})}>
			تعرف الاسم…
			<div style={{color: C.tan}}>فهل تعرف القصة؟</div>
		</Ar>
		<Art name="z-lookout" style={{right: 26, bottom: -26, height: 760}} />
		<Sticker rotate={-5} size={34} edge={C.surface} style={abs({left: 64, top: 1206})}>
			Swipe <span style={{fontSize: 40, lineHeight: 0.8}}>→</span>
		</Sticker>
	</Slide>
);

// 2. Her name: the one blue slide
export const S02: React.FC = () => (
	<Slide n={2} bg={BLUE} en="Her name" ar="اسمها" tone="blue">
		<Silhouette name="gate" color={BLUE_DEEP} style={{left: -110, width: 1300, height: 340, bottom: 0}} />
		<div dir="rtl" lang="ar" style={abs({left: 0, right: 0, top: 108, textAlign: 'center', fontFamily: AR.display, fontSize: 400, lineHeight: 1.1, color: C.paper})}>
			زرقاء
		</div>
		<div style={abs({left: 64, width: 500, top: 560, color: C.paper})}>
			<Shout style={{fontSize: 62}}>
				“Zarqa” means
				<br />
				the blue-eyed one.
			</Shout>
			<Say style={{fontSize: 32, fontWeight: 600, marginTop: 22}}>
				She was a woman of the Jadis tribe. Legend says her land was called Jaww, until it was renamed al-Yamama after her.
			</Say>
		</div>
		<Ar style={abs({right: 64, width: 420, top: 548, color: C.paper})}>
			<div style={{fontFamily: AR.display, fontWeight: 400, fontSize: 58, lineHeight: 1.25}}>«زرقاء» لقبٌ لزُرقة عينيها،</div>
			<div style={{fontSize: 32, lineHeight: 1.65, marginTop: 8}}>
				وهي امرأة من جَديس. ويُروى أن بلدها كان يُسمّى «جَوّاً»، ثم سُمّي «اليمامة» باسمها.
			</div>
		</Ar>
		<Art name="z-portrait" style={{left: 610, bottom: -6, width: 372}} />
	</Slide>
);

// 3. Her gift: a speck on the horizon
export const S03: React.FC = () => {
	const horizon = 1010;
	const eye = {x: 286, y: 366};
	const rider = {x: 978, y: horizon - 30};
	const angle = (Math.atan2(rider.y - eye.y, rider.x - eye.x) * 180) / Math.PI;
	return (
		<Slide n={3} bg={C.ground} en="Her gift" ar="موهبتها" tone="dark">
			<div style={abs({left: 0, right: 0, top: horizon, bottom: 0, background: C.surface})} />
			<svg width={W} height={H} style={abs({left: 0, top: 0})}>
				<line x1={eye.x} y1={eye.y} x2={rider.x - 34} y2={rider.y} stroke={C.tan} strokeWidth={5} strokeDasharray="4 22" strokeLinecap="round" />
			</svg>
			<Art name="z-lookout" style={{left: 96, top: 250, height: 470, clipPath: 'inset(0 0 58% 0)'}} />
			<Art name="tower" style={{left: 84, top: horizon - 700, height: 700, clipPath: 'inset(11.5% 0 0 0)'}} />
			<Art name="rider" style={{left: rider.x - 28, top: horizon - 50, height: 52}} />
			<div style={abs({left: (eye.x + rider.x) / 2 + 30, top: (eye.y + rider.y) / 2 - 78, translate: '-50% -50%', rotate: `${angle}deg`})}>
				<Sticker rotate={0} size={26} bg={C.paper}>
					3 days
					<span dir="rtl" lang="ar" style={{fontFamily: AR.body, fontWeight: 700, fontSize: 30, letterSpacing: 0}}>
						ثلاثة أيام
					</span>
				</Sticker>
			</div>
			<div style={abs({left: 64, width: 470, top: horizon + 46, color: C.paper})}>
				<Say style={{fontSize: 32, color: MUTED_ON_DARK}}>They say she could spot a rider</Say>
				<Shout style={{fontSize: 74, color: C.tan, margin: '8px 0 6px'}}>
					three days’
					<br />
					journey away,
				</Shout>
				<Say style={{fontSize: 32, color: MUTED_ON_DARK}}>and warn her people.</Say>
			</div>
			<Ar style={abs({right: 64, width: 440, top: horizon + 40, color: C.paper})}>
				<div style={{fontSize: 34, lineHeight: 1.6, color: MUTED_ON_DARK}}>قيل: كانت تُبصر الراكب من</div>
				<div style={{fontFamily: AR.display, fontWeight: 400, fontSize: 72, lineHeight: 1.3, color: C.tan, whiteSpace: 'nowrap'}}>مسيرة ثلاثة أيام،</div>
				<div style={{fontSize: 34, lineHeight: 1.6, color: MUTED_ON_DARK}}>فتُنذر قومها.</div>
			</Ar>
		</Slide>
	);
};

// 4. The trick: on paper, like a ticket
export const S04: React.FC = () => (
	<Slide n={4} bg={C.paper} en="The trick" ar="الحيلة" tone="paper">
		<div style={abs({left: 64, width: 900, top: 176, color: C.ink})}>
			<Say style={{fontSize: 36, color: MUTED_ON_PAPER}}>
				An army marched on them. It knew about her eyes,
				<br />
				so every man was ordered to
			</Say>
			<Shout style={{fontSize: 118, marginTop: 12}}>
				cut a tree <span style={{color: C.tanLabel}}>and hide behind it.</span>
			</Shout>
		</div>
		<div style={abs({left: 0, right: 0, top: 1080, height: 0, borderTop: `5px dashed ${C.paperLine}`})} />
		<div style={abs({left: -24, top: 1056, width: 48, height: 48, borderRadius: '50%', background: C.ground})} />
		<div style={abs({right: -24, top: 1056, width: 48, height: 48, borderRadius: '50%', background: C.ground})} />
		<Art name="soldiers" style={{left: 180, top: 556, width: 720}} />
		<Ar style={abs({right: 64, width: 952, top: 1100, color: C.ink})}>
			<div style={{fontSize: 34, lineHeight: 1.6, color: MUTED_ON_PAPER}}>فسار إليهم جيشٌ قد عَلِم بحدّة بصرها، فأُمر كلُّ رجلٍ أن</div>
			<div style={{fontFamily: AR.display, fontWeight: 400, fontSize: 100, lineHeight: 1.2}}>
				يقطع شجرةً <span style={{color: C.tanLabel}}>يستتر بها.</span>
			</div>
		</Ar>
	</Slide>
);

// 5. The warning: one giant Zarqa bubble
export const S05: React.FC = () => {
	const horizon = 934;
	return (
		<Slide n={5} bg={C.ground} en="The warning" ar="الإنذار" tone="dark">
			<div style={abs({left: 0, right: 0, top: horizon, bottom: 0, background: C.surface})} />
			{[
				{name: 'tree-2', left: 872, h: 46},
				{name: 'tree-1', left: 902, h: 40},
				{name: 'tree-4', left: 944, h: 38},
				{name: 'tree-3', left: 984, h: 42},
			].map((t) => (
				<Art key={t.left} name={t.name} style={{left: t.left, top: horizon - t.h + 4, height: t.h}} />
			))}
			<svg width={W} height={H} style={abs({left: 0, top: 0})}>
				<line x1={500} y1={896} x2={850} y2={908} stroke={C.tan} strokeWidth={5} strokeDasharray="4 22" strokeLinecap="round" />
			</svg>
			<Bubble style={{left: 120, right: 56, top: 168}}>
				<Shout style={{fontSize: 138, whiteSpace: 'nowrap'}}>
					“I see trees
					<br />
					walking!”
				</Shout>
				<Ar style={{fontFamily: AR.display, fontWeight: 400, fontSize: 98, lineHeight: 1.3, color: C.tan, marginTop: 6, whiteSpace: 'nowrap'}}>
					«إني أرى شجراً يسير!»
				</Ar>
			</Bubble>
			<Art name="z-warning" style={{left: 26, bottom: -22, height: 660}} />
		</Slide>
	);
};

// 6. The sandal: looking through her eye
export const S06: React.FC = () => {
	const d = 730;
	const cx = 540;
	const cy = 532;
	const ring = (inset: number, background: string): React.CSSProperties => ({
		position: 'absolute',
		left: cx - d / 2 + inset,
		top: cy - d / 2 + inset,
		width: d - inset * 2,
		height: d - inset * 2,
		borderRadius: '50%',
		background,
	});
	return (
		<Slide n={6} bg={C.ground} en="The sandal" ar="النعل" tone="dark">
			<div style={ring(0, C.ink)} />
			<div style={{...ring(0, '#12141d'), boxShadow: '0 40px 90px rgba(8, 10, 18, 0.6)'}} />
			<div style={ring(12, C.paper)} />
			<div style={ring(50, '#12141d')} />
			<div style={ring(60, BLUE)} />
			<div style={ring(96, '#12141d')} />
			<div style={{...ring(106, SAND), overflow: 'hidden'}}>
				<div style={abs({left: 0, right: 0, top: '74%', bottom: 0, background: C.tan})} />
				<Art name="sandal" style={{left: '50%', top: '7%', height: '82%', translate: '-50% 0'}} />
			</div>
			<Sticker rotate={7} size={26} bg={C.paper} style={abs({left: 742, top: 208})}>
				Zoom
				<span dir="rtl" lang="ar" style={{fontFamily: AR.body, fontWeight: 700, fontSize: 30, letterSpacing: 0}}>
					تكبير
				</span>
			</Sticker>
			<Bubble style={{left: 64, right: 64, top: 928, padding: '28px 46px 30px'}}>
				<Shout style={{fontSize: 74}}>“And I see a man mending his sandal.”</Shout>
				<Ar style={{fontFamily: AR.display, fontWeight: 400, fontSize: 80, lineHeight: 1.3, color: C.tan, marginTop: 2}}>
					«وأرى رجلاً يخصف نعله.»
				</Ar>
			</Bubble>
		</Slide>
	);
};

// 7. Disbelief: the app's chat, and the first tree already at the edge
export const S07: React.FC = () => {
	const them: React.CSSProperties = {
		alignSelf: 'flex-start',
		background: C.paper,
		color: C.ink,
		borderRadius: '44px 44px 44px 10px',
		padding: '22px 34px',
	};
	return (
		<Slide n={7} bg={C.ground} en="Disbelief" ar="التكذيب" tone="dark">
			<div style={abs({left: 0, right: 0, top: 1180, bottom: 0, background: C.surface})} />
			<div
				style={abs({
					left: 64,
					right: 64,
					top: 176,
					background: C.surface,
					borderRadius: 52,
					padding: '34px 38px 42px',
					display: 'flex',
					flexDirection: 'column',
					gap: 20,
				})}
			>
				<div
					style={{
						alignSelf: 'flex-end',
						background: C.tan,
						color: C.ink,
						borderRadius: '44px 44px 10px 44px',
						padding: '20px 34px',
						display: 'flex',
						alignItems: 'baseline',
						gap: 26,
					}}
				>
					<Say style={{fontSize: 36}}>I see trees walking!</Say>
					<Ar style={{fontSize: 36, fontWeight: 700, lineHeight: 1.3}}>إني أرى شجراً يسير!</Ar>
				</div>
				<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 8px 2px', color: MUTED_ON_DARK}}>
					<Say style={{fontSize: 32, fontWeight: 600}}>Her people didn’t believe her.</Say>
					<Ar style={{fontSize: 34, lineHeight: 1.3}}>فكذّبها قومها وقالوا:</Ar>
				</div>
				<div style={them}>
					<Shout style={{fontSize: 64, letterSpacing: 0.5, whiteSpace: 'nowrap'}}>“You’re seeing things, Zarqa.”</Shout>
				</div>
				<div style={them}>
					<Ar style={{fontFamily: AR.display, fontWeight: 400, fontSize: 84, lineHeight: 1.25}}>«خَرِفتِ يا زرقاء.»</Ar>
				</div>
			</div>
			<Art name="townspeople" style={{left: 18, bottom: 26, width: 640}} />
			<Art name="z-told-you" style={{left: 694, bottom: 20, height: 560}} />
			{/* The same tree, at the same height, continues on the next slide. */}
			<Art name="tree-1" style={{left: 984, top: 846, height: 440}} />
		</Slide>
	);
};

// 8. The arrival: dawn, and the frame full of trees
export const S08: React.FC = () => (
	<Slide n={8} bg="#ecd3b6" en="The arrival" ar="الوصول" tone="dawn">
		<div style={abs({left: 540 - 250, top: 430, width: 500, height: 500, borderRadius: '50%', background: C.paper})} />
		<Art name="gate" style={{left: -70, top: 596, width: 1220}} />
		<div style={abs({left: 0, right: 0, top: 908, bottom: 0, background: C.tan})} />
		<div style={abs({left: 64, top: 190, color: C.ink})}>
			<Say style={{fontSize: 40}}>The next morning,</Say>
			<Shout style={{fontSize: 108, marginTop: 8}}>
				the trees
				<br />
				arrived.
			</Shout>
		</div>
		<Ar style={abs({right: 64, top: 176, fontFamily: AR.display, fontWeight: 400, fontSize: 92, lineHeight: 1.28, color: C.ink})}>
			فلمّا أصبحوا…
			<br />
			صبّحهم الجيش.
		</Ar>
		<Art name="tree-3" style={{left: 196, top: 800, height: 500}} />
		<Art name="tree-4" style={{left: 742, top: 846, height: 450}} />
		<Art name="tree-2" style={{left: 536, top: 716, height: 590}} />
		<Art name="tree-1" style={{left: -96, top: 846, height: 440}} />
		<Art name="tree-3" style={{left: 916, top: 760, height: 540, scale: '-1 1'}} />
	</Slide>
);

// 9. The proverb: the slide is the ticket
export const S09: React.FC = () => (
	<Slide n={9} bg={C.paper} en="The proverb" ar="المثل" tone="paper">
		<div
			style={abs({
				left: 540 - 230,
				top: 168,
				width: 460,
				height: 388,
				borderRadius: '230px 230px 34px 34px',
				background: BLUE,
				border: `10px solid ${C.ink}`,
				overflow: 'hidden',
				boxSizing: 'border-box',
			})}
		>
			<Img src={staticFile('story/z-lookout.webp')} style={abs({left: -128, top: 8, width: 640})} />
		</div>
		<div dir="rtl" lang="ar" style={abs({left: 0, right: 0, top: 560, textAlign: 'center', fontFamily: AR.calli, fontWeight: 700, color: C.ink})}>
			<div style={{fontSize: 216, lineHeight: 1.16}}>أبصرُ من</div>
			<div style={{fontSize: 216, lineHeight: 1.16, marginTop: -26}}>
				<span style={{color: BLUE}}>زرقاء</span> اليمامة
			</div>
		</div>
		<div style={abs({left: 0, right: 0, top: 1112, height: 0, borderTop: `5px dashed ${C.paperLine}`})} />
		<div style={abs({left: -24, top: 1088, width: 48, height: 48, borderRadius: '50%', background: C.ground})} />
		<div style={abs({right: -24, top: 1088, width: 48, height: 48, borderRadius: '50%', background: C.ground})} />
		<Shout style={abs({left: 64, top: 1146, fontSize: 52, color: C.ink})}>“Sharper-sighted than Zarqa al-Yamama.”</Shout>
		<Say style={abs({left: 64, top: 1226, fontSize: 32, fontWeight: 600, color: MUTED_ON_PAPER})}>Arabs have said it for centuries.</Say>
		<Ar style={abs({right: 64, top: 1214, fontSize: 36, lineHeight: 1.4, color: MUTED_ON_PAPER})}>مثلٌ تضربه العرب في حدّة البصر.</Ar>
	</Slide>
);

// 10. The point: the app's Match alerts switch, on
export const S10: React.FC = () => (
	<Slide n={10} bg={C.ground} en="The point" ar="المغزى" tone="dark">
		<div style={abs({left: 0, right: 0, top: 1180, bottom: 0, background: C.surface})} />
		<Img src={staticFile('logo.png')} style={abs({left: 440, top: 190, width: 576})} />
		<div style={abs({left: 440, width: 580, top: 470, color: C.paper})}>
			<Shout style={{fontSize: 76}}>
				She saw what
				<br />
				no one else did.
			</Shout>
			<Shout style={{fontSize: 76, color: C.tan, marginTop: 22}}>
				This time,
				<br />
				we’re listening.
			</Shout>
		</div>
		<Ar style={abs({right: 64, width: 580, top: 822, fontFamily: AR.display, fontWeight: 400, fontSize: 66, lineHeight: 1.3, color: C.paper, whiteSpace: 'nowrap'})}>
			أبصرت ما لم يُبصره أحد.
			<div style={{color: C.tan}}>وهذه المرّة… سنصدّقها.</div>
		</Ar>
		<div
			style={abs({
				left: 440,
				right: 64,
				top: 1030,
				height: 108,
				background: C.paper,
				borderRadius: 30,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0 30px',
				color: C.ink,
			})}
		>
			<Say style={{fontSize: 36, fontWeight: 800}}>Match alerts</Say>
			<div style={{width: 130, height: 76, borderRadius: 38, background: '#74573f', padding: 8, boxSizing: 'border-box', display: 'flex', justifyContent: 'flex-end'}}>
				<div style={{width: 60, height: 60, borderRadius: '50%', background: C.paper}} />
			</div>
		</div>
		<Art name="z-wink" style={{left: 22, bottom: -16, height: 720}} />
		<Mono style={abs({left: 440, right: 64, top: 1236, color: MUTED_ON_DARK, fontSize: 30, letterSpacing: 6})}>GUtech lost &amp; found</Mono>
		<Sticker rotate={-5} size={34} style={abs({right: 44, top: 376})}>
			Coming soon
		</Sticker>
	</Slide>
);

export const SLIDES = [S01, S02, S03, S04, S05, S06, S07, S08, S09, S10];
