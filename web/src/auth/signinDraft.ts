// The sign-in form survives a reload, a trip to Terms/Privacy and the phone discarding the tab while the user
// fetches the code from their mail app. sessionStorage only: it's gone when the tab is, and it never holds a code.

type SignInDraft = {
  email?: string
  /** Where the last code went, and when (ms): the code step comes back while that code can still work. */
  sentTo?: string
  sentAt?: number
}

const KEY = 'zarqa.signin'
const TICK_KEY = 'zarqa.consentTick'
/** Codes live 10 minutes on the server (LoginCodes.Lifetime). */
const CODE_LIFETIME_MS = 10 * 60 * 1000

export function loadSignIn(): SignInDraft {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SignInDraft) : {}
  } catch {
    return {}
  }
}

export function saveSignIn(patch: SignInDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...loadSignIn(), ...patch }))
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
  try {
    return sessionStorage.getItem(TICK_KEY) === '1'
  } catch {
    return false
  }
}

export function saveTick(ticked: boolean) {
  try {
    if (ticked) sessionStorage.setItem(TICK_KEY, '1')
    else sessionStorage.removeItem(TICK_KEY)
  } catch {
    // not kept
  }
}

/** Signed in (or consent recorded): nothing of the form is needed any more. */
export function clearSignIn() {
  try {
    sessionStorage.removeItem(KEY)
    sessionStorage.removeItem(TICK_KEY)
  } catch {
    // nothing to clear
  }
}
