import { useEffect, useRef, useState } from 'react'
import { useSession, type Me } from '../auth/session'
import { clearSignIn, loadTick, saveTick } from '../auth/signinDraft'
import { t } from '../i18n'
import { api, ApiError } from '../lib/api'
import { CONSENT_VERSION } from '../lib/consent'
import { ConsentCheck } from './ConsentCheck'
import { InlineError } from './states'
import { BigButton } from './ui'
import c from './consent.module.css'

/** A new version of the app is waiting or the page is old: fetch the latest and start again. */
async function reloadZarqa() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
    if (reg?.waiting) {
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      setTimeout(() => window.location.reload(), 3000)
      return
    }
  } catch {
    // Reload anyway.
  }
  window.location.reload()
}

/**
 * Asked once of accounts that signed in before consent was recorded, or when the Terms/Privacy version changes.
 * A modal <dialog>: nothing behind it can be reached (or posted) until the user agrees or signs out.
 */
export function ConsentPrompt() {
  const { setMe, signOut } = useSession()
  // Kept while the user reads Terms or Privacy and comes back.
  const [accepted, setAccepted] = useState(loadTick)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (!d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
    title.current?.focus()
    return () => {
      if (d.open) d.close()
      // The page behind gets focus back once the sheet is gone.
      requestAnimationFrame(() => {
        const h1 = document.querySelector<HTMLElement>('#root h1')
        if (!h1) return
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
        h1.focus({ preventScroll: true })
      })
    }
  }, [])

  async function accept() {
    if (busy) return
    if (!accepted) {
      setError(t('consent.update.needTick'))
      document.getElementById('consent-update')?.focus()
      return
    }
    setBusy(true)
    setError('')
    setStale(false)
    try {
      const me = await api<Me>('/me/consent', { body: { version: CONSENT_VERSION } })
      clearSignIn()
      setMe(me)
    } catch (err) {
      // 400: the server has newer Terms than this copy of the app.
      if (err instanceof ApiError && err.status === 400) {
        setStale(true)
        setError(t('consent.update.stale'))
      } else setError(err instanceof ApiError ? err.message : t('common.error'))
      setBusy(false)
    }
  }

  async function leave() {
    if (leaving) return
    setLeaving(true)
    // Signing out never fails on this device (SessionProvider), and the app then shows sign-in.
    await signOut()
  }

  return (
    <dialog
      ref={dialog}
      className={c.sheet}
      aria-labelledby="consent-title"
      // Esc can't skip it: agree or sign out.
      onCancel={(e) => e.preventDefault()}
    >
      <h2 id="consent-title" ref={title} tabIndex={-1}>
        {t('consent.update.title')}
      </h2>
      <p>{t('consent.update.body')}</p>
      <ConsentCheck
        id="consent-update"
        checked={accepted}
        invalid={!!error && !accepted}
        onChange={(v) => {
          setAccepted(v)
          saveTick(v)
          if (v && !stale) setError('')
        }}
      />
      <InlineError>{error}</InlineError>
      {stale ? (
        <BigButton label={t('consent.update.reload')} onClick={() => void reloadZarqa()} />
      ) : (
        <BigButton label={busy ? t('consent.update.saving') : t('consent.update.go')} busy={busy} disabled={busy} onClick={accept} />
      )}
      <button type="button" className={c.signOut} onClick={() => void leave()} disabled={leaving} aria-busy={leaving || undefined}>
        {leaving ? t('consent.update.signingOut') : t('consent.update.signOut')}
      </button>
    </dialog>
  )
}
