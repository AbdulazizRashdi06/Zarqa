import { useEffect, useId, useState } from 'react'
import { useParams } from 'react-router'
import { useNavigate } from '../lib/transition'
import { ItemIcon } from '../components/ItemThumb'
import { ChevronDown } from '../components/icons'
import { BackHeader, BigButton, LuggageTag, MonoLabel, Sticker, Ticket, ZarqaBubble } from '../components/ui'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { clockTime, relativeDay } from '../lib/dates'
import s from './Match.module.css'

type Side = { id: string; title: string; description: string; categoryKey: string | null; locationText: string; eventDate: string | null; eventTime: string | null; photoIds: string[]; createdAt: string; isSensitive: boolean }
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
  /** Held for the RSA desk: "Could be mine" gives a pickup code instead of a chat. */
  atRsa: boolean
  rsaReceived: boolean
  pickupCode: string | null
  collected: boolean
}

type Level = 'small' | 'looks' | 'big'
/** Before 2026-11-01 the API said strong/likely; a server not yet redeployed may still send them. */
const levelOf = (strength: MatchView['strength']): Level =>
  strength === 'big' || strength === 'strong' ? 'big' : strength === 'looks' || strength === 'likely' ? 'looks' : 'small'

const when = (x: Side) =>
  [x.locationText || null, x.eventDate ? `${relativeDay(x.eventDate)}${x.eventTime ? ` · ~${clockTime(x.eventTime)}` : ''}` : null].filter(Boolean).join(' · ')

/** "Is this yours?" (design/screens/Match.dc.html). Only the lost owner gets here. */
export default function Match() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchView | null>(null)
  const [error, setError] = useState('')
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showWords, setShowWords] = useState(false)
  const wordsId = useId()

  useEffect(() => {
    api<MatchView>(`/matches/${id}`)
      .then(setMatch)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setGone(true)
        else setError(e instanceof ApiError ? e.message : t('common.error'))
      })
  }, [id])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ conversationId?: string; pickupCode?: string }>(`/matches/${id}/confirm`, { method: 'POST' })
      if (r.conversationId) {
        navigate(`/chats/${r.conversationId}`, { replace: true })
        return
      }
      setMatch(await api<MatchView>(`/matches/${id}`))
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    try {
      await api(`/matches/${id}/reject`, { method: 'POST' })
      navigate('/reports', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'))
      setBusy(false)
    }
  }

  const level = levelOf(match?.strength ?? 'small')
  const label = t(`match.${level}`)

  // The stamp lands 0.8s into the reveal (Match.module.css): a tap you can feel, where the phone allows it.
  const revealing = match?.status === 'Suggested'
  useEffect(() => {
    if (!revealing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setTimeout(() => navigator.vibrate?.(14), 830)
    return () => clearTimeout(timer)
  }, [revealing])

  if (!match) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        {error && <p className={s.error}>{error}</p>}
        {gone && (
          <>
            <ZarqaBubble mascot="question" alt="" width={70} quiet>
              {t('match.gone')}
            </ZarqaBubble>
            <BigButton to="/reports" label={t('match.toReports')} />
          </>
        )}
      </main>
    )
  }

  if (match.status === 'Confirmed' && match.pickupCode) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        <h1 className={s.title} data-enter="headline">
          {match.collected ? t('match.pickup.collected') : t('match.pickup.h1')}
        </h1>
        {!match.collected && (
          <>
            <Ticket data-enter="pop" style={{ '--delay': '120ms' }}>
              <div className={s.pickup}>
                <MonoLabel color="var(--ink-muted)">{t('match.pickup.label')}</MonoLabel>
                <p className={s.pickupCode} aria-label={match.pickupCode.split('').join(' ')}>{match.pickupCode}</p>
                <p className={s.pickupItem}>{match.lost.title}</p>
                <p>{t('match.pickup.where')}</p>
                <p>{t('match.pickup.bring')}</p>
              </div>
            </Ticket>
            <ZarqaBubble mascot={match.rsaReceived ? 'happy' : 'reading'} alt="Zarqa" width={60} quiet>
              {match.rsaReceived ? t('match.pickup.ready') : t('match.pickup.notYet')}
            </ZarqaBubble>
          </>
        )}
        <BigButton to="/reports" label={t('match.toReports')} />
      </main>
    )
  }

  const spottedAt = new Date(match.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })

  return (
    <main className={s.page}>
      <BackHeader to="/reports" label={t('match.spottedAt', { time: spottedAt })} />

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

      <h1 className={s.title}>
        <span data-enter="headline" style={{ display: 'block' }}>{t('match.h1')}</span>
        <span data-enter="headline" style={{ display: 'block', color: 'var(--tan)', '--i': 2 }}>{t('match.h2')}</span>
      </h1>

      <div className={s.tags}>
        <LuggageTag className={s.lostTag} hole={12} style={{ position: 'absolute' }}>
          <span className={`${s.stampSmall}`} style={{ color: 'var(--tan-dark)' }}>{t('match.youLost')}</span>
          <ItemIcon categoryKey={match.lost.categoryKey} size={34} />
          <span className={s.tagName}>{match.lost.title}</span>
          <span className={s.tagMeta} style={{ color: 'var(--ink-muted)' }}>{when(match.lost)}</span>
        </LuggageTag>
        <LuggageTag className={s.foundTag} hole={12} style={{ position: 'absolute' }}>
          <span className={s.stampSmall}>{t('match.someoneFound')}</span>
          <ItemIcon categoryKey={match.found.categoryKey} size={34} />
          <span className={s.tagName}>{match.found.title}</span>
          <span className={s.tagMeta}>{when(match.found)}</span>
        </LuggageTag>
        <div className={s.stamp} role="img" aria-label={label}>
          <span className={s.stampBig} aria-hidden="true">MATCH</span>
        </div>
      </div>

      {match.found.photoIds.length > 0 && (
        <div className={s.photos} role="group" aria-label={t('match.theirPhotos')}>
          {match.found.photoIds.map((p, i) => (
            <img
              key={p}
              src={`/api/photos/${p}`}
              alt={t('match.photoN', { n: i + 1, total: match.found.photoIds.length })}
              className={s.photo}
              data-enter="pop"
              style={{ '--delay': '700ms', '--i': i }}
            />
          ))}
        </div>
      )}
      {match.found.isSensitive && match.found.photoIds.length > 0 && <p className={s.coveredNote}>{t('match.covered')}</p>}

      {match.reasons.length > 0 && (
        <div className={s.reasons}>
          {match.reasons.map((r, i) => (
            <div key={r} className={s.reason} data-enter style={{ '--delay': '800ms', '--i': i }}>
              <span className={s.reasonNum}>0{i + 1}</span>
              {r}
            </div>
          ))}
        </div>
      )}

      {match.found.description && (
        <div className={s.words}>
          <button type="button" className={s.wordsToggle} aria-expanded={showWords} aria-controls={wordsId} onClick={() => setShowWords((v) => !v)}>
            {t('match.theirWords')}
            <ChevronDown size={18} style={{ transform: showWords ? 'rotate(180deg)' : undefined }} />
          </button>
          <blockquote id={wordsId} className={s.wordsText} hidden={!showWords}>
            {match.found.description}
          </blockquote>
        </div>
      )}

      <div className={s.bar}>
        {error && <p className={s.error}>{error}</p>}
        {match.status === 'Suggested' && (
          <>
            <BigButton label={t('match.mine')} labelSize={30} onClick={confirm} disabled={busy} />
            <p className={s.mineNote}>{match.atRsa ? t('match.mineNote.rsa') : t('match.mineNote')}</p>
            <button type="button" className={s.notMine} onClick={reject} disabled={busy}>
              {t('match.notMine')}
            </button>
          </>
        )}
        {match.status === 'Confirmed' && match.conversationId && <BigButton label={t('match.openChat')} to={`/chats/${match.conversationId}`} />}
        {(match.status === 'Rejected' || match.status === 'Expired') && (
          <ZarqaBubble mascot="reading" alt="Zarqa" width={56} quiet>
            {t('match.closed')}
          </ZarqaBubble>
        )}
      </div>
    </main>
  )
}
