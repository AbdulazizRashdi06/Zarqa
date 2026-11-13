import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useSession } from '../auth/session'
import { ConfirmSheet, InlineError, LoadError, LoadingState, Notice, UserText } from '../components/states'
import { BackHeader, MonoLabel, Ticket } from '../components/ui'
import { t, type StringKey } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, muscatNow, relativeDay } from '../lib/dates'
import l from './Launch.module.css'
import s from './Rsa.module.css'

// Older API builds may leave out the newer fields (updatedAt, suggestedTo, ownerEmail): every use defaults them.
type Item = {
  id: string; code: string | null; title: string; description: string; locationText: string; eventDate: string | null
  isSensitive: boolean; photoIds: string[]; state: 'expected' | 'held' | 'claimed' | 'collected' | 'closed' | 'expired' | 'finder' | 'chatting' | 'returned'; finderName: string
  createdAt: string; receivedAt: string | null; updatedAt?: string; suggestedTo?: string[]
}
type Claim = { code: string; ownerName: string; ownerEmail?: string | null; title: string; description: string; locationText: string; eventDate: string | null; claimedAt: string }
type Desk = { type: 'drop' | 'pickup'; item: Item; claim: Claim | null }
type ChatRow = { id: string; itemTitle: string; lostName: string; foundName: string; status: string; lastMessage: string | null; lastAt: string; messages: number }
type ChatMessage = { id: number; kind: string; from: 'lost' | 'found' | null; text: string; at: string; handoverAt: string | null; handoverPlace: string | null; handoverStatus: string | null }
type Thread = { id: string; itemTitle: string; lostName: string; foundName: string; status: string; messages: ChatMessage[] }
type Member = { email: string; addedAt: string }
type Person = { email: string; hasAccount: boolean; name: string | null }

const tabs = ['desk', 'shelf', 'found', 'chats', 'team'] as const
type Tab = (typeof tabs)[number]
const explain = (e: unknown) => (e instanceof ApiError ? e.message : t('common.error'))
const isTab = (x: string | null): x is Tab => tabs.includes(x as Tab)

// Codes: six characters without look-alikes (server/Zarqa.Api/Rsa/RsaCodes.cs), shown as K7P-4QM.
const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'
const cleanCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
const showCode = (c: string) => (c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c)

/** "Today", "31 Aug". */
const dayOf = (iso: string) => relativeDay(campusDate(iso))
/** "Today, 2:30 PM": the same 12-hour time as the rest of the app. */
function stamp(iso: string) {
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Muscat', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  return `${dayOf(iso)}, ${clockTime(hm)}`
}
/** Whole campus days since a timestamp. */
function daysSince(iso: string) {
  const ms = Date.parse(`${muscatNow().date}T00:00:00Z`) - Date.parse(`${campusDate(iso)}T00:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}
/** A string key that may not exist (an unknown status from a newer server): falls back to the raw value. */
function word(key: string, fallback: string) {
  return (t(key as StringKey) as string | undefined) ?? fallback
}
const countLabel = (n: number) => (n === 1 ? t('rsa.countOne') : t('rsa.count', { n }))

/** Search over what staff hear at the desk: title, words, place, finder, code (with or without the dash). */
function matches(item: Item, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const code = item.code ?? ''
  return [item.title, item.description, item.locationText, item.finderName, code, code.replace('-', '')]
    .some((x) => (x ?? '').toLowerCase().includes(q))
}

/** Lines that mix user text with labels: each user part is isolated so Arabic keeps its own order. */
function MetaLine({ parts, className = s.meta }: { parts: (ReactNode | null | false)[]; className?: string }) {
  const shown = parts.filter((x): x is ReactNode => Boolean(x))
  if (shown.length === 0) return null
  return (
    <p className={className}>
      {shown.map((x, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {x}
        </span>
      ))}
    </p>
  )
}

type Ask = { title: string; body: string; confirmLabel: string; run: () => Promise<void>; after?: () => void }

/**
 * One in-app confirmation at a time (shared ConfirmSheet). The action runs once however often it is tapped; a failure
 * stays in the sheet. Afterwards focus goes back to the button that opened it, or wherever `after` puts it.
 */
function useAsk() {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const opener = useRef<HTMLElement | null>(null)

  function close(after?: () => void) {
    setAsk(null)
    setError('')
    requestAnimationFrame(() => {
      if (after) after()
      else if (opener.current?.isConnected) opener.current.focus()
    })
  }
  const sheet = ask && (
    <ConfirmSheet
      open
      title={ask.title}
      body={ask.body}
      confirmLabel={ask.confirmLabel}
      cancelLabel={t('rsa.keep')}
      busy={busy}
      error={error}
      onConfirm={async () => {
        if (running.current) return
        running.current = true
        setBusy(true)
        setError('')
        try {
          await ask.run()
          close(ask.after)
        } catch (e) {
          setError(explain(e))
        } finally {
          running.current = false
          setBusy(false)
        }
      }}
      onCancel={() => close()}
    />
  )
  const open = (a: Ask) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setError('')
    setAsk(a)
  }
  return { sheet, open }
}

/**
 * After an action removes or replaces the button that started it, focus would fall to the page body. The returned function
 * names where it should go instead; for a few seconds, each render puts it there whenever focus is on the body (never taking it
 * from somewhere else), so a list that reloads under it still leaves the keyboard in place.
 */
function useRefocus() {
  const pending = useRef<{ find: () => HTMLElement | null; until: number } | null>(null)
  useEffect(() => {
    const p = pending.current
    if (!p) return
    if (Date.now() > p.until) { pending.current = null; return }
    const at = document.activeElement
    if (at && at !== document.body && at.isConnected) return
    p.find()?.focus()
  })
  return (find: () => HTMLElement | null) => { pending.current = { find, until: Date.now() + 5000 } }
}

/** The RSA desk: hand-ins, pickups, the shelf, read-only chats and the team. Not in the design; built in the ticket style. */
export default function Rsa() {
  const { me } = useSession()
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const chat = params.get('chat')
  const tab: Tab = chat ? 'chats' : isTab(raw) ? raw : 'desk'
  // Tabs stay mounted once opened, so a looked-up item or a scrolled list survives a trip to another tab.
  const [seen, setSeen] = useState<ReadonlySet<Tab>>(() => new Set([tab]))
  if (!seen.has(tab)) setSeen(new Set([...seen, tab]))
  const [deskRequest, setDeskRequest] = useState<{ code: string; n: number } | null>(null)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  if (!me?.isRsa) return <Navigate to="/profile" replace />

  const select = (x: Tab) => setParams(x === 'desk' ? {} : { tab: x }, { replace: true })
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = tabs.indexOf(tab)
    const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
      : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null
    if (!next) return
    e.preventDefault()
    select(next)
    tabRefs.current[next]?.focus()
  }
  // "Owner is here" on the Shelf: the desk looks the drop code up and goes straight to the pickup.
  const ownerHere = (code: string) => {
    setDeskRequest((r) => ({ code, n: (r?.n ?? 0) + 1 }))
    select('desk')
  }

  return (
    <main className={`${l.page} ${s.page}`} data-layout="wide">
      <BackHeader to="/profile" label={t('profile.rsa')} />
      <h1 className={s.title}>{t('rsa.title')}</h1>
      <div className={s.tabs} role="tablist" aria-label={t('rsa.title')}>
        {tabs.map((x) => (
          <button key={x} ref={(el) => { tabRefs.current[x] = el }} type="button" role="tab" id={`rsa-tab-${x}`} aria-selected={tab === x}
            aria-controls={`rsa-panel-${x}`} tabIndex={tab === x ? 0 : -1} className={s.tab} onClick={() => select(x)} onKeyDown={onTabKey}>
            {t(`rsa.tab.${x}` as StringKey)}
          </button>
        ))}
      </div>
      {tabs.filter((x) => seen.has(x)).map((x) => (
        <section key={x} role="tabpanel" id={`rsa-panel-${x}`} aria-labelledby={`rsa-tab-${x}`} className={s.panel} hidden={tab !== x}>
          {x === 'desk' && <DeskTab active={tab === 'desk'} request={deskRequest} />}
          {x === 'shelf' && <ShelfTab active={tab === 'shelf'} onOwnerHere={ownerHere} />}
          {x === 'found' && <FoundTab active={tab === 'found'} />}
          {x === 'chats' && (
            <ChatsTab active={tab === 'chats'} chat={chat}
              onOpen={(id) => setParams({ tab: 'chats', chat: id })}
              onClose={(pushed) => (pushed ? window.history.back() : setParams({ tab: 'chats' }, { replace: true }))} />
          )}
          {x === 'team' && <TeamTab active={tab === 'team'} myEmail={me.email} />}
        </section>
      ))}
    </main>
  )
}

/** Photos open full size (the covered copy for cards: the API never serves staff anything else). */
function PhotoViewer({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  // Taken while rendering, before the dialog takes focus (an effect that runs twice in development would see the dialog).
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(() => {
    // Closing unmounts the dialog while it is open, so the browser restores nothing: focus goes back to the photo here.
    const d = ref.current
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
    return () => { if (opener?.isConnected) opener.focus() }
  }, [opener])
  return (
    <dialog ref={ref} className={s.viewer} aria-label={t('rsa.photo', { title })} onCancel={(e) => { e.preventDefault(); onClose() }} onClick={onClose}>
      <img src={`/api/photos/${id}`} alt={t('rsa.photo', { title })} />
      <button type="button" className={s.viewerClose} onClick={onClose}>{t('rsa.photo.close')}</button>
    </dialog>
  )
}

function ageLine(item: Item): string | null {
  const updated = item.updatedAt ?? item.createdAt
  switch (item.state) {
    case 'held':
    case 'claimed': {
      if (!item.receivedAt) return item.state === 'claimed' ? t('rsa.age.expected') : null
      const n = daysSince(item.receivedAt)
      const date = dayOf(item.receivedAt)
      return n === 0 ? t('rsa.age.today') : n === 1 ? t('rsa.age.oneDay', { date }) : t('rsa.age.days', { n, date })
    }
    case 'expected': return t('rsa.age.expected')
    case 'collected': return t('rsa.age.collected', { date: dayOf(updated) })
    case 'closed': return t('rsa.age.closed', { date: dayOf(updated) })
    case 'expired': return t('rsa.age.expired', { date: dayOf(updated) })
    default: return null
  }
}

function ItemCard({ item, children, heading: H = 'h2', large, showAge }: { item: Item; children?: ReactNode; heading?: 'h2' | 'h3'; large?: boolean; showAge?: boolean }) {
  const [photo, setPhoto] = useState<string | null>(null)
  const photoIds = item.photoIds ?? []
  const age = showAge ? ageLine(item) : null
  return (
    <Ticket className={`${l.card} ${s.card}`}>
      <MonoLabel color="var(--ink-muted)">{[item.code, word(`rsa.state.${item.state}`, item.state)].filter(Boolean).join(' · ')}</MonoLabel>
      <UserText as={H} className={s.itemTitle}>{item.title}</UserText>
      {photoIds.length > 0 && (
        <div className={`${l.photos} ${large ? s.photosLarge : ''}`}>
          {photoIds.map((id, i) => (
            <button key={id} type="button" className={s.photoButton} aria-label={t('rsa.photo.open', { n: i + 1, title: item.title })} onClick={() => setPhoto(id)}>
              <img src={`/api/photos/${id}`} alt={t('rsa.photo', { title: item.title })} loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {photo && <PhotoViewer id={photo} title={item.title} onClose={() => setPhoto(null)} />}
      {item.isSensitive && <p>{t(photoIds.length > 0 ? 'rsa.covered' : 'rsa.sensitive')}</p>}
      {item.description && <UserText as="p">{item.description}</UserText>}
      <MetaLine parts={[
        item.locationText && <UserText key="place">{item.locationText}</UserText>,
        item.eventDate && relativeDay(item.eventDate),
        t('rsa.finder', { name: item.finderName }),
      ]} />
      {age && <p className={s.age}>{age}</p>}
      {children}
    </Ticket>
  )
}

/** A short status line inside a card (paper): readable on the ticket, announced politely. */
function CardNote({ children, live, focusId }: { children: ReactNode; live?: boolean; focusId?: string }) {
  return <p className={s.cardNote} role={live ? 'status' : undefined} data-note={focusId} tabIndex={focusId ? -1 : undefined}>{children}</p>
}

/** The desk's last action, at the top of the tab: names the item and code so a wrong one is noticed at once. */
function LastAction({ children, focusRef }: { children: ReactNode; focusRef?: RefObject<HTMLDivElement | null> }) {
  return <div ref={focusRef} className={s.noticeWrap} tabIndex={focusRef ? -1 : undefined}><Notice>{children}</Notice></div>
}

function dropHeading(item: Item): StringKey {
  switch (item.state) {
    case 'expected': return 'rsa.drop.h'
    case 'held': return 'rsa.drop.h.held'
    case 'claimed': return item.receivedAt ? 'rsa.drop.h.waiting' : 'rsa.drop.h'
    case 'collected': return 'rsa.drop.h.collected'
    case 'closed': return 'rsa.drop.h.closed'
    case 'expired': return 'rsa.drop.h.expired'
    default: return 'rsa.drop.h.other'
  }
}

function DeskTab({ active, request }: { active: boolean; request: { code: string; n: number } | null }) {
  const [code, setCode] = useState('')
  const [desk, setDesk] = useState<Desk | null>(null)
  const [last, setLast] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const result = useRef<HTMLHeadingElement>(null)
  const ask = useAsk()

  // At a desk PC the code box is ready to type into (phones would pop the keyboard up, so not there).
  useEffect(() => {
    if (active && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches) input.current?.focus()
  }, [active])
  useEffect(() => { if (desk) result.current?.focus() }, [desk])

  const retype = () => requestAnimationFrame(() => { input.current?.focus(); input.current?.select() })
  function invalid(c: string) {
    if (c.length < 6) return t('rsa.code.short')
    if ([...c].some((ch) => !CODE_ALPHABET.includes(ch))) return t('rsa.code.badChar')
    return ''
  }
  const find = useCallback(async (c: string, ownerHere = false) => {
    setBusy(true); setError(''); setLast(''); setDesk(null)
    try {
      let found = await api<Desk>(`/rsa/desk/${encodeURIComponent(showCode(c))}`)
      if (ownerHere && found.type === 'drop' && found.claim) {
        setCode(cleanCode(found.claim.code))
        found = await api<Desk>(`/rsa/desk/${encodeURIComponent(found.claim.code)}`)
      }
      setDesk(found)
    } catch (err) {
      setError(explain(err))
      retype()
    } finally { setBusy(false) }
  }, [])

  // From the Shelf: an owner without their code.
  const handled = useRef(0)
  useEffect(() => {
    if (!request || request.n === handled.current) return
    handled.current = request.n
    const c = cleanCode(request.code)
    setCode(c)
    void find(c, true)
  }, [request, find])

  function lookup(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    const bad = invalid(code)
    if (bad) { setError(bad); setDesk(null); retype(); return }
    void find(code)
  }
  function done(message: string) {
    setLast(message); setDesk(null); setCode('')
  }
  const after = () => input.current?.focus()

  function receive(d: Desk) {
    const item = d.item
    ask.open({
      title: t('rsa.drop.receiveConfirm'),
      body: t(d.claim ? 'rsa.drop.receiveBodyClaimed' : 'rsa.drop.receiveBody', { title: item.title, code: item.code ?? '' }),
      confirmLabel: t('rsa.drop.receive'),
      run: async () => {
        await api(`/rsa/drop/${item.code}/receive`, { method: 'POST' })
        done(t('rsa.drop.received', { title: item.title, code: item.code ?? '' }))
      },
      after,
    })
  }
  function handOver(d: Desk, claim: Claim) {
    ask.open({
      title: t('rsa.pickup.handoverConfirm', { name: claim.ownerName }),
      body: claim.ownerEmail
        ? t('rsa.pickup.handoverBodyEmail', { title: d.item.title, email: claim.ownerEmail })
        : t('rsa.pickup.handoverBody', { title: d.item.title }),
      confirmLabel: t('rsa.pickup.handover'),
      run: async () => {
        await api(`/rsa/pickup/${claim.code}/handover`, { method: 'POST' })
        done(t('rsa.pickup.done', { name: claim.ownerName, title: d.item.title }))
      },
      after,
    })
  }
  function reject(d: Desk, claim: Claim) {
    ask.open({
      title: t('rsa.pickup.rejectConfirm'),
      body: t('rsa.pickup.rejectBody', { code: claim.code }),
      confirmLabel: t('rsa.pickup.reject'),
      run: async () => {
        await api(`/rsa/pickup/${claim.code}/reject`, { method: 'POST' })
        done(t('rsa.pickup.rejected', { code: claim.code, title: d.item.title }))
      },
      after,
    })
  }

  const claim = desk?.claim ?? null
  return (
    <>
      <form onSubmit={lookup} className={s.lookup} noValidate>
        <label>
          {t('rsa.code')}
          <input ref={input} value={showCode(code)} onChange={(e) => { setCode(cleanCode(e.target.value)); setError('') }} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            inputMode="text" placeholder="K7P-4QM" className={s.codeInput} aria-describedby="rsa-code-hint" aria-invalid={error ? true : undefined} />
        </label>
        <span id="rsa-code-hint" className={s.meta}>{t('rsa.code.hint')}</span>
        <div className={l.actions}>
          <button type="submit" disabled={busy || !code} aria-busy={busy || undefined}>{busy ? t('rsa.lookingUp') : t('rsa.lookup')}</button>
        </div>
      </form>
      <InlineError>{error}</InlineError>
      {last && <LastAction>{last}</LastAction>}
      {desk?.type === 'drop' && (
        <div className={s.result}>
          <h2 ref={result} tabIndex={-1}>{t(dropHeading(desk.item))}</h2>
          <ItemCard item={desk.item} showAge>
            {claim && <CardNote>{t('rsa.drop.claimWaiting', { code: claim.code })}</CardNote>}
            {desk.item.state === 'expected' || (desk.item.state === 'claimed' && !desk.item.receivedAt) ? (
              <div className={l.actions}>
                <button type="button" disabled={busy} onClick={() => receive(desk)}>{t('rsa.drop.receive')}</button>
              </div>
            ) : desk.item.state === 'claimed' && claim ? (
              <div className={l.actions}>
                <button type="button" disabled={busy} onClick={() => { setCode(cleanCode(claim.code)); void find(cleanCode(claim.code)) }}>{t('rsa.drop.ownerHere')}</button>
              </div>
            ) : null}
          </ItemCard>
        </div>
      )}
      {desk?.type === 'pickup' && claim && (
        <div className={s.result}>
          <h2 ref={result} tabIndex={-1}>{t('rsa.pickup.h')}</h2>
          <p>{t('rsa.pickup.check')}</p>
          <div className={s.pickup}>
            <Ticket className={`${l.card} ${s.card}`}>
              <MonoLabel color="var(--ink-muted)">{t('rsa.pickup.owner')}</MonoLabel>
              <UserText as="p" className={s.owner}>{claim.ownerName}</UserText>
              {claim.ownerEmail && <p className={s.ownerEmail}>{claim.ownerEmail}</p>}
              <MonoLabel color="var(--ink-muted)">{t('rsa.pickup.said')}</MonoLabel>
              <UserText as="h3" className={s.itemTitle}>{claim.title}</UserText>
              {claim.description ? <UserText as="p">{claim.description}</UserText> : <CardNote>{t('rsa.pickup.noDetails')}</CardNote>}
              <MetaLine parts={[claim.locationText && <UserText key="place">{claim.locationText}</UserText>, claim.eventDate && relativeDay(claim.eventDate)]} />
            </Ticket>
            <div className={s.pickupItem}>
              <MonoLabel color="var(--text-muted)">
                {desk.item.receivedAt ? t('rsa.pickup.itemSince', { date: dayOf(desk.item.receivedAt).toUpperCase() }) : t('rsa.pickup.notIn')}
              </MonoLabel>
              <ItemCard item={desk.item} heading="h3" large>
                {!desk.item.receivedAt && <CardNote>{t('rsa.pickup.notInNote')}</CardNote>}
              </ItemCard>
            </div>
          </div>
          {desk.item.receivedAt && (
            <div className={s.pickupActions}>
              <div className={l.actions}>
                <button type="button" className={s.primary} disabled={busy} onClick={() => handOver(desk, claim)}>{t('rsa.pickup.handover')}</button>
              </div>
              <div className={l.actions}>
                <button type="button" className={s.secondary} disabled={busy} onClick={() => reject(desk, claim)}>{t('rsa.pickup.reject')}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {ask.sheet}
    </>
  )
}

/** Search box shared by the list tabs. */
function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className={s.search}>
      {t('rsa.search')}
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} enterKeyHint="search" />
    </label>
  )
}

/** Toggle chips (aria-pressed): one of several, or one on/off. */
function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className={s.chips} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={s.chip} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

/** Loads a list when the tab first opens and again each time it comes back, keeping what it had while it reloads. */
function useList<T>(path: string, active: boolean) {
  const [data, setData] = useState<T[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    api<T[]>(path)
      .then((d) => { if (live) { setData(d ?? []); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
      .finally(() => { if (live) setRetrying(false) })
    return () => { live = false }
  }, [active, path, attempt])
  const load = () => setAttempt((a) => a + 1)
  const retry = () => { setRetrying(true); load() }
  return { data, setData, failed: failed && !data, retrying, retry, load }
}

type FoundFilter = 'open' | 'shelf' | 'all'
const canMatch = (item: Item) => item.state === 'finder' || item.state === 'expected' || item.state === 'held'

/** Every found report. Staff can match an open one to someone who asks at the desk, reported or not. */
function FoundTab({ active }: { active: boolean }) {
  const list = useList<Item>('/rsa/found', active)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FoundFilter>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const countRef = useRef<HTMLParagraphElement>(null)
  const refocus = useRefocus()

  if (list.failed) return <LoadError onRetry={list.retry} busy={list.retrying} />
  if (!list.data) return <LoadingState />
  const shown = list.data
    .filter((i) => filter === 'all' || (filter === 'open' ? canMatch(i) : i.state === 'held' || i.state === 'claimed'))
    .filter((i) => matches(i, query))

  return (
    <>
      <p>{t('rsa.found.note')}</p>
      <div className={s.filters}>
        <Search value={query} onChange={setQuery} placeholder={t('rsa.search.items')} />
        <Chips label={t('rsa.found.filter')} value={filter} onChange={setFilter} options={[
          { id: 'open', label: t('rsa.found.filter.open') },
          { id: 'shelf', label: t('rsa.found.filter.shelf') },
          { id: 'all', label: t('rsa.found.filter.all') },
        ]} />
      </div>
      <p ref={countRef} className={s.count} role="status" tabIndex={-1}>{countLabel(shown.length)}</p>
      {list.data.length === 0 ? <p>{t('rsa.found.empty')}</p> : shown.length === 0 && <p>{t('rsa.search.none')}</p>}
      <div className={s.grid}>
        {shown.map((item) => {
          const sent = item.suggestedTo ?? []
          return (
            <ItemCard key={item.id} item={item}>
              {sent.length > 0 && <CardNote>{t('rsa.match.sentTo', { emails: sent.join(', ') })}</CardNote>}
              {notes[item.id] && <CardNote live focusId={item.id}>{notes[item.id]}</CardNote>}
              {canMatch(item) && (open === item.id ? (
                <MatchForm item={item} onCancel={() => setOpen(null)} onDone={(message) => {
                  // The form goes; focus goes to this card's button, or its result line, or (if the card left the
                  // filtered list) the count line above it.
                  const at = (a: string) => document.querySelector<HTMLElement>(`[${a}="${CSS.escape(item.id)}"]`)
                  refocus(() => at('data-match') ?? at('data-note') ?? countRef.current)
                  setOpen(null)
                  setNotes((n) => ({ ...n, [item.id]: message }))
                  list.load()
                }} />
              ) : (
                <div className={l.actions}>
                  <button type="button" className={s.secondary} data-match={item.id} aria-label={t('rsa.match.openLabel', { title: item.title })}
                    onClick={() => { setOpen(item.id); setNotes((n) => { const next = { ...n }; delete next[item.id]; return next }) }}>
                    {sent.length > 0 || notes[item.id] ? t('rsa.match.openAgain') : t('rsa.match.open')}
                  </button>
                </div>
              ))}
            </ItemCard>
          )
        })}
      </div>
    </>
  )
}

/** Only the person's email: Zarqa files a lost report for them. On the shelf, staff can hand it over at once. */
function MatchForm({ item, onCancel, onDone }: { item: Item; onCancel: () => void; onDone: (message: string) => void }) {
  const held = item.state === 'held'
  const [email, setEmail] = useState('')
  const [handOver, setHandOver] = useState(held)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const ask = useAsk()

  useEffect(() => { if (window.matchMedia('(pointer: fine)').matches) field.current?.focus() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (checking || !address) return
    setChecking(true); setError('')
    let person: Person
    try {
      person = await api<Person>(`/rsa/person?email=${encodeURIComponent(address)}`)
    } catch (err) {
      setError(explain(err))
      setChecking(false)
      return
    }
    setChecking(false)
    const who = person.hasAccount
      ? person.name ? t('rsa.match.known', { email: person.email, name: person.name }) : t('rsa.match.knownNoName', { email: person.email })
      : t('rsa.match.unknown', { email: person.email })
    ask.open({
      title: handOver ? t('rsa.match.confirmHandOver') : t('rsa.match.confirmSend'),
      body: [t('rsa.match.item', { title: item.title }), who, t(handOver ? 'rsa.match.bodyHandOver' : 'rsa.match.bodySend')].join(' '),
      confirmLabel: handOver ? t('rsa.match.submitHandOver') : t('rsa.match.submit'),
      run: async () => {
        await api(`/rsa/found/${item.id}/match`, { body: { email: person.email, handOver } })
        onDone(handOver ? t('rsa.match.handedOver', { email: person.email }) : t('rsa.match.sent', { email: person.email }))
      },
      after: () => {},
    })
  }

  return (
    <form onSubmit={submit} className={s.matchForm} noValidate>
      <p className={s.meta}>{t('rsa.match.note')}</p>
      <label>
        {t('rsa.match.email')}
        <input ref={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off"
          spellCheck={false} inputMode="email" placeholder="name@gutech.edu.om" aria-invalid={error ? true : undefined} />
      </label>
      {held && (
        <label className={s.check}>
          <input type="checkbox" checked={handOver} onChange={(e) => setHandOver(e.target.checked)} />
          {t('rsa.match.handOver')}
        </label>
      )}
      <InlineError onPaper>{error}</InlineError>
      <div className={l.actions}>
        <button type="submit" disabled={checking || !email.trim()} aria-busy={checking || undefined}>
          {checking ? t('rsa.match.checking') : handOver ? t('rsa.match.submitHandOver') : t('rsa.match.submit')}
        </button>
        <button type="button" className={s.secondary} onClick={onCancel} disabled={checking}>{t('rsa.match.cancel')}</button>
      </div>
      {ask.sheet}
    </form>
  )
}

const byOldest = (at: (i: Item) => string) => (a: Item, b: Item) => Date.parse(at(a)) - Date.parse(at(b))

function ShelfTab({ active, onOwnerHere }: { active: boolean; onOwnerHere: (code: string) => void }) {
  const [done, setDone] = useState(false)
  const list = useList<Item>(`/rsa/items${done ? '?done=true' : ''}`, active)
  const [query, setQuery] = useState('')
  const [old, setOld] = useState<'all' | 'old'>('all')
  const [last, setLast] = useState('')
  const lastRef = useRef<HTMLDivElement>(null)
  const refocus = useRefocus()
  const ask = useAsk()

  function close(item: Item) {
    ask.open({
      title: t('rsa.shelf.closeConfirm'),
      body: t('rsa.shelf.closeBody', { title: item.title }),
      confirmLabel: t('rsa.shelf.close'),
      run: async () => {
        await api(`/rsa/items/${item.id}/close`, { method: 'POST' })
        // Closed: take it off the list now; a failed refresh afterwards doesn't undo that.
        list.setData((d) => d?.filter((x) => x.id !== item.id) ?? d)
        setLast(t('rsa.shelf.closed', { title: item.title }))
        // Its button is gone with the card: focus goes to the line that says what was closed.
        refocus(() => lastRef.current)
        list.load()
      },
    })
  }

  const header = (
    <>
      <div className={l.actions}>
        <button type="button" className={s.secondary} onClick={() => { list.setData(null); setLast(''); setDone((d) => !d) }}>
          {done ? t('rsa.shelf.active') : t('rsa.shelf.done')}
        </button>
      </div>
      {last && <LastAction focusRef={lastRef}>{last}</LastAction>}
    </>
  )
  if (list.failed) return <>{header}<LoadError onRetry={list.retry} busy={list.retrying} /></>
  if (!list.data) return <>{header}<LoadingState /></>

  const shown = list.data.filter((i) => matches(i, query))
    .filter((i) => done || old === 'all' || (i.receivedAt != null && daysSince(i.receivedAt) >= 60))
  const card = (item: Item) => (
    <ItemCard key={item.id} item={item} heading={done ? 'h2' : 'h3'} showAge>
      {item.state === 'held' && (
        <div className={l.actions}>
          <button type="button" className={s.secondary} aria-label={t('rsa.shelf.closeLabel', { title: item.title })} onClick={() => close(item)}>
            {t('rsa.shelf.close')}
          </button>
        </div>
      )}
      {item.state === 'claimed' && item.receivedAt && item.code && (
        <div className={l.actions}>
          <button type="button" aria-label={t('rsa.drop.ownerHereLabel', { title: item.title })} onClick={() => onOwnerHere(item.code!)}>
            {t('rsa.drop.ownerHere')}
          </button>
        </div>
      )}
    </ItemCard>
  )
  const received = (i: Item) => i.receivedAt ?? i.createdAt
  const groups: { key: StringKey; items: Item[] }[] = done ? [] : [
    { key: 'rsa.shelf.group.held', items: shown.filter((i) => i.state === 'held').sort(byOldest(received)) },
    { key: 'rsa.shelf.group.claimed', items: shown.filter((i) => i.state === 'claimed').sort(byOldest(received)) },
    { key: 'rsa.shelf.group.expected', items: shown.filter((i) => i.state === 'expected').sort(byOldest((i) => i.createdAt)) },
  ]

  return (
    <>
      {header}
      <div className={s.filters}>
        <Search value={query} onChange={setQuery} placeholder={t('rsa.search.items')} />
        {!done && <Chips label={t('rsa.found.filter')} value={old} onChange={setOld} options={[
          { id: 'all', label: t('rsa.found.filter.all') },
          { id: 'old', label: t('rsa.shelf.old') },
        ]} />}
      </div>
      {list.data.length === 0 ? <p>{t('rsa.shelf.empty')}</p> : shown.length === 0 && <p>{t('rsa.search.none')}</p>}
      {done ? (
        <div className={s.grid}>{shown.map(card)}</div>
      ) : groups.filter((g) => g.items.length > 0).map((g) => (
        <section key={g.key} className={s.group}>
          <h2 className={s.groupTitle}>{t(g.key, { n: g.items.length })}</h2>
          <div className={s.grid}>{g.items.map(card)}</div>
        </section>
      ))}
      {ask.sheet}
    </>
  )
}

function ChatsTab({ active, chat, onOpen, onClose }: { active: boolean; chat: string | null; onOpen: (id: string) => void; onClose: (pushed: boolean) => void }) {
  const list = useList<ChatRow>('/rsa/conversations', active && !chat)
  const [query, setQuery] = useState('')
  const [thread, setThread] = useState<Thread | null>(null)
  const [threadFailed, setThreadFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const pushed = useRef(false)
  const listScroll = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!chat || thread?.id === chat) return
    let live = true
    api<Thread>(`/rsa/conversations/${chat}`)
      .then((th) => { if (live) { setThread(th); setThreadFailed(null) } })
      .catch(() => { if (live) setThreadFailed(chat) })
    return () => { live = false }
  }, [chat, thread?.id, attempt])
  useEffect(() => { if (thread) heading.current?.focus({ preventScroll: true }) }, [thread])
  // Back to the list where it was.
  useEffect(() => {
    if (!chat && listScroll.current) {
      const y = listScroll.current
      listScroll.current = 0
      requestAnimationFrame(() => window.scrollTo(0, y))
    }
  }, [chat])

  const open = (id: string) => {
    listScroll.current = window.scrollY
    pushed.current = true
    onOpen(id)
  }
  const back = () => {
    const wasPushed = pushed.current
    pushed.current = false
    onClose(wasPushed)
  }

  const status = (x: string) => word(`rsa.chats.status.${x.toLowerCase()}`, x)
  const shownRows = (list.data ?? []).filter((c) => {
    const q = query.trim().toLowerCase()
    return !q || [c.itemTitle, c.lostName, c.foundName].some((x) => (x ?? '').toLowerCase().includes(q))
  })

  return (
    <>
      {chat && (
        <div className={s.threadView}>
          <div className={l.actions}><button type="button" className={s.secondary} onClick={back}>{t('rsa.chats.back')}</button></div>
          <p className={s.readOnly}>{t('rsa.chats.note')}</p>
          {threadFailed === chat ? <LoadError onRetry={() => { setThreadFailed(null); setAttempt((a) => a + 1) }} />
            : !thread || thread.id !== chat ? <LoadingState />
            : <ThreadView thread={thread} heading={heading} status={status(thread.status)} />}
        </div>
      )}
      <div hidden={Boolean(chat)} className={s.chatList}>
        <p className={s.readOnly}>{t('rsa.chats.note')}</p>
        {list.failed ? <LoadError onRetry={list.retry} busy={list.retrying} /> : !list.data ? <LoadingState /> : (
          <>
            {list.data.length > 0 && <Search value={query} onChange={setQuery} placeholder={t('rsa.search.chats')} />}
            {list.data.length === 0 ? <p>{t('rsa.chats.empty')}</p> : shownRows.length === 0 && <p>{t('rsa.search.none')}</p>}
            <div className={s.grid}>
              {shownRows.map((c) => (
                <button key={c.id} type="button" className={`${s.chatRow} on-paper`} onClick={() => open(c.id)}>
                  <UserText as="strong">{c.itemTitle}</UserText>
                  <MetaLine className={`${s.meta} ${s.rowMeta}`} parts={[
                    t('rsa.chats.between', { lost: c.lostName, found: c.foundName }), status(c.status), dayOf(c.lastAt),
                  ]} />
                  {c.lastMessage && <UserText className={s.preview}>{c.lastMessage}</UserText>}
                  <span className={s.meta}>{c.messages === 1 ? t('rsa.chats.messagesOne') : t('rsa.chats.messages', { n: c.messages })}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ThreadView({ thread, heading, status }: { thread: Thread; heading: RefObject<HTMLHeadingElement | null>; status: string }) {
  const who = (m: ChatMessage) => (m.from === 'lost' ? `${thread.lostName} · ${t('rsa.chats.owner')}` : m.from === 'found' ? `${thread.foundName} · ${t('rsa.chats.finder')}` : t('rsa.chats.zarqa'))
  const handover = (m: ChatMessage) => {
    const [date, time] = (m.handoverAt ?? '').split('T')
    const when = date && time ? `${relativeDay(date)}, ${clockTime(time)}` : (m.handoverAt ?? '')
    const state = m.handoverStatus ? word(`rsa.chats.handover.${m.handoverStatus}`, m.handoverStatus) : ''
    return `${t('rsa.chats.handover', { when, place: m.handoverPlace ?? '' })}${state ? ` (${state})` : ''}`
  }
  return (
    <>
      <h2 ref={heading} tabIndex={-1} dir="auto" className={`user-text ${s.threadTitle}`}>{thread.itemTitle}</h2>
      <MetaLine parts={[t('rsa.chats.between', { lost: thread.lostName, found: thread.foundName }), status]} className={`${s.meta} ${s.onDark}`} />
      <ol className={s.thread}>
        {(thread.messages ?? []).map((m) => (
          <li key={m.id} className={`${s.msg} ${m.from === 'found' ? s.fromFound : m.from === 'lost' ? s.fromLost : s.fromZarqa}`}>
            <span className={s.msgWho}><UserText>{who(m)}</UserText> · {stamp(m.at)}</span>
            {m.kind === 'handover' && m.handoverAt ? <UserText>{handover(m)}</UserText> : <UserText>{m.text}</UserText>}
          </li>
        ))}
      </ol>
    </>
  )
}

function TeamTab({ active, myEmail }: { active: boolean; myEmail: string }) {
  const list = useList<Member>('/rsa/team', active)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [last, setLast] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const ask = useAsk()
  const me = myEmail.toLowerCase()

  function add(e: FormEvent) {
    e.preventDefault()
    const address = email.trim().toLowerCase()
    if (!address) return
    setError(''); setLast('')
    if (list.data?.some((m) => m.email === address)) { setError(t('rsa.team.already', { email: address })); return }
    ask.open({
      title: t('rsa.team.addConfirm', { email: address }),
      body: t('rsa.team.addBody'),
      confirmLabel: t('rsa.team.add'),
      run: async () => {
        await api('/rsa/team', { body: { email: address } })
        setEmail('')
        setLast(t('rsa.team.added', { email: address }))
        list.load()
      },
      after: () => field.current?.focus(),
    })
  }
  function remove(address: string) {
    setError(''); setLast('')
    ask.open({
      title: t('rsa.team.removeConfirm', { email: address }),
      body: t('rsa.team.removeBody'),
      confirmLabel: t('rsa.team.remove'),
      run: async () => {
        await api(`/rsa/team/${encodeURIComponent(address)}`, { method: 'DELETE' })
        list.setData((d) => d?.filter((m) => m.email !== address) ?? d)
        setLast(t('rsa.team.removed', { email: address }))
        list.load()
      },
      after: () => field.current?.focus(),
    })
  }

  return (
    <>
      <p>{t('rsa.team.note')}</p>
      <form onSubmit={add} className={s.lookup} noValidate>
        <label>
          {t('rsa.team.email')}
          <input ref={field} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} autoComplete="off" autoCapitalize="none"
            autoCorrect="off" spellCheck={false} inputMode="email" placeholder="name@gutech.edu.om" aria-invalid={error ? true : undefined} />
        </label>
        <div className={l.actions}><button type="submit" disabled={!email.trim()}>{t('rsa.team.add')}</button></div>
      </form>
      <InlineError>{error}</InlineError>
      {last && <LastAction>{last}</LastAction>}
      {list.failed ? <LoadError onRetry={list.retry} busy={list.retrying} /> : !list.data ? <LoadingState /> : (
        <ul className={s.team}>
          {list.data.map((m) => (
            <li key={m.email} className="on-paper">
              <span className={s.memberEmail}>{m.email}{m.email === me && ` (${t('rsa.team.you')})`}</span>
              {m.email !== me && (
                <button type="button" className={s.secondary} aria-label={t('rsa.team.removeLabel', { email: m.email })} onClick={() => remove(m.email)}>
                  {t('rsa.team.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ask.sheet}
    </>
  )
}
