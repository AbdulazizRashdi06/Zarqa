import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '../auth/session'
import { BackHeader, Ticket } from '../components/ui'
import { t, type StringKey } from '../i18n'
import { api, ApiError } from '../lib/api'
import s from './Launch.module.css'

type Group = { status: string; count: number; kind?: string; by?: string }
type Stats = { users: number; newUsers30d: number; returned: number; pendingJobs: number; failedJobs: number; spendTodayUsd: number; spend30dUsd: number; reports: Group[]; matches: Group[]; decidedBy: Group[] }
type Report = { id: string; kind: string; title: string; description: string; location: string; status: string; isSensitive: boolean; owner: string; ownerId: string; ownerBanned: boolean; photoIds: string[] }
type Log = { id: number; step: string; payload: string; createdAt: string; costUsd: number | null }
const metrics = ['users', 'newUsers30d', 'returned', 'pendingJobs', 'failedJobs', 'spendTodayUsd', 'spend30dUsd'] as const

export default function Admin() {
  const { me } = useSession()
  const [stats, setStats] = useState<Stats | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [logReport, setLogReport] = useState('')
  const [logLoaded, setLogLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const logVersion = useRef(0)
  const explain = (e: unknown) => setError(e instanceof ApiError ? e.message : t('common.error'))
  useEffect(() => {
    if (!me?.isAdmin) return
    let active = true
    Promise.all([api<Stats>('/admin/stats'), api<Report[]>('/admin/reports')]).then(([a, b]) => {
      if (active) { setStats(a); setReports(b) }
    }).catch(e => { if (active) explain(e) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [me?.isAdmin])
  if (!me?.isAdmin) return <Navigate to="/profile" replace />

  async function moderate(path: string, confirmation: string) {
    if (busy || !window.confirm(confirmation)) return
    setBusy(true); setError('')
    try {
      await api(path, { method: 'POST' })
      const [a, b] = await Promise.all([api<Stats>('/admin/stats'), api<Report[]>('/admin/reports')])
      setStats(a); setReports(b)
    } catch (e) { explain(e) } finally { setBusy(false) }
  }
  async function loadLog(id: string) {
    const version = ++logVersion.current
    setLogReport(id); setLogs([]); setLogLoaded(false); setError('')
    try {
      const result = await api<Log[]>(`/admin/log?reportId=${encodeURIComponent(id)}`)
      if (version === logVersion.current) { setLogs(result); setLogLoaded(true) }
    } catch (e) { if (version === logVersion.current) explain(e) }
  }
  return <main className={s.page}>
    <BackHeader to="/profile" label={t('profile.admin')} />
    <h1>{t('admin.title')}</h1>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {loading && <p role="status">{t('admin.loading')}</p>}
    {stats && <>
      <div className={s.tiles}>{metrics.map(key => <div className={s.tile} key={key}><strong>{key.startsWith('spend') ? `$${stats[key].toFixed(4)}` : stats[key]}</strong><span>{t(`admin.${key}` as StringKey)}</span></div>)}</div>
      <Ticket className={s.card}>{(['reports', 'matches', 'decidedBy'] as const).map(key => <section key={key}><h2>{t(`admin.${key}` as StringKey)}</h2>{stats[key].map((g, i) => <p key={i}>{[g.kind, g.status, g.by].filter(Boolean).join(' / ')}: {g.count}</p>)}</section>)}</Ticket>
    </>}
    <label>{t('admin.filter')}<select value={status} onChange={e => setStatus(e.target.value)}><option value="">{t('admin.all')}</option>{['Open', 'InChat', 'Returned', 'Closed', 'Expired'].map(x => <option key={x}>{x}</option>)}</select></label>
    <p>{t('admin.limit')}</p>
    {!loading && !reports.filter(r => !status || r.status === status).length && <p>{t('admin.empty')}</p>}
    {reports.filter(r => !status || r.status === status).map(r => <Ticket className={s.card} key={r.id}>
      <h2>{r.title}</h2><p>{r.kind} · {r.status}<br />{r.owner}<br />{r.location}</p><p>{r.description}</p>
      {r.isSensitive ? <p>{t('admin.sensitive')}</p> : <div className={s.photos}>{r.photoIds.map(id => <img key={id} src={`/api/photos/${id}`} alt={t('admin.photo', { title: r.title })} loading="lazy" />)}</div>}
      <div className={s.actions}>
        <button disabled={busy || ['Closed', 'Returned', 'Expired'].includes(r.status)} onClick={() => moderate(`/admin/reports/${r.id}/close`, t('admin.closeConfirm', { title: r.title }))}>{t('admin.close')}</button>
        <button disabled={busy} onClick={() => moderate(`/admin/users/${r.ownerId}/${r.ownerBanned ? 'unban' : 'ban'}`, t(r.ownerBanned ? 'admin.unbanConfirm' : 'admin.banConfirm', { email: r.owner }))}>{t(r.ownerBanned ? 'admin.unban' : 'admin.ban')}</button>
        <button onClick={() => loadLog(r.id)}>{t('admin.viewLog')}</button>
      </div>
      {logReport === r.id && <div aria-live="polite"><h2>{t('admin.log')}</h2>{!logLoaded ? <p>{t('admin.loading')}</p> : !logs.length ? <p>{t('admin.noLog')}</p> : logs.map(l => <details key={l.id}><summary>{l.step} · {new Date(l.createdAt).toLocaleString()}</summary><pre>{l.payload}</pre></details>)}</div>}
    </Ticket>)}
  </main>
}
