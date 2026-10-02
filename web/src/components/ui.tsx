import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronLeft } from './icons'
import s from './ui.module.css'

type Css = CSSProperties & Record<`--${string}`, string | number>

/** The ZARQA logo (public/logo.png). `size` is the logo's height in px. */
export function Wordmark({ size = 30 }: { size?: number }) {
  return <img src="/logo.png" alt="Zarqa" height={size} style={{ height: size, width: 'auto', display: 'block' }} />
}

export function MonoLabel({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={`${s.label} ${className ?? ''}`} style={color ? { color } : undefined}>
      {children}
    </span>
  )
}

/** Luggage tag: notched left corners and a punched hole in the background colour behind it. */
export function LuggageTag({
  notch = 20,
  hole = 12,
  holeColor = 'var(--ground)',
  className,
  style,
  children,
}: {
  notch?: number
  hole?: number
  holeColor?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const vars: Css = { '--notch': `${notch}px`, '--hole': `${hole}px`, '--hole-color': holeColor, ...style }
  return (
    <div className={`${s.tag} ${className ?? ''}`} style={vars}>
      <span aria-hidden="true" className={s.tagHole} />
      {children}
    </div>
  )
}

export function Ticket({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`${s.ticket} ${className ?? ''}`} style={style}>
      {children}
    </div>
  )
}

/** Dashed tear line with side notches. `inset` is the parent's horizontal padding so it spans edge to edge. */
export function TearLine({ inset = 20, notch = 28, notchColor = 'var(--ground)' }: { inset?: number; notch?: number; notchColor?: string }) {
  const vars: Css = { margin: `4px -${inset}px 0`, '--notch-size': `${notch}px`, '--notch-color': notchColor }
  return <div aria-hidden="true" className={s.tear} style={vars} />
}

export function Sticker({ children, rotate = -3, style }: { children: ReactNode; rotate?: number; style?: CSSProperties }) {
  return (
    <span className={s.sticker} style={{ transform: `rotate(${rotate}deg)`, ...style }}>
      {children}
    </span>
  )
}

export type Mascot = 'thinking' | 'happy' | 'wink' | 'reading' | 'question' | 'portrait' | 'full' | 'lookout' | 'phone'

const mascotSrc = (m: Mascot) => `/mascot/${m}.webp`

/** Zarqa with a speech bubble. `quiet` is the smaller, softer tip style (Chats, chat system messages). */
export function ZarqaBubble({
  mascot,
  alt,
  width = 92,
  quiet,
  children,
}: {
  mascot: Mascot
  alt: string
  width?: number
  quiet?: boolean
  children: ReactNode
}) {
  return (
    <div className={`${s.bubbleRow} ${quiet ? s.bubbleQuiet : ''}`}>
      <img src={mascotSrc(mascot)} alt={alt} width={width} style={{ flexShrink: 0, height: 'auto' }} />
      <div className={s.bubble}>
        <span className={s.bubbleName}>ZARQA</span>
        <span className={s.bubbleText}>{children}</span>
      </div>
    </div>
  )
}

type BigButtonProps = {
  label: ReactNode
  variant?: 'tan' | 'dark'
  /** Arrow circle colour for the dark variant (the Lost/Found accent). */
  accent?: string
  labelSize?: number
  to?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}

export function BigButton({ label, variant = 'tan', accent = 'var(--tan)', labelSize, to, onClick, type = 'button', disabled }: BigButtonProps) {
  const cls = `${s.big} ${variant === 'tan' ? s.bigTan : s.bigDark}`
  const inner = (
    <>
      <span className={s.bigLabel} style={labelSize ? { fontSize: labelSize } : undefined}>
        {label}
      </span>
      <span className={s.bigCircle} style={variant === 'dark' ? { background: accent } : undefined}>
        <ArrowRight size={22} color={variant === 'tan' ? 'var(--tan)' : 'var(--ink)'} />
      </span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {inner}
    </button>
  )
}

export function RoundButton({
  to,
  onClick,
  label,
  badge,
  background,
  children,
}: {
  to?: string
  onClick?: () => void
  label: string
  badge?: number
  background?: string
  children: ReactNode
}) {
  const content = (
    <>
      {children}
      {badge ? <span className={s.badge}>{badge > 9 ? '9+' : badge}</span> : null}
    </>
  )
  const style = background ? { background } : undefined
  if (to) {
    return (
      <Link to={to} aria-label={label} className={s.roundBtn} style={style}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" aria-label={label} className={s.roundBtn} style={style} onClick={onClick}>
      {content}
    </button>
  )
}

/** Back circle on the left, small mono label on the right. */
export function BackHeader({ to = '/', label, right }: { to?: string; label?: ReactNode; right?: ReactNode }) {
  return (
    <header className={s.backHeader}>
      <RoundButton to={to} label="Back">
        <ChevronLeft size={20} />
      </RoundButton>
      {right ?? (label ? <span className={s.label}>{label}</span> : null)}
    </header>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={s.switch} onClick={() => onChange(!checked)}>
      <span className={s.switchKnob} />
    </button>
  )
}

export type PillStatus = 'Searching' | 'Possible match' | 'Chatting' | 'Returned'

const pillColors: Record<PillStatus, { bg: string; fg: string; dot: string }> = {
  Searching: { bg: '#E4DED6', fg: '#3F4652', dot: '#7D898C' },
  'Possible match': { bg: '#222634', fg: '#E3C4A8', dot: '#BD9777' },
  Chatting: { bg: '#D3DBDC', fg: '#222634', dot: '#434E5F' },
  Returned: { bg: '#D6E6DA', fg: '#1F4A2E', dot: '#3F8A57' },
}

export function StatusPill({ status }: { status: PillStatus }) {
  const c = pillColors[status]
  return (
    <span className={s.pill} style={{ background: c.bg, color: c.fg }}>
      <span className={s.pillDot} style={{ background: c.dot }} />
      {status}
    </span>
  )
}

export function Avatar({
  name,
  photoUrl,
  size = 46,
  background = 'var(--tan)',
  to,
  label,
  ring,
}: {
  name: string
  photoUrl?: string | null
  size?: number
  background?: string
  to?: string
  label?: string
  ring?: boolean
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background,
    fontSize: Math.round(size * 0.48),
    boxShadow: ring ? `0 0 0 3px var(--ground), 0 0 0 5px ${background}` : undefined,
  }
  const content = photoUrl ? <img src={photoUrl} alt="" /> : (name.trim()[0] ?? '?').toUpperCase()
  if (to) {
    return (
      <Link to={to} aria-label={label} className={s.avatar} style={style}>
        {content}
      </Link>
    )
  }
  return (
    <span aria-hidden="true" className={s.avatar} style={style}>
      {content}
    </span>
  )
}
