import { claimTapNavigation, useNavigate } from './transition'

// The in-app trail, by react-router's history index, so Back can tell whether the page before is ours.
const trail: string[] = []
const historyIdx = (): number | null => {
  const idx = (window.history.state as { idx?: number } | null)?.idx
  return typeof idx === 'number' ? idx : null
}

/** The path of the in-app page before this one, or null after a reload or when the app was opened on this page. */
export function previousPath(): string | null {
  const idx = historyIdx()
  return idx && idx > 0 ? (trail[idx - 1] ?? null) : null
}

/**
 * Back that behaves like the phone's back: returns through history when the page before is `to` (or any
 * in-app page, with `anyPrevious`), so the system back button doesn't replay screens. Otherwise it replaces
 * this page with `to`.
 */
export function useBack() {
  const navigate = useNavigate()
  return (to: string, anyPrevious = false) => {
    if (!claimTapNavigation()) return
    const prev = previousPath()
    if (prev !== null && (anyPrevious || prev === to)) navigate(-1, { dir: 'back' })
    else navigate(to, { replace: true, dir: 'back' })
  }
}

/** Called by <RouteSettled> on every page change. */
export function recordHistory(type: 'PUSH' | 'POP' | 'REPLACE', pathname: string) {
  const idx = historyIdx()
  if (idx === null) return
  if (type === 'PUSH') trail.length = idx
  trail[idx] = pathname
}
