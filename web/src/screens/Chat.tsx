import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { useParams } from 'react-router'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { useBack } from '../lib/back'
import { ArrowRight, Check, ChevronLeft, ChevronRight } from '../components/icons'
import { CoinBurst } from '../components/CoinBurst'
import { Avatar, BigButton, LuggageTag, RoundButton, TearLine, ZarqaBubble } from '../components/ui'
import { ConfirmSheet, InlineError, LoadError, LoadingState, UserText } from '../components/states'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, muscatNow, relativeDay } from '../lib/dates'
import s from './Chat.module.css'

type Msg = {
  id: number
  kind: 'text' | 'system' | 'handover' | 'return'
  mine: boolean
  text: string
  at: string
  handoverAt: string | null
  handoverPlace: string | null
  handoverStatus: 'suggested' | 'confirmed' | 'replaced' | null
  canConfirm: boolean
}
type Thread = {
  id: string
  otherName: string
  otherAvatarUrl: string | null
  itemTitle: string
  myRole: 'lost' | 'found'
  status: 'Active' | 'Returned' | 'Closed'
  messages: Msg[]
  matchId?: string
  myReportId?: string
}
/** An action's error; `network` ones clear themselves once a poll gets through again. */
type Err = { text: string; network: boolean } | null

const QUICK = ['chat.quick.where', 'chat.quick.omw', 'chat.quick.late', 'chat.quick.thanks'] as const
const MAX = 2000
const POLL_MS = 4000

const errOf = (e: unknown): Err =>
  e instanceof ApiError ? { text: e.message, network: e.status === 0 } : { text: t('common.error'), network: false }
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** "9:32 PM" in campus time: the same 12-hour clock as the handover tickets. */
const timeOf = (iso: string) =>
  clockTime(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Muscat' }).format(new Date(iso)))

// The typed message survives a reload (or Android's pull-to-refresh), per chat, for this tab only.
const draftKey = (id: string) => `zarqa.chatDraft.${id}`
function readDraft(id: string) {
  try {
    return sessionStorage.getItem(draftKey(id)) ?? ''
  } catch {
    return ''
  }
}
function saveDraft(id: string, text: string) {
  try {
    if (text) sessionStorage.setItem(draftKey(id), text)
    else sessionStorage.removeItem(draftKey(id))
  } catch {
    /* private mode: the draft just isn't kept */
  }
}

/** Every chat gets its own state (draft, scroll, celebration), even when one chat links to another. */
export default function ChatRoute() {
  const { id = '' } = useParams()
  return <Chat key={id} id={id} />
}

/** design/screens/Chat.dc.html + Returned.dc.html. Polls for new messages every few seconds. */
function Chat({ id }: { id: string }) {
  const navigate = useNavigate()
  const back = useBack()
  const [thread, setThread] = useState<Thread | null>(null)
  const [loadError, setLoadError] = useState<{ message?: string } | null>(null)
  const [gone, setGone] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState(() => readDraft(id))
  const [error, setError] = useState<Err>(null)
  const [offline, setOffline] = useState(false)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState('')
  const [typing, setTyping] = useState(false)
  const [returned, setReturned] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [askNotIt, setAskNotIt] = useState(false)
  const [notItBusy, setNotItBusy] = useState(false)
  const [notItError, setNotItError] = useState('')
  const [newBelow, setNewBelow] = useState(false)
  const [pendingHidden, setPendingHidden] = useState(false)
  // Newest message id when the chat opened: only what arrives after that animates in.
  const [openedAt, setOpenedAt] = useState<number | null>(null)
  const lastId = useRef(0)
  const status = useRef<Thread['status'] | null>(null)
  const celebrated = useRef(false)
  const scrolled = useRef(false)
  const atBottom = useRef(true)
  const sendingRef = useRef(false)
  const busyRef = useRef(false)
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const planChip = useRef<HTMLButtonElement>(null)
  const pendingTicket = useRef<HTMLDivElement>(null)

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return
    setThread((th) => {
      if (!th) return th
      const byId = new Map(th.messages.map((m) => [m.id, m]))
      // Every poll re-sends the tickets; only re-render when something really changed.
      if (incoming.every((m) => JSON.stringify(byId.get(m.id)) === JSON.stringify(m))) return th
      for (const m of incoming) byId.set(m.id, m)
      return { ...th, messages: [...byId.values()].sort((a, b) => a.id - b.id) }
    })
  }, [])

  const celebrate = useCallback(() => {
    if (celebrated.current) return
    celebrated.current = true
    setReturned(true)
  }, [])

  // Load, then poll for anything newer (the server also re-sends every ticket, so a confirm or withdraw by the
  // other person shows up); tell the server what we've read. Only polls move `lastId`, never our own sends, so a
  // message that arrives just before we send still comes in with the next poll.
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setInterval> | undefined
    let fails = 0
    // One request at a time: on slow Wi-Fi a poll can outlast the interval.
    let inFlight = false
    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }
    async function load(first: boolean): Promise<boolean> {
      if (inFlight) return false
      inFlight = true
      try {
        const th = await api<Thread>(`/conversations/${id}${first ? '' : `?after=${lastId.current}`}`)
        if (!alive) return false
        const messages = th.messages ?? []
        fails = 0
        setOffline(false)
        setError((e) => (e?.network ? null : e))
        if (first) {
          setThread({ ...th, messages })
          setOpenedAt(messages.at(-1)?.id ?? 0)
        } else {
          merge(messages)
          // The other person confirmed our "it's back": celebrate on this side too, once.
          if (status.current === 'Active' && th.status === 'Returned') celebrate()
          setThread((cur) => (cur && cur.status !== th.status ? { ...cur, status: th.status } : cur))
        }
        status.current = th.status
        const newest = messages.reduce((n, m) => Math.max(n, m.id), 0)
        if (newest > lastId.current) {
          lastId.current = newest
          void api(`/conversations/${id}/read`, { method: 'POST', body: { lastMessageId: newest } }).catch(() => {})
        }
        // A closed chat never changes again: stop asking.
        if (th.status !== 'Active') stop()
        return th.status === 'Active'
      } catch (e) {
        if (!alive) return false
        if (e instanceof ApiError && e.status === 404) {
          // Gone (the other person deleted their account): say so instead of "Reconnecting…" forever.
          stop()
          setThread(null)
          setGone(true)
        } else if (first) setLoadError({ message: e instanceof ApiError && e.status !== 0 ? e.message : undefined })
        else if (++fails >= 2) setOffline(true)
        return false
      } finally {
        inFlight = false
      }
    }
    void load(true).then((ok) => {
      if (ok && alive) timer = setInterval(() => void load(false), POLL_MS)
    })
    return () => {
      alive = false
      stop()
    }
  }, [id, merge, celebrate, attempt])

  useEffect(() => saveDraft(id, draft), [id, draft])

  // The message box grows with the text, up to about four lines.
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 116)}px`
  }, [draft, planning, thread?.status])

  const messageCount = thread?.messages.length ?? 0
  const lastMine = thread?.messages.at(-1)?.mine ?? false
  useEffect(() => {
    const el = log.current
    if (!messageCount || !el) return
    // Jump to the end when the chat opens. Later, follow new messages only when you're already at the bottom
    // (or sent it yourself); while you read older ones, a "New messages" pill waits instead.
    if (!scrolled.current || atBottom.current || lastMine) {
      el.scrollTo({ top: el.scrollHeight, behavior: scrolled.current && !reduced() ? 'smooth' : 'auto' })
      atBottom.current = true
      setNewBelow(false)
    } else setNewBelow(true)
    scrolled.current = true
  }, [messageCount, lastMine])

  // Whether the ticket waiting for my answer is scrolled out of sight (then the composer points to it).
  const pending = thread ? [...thread.messages].reverse().find((m) => m.canConfirm && m.handoverStatus === 'suggested' && (m.kind === 'handover' || m.kind === 'return')) : undefined
  const pendingId = pending?.id
  useEffect(() => {
    const el = pendingTicket.current
    const root = log.current
    if (!el || !root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setPendingHidden(!e.isIntersecting), { root, threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [pendingId])

  /** After a button that removed itself, put focus somewhere sensible instead of the page body. */
  function refocus(target?: RefObject<HTMLElement | null>) {
    requestAnimationFrame(() => {
      if (target?.current) target.current.focus()
      else if (document.activeElement === document.body || !document.activeElement) log.current?.focus({ preventScroll: true })
    })
  }

  async function send(text: string, fromDraft: boolean) {
    const body = text.trim()
    if (!body || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    if (fromDraft) setDraft('')
    try {
      merge([await api<Msg>(`/conversations/${id}/messages`, { body: { text: body } })])
    } catch (e) {
      setError(errOf(e))
      if (fromDraft) setDraft((d) => d || text)
    } finally {
      sendingRef.current = false
      setSending(false)
      // A disabled Send button drops keyboard focus to the page; put it back in the message box.
      if (fromDraft)
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) input.current?.focus({ preventScroll: true })
        })
    }
  }

  async function act(key: string, path: string, after?: () => void) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(key)
    setError(null)
    try {
      const res = await api<Msg | undefined>(path, { method: 'POST' })
      if (res && 'id' in res) merge([res])
      after?.()
    } catch (e) {
      setError(errOf(e))
    } finally {
      busyRef.current = false
      setBusy(null)
      refocus()
    }
  }

  async function closeAsNotIt() {
    setNotItBusy(true)
    setNotItError('')
    try {
      await api(`/conversations/${id}/not-it`, { method: 'POST' })
      setAskNotIt(false)
      navigate('/chats', { replace: true })
    } catch (e) {
      setNotItError(errOf(e)?.text ?? '')
    } finally {
      setNotItBusy(false)
    }
  }

  const backButton = (
    <RoundButton onClick={() => back('/chats')} label={t('common.back')} background="var(--ground)">
      <ChevronLeft size={20} />
    </RoundButton>
  )

  if (!thread) {
    return (
      <main className={s.page}>
        <div className={s.head}>
          <div className={s.headRow}>{backButton}</div>
        </div>
        <h1 className="visually-hidden">{t('chat.title')}</h1>
        <div className={s.stateBody}>
          {gone ? (
            <>
              <ZarqaBubble mascot="question" alt="" width={70} quiet>
                {t('chat.gone')}
              </ZarqaBubble>
              <BigButton to="/reports" label={t('chat.toReports')} />
            </>
          ) : loadError ? (
            <LoadError
              message={loadError.message}
              onRetry={() => {
                setLoadError(null)
                setAttempt((a) => a + 1)
              }}
            />
          ) : (
            <LoadingState />
          )}
        </div>
      </main>
    )
  }

  const active = thread.status === 'Active'
  const name = thread.otherName
  // Replaced suggestions and withdrawn or declined return asks are gone; a system line says what happened.
  const visible = thread.messages.filter((m) => m.handoverStatus !== 'replaced')
  const returnPending = thread.messages.some((m) => m.kind === 'return' && m.handoverStatus === 'suggested')
  const handoverSet = thread.messages.some((m) => m.kind === 'handover' && m.handoverStatus === 'confirmed')
  const awaitingMe = thread.messages.some((m) => m.kind === 'handover' && m.handoverStatus === 'suggested' && m.canConfirm)
  const fresh = (m: Msg) => (openedAt !== null && m.id > openedAt ? s.fresh : '')
  const who = (m: Msg) => (m.kind === 'system' ? t('chat.zarqa') : m.mine ? t('chat.you') : name)
  const now = muscatNow()
  const statusText = active ? t('chat.status.active') : thread.status === 'Returned' ? t('chat.status.returned') : t('chat.status.closed')
  // The owner reopens the match (the finder's photo and words); the finder, or anyone after the chat, their own report.
  const tagTo =
    thread.myRole === 'lost' && active && thread.matchId ? `/matches/${thread.matchId}` : thread.myReportId ? `/reports/${thread.myReportId}` : null
  const tagContent = (
    <>
      <UserText className={s.itemName}>{thread.itemTitle}</UserText>
      <span className={s.itemStatus}>{statusText}</span>
      {tagTo && (
        <>
          <span className="visually-hidden">{tagTo.startsWith('/matches') ? t('chat.openMatch') : t('chat.openReport')}</span>
          <ChevronRight size={16} />
        </>
      )}
    </>
  )
  const pendingLabel = pending
    ? pending.kind === 'return'
      ? t('chat.pending.return', { name })
      : t('chat.pending.handover', {
          name,
          when: pending.handoverAt ? `${relativeDay(pending.handoverAt.split('T')[0])} ${clockTime(pending.handoverAt.split('T')[1])}` : '',
        })
    : ''

  return (
    <main className={s.page}>
      <div className={s.head} inert={returned}>
        <header className={s.headRow}>
          {backButton}
          <Avatar name={name} photoUrl={thread.otherAvatarUrl} size={44} background={thread.myRole === 'lost' ? 'var(--sage)' : 'var(--tan)'} />
          <h1 className={s.who}>
            <span className="visually-hidden">{t('chat.with')} </span>
            <UserText className={s.name}>{name}</UserText>{' '}
            <span className={s.role}>{thread.myRole === 'lost' ? t('chat.foundYours') : t('chat.lostIt')}</span>
          </h1>
          <Link to="/tips" className={s.safetyLink}>
            {t('chat.safety.tips')}
          </Link>
        </header>
        <div className={s.itemRow}>
          {tagTo ? (
            <Link to={tagTo} className={s.itemLink}>
              <LuggageTag notch={14} hole={10} holeColor="var(--surface)" className={s.itemTag}>
                {tagContent}
              </LuggageTag>
            </Link>
          ) : (
            <LuggageTag notch={14} hole={10} holeColor="var(--surface)" className={s.itemTag}>
              {tagContent}
            </LuggageTag>
          )}
        </div>
      </div>

      <div className={s.logWrap} inert={returned}>
        <div
          ref={log}
          className={s.messages}
          role="log"
          aria-live="polite"
          aria-label={t('chat.messages')}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            if (atBottom.current) setNewBelow(false)
          }}
        >
          <p className={s.safetyNote}>
            {t('chat.safety')} <Link to="/help">{t('chat.safety.help')}</Link>
          </p>
          {visible.map((m, i) => {
            // A day line wherever the campus date changes from the message before.
            const day = campusDate(m.at)
            const divider = i === 0 || campusDate(visible[i - 1].at) !== day ? <p className={s.day}>{relativeDay(day)}</p> : null
            const group = t('chat.sentAt', { who: who(m), time: timeOf(m.at) })
            const isPending = m.id === pendingId
            let body: ReactNode
            if (m.kind === 'system') {
              body = (
                <div role="group" aria-label={group} className={`${s.system} ${fresh(m)}`}>
                  <img src="/mascot/reading.webp" alt="" width={52} />
                  <div className={s.systemBubble}>
                    <span className={s.zarqa} aria-hidden="true">
                      {t('chat.zarqa').toUpperCase()}
                    </span>
                    <span>{m.text}</span>
                  </div>
                </div>
              )
            } else if (m.kind === 'return') {
              body = (
                <div
                  ref={isPending ? pendingTicket : undefined}
                  role="group"
                  aria-label={group}
                  className={`${s.ticket} ${s.returnTicket} ${fresh(m)}`}
                  data-mine={m.mine}
                  style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}
                >
                  <div className={s.ticketHead}>
                    <span className={s.ticketLabel}>{m.mine ? t('chat.return.you') : t('chat.return.they', { name: name.toUpperCase() })}</span>
                    <span className={s.ticketAt}>{timeOf(m.at)}</span>
                  </div>
                  <span className={s.returnText}>{m.text}</span>
                  <TearLine inset={16} notch={22} />
                  {m.handoverStatus === 'confirmed' ? (
                    <div className={s.confirmed} data-enter="pop">
                      <Check size={18} color="var(--ink)" />
                      {t('chat.return.done')}
                    </div>
                  ) : m.canConfirm && active ? (
                    <div className={s.ticketActions}>
                      <button
                        type="button"
                        className={s.confirmBtn}
                        disabled={busy !== null}
                        aria-busy={busy === `rc${m.id}` || undefined}
                        onClick={() =>
                          act(`rc${m.id}`, `/returns/${m.id}/confirm`, () => {
                            status.current = 'Returned'
                            setThread((cur) => (cur ? { ...cur, status: 'Returned' } : cur))
                            celebrate()
                          })
                        }
                      >
                        {t('chat.return.yes')}
                      </button>
                      <button type="button" className={s.otherBtn} disabled={busy !== null} aria-busy={busy === `rd${m.id}` || undefined} onClick={() => act(`rd${m.id}`, `/returns/${m.id}/decline`)}>
                        {t('chat.return.no')}
                      </button>
                    </div>
                  ) : active ? (
                    <div className={s.returnWait}>
                      <span className={s.waiting}>{t('chat.handover.waiting', { name })}</span>
                      <button type="button" className={s.withdraw} disabled={busy !== null} aria-busy={busy === `rw${m.id}` || undefined} onClick={() => act(`rw${m.id}`, `/returns/${m.id}/decline`)}>
                        {t('chat.return.withdraw')}
                      </button>
                    </div>
                  ) : null}
                </div>
              )
            } else if (m.kind === 'handover' && m.handoverAt) {
              const [date, time] = m.handoverAt.split('T')
              const past = m.handoverAt < `${now.date}T${now.time}`
              body = (
                <div
                  ref={isPending ? pendingTicket : undefined}
                  role="group"
                  aria-label={group}
                  className={`${s.ticket} ${fresh(m)}`}
                  data-mine={m.mine}
                  style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}
                >
                  <div className={s.ticketHead}>
                    <span className={s.ticketLabel}>{m.handoverStatus === 'confirmed' ? t('chat.handover.confirmed') : t('chat.handover.suggested')}</span>
                    <span className={s.ticketAt}>{timeOf(m.at)}</span>
                  </div>
                  <div className={s.ticketWhen}>
                    <span className={s.ticketTime}>{clockTime(time)}</span>
                    <span className={s.ticketPlace}>
                      {relativeDay(date)} · <UserText>{m.handoverPlace}</UserText>
                    </span>
                  </div>
                  <TearLine inset={16} notch={22} />
                  {m.handoverStatus === 'confirmed' ? (
                    <div className={s.confirmed} data-enter="pop">
                      <img src="/mascot/wink.webp" alt="" width={34} />
                      {past ? t('chat.handover.past') : t('chat.handover.seeYou')}
                    </div>
                  ) : m.canConfirm && active ? (
                    <div className={s.ticketActions}>
                      <button type="button" className={s.confirmBtn} disabled={busy !== null} aria-busy={busy === `hc${m.id}` || undefined} onClick={() => act(`hc${m.id}`, `/handovers/${m.id}/confirm`)}>
                        {t('chat.handover.confirm')}
                      </button>
                      <button
                        type="button"
                        className={s.otherBtn}
                        disabled={busy !== null}
                        onClick={() => {
                          setPlanError('')
                          setPlanning(true)
                        }}
                      >
                        {t('chat.handover.another')}
                      </button>
                    </div>
                  ) : (
                    <span className={s.waiting}>{t('chat.handover.waiting', { name })}</span>
                  )}
                </div>
              )
            } else {
              body = (
                <div role="group" aria-label={group} className={`${m.mine ? s.meWrap : s.themWrap} ${fresh(m)}`} data-mine={m.mine}>
                  <UserText as="div" className={m.mine ? s.me : s.them}>
                    {m.text}
                  </UserText>
                  <span className={s.at} aria-hidden="true">
                    {timeOf(m.at)}
                  </span>
                </div>
              )
            }
            return (
              <Fragment key={m.id}>
                {divider}
                {body}
              </Fragment>
            )
          })}
        </div>
        {newBelow && (
          <button
            type="button"
            className={s.newPill}
            data-enter="pop"
            onClick={() => {
              const el = log.current
              el?.scrollTo({ top: el.scrollHeight, behavior: reduced() ? 'auto' : 'smooth' })
              setNewBelow(false)
            }}
          >
            {t('chat.newMessages')} ↓
          </button>
        )}
      </div>

      {active ? (
        <div className={s.composer} inert={returned}>
          {offline && (
            <p role="status" className={s.reconnecting}>
              {t('chat.reconnecting')}
            </p>
          )}
          <InlineError>{error?.text}</InlineError>
          {pending && pendingHidden && !planning && (
            <div className={s.pendingBar}>
              <span className={s.pendingText}>{pendingLabel}</span>
              <button
                type="button"
                className={s.pendingView}
                onClick={() => {
                  const el = pendingTicket.current
                  el?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
                  el?.querySelector('button')?.focus({ preventScroll: true })
                }}
              >
                {t('chat.pending.view')}
              </button>
            </div>
          )}
          {planning ? (
            <HandoverForm
              error={planError}
              onCancel={() => {
                setPlanning(false)
                refocus(planChip)
              }}
              onSend={async (date, time, place) => {
                setPlanError('')
                try {
                  merge([await api<Msg>(`/conversations/${id}/handover`, { body: { date, time, place } })])
                  setPlanning(false)
                  refocus(planChip)
                } catch (e) {
                  setPlanError(errOf(e)?.text ?? '')
                }
              }}
            />
          ) : (
            <>
              {!returnPending && !typing && (
                <button
                  type="button"
                  className={`${s.returnAsk} ${handoverSet ? s.returnAskReady : ''}`}
                  disabled={busy !== null}
                  aria-busy={busy === 'ask' || undefined}
                  onClick={() => act('ask', `/conversations/${id}/returned`)}
                >
                  <Check size={18} />
                  {thread.myRole === 'lost' ? t('chat.return.ask.lost') : t('chat.return.ask.found')}
                </button>
              )}
              {/* Chips and Send keep the keyboard up: a press doesn't take focus from the message box. */}
              <div className={s.quick}>
                {/* With a suggestion waiting for me, its own "Suggest another" is the one way to counter it. */}
                {!awaitingMe && (
                  <button
                    ref={planChip}
                    type="button"
                    className={`${s.chip} ${s.chipPlan}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPlanError('')
                      setPlanning(true)
                    }}
                  >
                    {t('chat.suggestTime')}
                  </button>
                )}
                {QUICK.map((k) => (
                  <button key={k} type="button" className={s.chip} disabled={sending} onMouseDown={(e) => e.preventDefault()} onClick={() => send(t(k), false)}>
                    {t(k)}
                  </button>
                ))}
              </div>
              {draft.length > MAX - 200 && <p className={s.count}>{t('chat.tooLong', { n: draft.length })}</p>}
              <form
                className={s.inputRow}
                onSubmit={(e: FormEvent) => {
                  e.preventDefault()
                  void send(draft, true)
                }}
              >
                <label htmlFor="chat-input" className="visually-hidden">
                  {t('chat.message')}
                </label>
                <textarea
                  ref={input}
                  id="chat-input"
                  className={`${s.input} user-text`}
                  dir="auto"
                  rows={1}
                  value={draft}
                  maxLength={MAX}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    if (error) setError(null)
                  }}
                  // Only with an on-screen keyboard (touch): then the rows above give the messages their room back.
                  onFocus={() => setTyping(window.matchMedia('(pointer: coarse)').matches)}
                  onBlur={() => setTyping(false)}
                  onKeyDown={(e) => {
                    // Enter sends on a computer keyboard (Shift+Enter for a new line); on a phone it's a new line.
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                      e.preventDefault()
                      void send(draft, true)
                    }
                  }}
                  placeholder={t('chat.placeholder', { name })}
                />
                <button
                  type="submit"
                  className={s.send}
                  aria-label={t('chat.send')}
                  aria-busy={sending || undefined}
                  disabled={!draft.trim() || sending}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {sending ? <span className={s.spinner} aria-hidden="true" /> : <ArrowRight size={22} color="var(--ink)" />}
                </button>
              </form>
              {!typing && (
                <button type="button" className={s.notIt} onClick={() => setAskNotIt(true)}>
                  {t('chat.notIt')}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={s.composer} inert={returned}>
          <p className={s.closedNote}>{thread.status === 'Returned' ? t('chat.closedReturned') : t('chat.closedNotIt')}</p>
          <Link to="/reports" className={s.closedLink}>
            {t('chat.toReports')}
          </Link>
        </div>
      )}

      <ConfirmSheet
        open={askNotIt}
        title={t('chat.notIt.title')}
        body={t('chat.notIt.body', { name })}
        confirmLabel={t('chat.notIt.go')}
        cancelLabel={t('chat.notIt.keep')}
        busy={notItBusy}
        error={notItError}
        onConfirm={() => void closeAsNotIt()}
        onCancel={() => {
          setAskNotIt(false)
          setNotItError('')
        }}
      />

      {returned && (
        <ReturnedDialog
          className={s.overlay}
          leaving={leaving}
          fallback={log}
          onClose={() => setLeaving(true)}
          onLeft={() => {
            setReturned(false)
            setLeaving(false)
          }}
        >
          {/* Her gold coins go up behind her as she lands. */}
          <CoinBurst origin={[0.5, 0.4]} delay={420} />
          {/* The owner's iPhone art, untouched: the hop is the mascot skill's bounce preset on the still. */}
          <img src="/mascot/phone.webp" alt={t('chat.returned.alt')} className={`${s.overlayMascot} ${zarqaMotion('bounce')}`} />
          <span className={`${s.overlayItem} user-text`} dir="auto" data-enter style={{ '--delay': '420ms' }}>
            {thread.itemTitle}
          </span>
          <h2 id="returned-title" tabIndex={-1} className={s.overlayTitle}>{t('chat.returned.title')}</h2>
          <p className={s.overlayText} data-enter style={{ '--delay': '560ms' }}>{thread.myRole === 'found' ? t('chat.returned.body.found', { name }) : t('chat.returned.body')}</p>
          <BigButton to="/" label={t('chat.returned.home')} />
          <button type="button" className={s.keep} onClick={() => setLeaving(true)}>
            {t('chat.returned.keep')}
          </button>
        </ReturnedDialog>
      )}
    </main>
  )
}

/** "2026-11-13" + "14:30" in campus time, as minutes, to compare with now. */
const minutesOf = (date: string, time: string) => Date.parse(`${date}T${time}:00Z`) / 60000

/** Suggest a meeting time and place (the design has the ticket, not its composer). */
function HandoverForm({ onSend, onCancel, error }: { onSend: (date: string, time: string, place: string) => Promise<void>; onCancel: () => void; error?: string }) {
  const now = muscatNow()
  const [date, setDate] = useState(now.date)
  const [time, setTime] = useState('')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const [past, setPast] = useState(false)
  const timeInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    timeInput.current?.focus({ preventScroll: true })
  }, [])
  return (
    <form
      className={`${s.plan} on-paper`}
      data-enter
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        // The server allows half an hour of slack for slow typing; say so here, next to the time.
        const n = muscatNow()
        if (minutesOf(date, time) < minutesOf(n.date, n.time) - 30) {
          setPast(true)
          timeInput.current?.focus()
          return
        }
        setBusy(true)
        await onSend(date, time, place)
        setBusy(false)
      }}
    >
      <span className={s.ticketLabel}>{t('chat.plan.title')}</span>
      <div className={s.planRow}>
        <label className={s.planField}>
          <span className={s.planLabel}>{t('chat.plan.day')}</span>
          <input
            type="date"
            className={s.planInput}
            value={date}
            min={now.date}
            onChange={(e) => {
              setDate(e.target.value)
              setPast(false)
            }}
            required
          />
        </label>
        <label className={s.planField}>
          <span className={s.planLabel}>{t('chat.plan.time')}</span>
          <input
            ref={timeInput}
            type="time"
            className={s.planInput}
            value={time}
            onChange={(e) => {
              setTime(e.target.value)
              setPast(false)
            }}
            aria-invalid={past || undefined}
            aria-describedby={past ? 'plan-past' : undefined}
            required
          />
        </label>
      </div>
      <InlineError onPaper id="plan-past">
        {past ? t('chat.plan.past') : ''}
      </InlineError>
      <label className={s.planField}>
        <span className={s.planLabel}>{t('chat.plan.where')}</span>
        <input className={`${s.planInput} user-text`} dir="auto" value={place} maxLength={120} onChange={(e) => setPlace(e.target.value)} placeholder={t('chat.plan.place')} required />
      </label>
      <InlineError onPaper>{error}</InlineError>
      <div className={s.ticketActions}>
        <button type="submit" className={s.confirmBtn} disabled={busy || !time || !place.trim()} aria-busy={busy || undefined}>
          {t('chat.plan.send')}
        </button>
        <button type="button" className={s.otherBtn} onClick={onCancel}>
          {t('chat.plan.cancel')}
        </button>
      </div>
    </form>
  )
}

/**
 * Modal celebration: takes focus, keeps Tab inside (the chat behind it is inert), closes on Escape. It fades out
 * (`leaving`) before `onLeft` removes it; focus then goes back to where it was, or to the messages.
 */
function ReturnedDialog({
  children,
  className,
  leaving,
  fallback,
  onClose,
  onLeft,
}: {
  children: ReactNode
  className: string
  leaving: boolean
  fallback: RefObject<HTMLElement | null>
  onClose: () => void
  onLeft: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const messages = fallback.current
    box.current?.querySelector<HTMLElement>('h2')?.focus()
    // A happy double tap you can feel, where the phone allows it.
    if (!reduced()) navigator.vibrate?.([14, 80, 26])
    return () => {
      if (before && before !== document.body && before.isConnected) before.focus()
      else messages?.focus({ preventScroll: true })
    }
  }, [fallback])
  return (
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-labelledby="returned-title"
      className={className}
      data-leaving={leaving || undefined}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onLeft()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key !== 'Tab' || !box.current) return
        const items = [...box.current.querySelectorAll<HTMLElement>('a[href], button')]
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const current = document.activeElement as HTMLElement | null
        const inside = current !== null && items.includes(current)
        // From the heading (not in the list) Shift+Tab wraps to the last control instead of leaving the dialog.
        if (e.shiftKey && (!inside || current === first)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (!inside || current === last)) {
          e.preventDefault()
          first.focus()
        }
      }}
    >
      {children}
    </div>
  )
}
