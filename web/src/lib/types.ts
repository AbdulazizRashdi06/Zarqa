export type Pill = 'Searching' | 'Possible match' | 'Chatting' | 'Returned' | 'Closed' | 'Bring to RSA' | 'At the RSA' | 'Ready to collect' | 'Claimed at RSA'

export type Report = {
  id: string
  kind: 'lost' | 'found'
  title: string
  category: string
  categoryKey: string | null
  description: string
  locationName: string | null
  locationText: string
  eventDate: string | null
  eventTime: string | null
  status: string
  pill: Pill
  isSensitive: boolean
  photoIds: string[]
  matchId: string | null
  conversationId: string | null
  createdAt: string
  /** Found item handed to the RSA desk; dropCode is shown there (only to the finder). */
  dropAtRsa: boolean
  dropCode: string | null
  rsaReceived: boolean
  /** Lost report claimed at the RSA desk: the match holding the pickup code. */
  pickupMatchId: string | null
}

export type HomeSummary = { active: number; matchesWaiting: number; unreadChats: number; postsLeft: number }
