import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ConsentPrompt } from '../components/ConsentPrompt'
import { Notice } from '../components/states'
import { BigButton, Wordmark, ZarqaBubble } from '../components/ui'
import s from '../components/states.module.css'
import { t } from '../i18n'
import { api, ApiError, setUnauthorizedHandler } from '../lib/api'
import { clearDraft } from '../lib/draft'
import { clearSignIn } from './signinDraft'
import { disablePushOnThisDevice } from '../lib/push'
import { clearReturnPath, rememberReturnPath, returnPath, SessionContext, signedOutFrom, useSession, type Me } from './session'

// Which account this browser last signed in as: an unfinished report (text and photos, maybe of a card) must
// never be shown to the next person who signs in on the same phone.
const LAST_USER_KEY = 'zarqa.lastUser'
// Sign out was tapped while the logout request couldn't get through: finish it on the next start.
const LOGOUT_PENDING_KEY = 'zarqa.logoutPending'

/** A different account than last time on this browser: its unfinished report must not carry over. */
function noteUser(id: string) {
  let last: string | null = null
  try {
    last = localStorage.getItem(LAST_USER_KEY)
  } catch {
    // Storage blocked: treat it as a change; clearing costs nothing.
  }
  if (last !== id) clearDraft()
  try {
    localStorage.setItem(LAST_USER_KEY, id)
    localStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // Not remembered: the next sign-in clears the draft again, which is the safe side.
  }
}

function logoutPending(): boolean {
  try {
    return localStorage.getItem(LOGOUT_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

/** Tells the server. Stays pending (tried again on the next start) unless the server cleared the cookie. */
async function finishLogout() {
  try {
    await api('/auth/logout', { method: 'POST' })
  } catch (e) {
    // 401: there was no session left to end.
    if (!(e instanceof ApiError) || e.status !== 401) return
  }
  setLogoutPending(false)
}

function setLogoutPending(pending: boolean) {
  try {
    if (pending) localStorage.setItem(LOGOUT_PENDING_KEY, '1')
    else localStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // ignore
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreachable, setUnreachable] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const meRef = useRef<Me | null>(null)
  const pendingLogout = useRef<Promise<void> | null>(null)

  const updateMe = useCallback((next: Me | null) => {
    if (next && next.id !== meRef.current?.id) noteUser(next.id)
    if (next) signedOutFrom(null)
    meRef.current = next
    setMe(next)
    if (next) setSignedOut(false)
  }, [])

  const refresh = useCallback(async () => {
    if (logoutPending()) {
      // Signed out offline last time: the cookie may still be there. Finish the job (once, even when two
      // starts race), and stay signed out on this device either way.
      pendingLogout.current ??= finishLogout().finally(() => {
        pendingLogout.current = null
      })
      await pendingLogout.current
      updateMe(null)
      setUnreachable(false)
      setLoading(false)
      return
    }
    try {
      updateMe(await api<Me>('/me'))
      setUnreachable(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        updateMe(null)
        setUnreachable(false)
      } else if (!meRef.current) {
        // Offline or the server is down and we don't know who this is: say so, don't show sign-in.
        setUnreachable(true)
      }
      // Otherwise keep the session we had: a hiccup isn't a sign-out.
    } finally {
      setLoading(false)
    }
  }, [updateMe])

  // Any 401 in the middle of a session means it ended (expired, or signed out on another device).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!meRef.current) return
      // The next person to sign in on this browser must not find this account's unfinished report.
      clearDraft()
      setSignedOut(true)
      updateMe(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [updateMe])

  /**
   * Every sign-out goes through here. Never fails: the user asked to leave, so this device forgets the account
   * even if the server can't be told yet (it is told on the next start).
   */
  const signOut = useCallback(async () => {
    // Stop this phone showing the account's alerts (chat text, pickup codes), while still signed in to say so.
    await disablePushOnThisDevice().catch(() => undefined)
    // The unfinished report and the sign-in form belong to this account: nothing carries over to the next one.
    clearDraft()
    clearSignIn()
    setLogoutPending(true)
    await finishLogout()
    clearReturnPath()
    signedOutFrom(window.location.pathname + window.location.search)
    updateMe(null)
  }, [updateMe])

  useEffect(() => {
    // Load the session once on mount; state changes only after the request resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  // Couldn't reach Zarqa at start-up: try again when the network or the app comes back, and every 10s.
  useEffect(() => {
    if (!unreachable) return
    const retry = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    const timer = setInterval(retry, 10_000)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
      clearInterval(timer)
    }
  }, [unreachable, refresh])

  const value = useMemo(
    () => ({ me, loading, unreachable, signedOut, setMe: updateMe, refresh, signOut }),
    [me, loading, unreachable, signedOut, updateMe, refresh, signOut],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

/** The wordmark while /me loads; after 5s a hint and Try again (requests give up after 15s). */
function Splash() {
  const { refresh } = useSession()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 5000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className={s.splash} aria-busy="true">
      <span className={s.splashLogo}>
        <Wordmark size={40} />
      </span>
      {slow && (
        <>
          <p className={s.splashHint} role="status">
            {t('session.slow')}
          </p>
          <button type="button" className={s.splashRetry} onClick={() => void refresh()}>
            {t('common.retry')}
          </button>
        </>
      )}
    </div>
  )
}

/** /me failed (offline, server down): keep the URL and offer Try again instead of the sign-in screen. */
function Unreachable() {
  const { refresh } = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <main className={s.page}>
      <h1 className={s.title}>{t('session.unreachable.title')}</h1>
      <div className={s.bottom} role="alert">
        <ZarqaBubble mascot="question" alt="" width={70} quiet motion="sway">
          {t('session.unreachable.zarqa')}
        </ZarqaBubble>
        <BigButton
          label={t('common.retry')}
          busy={busy}
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void refresh().finally(() => setBusy(false))
          }}
        />
      </div>
    </main>
  )
}

/** Signed-in users only; a user without a first name goes to /welcome first. Accounts without recorded consent get a one-time prompt on top. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { me, loading, unreachable } = useSession()
  const { pathname, search } = useLocation()
  // Reached the page they were sent to after signing in: forget it (Welcome still needs it, so not there).
  useEffect(() => {
    if (me && pathname !== '/welcome') clearReturnPath()
  }, [me, pathname])
  if (loading) return <Splash />
  if (!me && unreachable) return <Unreachable />
  if (!me) {
    rememberReturnPath(pathname + search)
    return <Navigate to="/signin" replace />
  }
  if (!me.firstName && pathname !== '/welcome') return <Navigate to="/welcome" replace />
  if (me.needsConsent)
    return (
      <>
        {children}
        <ConsentPrompt />
      </>
    )
  return children
}

/** Signed-out users only (the sign-in screen). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { me, loading, unreachable, signedOut } = useSession()
  if (loading) return <Splash />
  if (me) return <Navigate to={returnPath() ?? '/'} replace />
  if (unreachable) return <Unreachable />
  return (
    <>
      {signedOut && <Notice>{t('session.signedOut')}</Notice>}
      {children}
    </>
  )
}
