import { useRef, type CSSProperties, type PointerEvent } from 'react'
import { Link } from '../lib/nav'
import { t } from '../i18n'
import s from './ComingSoon.module.css'

/** Design px on the 390 × 844 artboard (design: "Zarqa Coming Soon", board B). The burst flies them out from the middle. */
const COINS: { x: number; y: number; r: number; ring?: boolean }[] = [
  { x: 74, y: 182, r: 7, ring: true },
  { x: 92, y: 172, r: 5 },
  { x: 56, y: 196, r: 4 },
  { x: 318, y: 196, r: 6 },
  { x: 336, y: 212, r: 4 },
  { x: 40, y: 560, r: 5 },
  { x: 352, y: 548, r: 7, ring: true },
  { x: 334, y: 566, r: 4 },
]
const CENTRE = { x: 195, y: 420 }

const vars = (v: Record<string, string | number>) => v as CSSProperties

function Letters({ text, className, from }: { text: string; className: string; from: number }) {
  return (
    <span aria-hidden="true" className={className}>
      {[...text].map((ch, i) => (
        <span key={i} className={s.letter} style={vars({ '--n': from + i, '--k': i })}>
          <span>{ch}</span>
        </span>
      ))}
    </span>
  )
}

function Tape({ className }: { className: string }) {
  const words = Array.from({ length: 8 }, (_, i) => <span key={i}>{t('common.comingSoon')}</span>)
  return (
    <div aria-hidden="true" className={`${s.tape} ${className}`}>
      <div className={s.tapeRun}>
        {words}
        {words}
      </div>
    </div>
  )
}

/**
 * Shown after a new student's code checks out while sign-up is closed (server Auth:ComingSoon).
 * No account was made and nobody is signed in: people who already have an account, and staff, get in as usual.
 * One of the few screens that gets a show (motion.css): everything lands hard, then keeps moving, and a tap
 * anywhere throws coins. Reduced motion gets the still picture.
 */
export default function ComingSoon() {
  const stage = useRef<HTMLDivElement>(null)
  const zarqa = useRef<HTMLImageElement>(null)

  function burst(e: PointerEvent<HTMLElement>) {
    const el = stage.current
    if (!el || (e.target as Element).closest('a')) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const box = el.getBoundingClientRect()
    const u = box.width / 390
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    for (let i = 0; i < 14; i++) {
      const coin = document.createElement('span')
      coin.className = i % 4 === 3 ? `${s.spark} ${s.sparkRing}` : s.spark
      const size = (6 + Math.random() * 10) * u
      coin.style.width = coin.style.height = `${size}px`
      coin.style.left = `${x - size / 2}px`
      coin.style.top = `${y - size / 2}px`
      el.append(coin)
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.5
      const far = (70 + Math.random() * 90) * u
      const dx = Math.cos(angle) * far
      const dy = Math.sin(angle) * far
      coin
        .animate(
          [
            { translate: '0 0', scale: 0.4, opacity: 1 },
            { translate: `${dx}px ${dy - 30 * u}px`, scale: 1, opacity: 1, offset: 0.55 },
            { translate: `${dx * 1.15}px ${dy + 60 * u}px`, scale: 0.6, opacity: 0 },
          ],
          { duration: 620 + Math.random() * 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        )
        .finished.then(() => coin.remove(), () => coin.remove())
    }
    zarqa.current?.animate(
      [
        { transform: 'none' },
        { transform: 'scale(1.06, 0.92)', offset: 0.18 },
        { transform: 'translateY(-7%) scale(0.97, 1.05)', offset: 0.5 },
        { transform: 'scale(1.04, 0.95)', offset: 0.82 },
        { transform: 'none' },
      ],
      { duration: 520, easing: 'ease-out' },
    )
  }

  const h1 = t('comingSoon.h1')
  return (
    <main className={s.page} onPointerDown={burst}>
      <div className={s.stage} ref={stage}>
        <div aria-hidden="true" className={s.disc} />
        <div aria-hidden="true" className={s.sweep} />
        <div aria-hidden="true" className={`${s.ring} ${s.ringA}`} />
        <div aria-hidden="true" className={`${s.ring} ${s.ringB}`} />
        <div aria-hidden="true" className={s.ping} />
        <div aria-hidden="true" className={`${s.ping} ${s.pingLate}`} />

        <Tape className={s.tapeTop} />
        <Tape className={s.tapeLow} />

        {COINS.map((c, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={c.ring ? `${s.coin} ${s.coinRing}` : s.coin}
            style={vars({ '--x': c.x, '--y': c.y, '--r': c.r, '--dx': CENTRE.x - c.x, '--dy': CENTRE.y - c.y, '--n': i })}
          />
        ))}

        <h1 className={s.title} aria-label={t('common.comingSoon')}>
          <Letters text={h1} className={s.slam} from={0} />
        </h1>
        <p className="visually-hidden">{t('comingSoon.body')}</p>

        <div aria-hidden="true" className={`${s.tag} ${s.tagTan}`}>
          <div>
            <i />
            <b />
            <b />
          </div>
        </div>
        <div aria-hidden="true" className={`${s.tag} ${s.tagSage}`}>
          <div>
            <i />
            <b />
            <b />
          </div>
        </div>
        <div aria-hidden="true" className={s.eye}>
          <svg viewBox="0 0 18 12">
            <path d="M1 6c2.5-3.3 5-5 8-5s5.5 1.7 8 5c-2.5 3.3-5 5-8 5S3.5 9.3 1 6z" fill="none" stroke="#222634" strokeWidth="1.6" />
            <circle cx="9" cy="6" r="2.2" fill="#bd9777" />
          </svg>
        </div>

        <div className={s.zarqa}>
          <div className={s.float}>
            <img ref={zarqa} src="/mascot/envelope.webp" alt="Zarqa holding a sealed envelope to her chest, smiling" draggable={false} />
          </div>
        </div>

        <Letters text={t('comingSoon.h2')} className={s.soon} from={h1.length} />

        <Link to="/signin" dir="back" className={s.back} aria-label={t('comingSoon.otherEmail')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </main>
  )
}
