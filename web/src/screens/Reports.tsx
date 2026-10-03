import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { ChevronRight } from '../components/icons'
import { ItemThumb } from '../components/ItemThumb'
import { BackHeader, BigButton, StatusPill, Sticker, ZarqaBubble, type PillStatus } from '../components/ui'
import { t } from '../i18n'
import { api } from '../lib/api'
import { relativeDay, campusDate } from '../lib/dates'
import { reportHref } from '../lib/links'
import type { Report } from '../lib/types'
import s from './Reports.module.css'

type Filter = 'all' | 'lost' | 'found'

export default function Reports() {
  const [filter, setFilter] = useState<Filter>('all')
  const [reports, setReports] = useState<Report[] | null>(null)
  const posted = (useLocation().state as { posted?: 'lost' | 'found' } | null)?.posted

  useEffect(() => {
    api<Report[]>('/reports/mine').then(setReports).catch(() => setReports([]))
  }, [])

  const shown = (reports ?? []).filter((r) => filter === 'all' || r.kind === filter)
  const active = (reports ?? []).filter((r) => r.pill !== 'Closed' && r.pill !== 'Returned').length

  return (
    <main className={s.page}>
      <BackHeader label={reports ? t(reports.length === 1 ? 'reports.countOne' : 'reports.count', { n: reports.length }) : undefined} />

      <h1 className={s.title}>
        {t('reports.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('reports.h2')}</span>
      </h1>

      {posted && (
        <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64}>
          {posted === 'lost' ? t('reports.posted.lost') : t('reports.posted.found')}
        </ZarqaBubble>
      )}

      {reports && reports.length > 0 && (
        <div className={s.filters} role="group" aria-label={t('reports.filter')}>
          {(['all', 'lost', 'found'] as const).map((f) => (
            <button key={f} type="button" className={s.filter} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {t(`reports.filter.${f}`)}
            </button>
          ))}
        </div>
      )}

      <div className={s.list}>
        {shown.map((r) => {
          const when = r.eventDate ?? campusDate(r.createdAt)
          const typeLine = [r.kind === 'lost' ? 'LOST' : 'FOUND', r.locationText || null, relativeDay(when)].filter(Boolean).join(' · ')
          return (
            <Link key={r.id} to={reportHref(r)} className={`${s.card} ${r.pill === 'Closed' ? s.dim : ''}`}>
              <ItemThumb kind={r.kind} categoryKey={r.categoryKey} photoId={r.photoIds[0]} sensitive={r.isSensitive} />
              <span className={s.cardText}>
                <span className={s.typeLine}>{typeLine}</span>
                <span className={s.name}>{r.title}</span>
                {r.pill !== 'Closed' ? <StatusPill status={r.pill as PillStatus} /> : <span className={s.typeLine}>{t('reports.closed')}</span>}
              </span>
              <ChevronRight size={18} color="var(--ink-muted)" />
              {r.pill === 'Possible match' && (
                <span className={s.sticker}>
                  <Sticker rotate={3}>{t('reports.spotted')}</Sticker>
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {reports && reports.length === 0 && (
        <div className={s.empty}>
          <img src="/mascot/empty-sad.webp" alt="" className={s.emptyArt} />
          <p className={s.emptyText}>{t('reports.empty')}</p>
          <BigButton to="/" label={t('reports.postOne')} />
        </div>
      )}

      {reports && reports.length > 0 && active === 0 && filter === 'all' && (
        <ZarqaBubble mascot="reading" alt="Zarqa" width={64} quiet>
          {t('reports.allDone')}
        </ZarqaBubble>
      )}
    </main>
  )
}
