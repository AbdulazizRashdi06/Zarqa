import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from '../lib/transition'
import { returnPath, useSession, type Me } from '../auth/session'
import { BigButton, Wordmark, ZarqaBubble } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import s from './SignIn.module.css'

const WAVE = '/mascot/anim/welcome-wave.webp'
const WAVE_STILL = '/mascot/anim/welcome-wave-still.webp'

/** First sign-in: pick the first name other students see in chats. Not in the design; built in its style. */
export default function Welcome() {
  const { me, setMe } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState(me?.firstName ?? me?.suggestedFirstName ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // The wave clip is ~700 KB: her still (25 KB) shows at once and the clip takes over, from its first frame,
  // once it has fully arrived. Reduced motion keeps the still.
  const [wave, setWave] = useState(WAVE_STILL)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const clip = new Image()
    clip.onload = () => setWave(WAVE)
    clip.src = WAVE
    return () => {
      clip.onload = null
    }
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) {
      setError(t('welcome.needName'))
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await api<Me>('/me', { method: 'PATCH', body: { firstName: name } })
      navigate(returnPath() ?? '/', { replace: true, dir: 'forward', prepare: () => setMe(saved) })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={s.page}>
      <div className={s.top}>
        <Wordmark size={26} />
      </div>

      <h1 className={s.codeTitle} style={{ marginTop: 40 }} data-enter="headline">
        {t('welcome.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('welcome.h2')}</span>
      </h1>

      {/* First sign-in, once per person: Zarqa unclasps her hands and waves hello. A 3 s clip made with the
          zarqa-mascot-animation skill (video route), played once; reduced motion gets its last frame as a still. */}
      <ZarqaBubble
        mascot="portrait"
        alt={t('welcome.waveAlt')}
        art={
          <span className={s.wave}>
            <img src={wave} alt={t('welcome.waveAlt')} width={246} height={420} />
          </span>
        }
      >
        {t('welcome.zarqa')}
      </ZarqaBubble>

      <form className={s.form} onSubmit={save} noValidate>
        <label htmlFor="first-name" className={s.label}>
          {t('welcome.label')}
        </label>
        <input
          ref={inputRef}
          id="first-name"
          className={s.input}
          autoComplete="given-name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'name-error name-help' : 'name-help'}
        />
        {error && (
          <p id="name-error" className={s.error} role="alert">
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('welcome.saving') : t('welcome.go')} busy={busy} disabled={busy} />
        </div>
        <p id="name-help" className={s.help}>
          {t('welcome.help')}
        </p>
      </form>
    </main>
  )
}
