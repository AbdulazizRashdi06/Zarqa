import { createContext, useContext } from 'react'

export type Me = {
  id: string
  email: string
  firstName: string | null
  /** Guessed from the email until the user picks a name. */
  suggestedFirstName: string | null
  showFirstName: boolean
  matchAlerts: boolean
  locale: string
  avatarUrl: string | null
  isAdmin: boolean
  /** RSA desk staff (admins too). */
  isRsa: boolean
  /** Hasn't agreed to the current Terms/Privacy yet (PDPL consent): the app shows /consent first. */
  needsConsent?: boolean
}

export type Session = {
  me: Me | null
  loading: boolean
  /** /me failed for a reason other than 401 (offline, server down) and we don't know who this is yet. */
  unreachable: boolean
  /** The session ended in the middle of use (a 401): the sign-in screen says so. */
  signedOut: boolean
  setMe: (me: Me | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

// Where a signed-out visitor was heading (a push or email link), so sign-in can take them there.
const RETURN_KEY = 'zarqa.returnTo'

export function rememberReturnPath(path: string) {
  try {
    if (path !== '/' && path !== '/welcome' && path.startsWith('/') && !path.startsWith('//')) sessionStorage.setItem(RETURN_KEY, path)
  } catch {
    // Private mode: they land on Home instead.
  }
}

/** The page to open after signing in, if a signed-out visitor was sent to /signin from one. */
export function returnPath(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_KEY)
    return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/signin') ? path : null
  } catch {
    return null
  }
}

export function clearReturnPath() {
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // nothing to clear
  }
}
