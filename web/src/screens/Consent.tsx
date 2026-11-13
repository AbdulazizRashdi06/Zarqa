import { useState, type FormEvent } from 'react'
import { Link } from '../lib/nav'
import { useNavigate } from '../lib/transition'
import { useSession, type Me } from '../auth/session'
import { BigButton, Wordmark, ZarqaBubble } from '../components/ui'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { CONSENT_VERSION } from '../lib/consent'
import s from './SignIn.module.css'
import c from './Consent.module.css'

/**
 * Express, recorded consent before anything else (Oman PDPL Art. 10, and Executive Regulations Art. 37 for
 * processing outside Oman). Shown after sign-in, and again whenever CONSENT_VERSION changes.
 */
export default function Consent() {
  const { setMe, signOut } = useSession()
  const navigate = useNavigate()
  const [adult, setAdult] = useState(false)
  const [agree, setAgree] = useState(false)
  const [abroad, setAbroad] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = adult && agree && abroad

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError('')
    try {
      const saved = await api<Me>('/me/consent', { body: { version: CONSENT_VERSION } })
      navigate('/', { replace: true, dir: 'forward', prepare: () => setMe(saved) })
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

      <h1 className={s.codeTitle} style={{ marginTop: 24 }} data-enter="headline">
        {t('consent.h1')}
        <br />
        <span style={{ color: 'var(--tan)' }}>{t('consent.h2')}</span>
      </h1>

      <ZarqaBubble mascot="portrait" alt={t('consent.alt')}>
        {t('consent.zarqa')}
      </ZarqaBubble>

      <ul className={c.points}>
        <li>{t('consent.p1')}</li>
        <li>{t('consent.p2')}</li>
        <li>{t('consent.p3')}</li>
        <li>{t('consent.p4')}</li>
      </ul>

      <p className={s.help}>
        {t('consent.read')} <Link to="/terms">{t('consent.terms')}</Link> · <Link to="/privacy">{t('consent.privacy')}</Link>
      </p>

      <form className={s.form} onSubmit={save} noValidate>
        <label className={c.check}>
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>{t('consent.age')}</span>
        </label>
        <label className={c.check}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{t('consent.agree')}</span>
        </label>
        <label className={c.check}>
          <input type="checkbox" checked={abroad} onChange={(e) => setAbroad(e.target.checked)} />
          <span>{t('consent.abroad')}</span>
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div style={{ marginTop: 8 }}>
          <BigButton type="submit" label={busy ? t('consent.saving') : t('consent.go')} busy={busy} disabled={busy || !ready} />
        </div>
        <p className={s.help}>{t('consent.help')}</p>
        <button type="button" className={s.linkBtn} onClick={() => void signOut()}>
          {t('consent.decline')}
        </button>
      </form>
    </main>
  )
}
