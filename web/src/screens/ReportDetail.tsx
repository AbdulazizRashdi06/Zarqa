import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { useNavigate } from '../lib/transition'
import { BackHeader, BigButton, MonoLabel, StatusPill, Ticket, ZarqaBubble, type PillStatus } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, relativeDay } from '../lib/dates'
import { reportsCache } from '../lib/reportsCache'
import type { Report } from '../lib/types'
import s from './ReportDetail.module.css'

/** One of my reports: what I posted, plus close/delete. Not in the design; built in the ticket style. */
export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useLocation().state as { posted?: string; report?: Report } | null
  // Opened from its card, the report came along: show it at once and refresh it underneath.
  const [report, setReport] = useState<Report | null>(state?.report && state.report.id === id ? state.report : null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const justPosted = state?.posted === 'rsa'

  useEffect(() => {
    // Going back, this ticket shrinks into its card on My Reports.
    reportsCache.openedId = id ?? null
  }, [id])

  useEffect(() => {
    api<Report>(`/reports/${id}`)
      .then(setReport)
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')))
  }, [id])

  async function act(path: string, method: 'POST' | 'DELETE', confirmText: string) {
    if (!window.confirm(confirmText)) return
    setBusy(true)
    setError('')
    try {
      await api(path, { method })
      // The list changed: My Reports should load it again instead of showing this report's old card.
      reportsCache.openedId = null
      navigate('/reports', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  async function dropAtRsa() {
    if (!report || !window.confirm(t('detail.rsa.insteadConfirm'))) return
    setBusy(true)
    setError('')
    try {
      setReport(await api<Report>(`/reports/${report.id}/rsa`, { method: 'POST' }))
      reportsCache.reports = null
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  if (!report) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        {error && <p className={s.error}>{error}</p>}
      </main>
    )
  }

  const accent = report.kind === 'lost' ? 'var(--tan)' : 'var(--sage)'
  const atRsa = report.pill === 'At the RSA' || report.pill === 'Claimed at RSA'
  const when = report.eventDate
    ? `${relativeDay(report.eventDate)}${report.eventTime ? ` · ~${clockTime(report.eventTime)}` : ''}`
    : t('detail.whenUnknown')

  return (
    <main className={s.page}>
      <BackHeader to="/reports" label={relativeDay(campusDate(report.createdAt)).toUpperCase()} />

      <Ticket style={{ viewTransitionName: 'report-ticket' }}>
        <div className={s.body}>
          <div className={s.top}>
            <span className={s.tag} style={{ background: accent }}>
              {report.kind === 'lost' ? t('form.tag.lost') : t('form.tag.found')}
            </span>
            {report.pill !== 'Closed' && <StatusPill status={report.pill as PillStatus} />}
          </div>
          <h1 className={s.title}>{report.title}</h1>

          {report.photoIds.length > 0 && (
            <div className={s.photos}>
              {report.photoIds.map((p, i) => (
                <img key={p} src={`/api/photos/${p}`} alt="" className={s.photo} data-enter="pop" style={{ '--i': i, '--delay': '160ms' }} />
              ))}
            </div>
          )}

          <dl className={s.fields}>
            <dt><MonoLabel color="var(--ink-muted)">{t('detail.what')}</MonoLabel></dt>
            <dd>{report.description || report.title}</dd>
            <dt><MonoLabel color="var(--ink-muted)">{t('detail.where')}</MonoLabel></dt>
            <dd>{report.locationText || t('detail.whereUnknown')}</dd>
            <dt><MonoLabel color="var(--ink-muted)">{t('detail.when')}</MonoLabel></dt>
            <dd>{when}</dd>
          </dl>
          {report.isSensitive && <p className={s.note}>{t('detail.private')}</p>}
        </div>
      </Ticket>

      {justPosted && (
        <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64} motion="wiggle">
          {t('reports.posted.rsa')}
        </ZarqaBubble>
      )}

      {report.dropAtRsa && report.dropCode && report.status !== 'Returned' && report.status !== 'Closed' && report.status !== 'Expired' && (
        <Ticket data-enter="pop" style={{ '--delay': '140ms' }}>
          <div className={s.body}>
            <MonoLabel color="var(--ink-muted)">{t('detail.rsa.label')}</MonoLabel>
            <p className={s.code} aria-label={report.dropCode.split('').join(' ')}>{report.dropCode}</p>
            <p className={s.note}>
              {report.pill === 'Claimed at RSA' ? t('detail.rsa.claimed') : report.rsaReceived ? t('detail.rsa.held') : t('detail.rsa.bring')}
            </p>
          </div>
        </Ticket>
      )}

      {report.pill === 'Searching' && !report.dropAtRsa && (
        <ZarqaBubble mascot="reading" alt="Zarqa" width={60} quiet>
          {report.kind === 'lost' ? t('detail.searching.lost') : t('detail.searching.found')}
        </ZarqaBubble>
      )}

      {error && <p className={s.error}>{error}</p>}

      <div className={s.actions}>
        {report.pill === 'Ready to collect' && report.pickupMatchId && (
          <BigButton to={`/matches/${report.pickupMatchId}`} label={t('detail.pickup')} labelSize={24} />
        )}
        {report.kind === 'found' && report.pill === 'Searching' && !report.dropAtRsa && !report.conversationId && (
          <BigButton label={t('detail.rsa.instead')} labelSize={22} disabled={busy} onClick={dropAtRsa} />
        )}
        {(report.pill === 'Searching' || report.pill === 'Possible match' || report.pill === 'Bring to RSA') && (
          <BigButton
            variant="dark"
            label={report.kind === 'lost' ? t('detail.closeLost') : t('detail.closeFound')}
            labelSize={22}
            disabled={busy}
            onClick={() => act(`/reports/${report.id}/close`, 'POST', t('detail.closeConfirm'))}
          />
        )}
        {report.conversationId && <BigButton to={`/chats/${report.conversationId}`} label={t('detail.openChat')} labelSize={24} />}
        {!report.conversationId && !atRsa && report.pill !== 'Ready to collect' && (
          <button type="button" className={s.delete} disabled={busy} onClick={() => act(`/reports/${report.id}`, 'DELETE', t('detail.deleteConfirm'))}>
            {t('detail.delete')}
          </button>
        )}
      </div>
    </main>
  )
}
