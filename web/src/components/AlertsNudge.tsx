import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { enablePush, pushState, refreshPush, type PushState } from '../lib/push'
import { InlineError } from './states'
import s from './AlertsNudge.module.css'

// "Later" snoozes the card for a week instead of hiding it for good.
const SNOOZED = 'zarqa.alertsNudgeSnoozedUntil'
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000

const isSnoozed = () => {
  try {
    return Number(localStorage.getItem(SNOOZED) ?? 0) > Date.now()
  } catch {
    return false
  }
}

/** A small card on Home: turn on alerts, or (iPhone) add Zarqa to the Home Screen first. */
export function AlertsNudge() {
  const [state, setState] = useState<PushState>(() => pushState())
  const [hidden, setHidden] = useState(isSnoozed)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Turned on from this card: say so once instead of just disappearing.
  const [turnedOn, setTurnedOn] = useState(false)

  useEffect(() => {
    void refreshPush()
  }, [])

  if (turnedOn)
    return (
      <p className={s.done} role="status">
        {t('alerts.on')}
      </p>
    )
  if (hidden || state === 'granted' || state === 'denied' || state === 'unsupported') return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(SNOOZED, String(Date.now() + SNOOZE_MS))
    } catch {
      /* private mode: fine, it just shows again */
    }
  }

  const turnOn = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const next = await enablePush()
      if (next === 'granted') setTurnedOn(true)
      setState(next)
    } catch {
      // Permission was given but registering this phone failed: keep the card so they can try again.
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.card} role="note" data-enter style={{ '--delay': '300ms' }}>
      <div className={s.text}>
        <span className={s.label}>{t('alerts.label')}</span>
        <span>{state === 'needs-install' ? t('alerts.install') : t('alerts.body')}</span>
      </div>
      <InlineError>{failed ? t('alerts.failed') : ''}</InlineError>
      <div className={s.actions}>
        {state === 'default' && (
          <button type="button" className={s.on} aria-busy={busy || undefined} disabled={busy} onClick={() => void turnOn()}>
            {failed ? t('common.retry') : t('alerts.turnOn')}
          </button>
        )}
        <button type="button" className={s.later} onClick={dismiss}>
          {t('alerts.later')}
        </button>
      </div>
    </div>
  )
}
