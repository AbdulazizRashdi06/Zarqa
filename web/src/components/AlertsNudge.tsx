import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { enablePush, pushState, refreshPush, type PushState } from '../lib/push'
import s from './AlertsNudge.module.css'

const DISMISSED = 'zarqa.alertsNudgeDismissed'

const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED) === '1'
  } catch {
    return false
  }
}

/** A small card on Home: turn on alerts, or (iPhone) add Zarqa to the Home Screen first. */
export function AlertsNudge() {
  const [state, setState] = useState<PushState>(() => pushState())
  const [hidden, setHidden] = useState(wasDismissed)

  useEffect(() => {
    void refreshPush()
  }, [])

  if (hidden || state === 'granted' || state === 'denied' || state === 'unsupported') return null

  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, '1')
    } catch {
      /* private mode: fine, it just shows again */
    }
  }

  return (
    <div className={s.card} role="note">
      <div className={s.text}>
        <span className={s.label}>{t('alerts.label')}</span>
        <span>{state === 'needs-install' ? t('alerts.install') : t('alerts.body')}</span>
      </div>
      <div className={s.actions}>
        {state === 'default' && (
          <button type="button" className={s.on} onClick={() => enablePush().then(setState).catch(() => setState(pushState()))}>
            {t('alerts.turnOn')}
          </button>
        )}
        <button type="button" className={s.later} onClick={dismiss}>
          {t('alerts.later')}
        </button>
      </div>
    </div>
  )
}
