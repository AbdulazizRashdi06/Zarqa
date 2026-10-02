// Line icons copied from the design mockups (design/screens/*.dc.html).
type IconProps = { size?: number; color?: string; strokeWidth?: number }

function Svg({ size = 20, color = 'currentColor', strokeWidth = 2, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

export const ArrowRight = (p: IconProps) => <Svg strokeWidth={2.6} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const ChevronLeft = (p: IconProps) => <Svg strokeWidth={2.2} {...p}><path d="M15 6l-6 6 6 6" /></Svg>
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
export const Check = (p: IconProps) => <Svg strokeWidth={2.8} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
export const ChatBubble = (p: IconProps) => (
  <Svg {...p}><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5z" /></Svg>
)
export const Camera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)
export const Pin = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </Svg>
)
export const Lock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
)
export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3.5h10.5V20.5H9L3.5 15V9z" />
    <circle cx="8" cy="12" r="1.4" />
    <path d="M12.5 9.5h4M12.5 14.5h4" />
  </Svg>
)
export const SignOut = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 16l-4-4 4-4M6 12h10" />
  </Svg>
)

/** The tan eye glyph after the ZARQA wordmark. */
export function EyeGlyph() {
  return (
    <svg aria-hidden="true" width="22" height="14" viewBox="0 0 22 14" style={{ marginBottom: 5, flexShrink: 0 }}>
      <path d="M1 7C4.5 2 7.6 1 11 1s6.5 1 10 6c-3.5 5-6.6 6-10 6S4.5 12 1 7z" fill="none" stroke="var(--tan)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="11" cy="7" r="3" fill="var(--tan)" />
    </svg>
  )
}
