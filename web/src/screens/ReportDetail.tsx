import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BackHeader, BigButton, MonoLabel, StatusPill, Ticket, ZarqaBubble, type PillStatus } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, relativeDay } from '../lib/dates'
import type { Report } from '../lib/types'
import s from './ReportDetail.module.css'

/** One of my reports: what I posted, plus close/delete. Not in the design; built in the ticket style. */
export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
      navigate('/reports', { replace: true })
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
  const when = report.eventDate
    ? `${relativeDay(report.eventDate)}${report.eventTime ? ` · ~${clockTime(report.eventTime)}` : ''}`
    : t('detail.whenUnknown')

  return (
    <main className={s.page}>
      <BackHeader to="/reports" label={relativeDay(campusDate(report.createdAt)).toUpperCase()} />

      <Ticket>
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
              {report.photoIds.map((p) => (
                <img key={p} src={`/api/photos/${p}`} alt="" className={s.photo} />
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

      {report.pill === 'Searching' && (
        <ZarqaBubble mascot="reading" alt="Zarqa" width={60} quiet>
          {report.kind === 'lost' ? t('detail.searching.lost') : t('detail.searching.found')}
        </ZarqaBubble>
      )}

      {error && <p className={s.error}>{error}</p>}

      <div className={s.actions}>
        {(report.pill === 'Searching' || report.pill === 'Possible match') && (
          <BigButton
            variant="dark"
            label={report.kind === 'lost' ? t('detail.closeLost') : t('detail.closeFound')}
            labelSize={22}
            disabled={busy}
            onClick={() => act(`/reports/${report.id}/close`, 'POST', t('detail.closeConfirm'))}
          />
        )}
        {!report.conversationId && (
          <button type="button" className={s.delete} disabled={busy} onClick={() => act(`/reports/${report.id}`, 'DELETE', t('detail.deleteConfirm'))}>
            {t('detail.delete')}
          </button>
        )}
      </div>
    </main>
  )
}
