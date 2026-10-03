import { useEffect, useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ItemIcon } from '../components/ItemThumb'
import { ChevronDown } from '../components/icons'
import { BackHeader, BigButton, LuggageTag, Sticker, ZarqaBubble } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { clockTime, relativeDay } from '../lib/dates'
import s from './Match.module.css'

type Side = { id: string; title: string; description: string; categoryKey: string | null; locationText: string; eventDate: string | null; eventTime: string | null; photoIds: string[]; createdAt: string }
type MatchView = {
  id: string
  status: 'Suggested' | 'Confirmed' | 'Rejected' | 'Expired'
  finalScore: number
  strength: 'strong' | 'likely'
  reasons: string[]
  createdAt: string
  lost: Side
  found: Side
  conversationId: string | null
}

const when = (x: Side) =>
  [x.locationText || null, x.eventDate ? `${relativeDay(x.eventDate)}${x.eventTime ? ` · ~${clockTime(x.eventTime)}` : ''}` : null].filter(Boolean).join(' · ')

/** "Is this yours?" (design/screens/Match.dc.html). Only the lost owner gets here. */
export default function Match() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [match, setMatch] = useState<MatchView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showWords, setShowWords] = useState(false)
  const wordsId = useId()

  useEffect(() => {
    api<MatchView>(`/matches/${id}`)
      .then(setMatch)
      .catch((e) => setError(e instanceof ApiError ? e.message : t('common.error')))
  }, [id])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const r = await api<{ conversationId: string }>(`/matches/${id}/confirm`, { method: 'POST' })
      navigate(`/chats/${r.conversationId}`, { replace: true })
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

  if (!match) {
    return (
      <main className={s.page}>
        <BackHeader to="/reports" />
        {error && <p className={s.error}>{error}</p>}
      </main>
    )
  }

  const spottedAt = new Date(match.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Muscat' })

  return (
    <main className={s.page}>
      <BackHeader to="/reports" label={t('match.spottedAt', { time: spottedAt })} />

      <div className={s.mascot} aria-hidden="true">
        <Sticker rotate={6} style={{ marginBottom: -6, position: 'relative', zIndex: 1 }}>
          {t('match.spotted')}
        </Sticker>
        <img src="/mascot/happy.webp" alt="" />
      </div>

      <h1 className={s.title}>
        {t('match.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('match.h2')}</span>
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
        <div className={s.stamp} aria-label={match.strength === 'strong' ? t('match.strong') : t('match.likely')}>
          <span className={s.stampSmall}>{match.strength === 'strong' ? 'STRONG' : 'LIKELY'}</span>
          <span className={s.stampBig}>MATCH</span>
        </div>
      </div>

      {match.found.photoIds.length > 0 && (
        <div className={s.photos} role="group" aria-label={t('match.theirPhotos')}>
          {match.found.photoIds.map((p, i) => (
            <img key={p} src={`/api/photos/${p}`} alt={t('match.photoN', { n: i + 1, total: match.found.photoIds.length })} className={s.photo} />
          ))}
        </div>
      )}

      {match.reasons.length > 0 && (
        <div className={s.reasons}>
          {match.reasons.map((r, i) => (
            <div key={r} className={s.reason}>
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
            <p className={s.mineNote}>{t('match.mineNote')}</p>
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
