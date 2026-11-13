import type { Report } from './types'

/**
 * What the My Reports screen last showed, kept in memory only (gone on reload, never stored).
 * It lets the list paint at once when you come back from a report (`openedId`), which is also what lets that
 * report's ticket shrink back into its card (motion.css, report-ticket). From anywhere else the list loads fresh.
 * Tied to the signed-in user, so it can't leak across accounts.
 */
export const reportsCache: { userId: string | null; reports: Report[] | null; openedId: string | null } = {
  userId: null,
  reports: null,
  openedId: null,
}

/**
 * Forget one-shot location state ("Posted!", "Closed.") on the current history entry, so Back, Forward or a reload
 * don't show it again. react-router keeps it in history.state.usr; replacing it there changes nothing on screen.
 */
export function clearHistoryState() {
  try {
    const state = window.history.state as { usr?: unknown } | null
    if (state && state.usr != null) window.history.replaceState({ ...state, usr: null }, '')
  } catch {
    // Not fatal: the message would just show again after a reload.
  }
}
