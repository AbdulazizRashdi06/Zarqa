import type { Report } from './types'

/** Where a report card leads: the waiting match, the chat, or the report itself. */
export function reportHref(r: Report) {
  if (r.pill === 'Possible match' && r.matchId) return `/matches/${r.matchId}`
  if (r.conversationId && (r.pill === 'Chatting' || r.pill === 'Returned')) return `/chats/${r.conversationId}`
  return `/reports/${r.id}`
}
