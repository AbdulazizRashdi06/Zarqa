import { useCallback } from 'react'
import { useNavigate as useRouterNavigate, type NavigateOptions, type To } from 'react-router'

/** Which way the page slide goes: deeper into the app, or back towards Home. */
export type Dir = 'forward' | 'back'

// Resolves the running view transition once the new route is on screen.
let routeRendered: (() => void) | null = null

/** Called by <RouteSettled> (lib/nav.tsx) when a new route has rendered. */
export function settleRoute() {
  routeRendered?.()
}

// Double-tap guard: a second tap that lands within this window after a tap navigation is dropped, so it can't
// hit whatever sits under the finger on the next page (lib/nav.tsx also blocks taps while a page settles).
const TAP_GUARD_MS = 300
let lastTapNavigation = -Infinity

/** True (and starts the guard) unless a tap navigation just happened. Used by Link and the Back button. */
export function claimTapNavigation() {
  const now = performance.now()
  if (now - lastTapNavigation < TAP_GUARD_MS) return false
  lastTapNavigation = now
  return true
}

const depth = (path: string) => path.split('/').filter(Boolean).length
const pathOf = (to: To) => (typeof to === 'string' ? to.split(/[?#]/)[0] : (to.pathname ?? window.location.pathname))

/**
 * Change the page inside a view transition (motion.css has the slide). Browsers without the API just navigate.
 * Only taps in the app come through here: the browser's own back button or swipe already moves the page.
 */
function withTransition(dir: Dir, update: () => void) {
  if (!document.startViewTransition) {
    update()
    return
  }
  const root = document.documentElement
  root.dataset.nav = dir
  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const done = () => {
          if (routeRendered === done) routeRendered = null
          resolve()
        }
        routeRendered = done
        update()
        // Never leave the page frozen if the route somehow doesn't change.
        setTimeout(done, 400)
      }),
  )
  void transition.finished.finally(() => {
    if (root.dataset.nav === dir) delete root.dataset.nav
  })
}

/**
 * react-router's useNavigate, with the page slide. `dir` overrides the guess (deeper path = forward).
 * A number (-1) goes back through history, sliding back.
 * `prepare` runs inside the transition, just before the route changes: use it for state that would otherwise
 * redirect on its own first (signing in), so the old page is still the one that slides away.
 */
export function useNavigate() {
  const navigate = useRouterNavigate()
  return useCallback(
    (to: To | number, options?: NavigateOptions & { dir?: Dir; prepare?: () => void }) => {
      const { dir, prepare, ...rest } = options ?? {}
      if (typeof to === 'number') {
        withTransition(dir ?? (to < 0 ? 'back' : 'forward'), () => {
          prepare?.()
          void navigate(to)
        })
        return
      }
      const guess: Dir = depth(pathOf(to)) < depth(window.location.pathname) ? 'back' : 'forward'
      withTransition(dir ?? guess, () => {
        prepare?.()
        void navigate(to, rest)
      })
    },
    [navigate],
  )
}
