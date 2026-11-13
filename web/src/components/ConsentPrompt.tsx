import { useEffect, useRef, useState } from 'react'
import { useSession, type Me } from '../auth/session'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { CONSENT_VERSION } from '../lib/consent'
import { ConsentCheck } from './ConsentCheck'
import { BigButton } from './ui'
import c from './consent.module.css'

/** Asked once of accounts that signed in before consent was recorded, or when the Terms/Privacy version changes. */
export function ConsentPrompt() {
  const { setMe, signOut } = useSession()
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => title.current?.focus(), [])

  async function accept() {
    if (busy || !accepted) return
    setBusy(true)
    setError('')
    try {
      setMe(await api<Me>('/me/consent', { body: { version: CONSENT_VERSION } }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'))
      setBusy(false)
    }
  }

  return (
    <div className={c.backdrop}>
      <div className={c.sheet} role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title" ref={title} tabIndex={-1}>
          {t('consent.update.title')}
        </h2>
        <p>{t('consent.update.body')}</p>
        <ConsentCheck checked={accepted} onChange={setAccepted} />
        {error && <p role="alert">{error}</p>}
        <BigButton label={busy ? t('signin.sending') : t('consent.update.go')} busy={busy} disabled={busy || !accepted} onClick={accept} />
        <button type="button" className={c.signOut} onClick={() => void signOut()}>
          {t('consent.update.signOut')}
        </button>
      </div>
    </div>
  )
}
