import { useCallback, useEffect, useState } from 'react'
import { Link } from '../lib/nav'
import { Avatar, BackHeader, ZarqaBubble } from '../components/ui'
import { LoadError, LoadingState, UserText } from '../components/states'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, relativeDay } from '../lib/dates'
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

/** Today: "9:32 PM" (the same 12-hour clock as handover times); otherwise "Yesterday" or "24 Sep". */
function stamp(iso: string) {
  const day = campusDate(iso)
  return relativeDay(day) === 'Today'
    ? clockTime(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Muscat' }).format(new Date(iso)))
    : relativeDay(day)
}

/** design/screens/Chats.dc.html */
export default function Chats() {
  const [chats, setChats] = useState<ConversationItem[] | null>(null)
  const [failed, setFailed] = useState<{ message?: string } | null>(null)
  const [retrying, setRetrying] = useState(false)

  // A failed refresh keeps the list it already has; only a first load that fails shows the error.
  const load = useCallback(
    () =>
      api<ConversationItem[]>('/conversations')
        .then((list) => {
          setChats(list ?? [])
          setFailed(null)
        })
        .catch((e) => setFailed({ message: e instanceof ApiError && e.status !== 0 ? e.message : undefined })),
    [],
  )

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 15000)
    return () => clearInterval(timer)
  }, [load])

  const unread = (chats ?? []).reduce((n, c) => n + c.unread, 0)

  return (
    <main className={s.page}>
      <BackHeader label={unread > 0 ? t('chats.unread', { n: unread }) : undefined} />
      <h1 className={s.title}>
        {t('chats.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('chats.h2')}</span>
      </h1>

      {!chats && failed && (
        <LoadError
          message={failed.message}
          busy={retrying}
          onRetry={() => {
            setRetrying(true)
            void load().finally(() => setRetrying(false))
          }}
        />
      )}
      {!chats && !failed && <LoadingState />}

      <div className={s.list}>
        {(chats ?? []).map((c, i) => {
          const closed = c.status === 'Closed'
          const returned = c.status === 'Returned'
          const state = returned ? t('chats.returned') : closed ? t('chats.closed') : c.myRole === 'lost' ? t('chats.youLost') : t('chats.youFound')
          return (
            <Link key={c.id} to={`/chats/${c.id}`} className={`${s.row} ${closed ? s.closed : ''}`} data-enter style={{ '--i': Math.min(i, 8) }}>
              <Avatar name={c.otherName} photoUrl={c.otherAvatarUrl} size={52} background={closed ? 'var(--slate)' : returned ? 'var(--sage)' : c.myRole === 'lost' ? 'var(--sage)' : 'var(--tan)'} />
              <span className={s.text}>
                <span className={s.top}>
                  <UserText className={s.name}>{c.otherName}</UserText>
                  <span className={s.time}>{stamp(c.lastAt)}</span>
                </span>
                {/* Only the title shortens; the role or status after it always shows. */}
                <span className={s.item}>
                  <UserText className={s.itemTitle}>{c.itemTitle}</UserText>
                  <span className={s.itemState}>· {state}</span>
                </span>
                <span className={s.bottom}>
                  <UserText className={`${s.last} ${c.unread ? s.lastUnread : ''}`}>{c.lastMessage}</UserText>
                  {/* Keyed by its number, so a new message makes the badge pop again. */}
                  {c.unread > 0 && (
                    <span key={c.unread} className={s.badge} data-enter="pop">
                      <span aria-hidden="true">{c.unread}</span>
                      <span className="visually-hidden">{t('chats.unreadCount', { n: c.unread })}</span>
                    </span>
                  )}
                </span>
              </span>
            </Link>
          )
        })}
      </div>

      {chats && chats.length === 0 && (
        <div className={s.empty}>
          <img src="/mascot/empty-sad.webp" alt="" className={`${s.emptyArt} ${zarqaMotion('sway')}`} />
          <p className={s.emptyText} data-enter style={{ '--delay': '200ms' }}>{t('chats.empty')}</p>
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
