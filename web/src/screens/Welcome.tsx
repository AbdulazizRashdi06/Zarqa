import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useSession, type Me } from '../auth/session'
import { BigButton, Wordmark, ZarqaBubble } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import s from './SignIn.module.css'

/** First sign-in: pick the first name other students see in chats. Not in the design; built in its style. */
export default function Welcome() {
  const { me, setMe } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState(me?.firstName ?? me?.suggestedFirstName ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setMe(await api<Me>('/me', { method: 'PATCH', body: { firstName: name } }))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={s.page}>
      <div className={s.top}>
        <Wordmark size={26} />
      </div>

      <h1 className={s.codeTitle} style={{ marginTop: 40 }}>
        {t('welcome.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('welcome.h2')}</span>
      </h1>

      <ZarqaBubble mascot="portrait" alt="Zarqa" width={96}>
        {t('welcome.zarqa')}
      </ZarqaBubble>

      <form className={s.form} onSubmit={save} noValidate>
        <label htmlFor="first-name" className={s.label}>
          {t('welcome.label')}
        </label>
        <input
          id="first-name"
          className={s.input}
          autoComplete="given-name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!error}
          aria-describedby="name-help"
        />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('welcome.saving') : t('welcome.go')} disabled={busy || !name.trim()} />
        </div>
        <p id="name-help" className={s.help}>
          {t('welcome.help')}
        </p>
      </form>
    </main>
  )
}
