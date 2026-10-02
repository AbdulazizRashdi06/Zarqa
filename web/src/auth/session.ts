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
}

export type Session = {
  me: Me | null
  loading: boolean
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
