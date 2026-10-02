export type Pill = 'Searching' | 'Possible match' | 'Chatting' | 'Returned' | 'Closed'

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
}

export type HomeSummary = { active: number; matchesWaiting: number; unreadChats: number; postsLeft: number }
