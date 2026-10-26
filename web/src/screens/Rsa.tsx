import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../auth/session'
import { BackHeader, MonoLabel, Ticket } from '../components/ui'
import { t, type StringKey } from '../i18n'
import { api, ApiError } from '../lib/api'
import { relativeDay, campusDate } from '../lib/dates'
import l from './Launch.module.css'
import s from './Rsa.module.css'

type Item = {
  id: string; code: string | null; title: string; description: string; locationText: string; eventDate: string | null
  isSensitive: boolean; photoIds: string[]; state: 'expected' | 'held' | 'claimed' | 'collected' | 'closed'; finderName: string
  createdAt: string; receivedAt: string | null
}
type Claim = { code: string; ownerName: string; title: string; description: string; locationText: string; eventDate: string | null; claimedAt: string }
type Desk = { type: 'drop' | 'pickup'; item: Item; claim: Claim | null }
type ChatRow = { id: string; itemTitle: string; lostName: string; foundName: string; status: string; lastMessage: string | null; lastAt: string; messages: number }
type ChatMessage = { id: number; kind: string; from: 'lost' | 'found' | null; text: string; at: string; handoverAt: string | null; handoverPlace: string | null; handoverStatus: string | null }
type Thread = { id: string; itemTitle: string; lostName: string; foundName: string; status: string; messages: ChatMessage[] }
type Member = { email: string; addedAt: string }

const tabs = ['desk', 'shelf', 'chats', 'team'] as const
type Tab = (typeof tabs)[number]
const explain = (e: unknown) => (e instanceof ApiError ? e.message : t('common.error'))

/** The RSA desk: hand-ins, pickups, the shelf, read-only chats and the team. Not in the design; built in the ticket style. */
export default function Rsa() {
  const { me } = useSession()
  const [tab, setTab] = useState<Tab>('desk')
  if (!me?.isRsa) return <Navigate to="/profile" replace />
  return (
    <main className={l.page}>
      <BackHeader to="/profile" label={t('profile.rsa')} />
      <h1>{t('rsa.title')}</h1>
      <div className={s.tabs} role="tablist" aria-label={t('rsa.title')}>
        {tabs.map((x) => (
          <button key={x} type="button" role="tab" id={`rsa-tab-${x}`} aria-selected={tab === x} aria-controls={`rsa-panel-${x}`} className={s.tab} onClick={() => setTab(x)}>
            {t(`rsa.tab.${x}` as StringKey)}
          </button>
        ))}
      </div>
      <section role="tabpanel" id={`rsa-panel-${tab}`} aria-labelledby={`rsa-tab-${tab}`} className={s.panel}>
        {tab === 'desk' && <DeskTab />}
        {tab === 'shelf' && <ShelfTab />}
        {tab === 'chats' && <ChatsTab />}
        {tab === 'team' && <TeamTab myEmail={me.email} />}
      </section>
    </main>
  )
}

function ItemCard({ item, children }: { item: Item; children?: ReactNode }) {
  return (
    <Ticket className={l.card}>
      <MonoLabel color="var(--ink-muted)">{[item.code, t(`rsa.state.${item.state}` as StringKey)].filter(Boolean).join(' · ')}</MonoLabel>
      <h2 className={s.itemTitle}>{item.title}</h2>
      {item.isSensitive ? <p>{t('rsa.sensitive')}</p> : item.photoIds.length > 0 && (
        <div className={l.photos}>{item.photoIds.map((id) => <img key={id} src={`/api/photos/${id}`} alt={t('rsa.photo', { title: item.title })} loading="lazy" />)}</div>
      )}
      {item.description && <p>{item.description}</p>}
      <p className={s.meta}>
        {[item.locationText || null, item.eventDate ? relativeDay(item.eventDate) : null, t('rsa.finder', { name: item.finderName })].filter(Boolean).join(' · ')}
      </p>
      {children}
    </Ticket>
  )
}

function DeskTab() {
  const [code, setCode] = useState('')
  const [desk, setDesk] = useState<Desk | null>(null)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup(e?: FormEvent) {
    e?.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true); setError(''); setDone(''); setDesk(null)
    try { setDesk(await api<Desk>(`/rsa/desk/${encodeURIComponent(code.trim())}`)) } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }
  async function act(path: string, message: string, confirmText?: string) {
    if (busy || (confirmText && !window.confirm(confirmText))) return
    setBusy(true); setError('')
    try {
      await api(path, { method: 'POST' })
      setDone(message); setDesk(null); setCode('')
    } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <form onSubmit={lookup} className={s.lookup}>
        <label>
          {t('rsa.code')}
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false}
            inputMode="text" maxLength={9} placeholder="K7P-4QM" className={s.codeInput} aria-describedby="rsa-code-hint" />
        </label>
        <span id="rsa-code-hint" className={s.meta}>{t('rsa.code.hint')}</span>
        <div className={l.actions}><button type="submit" disabled={busy || !code.trim()}>{t('rsa.lookup')}</button></div>
      </form>
      {error && <p role="alert" className={l.error}>{error}</p>}
      {done && <p role="status" className={l.notice}>{done}</p>}
      {desk?.type === 'drop' && (
        <>
          <h2>{t('rsa.drop.h')}</h2>
          <ItemCard item={desk.item}>
            {desk.claim && <p className={l.notice}>{t('rsa.drop.claimWaiting', { code: desk.claim.code })}</p>}
            {desk.item.state === 'expected' || (desk.item.state === 'claimed' && !desk.item.receivedAt) ? (
              <div className={l.actions}>
                <button type="button" disabled={busy} onClick={() => act(`/rsa/drop/${desk.item.code}/receive`, t('rsa.drop.received'))}>{t('rsa.drop.receive')}</button>
              </div>
            ) : desk.item.receivedAt && <p className={s.meta}>{t('rsa.drop.received')}</p>}
          </ItemCard>
        </>
      )}
      {desk?.type === 'pickup' && desk.claim && (
        <>
          <h2>{t('rsa.pickup.h')}</h2>
          <p>{t('rsa.pickup.check')}</p>
          <Ticket className={l.card}>
            <MonoLabel color="var(--ink-muted)">{t('rsa.pickup.owner')}</MonoLabel>
            <p className={s.owner}>{desk.claim.ownerName}</p>
            <MonoLabel color="var(--ink-muted)">{t('rsa.pickup.said')}</MonoLabel>
            <h2 className={s.itemTitle}>{desk.claim.title}</h2>
            {desk.claim.description && <p>{desk.claim.description}</p>}
            <p className={s.meta}>{[desk.claim.locationText || null, desk.claim.eventDate ? relativeDay(desk.claim.eventDate) : null].filter(Boolean).join(' · ')}</p>
          </Ticket>
          <MonoLabel color="var(--ink-muted)">{t('rsa.pickup.item')}</MonoLabel>
          <ItemCard item={desk.item}>
            <div className={l.actions}>
              <button type="button" disabled={busy} onClick={() => act(`/rsa/pickup/${desk.claim!.code}/handover`, t('rsa.pickup.done'),
                t('rsa.pickup.handoverConfirm', { title: desk.item.title, name: desk.claim!.ownerName }))}>{t('rsa.pickup.handover')}</button>
              <button type="button" className={s.secondary} disabled={busy} onClick={() => act(`/rsa/pickup/${desk.claim!.code}/reject`, t('rsa.pickup.rejected'),
                t('rsa.pickup.rejectConfirm'))}>{t('rsa.pickup.reject')}</button>
            </div>
          </ItemCard>
        </>
      )}
    </>
  )
}

function ShelfTab() {
  const [done, setDone] = useState(false)
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api<Item[]>(`/rsa/items${done ? '?done=true' : ''}`).then(setItems).catch((e) => setError(explain(e))), [done])
  useEffect(() => { load() }, [load])

  async function close(item: Item) {
    if (busy || !window.confirm(t('rsa.shelf.closeConfirm', { title: item.title }))) return
    setBusy(true); setError('')
    try { await api(`/rsa/items/${item.id}/close`, { method: 'POST' }); await load() } catch (e) { setError(explain(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className={l.actions}><button type="button" className={s.secondary} onClick={() => { setItems(null); setDone((d) => !d) }}>{done ? t('rsa.shelf.active') : t('rsa.shelf.done')}</button></div>
      {error && <p role="alert" className={l.error}>{error}</p>}
      {!items && !error && <p role="status">{t('rsa.loading')}</p>}
      {items?.length === 0 && <p>{t('rsa.shelf.empty')}</p>}
      {items?.map((item) => (
        <ItemCard key={item.id} item={item}>
          {(item.state === 'held' || item.state === 'expected') && (
            <div className={l.actions}><button type="button" className={s.secondary} disabled={busy} onClick={() => close(item)}>{t('rsa.shelf.close')}</button></div>
          )}
        </ItemCard>
      ))}
    </>
  )
}

function ChatsTab() {
  const [rows, setRows] = useState<ChatRow[] | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { api<ChatRow[]>('/rsa/conversations').then(setRows).catch((e) => setError(explain(e))) }, [])

  async function open(id: string) {
    setError('')
    try { setThread(await api<Thread>(`/rsa/conversations/${id}`)) } catch (e) { setError(explain(e)) }
  }

  if (thread) {
    const who = (m: ChatMessage) => (m.from === 'lost' ? `${thread.lostName} · ${t('rsa.chats.owner')}` : m.from === 'found' ? `${thread.foundName} · ${t('rsa.chats.finder')}` : t('rsa.chats.zarqa'))
    return (
      <>
        <div className={l.actions}><button type="button" className={s.secondary} onClick={() => setThread(null)}>{t('rsa.chats.back')}</button></div>
        <p className={l.notice}>{t('rsa.chats.note')}</p>
        <h2>{thread.itemTitle}</h2>
        <p className={s.meta}>{t('rsa.chats.between', { lost: thread.lostName, found: thread.foundName })} · {thread.status}</p>
        <ol className={s.thread}>
          {thread.messages.map((m) => (
            <li key={m.id} className={`${s.msg} ${m.from === 'found' ? s.fromFound : m.from === 'lost' ? s.fromLost : s.fromZarqa}`}>
              <span className={s.msgWho}>{who(m)} · {new Date(m.at).toLocaleString('en-GB', { timeZone: 'Asia/Muscat', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              {m.kind === 'handover' && m.handoverAt
                ? <span>{t('rsa.chats.handover', { when: m.handoverAt.replace('T', ' '), place: m.handoverPlace ?? '' })} ({m.handoverStatus})</span>
                : <span>{m.text}</span>}
            </li>
          ))}
        </ol>
      </>
    )
  }
  return (
    <>
      <p className={l.notice}>{t('rsa.chats.note')}</p>
      {error && <p role="alert" className={l.error}>{error}</p>}
      {!rows && !error && <p role="status">{t('rsa.loading')}</p>}
      {rows?.length === 0 && <p>{t('rsa.chats.empty')}</p>}
      {rows?.map((c) => (
        <button key={c.id} type="button" className={s.chatRow} onClick={() => open(c.id)}>
          <strong>{c.itemTitle}</strong>
          <span className={s.meta}>{t('rsa.chats.between', { lost: c.lostName, found: c.foundName })} · {c.status} · {relativeDay(campusDate(c.lastAt))}</span>
          {c.lastMessage && <span className={s.preview}>{c.lastMessage}</span>}
          <span className={s.meta}>{t('rsa.chats.messages', { n: c.messages })}</span>
        </button>
      ))}
    </>
  )
}

function TeamTab({ myEmail }: { myEmail: string }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api<Member[]>('/rsa/team').then(setMembers).catch((e) => setError(explain(e))), [])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (busy || !email.trim()) return
    setBusy(true); setError('')
    try { await api('/rsa/team', { body: { email: email.trim() } }); setEmail(''); await load() } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }
  async function remove(address: string) {
    if (busy || !window.confirm(t('rsa.team.removeConfirm', { email: address }))) return
    setBusy(true); setError('')
    try { await api(`/rsa/team/${encodeURIComponent(address)}`, { method: 'DELETE' }); await load() } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }

  return (
    <>
      <p>{t('rsa.team.note')}</p>
      <form onSubmit={add} className={s.lookup}>
        <label>
          {t('rsa.team.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="name@gutech.edu.om" />
        </label>
        <div className={l.actions}><button type="submit" disabled={busy || !email.trim()}>{t('rsa.team.add')}</button></div>
      </form>
      {error && <p role="alert" className={l.error}>{error}</p>}
      {!members && !error && <p role="status">{t('rsa.loading')}</p>}
      <ul className={s.team}>
        {members?.map((m) => (
          <li key={m.email}>
            <span>{m.email}{m.email === myEmail.toLowerCase() && ` (${t('rsa.team.you')})`}</span>
            {m.email !== myEmail.toLowerCase() && (
              <button type="button" className={s.secondary} disabled={busy} onClick={() => remove(m.email)}>{t('rsa.team.remove')}</button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
