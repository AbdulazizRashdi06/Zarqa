import { Fragment, useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { Link } from '../lib/nav'
import { ChevronRight } from '../components/icons'
import { ItemThumb } from '../components/ItemThumb'
import { BackHeader, BigButton, StatusPill, Sticker, ZarqaBubble, type PillStatus } from '../components/ui'
import { LoadError, LoadingState, Notice, UserText } from '../components/states'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { useSession } from '../auth/session'
import { api } from '../lib/api'
import { relativeDay, campusDate } from '../lib/dates'
import { reportHref } from '../lib/links'
import { clearHistoryState, reportsCache } from '../lib/reportsCache'
import type { Report } from '../lib/types'
import s from './Reports.module.css'

type Filter = 'all' | 'lost' | 'found'
type Arrival = { posted?: 'lost' | 'found'; notice?: 'closed' | 'deleted' }

const FINISHED = ['Returned', 'Closed', 'Expired']
// Reports that need the user come first, then the ones still going, then the finished ones; newest first in each.
const NEEDS_YOU = ['Possible match', 'Ready to collect', 'Bring to RSA']
const band = (r: Report) => (NEEDS_YOU.includes(r.pill) ? 0 : FINISHED.includes(r.pill) ? 2 : 1)

export default function Reports() {
  const userId = useSession().me?.id ?? null
  const cached = reportsCache.userId === userId && reportsCache.openedId ? reportsCache.reports : null
  const [filter, setFilter] = useState<Filter>('all')
  // Coming back from a report, the list is already here; it still refreshes underneath.
  const [reports, setReports] = useState<Report[] | null>(cached)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // First arrival: the cards come in one after another. Not again when filtering or coming back.
  const [stagger, setStagger] = useState(cached === null)
  // The report we just came back from: its ticket shrinks into this card.
  const [backFrom, setBackFrom] = useState(reportsCache.openedId)
  const location = useLocation()
  // "Posted!" and "Closed." show once: kept for this visit, then cleared from history so Back or reload don't replay them.
  const [arrival] = useState(() => (location.state as Arrival | null) ?? {})

  const load = useCallback(
    () =>
      api<Report[]>('/reports/mine')
        .then((list) => {
          reportsCache.userId = userId
          reportsCache.reports = list
          setReports(list)
          setFailed(false)
        })
        // With a list on screen, a failed refresh keeps it; with nothing, the page says it couldn't load.
        .catch(() => setFailed(true)),
    [userId],
  )

  useEffect(() => {
    void load()
  }, [load])

  // An installed app is resumed, not reloaded: refresh when it comes back to the front.
  useEffect(() => {
    let last = Date.now()
    const onShow = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 5000) return
      last = Date.now()
      void load()
    }
    document.addEventListener('visibilitychange', onShow)
    window.addEventListener('pageshow', onShow)
    return () => {
      document.removeEventListener('visibilitychange', onShow)
      window.removeEventListener('pageshow', onShow)
    }
  }, [load])

  useEffect(() => {
    reportsCache.openedId = null
    const timer = setTimeout(() => setBackFrom(null), 700)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Drop the one-shot state from this history entry only (react-router keeps it in history.state.usr):
    // nothing re-renders and no page slide runs.
    if (location.state) clearHistoryState()
  }, [location.state])

  function retry() {
    setRetrying(true)
    void load().finally(() => setRetrying(false))
  }

  const all = [...(reports ?? [])].sort((a, b) => band(a) - band(b))
  const shown = all.filter((r) => filter === 'all' || r.kind === filter)
  const active = all.filter((r) => !FINISHED.includes(r.pill)).length
  const anyExpired = all.some((r) => r.pill === 'Expired')

  return (
    <main className={s.page}>
      <BackHeader label={reports ? t(reports.length === 1 ? 'reports.countOne' : 'reports.count', { n: reports.length }) : undefined} />

      <h1 className={s.title}>
        {t('reports.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('reports.h2')}</span>
      </h1>

      {arrival.posted && (
        <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64} motion="wiggle">
          {arrival.posted === 'lost' ? t('reports.posted.lost') : t('reports.posted.found')}
        </ZarqaBubble>
      )}
      {arrival.notice && <Notice>{arrival.notice === 'closed' ? t('reports.closedNotice') : t('reports.deletedNotice')}</Notice>}

      {!reports && (failed ? <LoadError onRetry={retry} busy={retrying} /> : <LoadingState />)}

      {reports && reports.length > 0 && (
        <div className={s.filters} role="group" aria-label={t('reports.filter')}>
          {(['all', 'lost', 'found'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={s.filter}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f)
                setStagger(false)
              }}
            >
              {t(`reports.filter.${f}`)}
            </button>
          ))}
        </div>
      )}

      <div className={s.list}>
        {shown.map((r, i) => {
          const href = reportHref(r)
          const opensTicket = href === `/reports/${r.id}`
          const when = r.eventDate ?? campusDate(r.createdAt)
          const done = FINISHED.includes(r.pill)
          const sticker = r.pill === 'Possible match' ? t('reports.spotted') : r.pill === 'Ready to collect' ? t('reports.readySticker') : null
          // A second suggestion while this report is already in a chat or a pickup: the card leads elsewhere.
          const another = r.matchId && r.pill !== 'Possible match' ? r.matchId : null
          return (
            <Fragment key={r.id}>
              <Link
                to={href}
                // The report goes along, so its ticket opens at once and this card can grow into it.
                state={opensTicket ? { report: r } : undefined}
                className={`${s.card} ${done ? s.done : ''} ${sticker ? s.withSticker : ''}`}
                data-enter={stagger ? '' : undefined}
                style={{ '--i': Math.min(i, 8), viewTransitionName: backFrom === r.id ? 'report-ticket' : undefined }}
                onClick={(e) => {
                  if (opensTicket) e.currentTarget.style.viewTransitionName = 'report-ticket'
                }}
              >
                <ItemThumb kind={r.kind} categoryKey={r.categoryKey} photoId={(r.photoIds ?? [])[0]} sensitive={r.isSensitive} />
                <span className={s.cardText}>
                  {/* Only the place shortens, so the date always shows. */}
                  <span className={s.typeLine}>
                    <span className={s.typeFixed}>{r.kind === 'lost' ? t('reports.kind.lost') : t('reports.kind.found')}</span>
                    {/* Its own separator shrinks with it: squeezed to nothing, the line reads "FOUND · 9 NOV". */}
                    {r.locationText && (
                      <span className={s.typePlace}>
                        {' · '}
                        <bdi>{r.locationText}</bdi>
                      </span>
                    )}
                    <span className={s.typeFixed}>{` · ${relativeDay(when)}`}</span>
                  </span>
                  <UserText className={s.name}>{r.title}</UserText>
                  <StatusPill status={r.pill as PillStatus} />
                </span>
                <ChevronRight size={18} color="var(--ink-muted)" />
                {sticker && (
                  <span className={s.sticker} data-enter="sticker" style={{ '--delay': `${Math.min(i, 8) * 45 + 260}ms` }}>
                    <Sticker rotate={3}>{sticker}</Sticker>
                  </span>
                )}
              </Link>
              {another && (
                <Link to={`/matches/${another}`} className={s.another}>
                  <span>{t('reports.anotherMatch')}</span>
                  <ChevronRight size={16} color="var(--tan)" />
                </Link>
              )}
            </Fragment>
          )
        })}
        {reports && reports.length > 0 && shown.length === 0 && filter !== 'all' && (
          <p className={s.filterEmpty} role="status">
            {t(`reports.filterEmpty.${filter}`)}
          </p>
        )}
      </div>

      {reports && reports.length === 0 && (
        <div className={s.empty}>
          <img src="/mascot/empty-sad.webp" alt="" className={`${s.emptyArt} ${zarqaMotion('sway')}`} />
          <p className={s.emptyText} data-enter style={{ '--delay': '200ms' }}>{t('reports.empty')}</p>
          <BigButton to="/" label={t('reports.postOne')} />
        </div>
      )}

      {reports && reports.length > 0 && active === 0 && !anyExpired && filter === 'all' && (
        <ZarqaBubble mascot="reading" alt="Zarqa" width={64} quiet>
          {t('reports.allDone')}
        </ZarqaBubble>
      )}
    </main>
  )
}
