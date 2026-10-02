import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Wordmark } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { SessionContext, useSession, type Me } from './session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'))
    } catch (e) {
      // 401: signed out. Anything else (offline, server hiccup): keep what we had.
      if (e instanceof ApiError && e.status === 401) setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setMe(null)
  }, [])

  useEffect(() => {
    // Load the session once on mount; state changes only after the request resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  const value = useMemo(() => ({ me, loading, setMe, refresh, signOut }), [me, loading, refresh, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

function Splash() {
  return (
    <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-busy="true">
      <Wordmark size={40} />
    </div>
  )
}

/** Signed-in users only; a user without a first name goes to /welcome first. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { me, loading } = useSession()
  const { pathname } = useLocation()
  if (loading) return <Splash />
  if (!me) return <Navigate to="/signin" replace />
  if (!me.firstName && pathname !== '/welcome') return <Navigate to="/welcome" replace />
  return children
}

/** Signed-out users only (the sign-in screen). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { me, loading } = useSession()
  if (loading) return <Splash />
  if (me) return <Navigate to="/" replace />
  return children
}
