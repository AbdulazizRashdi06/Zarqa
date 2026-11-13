import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'react-router'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { BackHeader, BigButton, MonoLabel, StatusPill, Ticket, ZarqaBubble, type PillStatus } from '../components/ui'
import { ConfirmSheet, InlineError, LoadError, LoadingState, Notice, UserText } from '../components/states'
import { t, type StringKey } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, muscatNow, relativeDay } from '../lib/dates'
import { clearDraft, saveFields } from '../lib/draft'
import { clearHistoryState, reportsCache } from '../lib/reportsCache'
import type { Report } from '../lib/types'
import s from './ReportDetail.module.css'

type Ask = 'close' | 'delete' | 'rsa'
type Place = { name: string; aliases: string[] }

const message = (e: unknown) => (e instanceof ApiError ? e.message : t('common.error'))

/** One of my reports: what I posted, plus edit/close/delete. Not in the design; built in the ticket style. */
export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { posted?: string; report?: Report } | null
  // Opened from its card, the report came along: show it at once and refresh it underneath.
  const [report, setReport] = useState<Report | null>(state?.report && state.report.id === id ? state.report : null)
  // 'gone' = the server says there is no such report (deleted, or an old link).
  const [loadFailed, setLoadFailed] = useState<'gone' | 'error' | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState<Ask | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const [brokenPhotos, setBrokenPhotos] = useState<string[]>([])
  // Shown once after posting; cleared from history so Back or a reload don't replay it.
  const [justPosted] = useState(state?.posted === 'rsa')

  useEffect(() => {
    // Going back, this ticket shrinks into its card on My Reports.
    reportsCache.openedId = id ?? null
  }, [id])

  useEffect(() => {
    if (location.state) clearHistoryState()
  }, [location.state])

  const load = useCallback(
    () =>
      api<Report>(`/reports/${id}`)
        .then((r) => {
          setReport(r)
          setLoadFailed(null)
        })
        .catch((e) => setLoadFailed(e instanceof ApiError && e.status === 404 ? 'gone' : 'error')),
    [id],
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

  function retry() {
    setRetrying(true)
    void load().finally(() => setRetrying(false))
  }

  function ask(what: Ask) {
    setError('')
    setAsking(what)
  }

  async function confirm() {
    if (!report || !asking) return
    setBusy(true)
    setError('')
    try {
      if (asking === 'rsa') {
        setReport(await api<Report>(`/reports/${report.id}/rsa`, { method: 'POST' }))
        reportsCache.reports = null
        setAsking(null)
        return
      }
      if (asking === 'close') await api(`/reports/${report.id}/close`, { method: 'POST' })
      else await api(`/reports/${report.id}`, { method: 'DELETE' })
      // The list changed: My Reports should load it again instead of showing this report's old card.
      reportsCache.openedId = null
      navigate('/reports', { replace: true, state: { notice: asking === 'close' ? 'closed' : 'deleted' } })
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  /** "Still looking?" on an expired report: Home opens with this report's words and place filled in. */
  function postAgain() {
    if (!report) return
    clearDraft()
    saveFields({
      mode: report.kind,
      text: report.description || report.title,
      locQuery: report.locationText,
      placeName: report.locationName,
      knowsWhen: false,
      date: '',
      time: '',
    })
    navigate('/')
  }

  if (loadFailed === 'gone') {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        <h1 className={s.goneTitle}>{t('detail.gone.h1')}</h1>
        <ZarqaBubble mascot="question" alt="" width={64} quiet>
          {t('detail.gone')}
        </ZarqaBubble>
        <BigButton to="/reports" label={t('detail.gone.back')} />
      </main>
    )
  }

  if (!report) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        <h1 className="visually-hidden">{t('detail.loading')}</h1>
        {loadFailed ? <LoadError onRetry={retry} busy={retrying} /> : <LoadingState />}
      </main>
    )
  }

  const photoIds = (report.photoIds ?? []).filter((p) => !brokenPhotos.includes(p))
  const accent = report.kind === 'lost' ? 'var(--tan)' : 'var(--sage)'
  const atRsa = report.pill === 'At the RSA' || report.pill === 'Claimed at RSA'
  const ended = report.pill === 'Closed' || report.pill === 'Expired'
  const closable = report.pill === 'Searching' || report.pill === 'Possible match' || report.pill === 'Bring to RSA'
  const chatLive = report.conversationId && (report.pill === 'Chatting' || report.pill === 'Returned')
  const showCode = report.dropAtRsa && report.dropCode && report.status !== 'Returned' && report.status !== 'Closed' && report.status !== 'Expired'
  // Until the desk has it, the code is what the finder came for: it goes first, above the report.
  const codeFirst = showCode && !report.rsaReceived
  const when = report.eventDate
    ? `${relativeDay(report.eventDate)}${report.eventTime ? ` · ~${clockTime(report.eventTime)}` : ''}`
    : t('detail.whenUnknown')
  const privateNote = report.coverState ? t(`detail.private.${report.coverState}` as StringKey) : t('detail.private')

  const codeTicket = showCode && report.dropCode && (
    <Ticket data-enter="pop" style={{ '--delay': codeFirst ? '0ms' : '140ms' }}>
      <div className={s.body}>
        <MonoLabel color="var(--ink-muted)">{t('detail.rsa.label')}</MonoLabel>
        <p className={report.rsaReceived ? s.codeSmall : s.code}>
          <span aria-hidden="true">{report.dropCode}</span>
          <span className="visually-hidden">{report.dropCode.split('').join(' ')}</span>
        </p>
        <p className={s.note}>
          {report.pill === 'Claimed at RSA'
            ? report.rsaReceived
              ? t('detail.rsa.claimed')
              : t('detail.rsa.waiting')
            : report.rsaReceived
              ? t('detail.rsa.held')
              : t('detail.rsa.bring')}
        </p>
      </div>
    </Ticket>
  )

  return (
    <main className={s.page}>
      <BackHeader to="/reports" label={t('detail.posted', { day: relativeDay(campusDate(report.createdAt)).toUpperCase() })} />

      {saved && <Notice>{t('detail.edit.saved')}</Notice>}

      {justPosted && (
        <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64} motion="wiggle">
          {t('reports.posted.rsa')}
        </ZarqaBubble>
      )}

      {codeFirst && codeTicket}

      <Ticket style={{ viewTransitionName: 'report-ticket' }}>
        <div className={s.body}>
          <div className={s.top}>
            <span className={s.tag} style={{ background: accent }}>
              {report.kind === 'lost' ? t('form.tag.lost') : t('form.tag.found')}
            </span>
            <StatusPill status={report.pill as PillStatus} />
          </div>
          <UserText as="h1" className={s.title}>{report.title}</UserText>

          {photoIds.length > 0 && (
            <div className={`${s.photos} ${photoIds.length === 1 ? s.photosOne : ''}`}>
              {photoIds.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  className={s.photoButton}
                  aria-label={t('detail.photo.open', { n: i + 1, total: photoIds.length })}
                  onClick={() => setViewing(i)}
                >
                  <img
                    src={`/api/photos/${p}`}
                    alt=""
                    className={s.photo}
                    decoding="async"
                    onError={() => setBrokenPhotos((b) => [...b, p])}
                    data-enter="pop"
                    style={{ '--i': i, '--delay': '160ms' }}
                  />
                </button>
              ))}
            </div>
          )}
          {report.isSensitive && photoIds.length > 0 && <p className={s.note}>{privateNote}</p>}

          {editing ? (
            <EditForm
              report={report}
              onCancel={() => setEditing(false)}
              onSaved={(r) => {
                setReport(r)
                setEditing(false)
                setSaved(true)
                reportsCache.reports = null
              }}
            />
          ) : (
            <>
              <dl className={s.fields}>
                <dt><MonoLabel color="var(--ink-muted)">{t('detail.what')}</MonoLabel></dt>
                <UserText as="dd">{report.description || report.title}</UserText>
                <dt><MonoLabel color="var(--ink-muted)">{t('detail.where')}</MonoLabel></dt>
                <dd>{report.locationText ? <bdi>{report.locationText}</bdi> : t('detail.whereUnknown')}</dd>
                <dt><MonoLabel color="var(--ink-muted)">{t('detail.when')}</MonoLabel></dt>
                <dd>{when}</dd>
              </dl>
              {report.status === 'Open' && (
                <button
                  type="button"
                  className={s.edit}
                  onClick={() => {
                    setSaved(false)
                    setEditing(true)
                  }}
                >
                  {t('detail.edit')}
                </button>
              )}
            </>
          )}
        </div>
      </Ticket>

      {!codeFirst && codeTicket}

      {report.pill === 'Searching' && !report.dropAtRsa && (
        <ZarqaBubble mascot="reading" alt="Zarqa" width={60} quiet>
          {report.kind === 'lost' ? t('detail.searching.lost') : t('detail.searching.found')}
        </ZarqaBubble>
      )}
      {report.pill === 'Possible match' && report.matchId && (
        <ZarqaBubble mascot="question" alt="Zarqa" width={60} quiet>
          {t('detail.matchWaiting')}
        </ZarqaBubble>
      )}
      {report.pill === 'Returned' && (
        <ZarqaBubble mascot="happy" alt="Zarqa, happy" width={70} motion="bounce">
          {report.kind === 'lost' ? t('detail.returned.lost') : t('detail.returned.found')}
        </ZarqaBubble>
      )}
      {ended && (
        <ZarqaBubble mascot="reading" alt="Zarqa" width={60} quiet>
          {t(`detail.ended.${report.pill}` as StringKey)}
        </ZarqaBubble>
      )}

      {!asking && <InlineError>{error}</InlineError>}

      <div className={s.actions}>
        {report.pill === 'Ready to collect' && report.pickupMatchId && (
          <BigButton to={`/matches/${report.pickupMatchId}`} label={t('detail.pickup')} labelSize={24} />
        )}
        {report.matchId && <BigButton to={`/matches/${report.matchId}`} label={t('detail.seeMatch')} labelSize={24} />}
        {chatLive && <BigButton to={`/chats/${report.conversationId}`} label={t('detail.openChat')} labelSize={24} />}
        {report.kind === 'found' && report.status === 'Open' && report.pill === 'Searching' && !report.dropAtRsa && (
          <BigButton label={t('detail.rsa.instead')} labelSize={22} onClick={() => ask('rsa')} />
        )}
        {report.pill === 'Expired' && <BigButton label={t('detail.repost')} labelSize={22} onClick={postAgain} />}
        {closable && (
          <BigButton
            variant="surface"
            label={report.kind === 'lost' ? t('detail.closeLost') : t('detail.closeFound')}
            labelSize={22}
            onClick={() => ask('close')}
          />
        )}
        {report.conversationId && !chatLive && (
          <Link to={`/chats/${report.conversationId}`} className={s.quiet}>
            {t('detail.earlierChat')}
          </Link>
        )}
        {!report.conversationId && !atRsa && report.pill !== 'Ready to collect' && (
          <button type="button" className={s.delete} onClick={() => ask('delete')}>
            {t('detail.delete')}
          </button>
        )}
      </div>

      <ConfirmSheet
        open={asking !== null}
        title={asking === 'delete' ? t('detail.delete.title') : asking === 'rsa' ? t('detail.rsa.insteadTitle') : t('detail.close.title')}
        body={asking === 'delete' ? t('detail.delete.body') : asking === 'rsa' ? t('detail.rsa.insteadBody') : t('detail.close.body')}
        confirmLabel={asking === 'delete' ? t('detail.delete.go') : asking === 'rsa' ? t('detail.rsa.insteadGo') : t('detail.close.go')}
        cancelLabel={asking === 'delete' ? t('detail.delete.keep') : asking === 'rsa' ? t('detail.rsa.insteadKeep') : t('detail.close.keep')}
        busy={busy}
        error={asking ? error : ''}
        onConfirm={confirm}
        onCancel={() => {
          setAsking(null)
          setError('')
        }}
      />

      {viewing !== null && photoIds[viewing] && (
        <PhotoViewer
          src={`/api/photos/${photoIds[viewing]}`}
          label={t('detail.photo', { n: viewing + 1, total: photoIds.length })}
          onClose={() => setViewing(null)}
        />
      )}
    </main>
  )
}

/** The report's own words, place and day, editable while it is still searching. The server checks it again. */
function EditForm({ report, onCancel, onSaved }: { report: Report; onCancel: () => void; onSaved: (r: Report) => void }) {
  const [text, setText] = useState(report.description || report.title)
  const [where, setWhere] = useState(report.locationText)
  const [date, setDate] = useState(report.eventDate ?? '')
  const [time, setTime] = useState(report.eventTime ?? '')
  const [places, setPlaces] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const textBox = useRef<HTMLTextAreaElement>(null)
  const today = muscatNow().date

  useEffect(() => {
    textBox.current?.focus()
    fetch('/api/locations')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Place[]) => setPlaces(Array.isArray(list) ? list : []))
      .catch(() => setPlaces([]))
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!text.trim()) {
      setError(t('detail.edit.missing'))
      textBox.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    const typed = where.trim()
    const place = places.find((p) => p.name.toLowerCase() === typed.toLowerCase())
    try {
      const updated = await api<Report>(`/reports/${report.id}`, {
        method: 'PATCH',
        body: {
          text,
          locationName: place?.name ?? null,
          locationText: place?.name ?? typed,
          eventDate: date,
          eventTime: date ? time : '',
        },
      })
      onSaved(updated)
    } catch (err) {
      setError(message(err))
      setBusy(false)
    }
  }

  return (
    <form className={s.editForm} onSubmit={save} noValidate>
      <h2 className="visually-hidden">{t('detail.edit.h2')}</h2>
      <label className={s.field}>
        <MonoLabel color="var(--ink-muted)">{t('detail.edit.text')}</MonoLabel>
        <textarea ref={textBox} dir="auto" rows={4} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label className={s.field}>
        <MonoLabel color="var(--ink-muted)">{t('detail.edit.where')}</MonoLabel>
        <input dir="auto" list="report-edit-places" maxLength={120} value={where} onChange={(e) => setWhere(e.target.value)} />
        <datalist id="report-edit-places">
          {places.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>
      </label>
      <div className={s.whenRow}>
        <label className={s.field}>
          <MonoLabel color="var(--ink-muted)">{t('detail.edit.date')}</MonoLabel>
          <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className={s.field}>
          <MonoLabel color="var(--ink-muted)">{t('detail.edit.time')}</MonoLabel>
          <input type="time" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <InlineError onPaper>{error}</InlineError>
      <BigButton type="submit" label={t('detail.edit.save')} labelSize={24} busy={busy} disabled={busy} />
      <button type="button" className={s.editCancel} onClick={onCancel} disabled={busy}>
        {t('detail.edit.cancel')}
      </button>
    </form>
  )
}

/** One photo full screen, uncropped. A native dialog: Esc and the close button shut it, focus returns. */
function PhotoViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const d = ref.current
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
    return () => opener?.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      className={s.viewer}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={onClose}
    >
      <img src={src} alt={label} className={s.viewerPhoto} />
      <button type="button" className={s.viewerClose} onClick={onClose}>
        {t('detail.photo.close')}
      </button>
    </dialog>
  )
}
