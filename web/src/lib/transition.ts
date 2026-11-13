import { useCallback } from 'react'
import { useNavigate as useRouterNavigate, type NavigateOptions, type To } from 'react-router'

/** Which way the page slides: deeper into the app, or back towards Home. */
export type Dir = 'forward' | 'back'

// Resolves the running view transition once the new route is on screen.
let routeRendered: (() => void) | null = null

/** Called by <RouteSettled> (lib/nav.tsx) when a new route has rendered. */
export function settleRoute() {
  routeRendered?.()
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
 * `prepare` runs inside the transition, just before the route changes: use it for state that would otherwise
 * redirect on its own first (signing in), so the old page is still the one that slides away.
 */
export function useNavigate() {
  const navigate = useRouterNavigate()
  return useCallback(
    (to: To, options?: NavigateOptions & { dir?: Dir; prepare?: () => void }) => {
      const { dir, prepare, ...rest } = options ?? {}
      const guess: Dir = depth(pathOf(to)) < depth(window.location.pathname) ? 'back' : 'forward'
      withTransition(dir ?? guess, () => {
        prepare?.()
        void navigate(to, rest)
      })
    },
    [navigate],
  )
}
