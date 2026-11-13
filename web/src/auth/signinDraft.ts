// The sign-in form survives a reload, a trip to Terms/Privacy and the phone discarding the tab while the user
// fetches the code from their mail app. sessionStorage only: it's gone when the tab is, and it never holds a code.
// An abandoned form expires (the code's lifetime after it was last touched), so the address and the consent tick
// of someone who walked away from a shared computer never greet the next person.

type SignInDraft = {
  email?: string
  /** The consent box was ticked. */
  ticked?: boolean
  /** Where the last code went, and when (ms): the code step comes back while that code can still work. */
  sentTo?: string
  sentAt?: number
  /** Last change (ms): the whole draft is forgotten once it is older than a code can live. */
  savedAt?: number
}

const KEY = 'zarqa.signin'
// Where the tick used to live on its own: cleared with the draft so an old one can never come back.
const OLD_TICK_KEY = 'zarqa.consentTick'
/** Codes live 10 minutes on the server (LoginCodes.Lifetime). */
const CODE_LIFETIME_MS = 10 * 60 * 1000

export function loadSignIn(): SignInDraft {
  try {
    const raw = sessionStorage.getItem(KEY)
    const draft = raw ? (JSON.parse(raw) as SignInDraft) : null
    if (draft && typeof draft.savedAt === 'number' && Date.now() - draft.savedAt < CODE_LIFETIME_MS) return draft
    if (raw) clearSignIn()
    return {}
  } catch {
    return {}
  }
}

export function saveSignIn(patch: Omit<SignInDraft, 'savedAt'>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...loadSignIn(), ...patch, savedAt: Date.now() }))
  } catch {
    // Private mode or full storage: the form just isn't kept.
  }
}

/** The address the last code went to, while that code can still work. */
export function liveCodeAddress(): string | null {
  const { sentTo, sentAt } = loadSignIn()
  return sentTo && typeof sentAt === 'number' && Date.now() - sentAt < CODE_LIFETIME_MS ? sentTo : null
}

/** The consent box, kept ticked while the user reads Terms or Privacy and comes back. */
export function loadTick(): boolean {
  return loadSignIn().ticked === true
}

export function saveTick(ticked: boolean) {
  saveSignIn({ ticked })
}

/** Signed in (or consent recorded): nothing of the form is needed any more. */
export function clearSignIn() {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(OLD_TICK_KEY)
  } catch {
    // nothing to clear
  }
}
