import { Link } from '../lib/nav'
import { BigButton, ZarqaBubble } from '../components/ui'
import { zarqaMotion } from '../components/zarqaMotion'
import { t } from '../i18n'
import s from './SignIn.module.css'

/**
 * Shown after a new student's code checks out while sign-up is closed (server Auth:ComingSoon).
 * No account was made and nobody is signed in: people who already have an account, and staff, get in as usual.
 */
export default function ComingSoon() {
  return (
    <main className={s.page}>
      <div className={s.hero}>
        <img src="/mascot/lookout.webp" alt="Zarqa shading her eyes, looking far into the distance" className={zarqaMotion('sway', false)} />
      </div>

      <h1 className={s.title}>
        <span className={s.line} data-enter="headline" style={{ '--delay': '80ms' }}>
          {t('comingSoon.h1')}
        </span>{' '}
        <span className={s.line} data-enter="headline" style={{ '--delay': '170ms' }}>
          <span className={s.outline}>{t('comingSoon.h2')}</span>
        </span>
      </h1>

      <p className={s.intro} data-enter style={{ '--delay': '300ms' }}>
        {t('comingSoon.body')}
      </p>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16, '--delay': '420ms' }} data-enter>
        <ZarqaBubble mascot="wink" alt="Zarqa winking" width={64} quiet>
          {t('comingSoon.zarqa')}
        </ZarqaBubble>
        <BigButton to="/signin" label={t('comingSoon.otherEmail')} variant="surface" />
        <nav className={s.links} aria-label="About">
          <Link to="/help">{t('signin.helpLink')}</Link>
        </nav>
      </div>
    </main>
  )
}
