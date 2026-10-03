import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Avatar, BackHeader, ZarqaBubble } from '../components/ui'
import { t } from '../i18n'
import { api } from '../lib/api'
import { campusDate, relativeDay } from '../lib/dates'
import s from './Chats.module.css'

export type ConversationItem = {
  id: string
  otherName: string
  otherAvatarUrl: string | null
  itemTitle: string
  myRole: 'lost' | 'found'
  status: 'Active' | 'Returned' | 'Closed'
  lastMessage: string | null
  lastAt: string
  unread: number
}

function stamp(iso: string) {
  const day = campusDate(iso)
  return relativeDay(day) === 'Today'
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })
    : relativeDay(day)
}

/** design/screens/Chats.dc.html */
export default function Chats() {
  const [chats, setChats] = useState<ConversationItem[] | null>(null)

  useEffect(() => {
    const load = () => api<ConversationItem[]>('/conversations').then(setChats).catch(() => setChats((c) => c ?? []))
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])

  const unread = (chats ?? []).reduce((n, c) => n + c.unread, 0)

  return (
    <main className={s.page}>
      <BackHeader label={t('chats.unread', { n: unread })} />
      <h1 className={s.title}>
        {t('chats.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('chats.h2')}</span>
      </h1>

      <div className={s.list}>
        {(chats ?? []).map((c) => {
          const closed = c.status !== 'Active'
          const line = `${c.itemTitle} · ${c.status === 'Returned' ? t('chats.returned') : c.status === 'Closed' ? t('chats.closed') : c.myRole === 'lost' ? t('chats.youLost') : t('chats.youFound')}`
          return (
            <Link key={c.id} to={`/chats/${c.id}`} className={s.row} style={closed ? { opacity: 0.6 } : undefined}>
              <Avatar name={c.otherName} photoUrl={c.otherAvatarUrl} size={52} background={closed ? 'var(--slate)' : c.myRole === 'lost' ? 'var(--sage)' : 'var(--tan)'} />
              <span className={s.text}>
                <span className={s.top}>
                  <span className={s.name}>{c.otherName}</span>
                  <span className={s.time}>{stamp(c.lastAt)}</span>
                </span>
                <span className={s.item}>{line}</span>
                <span className={s.bottom}>
                  <span className={s.last} style={c.unread ? { fontWeight: 700, color: 'var(--paper)' } : undefined}>
                    {c.lastMessage}
                  </span>
                  {c.unread > 0 && <span className={s.badge}>{c.unread}</span>}
                </span>
              </span>
            </Link>
          )
        })}
      </div>

      {chats && chats.length === 0 && (
        <div className={s.empty}>
          <img src="/mascot/empty-sad.webp" alt="" className={s.emptyArt} />
          <p className={s.emptyText}>{t('chats.empty')}</p>
        </div>
      )}

      {chats && chats.length > 0 && (
        <div className={s.tip}>
          <ZarqaBubble mascot="reading" alt="Zarqa" width={70} quiet>
            {t('chats.tip')}
          </ZarqaBubble>
        </div>
      )}
    </main>
  )
}
