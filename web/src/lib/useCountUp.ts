import { useEffect, useState } from 'react'

/**
 * Counts from 0 up to `target` over `ms`, easing out, for numbers worth a small moment (profile stats).
 * Returns `target` straight away under reduced motion, and null while there is no number yet.
 */
export function useCountUp(target: number | null | undefined, ms = 700) {
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    if (target == null) return
    const still = target === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const p = still ? 1 : Math.min((now - start) / ms, 1)
      setShown(Math.round(target * (1 - (1 - p) ** 4)))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])

  return target == null ? null : shown
}
