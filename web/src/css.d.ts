import 'react'

// Lets inline styles carry CSS custom properties, e.g. style={{ '--i': 2 }} for a staggered entrance.
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}
