import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowRight, Check, ChevronLeft } from '../components/icons'
import { Avatar, BigButton, LuggageTag, RoundButton, TearLine } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { clockTime, muscatNow, relativeDay } from '../lib/dates'
import s from './Chat.module.css'

type Msg = {
  id: number
  kind: 'text' | 'system' | 'handover'
  mine: boolean
  text: string
  at: string
  handoverAt: string | null
  handoverPlace: string | null
  handoverStatus: 'suggested' | 'confirmed' | 'replaced' | null
  canConfirm: boolean
}
type Thread = { id: string; otherName: string; otherAvatarUrl: string | null; itemTitle: string; myRole: 'lost' | 'found'; status: 'Active' | 'Returned' | 'Closed'; messages: Msg[] }

const QUICK = ['chat.quick.where', 'chat.quick.omw', 'chat.quick.late', 'chat.quick.thanks'] as const
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })

/** design/screens/Chat.dc.html + Returned.dc.html. Polls for new messages every few seconds. */
export default function Chat() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [thread, setThread] = useState<Thread | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [planning, setPlanning] = useState(false)
  const [returned, setReturned] = useState(false)
  const lastId = useRef(0)
  const bottom = useRef<HTMLDivElement>(null)

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return
    setThread((th) => {
      if (!th) return th
      const byId = new Map(th.messages.map((m) => [m.id, m]))
      for (const m of incoming) byId.set(m.id, m)
      return { ...th, messages: [...byId.values()].sort((a, b) => a.id - b.id) }
    })
  }, [])

  // Load, then poll for anything newer; tell the server what we've read.
  useEffect(() => {
    let alive = true
    async function load(first: boolean) {
      try {
        const th = await api<Thread>(`/conversations/${id}${first ? '' : `?after=${lastId.current}`}`)
        if (!alive) return
        if (first) setThread(th)
        else {
          merge(th.messages)
          setThread((cur) => (cur ? { ...cur, status: th.status } : cur))
        }
        const newest = th.messages.at(-1)?.id
        if (newest && newest > lastId.current) {
          lastId.current = newest
          void api(`/conversations/${id}/read`, { method: 'POST', body: { lastMessageId: newest } })
        }
      } catch (e) {
        if (first) setError(e instanceof ApiError ? e.message : t('common.error'))
      }
    }
    void load(true)
    const timer = setInterval(() => void load(false), 4000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id, merge])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messages.length])

  async function send(text: string) {
    const body = text.trim()
    if (!body) return
    setError('')
    try {
      const m = await api<Msg>(`/conversations/${id}/messages`, { body: { text: body } })
      setDraft('')
      merge([m])
      lastId.current = Math.max(lastId.current, m.id)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    }
  }

  async function act(path: string, after?: () => void) {
    setError('')
    try {
      const res = await api<Msg | undefined>(path, { method: 'POST' })
      if (res && 'id' in res) merge([res])
      after?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    }
  }

  if (!thread) {
    return (
      <main className={s.page}>
        <div className={s.head}>
          <RoundButton to="/chats" label={t('common.back')} background="var(--ground)">
            <ChevronLeft size={20} />
          </RoundButton>
        </div>
        {error && <p className={s.error}>{error}</p>}
      </main>
    )
  }

  const active = thread.status === 'Active'
  const visible = thread.messages.filter((m) => !(m.kind === 'handover' && m.handoverStatus === 'replaced'))

  return (
    <main className={s.page}>
      <div className={s.head}>
        <header className={s.headRow}>
          <RoundButton to="/chats" label={t('common.back')} background="var(--ground)">
            <ChevronLeft size={20} />
          </RoundButton>
          <Avatar name={thread.otherName} photoUrl={thread.otherAvatarUrl} size={44} background={thread.myRole === 'lost' ? 'var(--sage)' : 'var(--tan)'} />
          <div className={s.who}>
            <span className={s.name}>{thread.otherName}</span>
            <span className={s.role}>{thread.myRole === 'lost' ? t('chat.foundYours') : t('chat.lostIt')}</span>
          </div>
        </header>
        <div className={s.itemRow}>
          <LuggageTag notch={14} hole={10} holeColor="var(--surface)" className={s.itemTag}>
            <span className={s.itemName}>{thread.itemTitle}</span>
            <span className={s.itemStatus}>{thread.status === 'Active' ? 'CHATTING' : thread.status.toUpperCase()}</span>
          </LuggageTag>
          {active && (
            <button type="button" className={s.gotIt} onClick={() => act(`/conversations/${id}/returned`, () => setReturned(true))}>
              <Check size={15} color="var(--paper)" />
              {t('chat.gotItBack')}
            </button>
          )}
        </div>
      </div>

      <div className={s.messages}>
        {visible.map((m) => {
          if (m.kind === 'system')
            return (
              <div key={m.id} className={s.system}>
                <img src="/mascot/reading.png" alt="Zarqa" width={52} />
                <div className={s.systemBubble}>
                  <span className={s.zarqa}>ZARQA</span>
                  <span>{m.text}</span>
                </div>
              </div>
            )
          if (m.kind === 'handover' && m.handoverAt) {
            const [date, time] = m.handoverAt.split('T')
            const dayLabel = relativeDay(date)
            return (
              <div key={m.id} className={s.ticket} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}>
                <span className={s.ticketLabel}>{m.handoverStatus === 'confirmed' ? t('chat.handover.confirmed') : t('chat.handover.suggested')}</span>
                <div className={s.ticketWhen}>
                  <span className={s.ticketTime}>{clockTime(time)}</span>
                  <span className={s.ticketPlace}>
                    {dayLabel} · {m.handoverPlace}
                  </span>
                </div>
                <TearLine inset={16} notch={22} />
                {m.handoverStatus === 'confirmed' ? (
                  <div className={s.confirmed}>
                    <img src="/mascot/wink.png" alt="Zarqa winking" width={34} />
                    {t('chat.handover.seeYou')}
                  </div>
                ) : m.canConfirm && active ? (
                  <div className={s.ticketActions}>
                    <button type="button" className={s.confirmBtn} onClick={() => act(`/handovers/${m.id}/confirm`)}>
                      {t('chat.handover.confirm')}
                    </button>
                    <button type="button" className={s.otherBtn} onClick={() => setPlanning(true)}>
                      {t('chat.handover.another')}
                    </button>
                  </div>
                ) : (
                  <span className={s.waiting}>{t('chat.handover.waiting', { name: thread.otherName })}</span>
                )}
              </div>
            )
          }
          return (
            <div key={m.id} className={m.mine ? s.meWrap : s.themWrap}>
              <div className={m.mine ? s.me : s.them}>{m.text}</div>
              <span className={s.at}>{timeOf(m.at)}</span>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      {active ? (
        <div className={s.composer}>
          {error && <p className={s.error}>{error}</p>}
          {planning ? (
            <HandoverForm
              onCancel={() => setPlanning(false)}
              onSend={async (date, time, place) => {
                setError('')
                try {
                  merge([await api<Msg>(`/conversations/${id}/handover`, { body: { date, time, place } })])
                  setPlanning(false)
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : t('common.error'))
                }
              }}
            />
          ) : (
            <>
              <div className={s.quick}>
                <button type="button" className={`${s.chip} ${s.chipPlan}`} onClick={() => setPlanning(true)}>
                  {t('chat.suggestTime')}
                </button>
                {QUICK.map((k) => (
                  <button key={k} type="button" className={s.chip} onClick={() => send(t(k))}>
                    {t(k)}
                  </button>
                ))}
              </div>
              <form
                className={s.inputRow}
                onSubmit={(e: FormEvent) => {
                  e.preventDefault()
                  void send(draft)
                }}
              >
                <label htmlFor="chat-input" className="visually-hidden">
                  {t('chat.message')}
                </label>
                <input id="chat-input" className={s.input} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)} placeholder={t('chat.placeholder', { name: thread.otherName })} />
                <button type="submit" className={s.send} aria-label={t('chat.send')} disabled={!draft.trim()}>
                  <ArrowRight size={22} color="var(--ink)" />
                </button>
              </form>
              <button
                type="button"
                className={s.notIt}
                onClick={() => {
                  if (window.confirm(t('chat.notItConfirm'))) void act(`/conversations/${id}/not-it`, () => navigate('/chats', { replace: true }))
                }}
              >
                {t('chat.notIt')}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={s.composer}>
          <p className={s.closedNote}>{thread.status === 'Returned' ? t('chat.closedReturned') : t('chat.closedNotIt')}</p>
        </div>
      )}

      {returned && (
        <div role="dialog" aria-label={t('chat.returned.title')} className={s.overlay}>
          <img src="/mascot/phone.png" alt="Zarqa holding up a returned item" className={s.overlayMascot} />
          <span className={s.overlayItem}>{thread.itemTitle}</span>
          <h2 className={s.overlayTitle}>{t('chat.returned.title')}</h2>
          <p className={s.overlayText}>{t('chat.returned.body')}</p>
          <BigButton to="/" label={t('chat.returned.home')} />
          <button type="button" className={s.keep} onClick={() => setReturned(false)}>
            {t('chat.returned.keep')}
          </button>
        </div>
      )}
    </main>
  )
}

/** Suggest a meeting time and place (the design has the ticket, not its composer). */
function HandoverForm({ onSend, onCancel }: { onSend: (date: string, time: string, place: string) => Promise<void>; onCancel: () => void }) {
  const now = muscatNow()
  const [date, setDate] = useState(now.date)
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={s.plan}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        await onSend(date, time, place)
        setBusy(false)
      }}
    >
      <span className={s.ticketLabel}>{t('chat.plan.title')}</span>
      <div className={s.planRow}>
        <input type="date" className={s.planInput} value={date} min={now.date} onChange={(e) => setDate(e.target.value)} aria-label={t('form.date')} required />
        <input type="time" className={s.planInput} value={time} onChange={(e) => setTime(e.target.value)} aria-label={t('form.time')} required />
      </div>
      <input className={s.planInput} value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder={t('chat.plan.place')} aria-label={t('chat.plan.place')} required />
      <div className={s.ticketActions}>
        <button type="submit" className={s.confirmBtn} disabled={busy || !time || !place.trim()}>
          {t('chat.plan.send')}
        </button>
        <button type="button" className={s.otherBtn} onClick={onCancel}>
          {t('chat.plan.cancel')}
        </button>
      </div>
    </form>
  )
}
