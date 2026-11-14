import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../auth/session'
import { ConfirmSheet, InlineError, LoadError, LoadingState, UserText } from '../components/states'
import { BackHeader, Ticket } from '../components/ui'
import { t, type StringKey } from '../i18n'
import { api, ApiError } from '../lib/api'
import s from './Launch.module.css'
import a from './Admin.module.css'

type Group = { status?: string; count: number; kind?: string; by?: string }
type Stats = {
  users: number; admins?: number; sampleUsers?: number; sampleReports?: number; newUsers30d: number; returned: number
  pendingJobs: number; failedJobs: number; spendTodayUsd: number; spend30dUsd: number; reports?: Group[]; matches?: Group[]; decidedBy?: Group[]
}
type Report = {
  id: string; kind: string; title: string; description: string; location: string; status: string; isSensitive: boolean
  owner: string; ownerId: string; ownerBanned: boolean; ownerIsAdmin?: boolean; photoIds?: string[]; createdAt?: string
}
type Log = { id: number; step: string; payload: string; createdAt: string; costUsd: number | null; counterpartTitle?: string | null; counterpartKind?: string | null }
type Result = { ok?: string; err?: string }
/** key: where its result shows; action: which button shows the busy label. */
type Ask = { key: string; action: string; title: string; body: ReactNode; confirmLabel: string; run: () => Promise<string> }

const metrics = ['users', 'newUsers30d', 'returned', 'pendingJobs', 'failedJobs', 'spendTodayUsd', 'spend30dUsd'] as const
const statuses = ['Open', 'InChat', 'Pickup', 'Returned', 'Closed', 'Expired']
const finished = ['Closed', 'Returned', 'Expired']
const sampleSuffix = '@sample.invalid'
/** A label for an internal name (status, kind, reviewer), falling back to the raw name for anything new. */
const label = (prefix: string, raw?: string) => (raw ? ((t(`${prefix}.${raw}` as StringKey) as string | undefined) ?? raw) : '')
const message = (e: unknown) => (e instanceof ApiError ? e.message : t('common.error'))
const money = (n: number) => (n > 0 && n < 0.005 ? t('admin.spendUnderCent') : `$${n.toFixed(2)}`)
function pretty(payload: string) {
  try { return JSON.stringify(JSON.parse(payload), null, 2) } catch { return payload }
}
function score(payload: string) {
  try {
    const v = (JSON.parse(payload) as { finalScore?: unknown }).finalScore
    return typeof v === 'number' ? v.toFixed(2) : null
  } catch { return null }
}

export default function Admin() {
  const { me } = useSession()
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [statsLoading, setStatsLoading] = useState(true)
  const [reports, setReports] = useState<Report[] | null>(null)
  const [reportsFailed, setReportsFailed] = useState(false)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [logs, setLogs] = useState<Log[]>([])
  const [logReport, setLogReport] = useState('')
  const [logLoaded, setLogLoaded] = useState(false)
  // One action at a time: `running` is the key of the action in flight, so a double tap can't fire it twice.
  const [running, setRunning] = useState('')
  const [results, setResults] = useState<Record<string, Result>>({})
  const [ask, setAsk] = useState<Ask | null>(null)
  const [viewer, setViewer] = useState<{ id: string; title: string } | null>(null)
  const [wipeWord, setWipeWord] = useState('')
  const wipeTimer = useRef<number | undefined>(undefined)
  const logVersion = useRef(0)
  const reportsVersion = useRef(0)
  const site = location.hostname

  const fetchStats = useCallback(() => api<Stats>('/admin/stats')
    .then(x => { setStats(x); setStatsFailed(false) }, () => setStatsFailed(true))
    .finally(() => setStatsLoading(false)), [])
  const loadStats = useCallback(() => { setStatsLoading(true); return fetchStats() }, [fetchStats])
  const loadReports = useCallback(async () => {
    const version = ++reportsVersion.current
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (query.trim()) params.set('q', query.trim())
    const qs = params.toString()
    try {
      const list = await api<Report[]>(`/admin/reports${qs ? `?${qs}` : ''}`)
      if (version === reportsVersion.current) { setReports(list ?? []); setReportsFailed(false) }
    } catch {
      if (version === reportsVersion.current) setReportsFailed(true)
    }
  }, [status, query])
  const refresh = useCallback(() => Promise.all([loadStats(), loadReports()]), [loadStats, loadReports])

  useEffect(() => {
    if (me?.isAdmin) void fetchStats()
  }, [me?.isAdmin, fetchStats])
  useEffect(() => {
    if (!me?.isAdmin) return
    // Typing in the search box waits a moment; the status filter and the first load go straight away.
    const timer = window.setTimeout(() => void loadReports(), query ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [me?.isAdmin, loadReports, query])
  useEffect(() => () => window.clearTimeout(wipeTimer.current), [])
  if (!me?.isAdmin) return <Navigate to="/profile" replace />

  /** Runs a confirmed action: one at a time, its result or error shown next to the control it came from. */
  async function confirmAsk() {
    if (!ask || running) return
    const { key, action, run } = ask
    setRunning(action)
    // A new action clears older results and errors, so nothing stale sits next to it.
    setResults({})
    try {
      const ok = await run()
      setResults(r => ({ ...r, [key]: { ok } }))
    } catch (e) {
      setResults(r => ({ ...r, [key]: { err: message(e) } }))
    } finally {
      setRunning('')
      setAsk(null)
      if (key === 'wipe') setWipeWord('')
    }
  }
  function askClose(r: Report) {
    setAsk({
      key: `card:${r.id}`, action: `close:${r.id}`, title: t('admin.closeTitle'), confirmLabel: t('admin.closeGo'),
      body: <><UserText>“{r.title}”</UserText> · {r.owner}<br />{t('admin.closeConfirm')}
        {r.status === 'InChat' && <><br />{t('admin.closeInChat')}</>}
        {r.status === 'Pickup' && <><br />{t('admin.closePickup')}</>}</>,
      run: async () => { await api(`/admin/reports/${r.id}/close`, { method: 'POST' }); void refresh(); return '' },
    })
  }
  function askBan(r: Report) {
    const ban = !r.ownerBanned
    setAsk({
      key: `card:${r.id}`, action: `ban:${r.id}`, title: t(ban ? 'admin.banTitle' : 'admin.unbanTitle'), confirmLabel: t(ban ? 'admin.banGo' : 'admin.unbanGo'),
      body: t(ban ? 'admin.banConfirm' : 'admin.unbanConfirm', { email: r.owner }),
      run: async () => { await api(`/admin/users/${r.ownerId}/${ban ? 'ban' : 'unban'}`, { method: 'POST' }); void refresh(); return '' },
    })
  }
  function askRematch() {
    setAsk({
      key: 'rematch', action: 'rematch', title: t('admin.rematchTitle'), body: t('admin.rematchConfirm'), confirmLabel: t('admin.rematchGo'),
      run: async () => {
        const r = await api<{ queued: number }>('/admin/rematch', { method: 'POST' })
        void loadStats()
        return r.queued === 0 ? t('admin.rematchNone') : r.queued === 1 ? t('admin.rematchOne') : t('admin.rematchDone', { n: r.queued })
      },
    })
  }
  function askEmailTest() {
    setAsk({
      key: 'email', action: 'email', title: t('admin.email.sheetTitle'), body: t('admin.email.confirm'), confirmLabel: t('admin.email.go'),
      run: async () => {
        const r = await api<{ to: string; results: { provider: string; ok: boolean; error: string | null }[] }>('/admin/email-test', { method: 'POST' })
        if (r.results.length === 0) return t('admin.email.none')
        const lines = r.results.map(x => (x.ok ? t('admin.email.okLine', { provider: x.provider }) : t('admin.email.failLine', { provider: x.provider, error: x.error ?? '' }))).join(' ')
        // One provider failing is the thing this check exists to catch: show it as an error, not a quiet result.
        if (r.results.some(x => !x.ok)) throw new ApiError(lines, 0)
        return t('admin.email.allOk', { lines, to: r.to })
      },
    })
  }
  function askSample(method: 'POST' | 'DELETE') {
    const fill = method === 'POST'
    setAsk({
      key: 'sample', action: `sample:${method}`, title: t(fill ? 'admin.sample.fillTitle' : 'admin.sample.deleteTitle'),
      body: t(fill ? 'admin.sample.fillConfirm' : 'admin.sample.deleteConfirm'),
      confirmLabel: t(fill ? 'admin.sample.fillGo' : 'admin.sample.delete'),
      run: async () => {
        const r = await api<{ users: number; reports?: number }>('/admin/sample', { method })
        void refresh()
        return fill ? t('admin.sample.filled', { reports: r.reports ?? 0, users: r.users }) : t('admin.sample.deleted')
      },
    })
  }
  const reportTotal = (stats?.reports ?? []).reduce((n, g) => n + g.count, 0)
  const accountTotal = stats ? Math.max(0, stats.users - (stats.admins ?? 0)) : 0
  const wipeReady = !!stats && wipeWord.trim().toLowerCase() === site.toLowerCase()
  function askWipe() {
    if (!wipeReady) return
    setAsk({
      key: 'wipe', action: 'wipe', title: t('admin.wipe.sheetTitle', { site }), confirmLabel: t('admin.wipe.go'),
      body: <>{t('admin.wipe.scope', { site, reports: reportTotal, users: accountTotal })}<br />{t('admin.wipe.note')}</>,
      // The server keeps its own fixed confirmation word (decisions.md, 2026-11-02); typing the site name is the page's check.
      run: async () => {
        const r = await api<{ reports: number; users: number }>('/admin/delete-everything', { body: { confirm: 'DELETE' } })
        void refresh()
        return t('admin.wipe.done', { reports: r.reports, users: r.users })
      },
    })
  }
  async function toggleLog(id: string) {
    const version = ++logVersion.current
    if (logReport === id) { setLogReport(''); return }
    setLogReport(id); setLogs([]); setLogLoaded(false)
    setResults(r => ({ ...r, [`log:${id}`]: {} }))
    try {
      const result = await api<Log[]>(`/admin/log?reportId=${encodeURIComponent(id)}`)
      if (version === logVersion.current) { setLogs(result ?? []); setLogLoaded(true) }
    } catch (e) {
      if (version === logVersion.current) { setLogReport(''); setResults(r => ({ ...r, [`log:${id}`]: { err: message(e) } })) }
    }
  }

  const busyLabel = (action: string, idle: string, working: string) => (running === action ? working : idle)
  const result = (key: string) => results[key] ?? {}
  const outcome = (key: string, paper?: boolean) => <>
    {result(key).ok && <p role="status" className={a.result}>{result(key).ok}</p>}
    <InlineError onPaper={paper}>{result(key).err}</InlineError>
  </>
  const visible = reports ?? []
  const sampleUsers = stats?.sampleUsers ?? 0
  const sampleReports = stats?.sampleReports ?? 0
  const near = wipeWord.trim() !== '' && !site.toLowerCase().startsWith(wipeWord.trim().toLowerCase())

  return <main className={`${s.page} ${a.page}`} data-layout="wide">
    <BackHeader to="/profile" label={t('profile.admin')} />
    <h1>{t('admin.title')}</h1>

    <section aria-labelledby="numbers-title" className={a.section}>
      <div className={a.sectionHead}>
        <h2 id="numbers-title">{t('admin.numbers')}</h2>
        {stats && <div className={`${s.actions} ${a.actions}`}>
          <button type="button" disabled={statsLoading} aria-busy={statsLoading || undefined} onClick={() => void refresh()}>{statsLoading ? t('admin.refreshing') : t('admin.refresh')}</button>
        </div>}
      </div>
      {statsFailed && !stats ? <LoadError onRetry={() => void loadStats()} busy={statsLoading} />
        : !stats ? <LoadingState />
        : <>
          <div className={`${s.tiles} ${a.tiles}`}>{metrics.map(key => <div className={s.tile} key={key}>
            <strong>{key.startsWith('spend') ? money(stats[key]) : key === 'users' ? Math.max(0, stats.users - sampleUsers) : stats[key]}</strong>
            <span>{t(`admin.${key}` as StringKey)}</span>
          </div>)}</div>
          {statsFailed && <InlineError>{t('common.loadError')}</InlineError>}
          <Ticket className={`${s.card} ${a.summary}`}>{(['reports', 'matches', 'decidedBy'] as const).map(key => <section key={key}>
            <h2>{t(`admin.${key}` as StringKey)}</h2>
            {(stats[key] ?? []).length === 0 ? <p>{t('admin.noneYet')}</p>
              : (stats[key] ?? []).map((g, i) => <p key={i}>{[label('admin.kind', g.kind), label(key === 'matches' ? 'admin.matchStatus' : 'admin.status', g.status), label('admin.decider', g.by)].filter(Boolean).join(' / ')}: {g.count}</p>)}
          </section>)}</Ticket>
        </>}
      <div className={`${s.actions} ${a.actions}`}>
        <button type="button" disabled={!!running} aria-busy={running === 'rematch' || undefined} onClick={askRematch}>{busyLabel('rematch', t('admin.rematch'), t('admin.rematching'))}</button>
      </div>
      {outcome('rematch')}
    </section>

    <section aria-labelledby="email-title" className={a.section}>
      <h2 id="email-title">{t('admin.email.title')}</h2>
      <p>{t('admin.email.note')}</p>
      <div className={`${s.actions} ${a.actions}`}>
        <button type="button" disabled={!!running} aria-busy={running === 'email' || undefined} onClick={askEmailTest}>{busyLabel('email', t('admin.email.send'), t('admin.email.sending'))}</button>
      </div>
      {outcome('email')}
    </section>

    <section aria-labelledby="reports-title" className={a.section}>
      <h2 id="reports-title">{t('admin.reports')}</h2>
      <div className={a.filters}>
        <label className={a.field}>{t('admin.search')}
          <input type="search" value={query} placeholder={t('admin.searchHint')} autoComplete="off" autoCorrect="off" spellCheck={false} onChange={e => setQuery(e.target.value)} />
        </label>
        <label className={a.field}>{t('admin.filter')}
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">{t('admin.all')}</option>
            {statuses.map(x => <option key={x} value={x}>{label('admin.status', x)}</option>)}
          </select>
        </label>
      </div>
      <p className={a.note}>{t('admin.limit')}</p>
      {reportsFailed && reports && <InlineError>{t('common.loadError')}</InlineError>}
      {reportsFailed && !reports ? <LoadError onRetry={() => void loadReports()} />
        : !reports ? <LoadingState />
        : !visible.length ? <p>{t(query.trim() || status ? 'admin.noResults' : 'admin.empty')}</p>
        : <div className={a.list}>{visible.map(r => {
          const photos = r.photoIds ?? []
          const cardKey = `card:${r.id}`
          const sample = r.owner.toLowerCase().endsWith(sampleSuffix)
          const open = logReport === r.id
          return <Ticket className={`${s.card} ${a.card} ${open ? a.cardOpen : ''}`} key={r.id}>
            {sample && <span className={a.tag}>{t('admin.sampleTag')}</span>}
            <UserText as="h3" className={a.cardTitle}>{r.title}</UserText>
            <p>
              {label('admin.kind', r.kind)} · {label('admin.status', r.status)}
              {r.createdAt && <> · {t('admin.posted', { date: new Date(r.createdAt).toLocaleDateString() })}</>}<br />
              <span className="wrap">{r.owner}</span>
              {r.ownerBanned && <> <span className={a.tag}>{t('admin.bannedTag')}</span></>}
              {r.ownerIsAdmin && <> <span className={a.tag}>{t('admin.adminTag')}</span></>}<br />
              <UserText>{r.location}</UserText>
            </p>
            {r.description && <UserText as="p">{r.description}</UserText>}
            {photos.length > 0 && <div className={s.photos}>{photos.map(id => <button type="button" key={id} className={a.photo}
              aria-label={t('admin.photoOpen', { title: r.title })} onClick={() => setViewer({ id, title: r.title })}>
              <img src={`/api/photos/${id}`} alt="" loading="lazy" className={r.isSensitive ? a.contain : undefined} />
            </button>)}</div>}
            {r.isSensitive && <p>{t(photos.length > 0 ? 'admin.covered' : 'admin.sensitive')}</p>}
            <div className={`${s.actions} ${a.actions}`}>
              {finished.includes(r.status) ? <span className={a.done}>{label('admin.status', r.status)}</span>
                : <button type="button" disabled={!!running} aria-busy={running === `close:${r.id}` || undefined} onClick={() => askClose(r)}>
                  {busyLabel(`close:${r.id}`, t('admin.close'), t('admin.closing'))}</button>}
              {!r.ownerIsAdmin && <button type="button" disabled={!!running} aria-busy={running === `ban:${r.id}` || undefined} onClick={() => askBan(r)}>
                {busyLabel(`ban:${r.id}`, t(r.ownerBanned ? 'admin.unban' : 'admin.ban'), t(r.ownerBanned ? 'admin.unbanning' : 'admin.banning'))}</button>}
              <button type="button" aria-expanded={open} onClick={() => void toggleLog(r.id)}>{t(open ? 'admin.hideLog' : 'admin.viewLog')}</button>
            </div>
            {outcome(cardKey, true)}
            <InlineError onPaper>{result(`log:${r.id}`).err}</InlineError>
            {open && <div aria-live="polite" className={a.log}>
              <h3>{t('admin.log')}</h3>
              {!logLoaded ? <p>{t('admin.loading')}</p> : !logs.length ? <p>{t('admin.noLog')}</p> : logs.map(l => {
                const sc = score(l.payload)
                const parts = [
                  l.step,
                  l.counterpartTitle ? t('admin.logVs', { title: l.counterpartTitle, kind: label('admin.kind', l.counterpartKind ?? '') }) : '',
                  sc ? t('admin.logScore', { score: sc }) : '',
                  l.costUsd ? `$${l.costUsd.toFixed(3)}` : '',
                  new Date(l.createdAt).toLocaleString(),
                ].filter(Boolean)
                return <details key={l.id}><summary className="user-text" dir="auto">{parts.join(' · ')}</summary><pre>{pretty(l.payload)}</pre></details>
              })}
            </div>}
          </Ticket>
        })}</div>}
    </section>

    <details className={a.tools}>
      <summary>{t('admin.danger')}</summary>
      <section aria-labelledby="sample-title" className={a.section}>
        <h2 id="sample-title">{t('admin.sample.title')}</h2>
        <p>{t('admin.sample.note')}</p>
        {stats && <p className={a.state}>{sampleUsers > 0 ? t('admin.sample.on', { reports: sampleReports, users: sampleUsers }) : t('admin.sample.off')}</p>}
        <div className={`${s.actions} ${a.actions}`}>
          <button type="button" disabled={!!running} aria-busy={running === 'sample:POST' || undefined} onClick={() => askSample('POST')}>
            {busyLabel('sample:POST', t('admin.sample.fill'), t('admin.sample.filling'))}</button>
          <button type="button" disabled={!!running || (!!stats && sampleUsers === 0)} aria-busy={running === 'sample:DELETE' || undefined} onClick={() => askSample('DELETE')}>
            {busyLabel('sample:DELETE', t('admin.sample.delete'), t('admin.sample.deleting'))}</button>
        </div>
        {outcome('sample')}
      </section>
      <section aria-labelledby="wipe-title" className={s.danger}>
        <h2 id="wipe-title">{t('admin.wipe.title')}</h2>
        <p>{t('admin.wipe.note')}</p>
        <p className={a.state}>{stats ? t('admin.wipe.scope', { site, reports: reportTotal, users: accountTotal }) : t('admin.wipe.waiting')}</p>
        <label className={a.field}>{t('admin.wipe.label', { site })}
          <input id="wipe-word" value={wipeWord} disabled={!!running || !stats} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-describedby={near ? 'wipe-hint' : undefined}
            onChange={e => setWipeWord(e.target.value)}
            onFocus={() => window.clearTimeout(wipeTimer.current)}
            // A word left typed in is cleared after a minute away, so the page can't stay armed.
            onBlur={() => { window.clearTimeout(wipeTimer.current); wipeTimer.current = window.setTimeout(() => setWipeWord(''), 60_000) }} />
        </label>
        {near && <p id="wipe-hint" className={a.hint}>{t('admin.wipe.mismatch', { site })}</p>}
        <div className={`${s.actions} ${a.actions}`}>
          <button type="button" className={s.dangerButton} disabled={!!running || !wipeReady} aria-busy={running === 'wipe' || undefined} onClick={askWipe}>
            {busyLabel('wipe', t('admin.wipe.button'), t('admin.wipe.busy'))}</button>
        </div>
        {outcome('wipe')}
      </section>
    </details>

    <ConfirmSheet open={!!ask} title={ask?.title ?? ''} body={ask?.body} confirmLabel={ask?.confirmLabel ?? ''} cancelLabel={t('admin.cancel')}
      busy={!!running} onConfirm={() => void confirmAsk()} onCancel={() => { if (running) return; if (ask?.key === 'wipe') setWipeWord(''); setAsk(null) }} />
    <PhotoViewer photo={viewer} onClose={() => setViewer(null)} />
  </main>
}

/** The whole photo, uncropped, in a dialog (card photos here are always the covered copy). */
function PhotoViewer({ photo, onClose }: { photo: { id: string; title: string } | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (photo && !d.open) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '') }
    else if (!photo && d.open) d.close()
  }, [photo])
  return <dialog ref={ref} className={a.viewer} aria-label={photo ? t('admin.photo', { title: photo.title }) : undefined}
    onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    {photo && <img src={`/api/photos/${photo.id}`} alt={t('admin.photo', { title: photo.title })} />}
    <button type="button" onClick={onClose}>{t('admin.photoClose')}</button>
  </dialog>
}
