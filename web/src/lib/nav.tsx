import { useEffect, useLayoutEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigationType, type LinkProps } from 'react-router'
import { t, type StringKey } from '../i18n'
import { recordHistory } from './back'
import { applyPendingUpdate } from './pwa'
import { claimTapNavigation, settleRoute, useNavigate, type Dir } from './transition'

/** react-router's Link, with the page slide (lib/transition.ts). Modified clicks (new tab and so on) are left to the browser. */
export function Link({ dir, onClick, to, replace, state, ...rest }: LinkProps & { dir?: Dir }) {
  const navigate = useNavigate()
  return (
    <RouterLink
      to={to}
      replace={replace}
      state={state}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return
        e.preventDefault()
        if (!claimTapNavigation()) return
        // Tapping the page you are already on doesn't stack another copy of it.
        const same = typeof to === 'string' && to === window.location.pathname + window.location.search
        navigate(to, { replace: replace ?? same, state, dir })
      }}
    />
  )
}

/** document.title for each route: "My reports · Zarqa". Screens never set it themselves. */
function routeTitle(pathname: string): string {
  const key = ((): StringKey => {
    if (pathname === '/') return 'route.home'
    if (pathname === '/signin') return 'route.signin'
    if (pathname === '/welcome') return 'route.welcome'
    if (pathname === '/reports') return 'route.reports'
    if (pathname.startsWith('/reports/')) return 'route.report'
    if (pathname.startsWith('/matches/')) return 'route.match'
    if (pathname === '/chats') return 'route.chats'
    if (pathname.startsWith('/chats/')) return 'route.chat'
    if (pathname === '/profile') return 'profile.title'
    if (pathname === '/admin') return 'route.admin'
    if (pathname === '/rsa') return 'rsa.title'
    if (pathname === '/terms') return 'info.terms.title'
    if (pathname === '/privacy') return 'info.privacy.title'
    if (pathname === '/help') return 'info.help.title'
    if (pathname === '/tips') return 'info.tips.title'
    return 'notFound.title'
  })()
  return t(key)
}

/** Keeps taps off a page for its first moments, so a double tap can't land on the new page. */
const SETTLE_MS = 250

/**
 * Mounted once inside the router. On every page change it: tells the transition the new page is in, starts
 * new pages at the top, sets the title, moves focus to the new page's h1 (or leaves it where the page put it),
 * and announces the page name to screen readers. It also routes notification taps (public/push-sw.js).
 */
export function RouteSettled() {
  const { key, pathname } = useLocation()
  const type = useNavigationType()
  const navigate = useNavigate()
  const [announcement, setAnnouncement] = useState('')

  useLayoutEffect(() => {
    recordHistory(type, pathname)
    if (type !== 'POP') window.scrollTo(0, 0)
    settleRoute()
  }, [key, type, pathname])

  // The first render is the page the user opened: nothing to announce or move.
  const [firstKey] = useState(key)
  useEffect(() => {
    const title = routeTitle(pathname)
    document.title = t('common.pageTitle', { page: title })
    if (key === firstKey) return
    // A new app version that downloaded in the background goes live between pages, never mid-form.
    applyPendingUpdate()
    // Announce through a polite live region, a beat after the new page is in.
    const announce = setTimeout(() => setAnnouncement(title), 60)
    const root = document.documentElement
    let settle: ReturnType<typeof setTimeout> | undefined
    if (type !== 'POP') {
      root.dataset.settling = ''
      settle = setTimeout(() => delete root.dataset.settling, SETTLE_MS)
    }
    // After the screen's own autofocus (an input) has run: only take focus if nothing has it.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body && document.contains(active)) return
      const h1 = document.querySelector<HTMLElement>('#root h1')
      if (!h1) return
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
      h1.dataset.routeFocus = ''
      h1.focus({ preventScroll: true })
    })
    return () => {
      clearTimeout(announce)
      if (settle) clearTimeout(settle)
      delete root.dataset.settling
      cancelAnimationFrame(frame)
    }
  }, [key, pathname, type, firstKey])

  // Notification taps while the app is open: the service worker posts the URL instead of reloading the app.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null
      if (data?.type !== 'navigate' || typeof data.url !== 'string') return
      const url = new URL(data.url, window.location.origin)
      if (url.origin !== window.location.origin) return
      navigate(url.pathname + url.search, { dir: 'forward' })
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  )
}
