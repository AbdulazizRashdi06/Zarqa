import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../i18n'
import { BigButton, ZarqaBubble } from './ui'
import s from './states.module.css'

/**
 * Catches a render crash (say, an API value the screen didn't expect) so one bad page never blanks the whole
 * app: an installed PWA has no reload button. App.tsx mounts it around the routes with key={pathname}, so
 * moving to another page clears it. Reload also picks up a newer app version.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className={s.page}>
        <h1 className={s.title} tabIndex={-1}>
          {t('crash.title')}
        </h1>
        <div className={s.bottom}>
          <ZarqaBubble mascot="question" alt="" width={70} quiet motion="sway">
            {t('crash.zarqa')}
          </ZarqaBubble>
          <BigButton label={t('crash.reload')} onClick={() => window.location.reload()} />
          <BigButton
            label={t('common.backHome')}
            variant="surface"
            onClick={() => {
              // A full load, not a route change: the crashed tree may hold broken state.
              window.location.assign('/')
            }}
          />
        </div>
      </main>
    )
  }
}
