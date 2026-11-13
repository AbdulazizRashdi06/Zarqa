import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ConsentPrompt } from '../components/ConsentPrompt'
import { Notice } from '../components/states'
import { BigButton, Wordmark, ZarqaBubble } from '../components/ui'
import s from '../components/states.module.css'
import { t } from '../i18n'
import { api, ApiError, setUnauthorizedHandler } from '../lib/api'
import { clearDraft } from '../lib/draft'
import { disablePushOnThisDevice } from '../lib/push'
import { clearReturnPath, rememberReturnPath, returnPath, SessionContext, useSession, type Me } from './session'

// Which account this browser last signed in as: an unfinished report (text and photos, maybe of a card) must
// never be shown to the next person who signs in on the same phone.
const LAST_USER_KEY = 'zarqa.lastUser'
// Sign out was tapped while the logout request couldn't get through: finish it on the next start.
const LOGOUT_PENDING_KEY = 'zarqa.logoutPending'

function noteUser(id: string) {
  try {
    if (localStorage.getItem(LAST_USER_KEY) !== id) {
      clearDraft()
      localStorage.setItem(LAST_USER_KEY, id)
    }
    localStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch {
    // Storage blocked: the draft lives in the same storage, so there is nothing to protect.
  }
}

function logoutPending(): boolean {
  try {
    return localStorage.getItem(LOGOUT_PENDING_KEY) === '1'
  } catch {
    return false
  }
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

  const updateMe = useCallback((next: Me | null) => {
    meRef.current = next
    if (next) noteUser(next.id)
    setMe(next)
    if (next) setSignedOut(false)
  }, [])

  const refresh = useCallback(async () => {
    if (logoutPending()) {
      // Signed out offline last time: the cookie may still be there. Finish the job, and stay signed out
      // on this device either way.
      try {
        await api('/auth/logout', { method: 'POST' })
        setLogoutPending(false)
      } catch {
        // Tried again next start.
      }
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
      setSignedOut(true)
      updateMe(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [updateMe])

  /** Never fails: the user asked to leave, so this device forgets the account even if the server can't be told yet. */
  const signOut = useCallback(async () => {
    // Stop this phone showing the account's alerts (chat text, pickup codes) after it signs out.
    await disablePushOnThisDevice().catch(() => undefined)
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch {
      setLogoutPending(true)
    }
    clearDraft()
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
