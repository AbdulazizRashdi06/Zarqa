import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useNavigate } from '../lib/transition'
import { ItemIcon } from '../components/ItemThumb'
import { ChevronDown, ChevronLeft, ChevronRight, Close } from '../components/icons'
import { ConfirmSheet, InlineError, LoadError, LoadingState, UserText } from '../components/states'
import { BackHeader, BigButton, LuggageTag, MonoLabel, Sticker, Ticket, ZarqaBubble } from '../components/ui'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { campusDate, clockTime, relativeDay } from '../lib/dates'
import s from './Match.module.css'

type Side = {
  id: string
  title: string
  description: string
  categoryKey: string | null
  locationText: string
  eventDate: string | null
  eventTime: string | null
  photoIds: string[]
  createdAt: string
  isSensitive: boolean
  /** A photo exists that stays with the finder (a card photo not covered yet). */
  hasPrivatePhoto?: boolean
}
type MatchView = {
  id: string
  status: 'Suggested' | 'Confirmed' | 'Rejected' | 'Expired'
  finalScore: number
  /** How sure the suggestion sounds to the owner: small (55–64), looks like it (65–79), big (80+). */
  strength: Level | 'strong' | 'likely'
  reasons: string[]
  createdAt: string
  lost: Side
  found: Side
  conversationId: string | null
  /** Held for the RSA desk: "Could be mine" gives a pickup code instead of a chat. rsaReceived: it's there now. */
  atRsa: boolean
  rsaReceived: boolean
  pickupCode: string | null
  collected: boolean
  /** Still suggested, but someone else has claimed the item for now. */
  taken?: boolean
}

type Level = 'small' | 'looks' | 'big'
/** Before 2026-11-01 the API said strong/likely; a server not yet redeployed may still send them. */
const levelOf = (strength: MatchView['strength']): Level =>
  strength === 'big' || strength === 'strong' ? 'big' : strength === 'looks' || strength === 'likely' ? 'looks' : 'small'

const timeOf = (x: Side) => (x.eventDate ? `${relativeDay(x.eventDate)}${x.eventTime ? ` · ~${clockTime(x.eventTime)}` : ''}` : '')

/** "K7P-4QM" read out a character at a time. */
const spelled = (code: string) => code.replace(/-/g, '').split('').join(' ')

// The reveal plays once per match on this phone; later visits open settled, with no vibration.
const SEEN_KEY = 'zarqa.matchesSeen'
function seenBefore(id: string) {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    if (seen.includes(id)) return true
    localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...seen].slice(0, 50)))
  } catch {
    // Private mode or blocked storage: just play it.
  }
  return false
}

type Busy = 'mine' | 'notMine' | 'release' | null

/** "Is this yours?" (design/screens/Match.dc.html). Only the lost owner gets here. */
export default function Match() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [asking, setAsking] = useState<'reject' | 'release' | null>(null)
  const [justRejected, setJustRejected] = useState(false)
  const [reveal, setReveal] = useState<boolean | null>(null)
  const [showWords, setShowWords] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const wordsId = useId()
  const h1 = useRef<HTMLHeadingElement>(null)
  // After an action swaps the page (ticket, closed), move focus to its new heading so it's read out.
  const focusAfter = useRef(false)
  const lastLoad = useRef(0)

  const load = useCallback(() => {
    lastLoad.current = Date.now()
    return api<MatchView>(`/matches/${id}`).then(
      (m) => {
        const fresh = !seenBefore(m.id)
        setReveal((r) => r ?? (fresh && m.status === 'Suggested'))
        setMatch(m)
        setLoadError('')
      },
      (e) => {
        if (e instanceof ApiError && e.status === 404) setGone(true)
        else setLoadError(e instanceof ApiError ? e.message : t('common.loadError'))
      },
    )
  }, [id])

  function retry() {
    setRetrying(true)
    void load().finally(() => setRetrying(false))
  }

  useEffect(() => {
    void load()
  }, [load])

  // An installed app is resumed, not reloaded: check again when it comes back to the front.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 5000) void load()
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('pageshow', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('pageshow', again)
    }
  }, [load])

  useEffect(() => {
    if (!focusAfter.current) return
    focusAfter.current = false
    h1.current?.focus()
  })

  async function confirm() {
    if (!match) return
    setBusy('mine')
    setError('')
    let r: { conversationId?: string; pickupCode?: string }
    try {
      r = await api<{ conversationId?: string; pickupCode?: string }>(`/matches/${id}/confirm`, { method: 'POST' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
      setBusy(null)
      // Someone else may have claimed it meanwhile: show that instead of a button that keeps failing.
      api<MatchView>(`/matches/${id}`).then(setMatch, () => {})
      return
    }
    if (r.conversationId) {
      navigate(`/chats/${r.conversationId}`, { replace: true })
      return
    }
    // The claim went through: show the ticket now, then fill in the rest. A failed refresh doesn't undo it.
    focusAfter.current = true
    setMatch({ ...match, status: 'Confirmed', pickupCode: r.pickupCode ?? null })
    setBusy(null)
    window.scrollTo({ top: 0 })
    api<MatchView>(`/matches/${id}`).then(setMatch, () => {})
  }

  async function reject() {
    if (!match) return
    setBusy('notMine')
    setError('')
    try {
      await api(`/matches/${id}/reject`, { method: 'POST' })
      focusAfter.current = true
      setJustRejected(true)
      setAsking(null)
      setMatch({ ...match, status: 'Rejected' })
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(null)
    }
  }

  async function release() {
    if (!match) return
    setBusy('release')
    setError('')
    try {
      await api(`/matches/${id}/release`, { method: 'POST' })
      focusAfter.current = true
      setJustRejected(true)
      setAsking(null)
      setMatch({ ...match, status: 'Rejected', pickupCode: null })
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
    } finally {
      setBusy(null)
    }
  }

  const level = levelOf(match?.strength ?? 'small')
  const label = t(`match.${level}`)

  // The stamp lands 0.8s into the reveal (Match.module.css): a tap you can feel, where the phone allows it.
  // Only on the first visit, and not for a small chance.
  const vibrate = reveal === true && match?.status === 'Suggested' && level !== 'small'
  useEffect(() => {
    if (!vibrate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setTimeout(() => navigator.vibrate?.(14), 830)
    return () => clearTimeout(timer)
  }, [vibrate])

  if (!match) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        {gone ? (
          <>
            <h1 className={s.title} tabIndex={-1}>
              {t('match.goneH1')}
            </h1>
            <ZarqaBubble mascot="question" alt="" width={70} quiet>
              {t('match.gone')}
            </ZarqaBubble>
            <BigButton to="/reports" label={t('match.toReports')} />
          </>
        ) : loadError ? (
          <>
            <h1 className="visually-hidden">{t('match.title')}</h1>
            <LoadError message={loadError} onRetry={retry} busy={retrying} />
          </>
        ) : (
          <>
            <h1 className="visually-hidden">{t('match.title')}</h1>
            <LoadingState />
          </>
        )}
      </main>
    )
  }

  const reasons = match.reasons ?? []
  const photoIds = match.found.photoIds ?? []
  const closeSheet = () => {
    setAsking(null)
    setError('')
  }

  if (match.status === 'Confirmed' && match.pickupCode) {
    const ready = match.rsaReceived
    const bubble = (
      <ZarqaBubble mascot={ready ? 'happy' : 'reading'} alt="Zarqa" width={60} quiet>
        {ready ? t('match.pickup.ready') : t('match.pickup.notYet')}
      </ZarqaBubble>
    )
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        <h1 ref={h1} tabIndex={-1} className={s.title} data-enter="headline">
          {match.collected ? t('match.pickup.collected') : ready ? t('match.pickup.h1') : t('match.pickup.notYetH1')}
        </h1>
        {!match.collected && (
          <>
            {!ready && bubble}
            <Ticket data-enter="pop" style={{ '--delay': '120ms' }}>
              <div className={s.pickup}>
                <MonoLabel color="var(--ink-muted)">{t('match.pickup.label')}</MonoLabel>
                <p className={`${s.pickupCode} ${ready ? '' : s.pickupCodeWaiting}`}>
                  <span aria-hidden="true">{match.pickupCode}</span>
                  <span className="visually-hidden">{spelled(match.pickupCode)}</span>
                </p>
                <UserText as="p" className={s.pickupItem}>
                  {match.lost.title}
                </UserText>
                <p>{t('match.pickup.where')}</p>
                <p>{t('match.pickup.bring')}</p>
              </div>
            </Ticket>
            {ready && bubble}
          </>
        )}
        <BigButton to="/reports" label={t('match.toReports')} />
        {!match.collected && (
          <button type="button" className={s.notMine} onClick={() => setAsking('release')}>
            {t('match.release.link')}
          </button>
        )}
        <ConfirmSheet
          open={asking === 'release'}
          title={t('match.release.title')}
          body={t('match.release.body')}
          confirmLabel={t('match.release.go')}
          cancelLabel={t('match.release.keep')}
          busy={busy === 'release'}
          error={asking === 'release' ? error : ''}
          onConfirm={release}
          onCancel={closeSheet}
        />
      </main>
    )
  }

  const chatting = match.status === 'Confirmed' && !!match.conversationId
  if (match.status !== 'Suggested' && !chatting) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        <h1 ref={h1} tabIndex={-1} className={s.title}>
          {t('match.closedH1')}
        </h1>
        <ZarqaBubble mascot={justRejected ? 'happy' : 'reading'} alt="" width={64} quiet>
          {justRejected ? t('match.rejectedNow') : match.status === 'Expired' ? t('match.expired') : t('match.closed')}
        </ZarqaBubble>
        <BigButton to="/reports" label={t('match.toReports')} />
      </main>
    )
  }

  const spottedAt = `${relativeDay(campusDate(match.createdAt))} · ${clockTime(
    new Date(match.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Muscat' }),
  )}`
  const suggested = match.status === 'Suggested'

  const tag = (x: Side, kind: 'lost' | 'found') => (
    <LuggageTag className={kind === 'lost' ? s.lostTag : s.foundTag} hole={12}>
      <span className={s.stampSmall}>{kind === 'lost' ? t('match.youLost') : t('match.someoneFound')}</span>
      <ItemIcon categoryKey={x.categoryKey} size={34} />
      <UserText className={s.tagName}>{x.title}</UserText>
      <span className={s.tagMeta}>
        {x.locationText && <UserText className={s.tagPlace}>{x.locationText}</UserText>}
        {timeOf(x) && <span>{timeOf(x)}</span>}
      </span>
    </LuggageTag>
  )

  return (
    <main className={`${s.page} ${reveal ? '' : s.settled}`}>
      <BackHeader to="/reports" label={t('match.spottedAt', { when: spottedAt })} />

      {suggested && (
        <div className={s.mascot} aria-hidden="true">
          {/* Her face and the sticker say how sure Zarqa is: confused, happy or really happy. */}
          <span className={s.verdict}>
            <Sticker rotate={6} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
              {label}
            </Sticker>
          </span>
          {/* Sure: an excited wiggle. Likely: she just breathes. Unsure: she sways, thinking it over. */}
          <img src={`/mascot/match-${level}.webp`} alt="" className={zarqaMotion(level === 'big' ? 'wiggle' : level === 'looks' ? 'breathe' : 'sway')} />
        </div>
      )}

      {suggested ? (
        <h1 ref={h1} tabIndex={-1} className={s.title}>
          <span data-enter="headline" style={{ display: 'block' }}>
            {t('match.h1')}
          </span>
          <span data-enter="headline" style={{ display: 'block', color: 'var(--tan)', '--i': 2 }}>
            {t('match.h2')}
          </span>
        </h1>
      ) : (
        <>
          <h1 ref={h1} tabIndex={-1} className={s.title}>
            {t('match.chattingH1')}
          </h1>
          <BigButton label={t('match.openChat')} to={`/chats/${match.conversationId}`} />
        </>
      )}

      <div className={`${s.tags} ${suggested ? '' : s.tagsPlain}`} data-level={level}>
        {tag(match.lost, 'lost')}
        {tag(match.found, 'found')}
        {suggested && (
          <div className={s.stamp} role="img" aria-label={label}>
            <span className={s.stampBig} aria-hidden="true">
              {t(`match.stamp.${level}`)}
            </span>
          </div>
        )}
      </div>

      {photoIds.length > 0 && (
        <div className={s.photos} role="group" aria-label={t('match.theirPhotos')} tabIndex={0}>
          {photoIds.map((p, i) => (
            <Photo key={p} id={p} n={i + 1} total={photoIds.length} onOpen={() => setViewing(i)} />
          ))}
        </div>
      )}
      {match.found.isSensitive && photoIds.length > 0 && <p className={s.coveredNote}>{t('match.covered')}</p>}
      {match.found.hasPrivatePhoto && photoIds.length === 0 && (
        <p className={s.privateNote}>{match.atRsa ? t('match.privatePhoto.rsa') : t('match.privatePhoto')}</p>
      )}

      {reasons.length > 0 && (
        <ol className={s.reasons} aria-label={t('match.reasons')}>
          {reasons.map((r, i) => (
            <li key={r} className={s.reason} data-enter style={{ '--delay': '800ms', '--i': i }}>
              <span className={s.reasonNum} aria-hidden="true">
                0{i + 1}
              </span>
              <span className={s.reasonText}>{r}</span>
            </li>
          ))}
        </ol>
      )}

      {match.found.description && (
        <div className={s.words}>
          <button type="button" className={s.wordsToggle} aria-expanded={showWords} aria-controls={wordsId} onClick={() => setShowWords((v) => !v)}>
            {t('match.theirWords')}
            <ChevronDown size={18} style={{ transform: showWords ? 'rotate(180deg)' : undefined }} />
          </button>
          <blockquote id={wordsId} dir="auto" className={`user-text ${s.wordsText}`} hidden={!showWords}>
            {match.found.description}
          </blockquote>
        </div>
      )}

      {suggested && (
        <>
          {match.taken ? (
            <div className={s.takenNote}>
              <ZarqaBubble mascot="reading" alt="" width={56} quiet>
                {t('match.taken')}
              </ZarqaBubble>
            </div>
          ) : (
            <>
              {/* Stays on screen while the details scroll under it, so the answer is never below the fold. */}
              <div className={s.bar}>
                <InlineError>{asking ? '' : error}</InlineError>
                <BigButton
                  label={busy === 'mine' ? (match.atRsa ? t('match.mineBusy.rsa') : t('match.mineBusy')) : t('match.mine')}
                  onClick={confirm}
                  disabled={busy !== null}
                  busy={busy === 'mine'}
                />
              </div>
              <p className={s.mineNote}>{match.atRsa ? (match.rsaReceived ? t('match.mineNote.rsaHeld') : t('match.mineNote.rsa')) : t('match.mineNote')}</p>
            </>
          )}
          <button type="button" className={s.notMine} onClick={() => setAsking('reject')} disabled={busy !== null}>
            {t('match.notMine')}
          </button>
          <ConfirmSheet
            open={asking === 'reject'}
            title={t('match.reject.title')}
            body={t('match.reject.body')}
            confirmLabel={t('match.reject.go')}
            cancelLabel={t('match.reject.keep')}
            busy={busy === 'notMine'}
            error={asking === 'reject' ? error : ''}
            onConfirm={reject}
            onCancel={closeSheet}
          />
        </>
      )}

      {viewing !== null && photoIds.length > 0 && <Viewer ids={photoIds} start={viewing} onClose={() => setViewing(null)} />}
    </main>
  )
}

/** One of the finder's photos: its whole picture (never cropped, so a card's edges and name show), tap to enlarge. */
function Photo({ id, n, total, onOpen }: { id: string; n: number; total: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const name = t('match.photoN', { n, total })
  if (failed) {
    return (
      <button
        type="button"
        className={`${s.photo} ${s.photoFailed}`}
        onClick={() => {
          setFailed(false)
          setAttempt((a) => a + 1)
        }}
      >
        {t('match.photoFailed')}
        <span className={s.photoRetry}>{t('common.retry')}</span>
      </button>
    )
  }
  return (
    <button type="button" className={s.photoButton} onClick={onOpen} aria-label={name} data-enter="pop" style={{ '--delay': '700ms', '--i': n - 1 }}>
      <img src={`/api/photos/${id}${attempt ? `?try=${attempt}` : ''}`} alt="" height={132} decoding="async" className={s.photo} onError={() => setFailed(true)} />
    </button>
  )
}

/** Full-screen photo viewer: the whole photo, pinch to zoom, swipe or arrows between photos. */
function Viewer({ ids, start, onClose }: { ids: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const ref = useRef<HTMLDialogElement>(null)
  const touchX = useRef<number | null>(null)
  const go = useCallback((d: number) => setI((x) => Math.min(ids.length - 1, Math.max(0, x + d))), [ids.length])
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={s.viewer}
      aria-label={t('match.photoN', { n: i + 1, total: ids.length })}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1)
        if (e.key === 'ArrowRight') go(1)
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches.length === 1 ? e.touches[0].clientX : null
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
      }}
    >
      <button type="button" className={s.viewerClose} onClick={onClose} aria-label={t('match.viewer.close')} autoFocus>
        <Close size={24} />
      </button>
      <img key={ids[i]} src={`/api/photos/${ids[i]}`} alt={t('match.photoN', { n: i + 1, total: ids.length })} className={s.viewerImg} />
      {ids.length > 1 && (
        <div className={s.viewerNav}>
          <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label={t('match.viewer.prev')}>
            <ChevronLeft size={24} />
          </button>
          <span aria-hidden="true">
            {i + 1} / {ids.length}
          </span>
          <button type="button" onClick={() => go(1)} disabled={i === ids.length - 1} aria-label={t('match.viewer.next')}>
            <ChevronRight size={24} />
          </button>
        </div>
      )}
    </dialog>
  )
}
