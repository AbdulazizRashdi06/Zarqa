import { Link } from '../lib/nav'
import { t } from '../i18n'
import c from './consent.module.css'

/**
 * The one consent line (Oman PDPL: express consent, including processing outside Oman). "Terms" and
 * "Privacy" open those pages; tapping a link follows it without ticking the box.
 */
export function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={c.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {t('signin.consent.a')}
        <Link to="/terms">{t('signin.terms')}</Link>
        {t('signin.consent.and')}
        <Link to="/privacy">{t('signin.privacy')}</Link>
        {t('signin.consent.b')}
      </span>
    </label>
  )
}
