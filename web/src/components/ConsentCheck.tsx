import { Link } from '../lib/nav'
import { t } from '../i18n'
import c from './consent.module.css'

/**
 * The one consent line (Oman PDPL: express consent, including processing outside Oman). "Terms" and
 * "Privacy" open those pages; tapping a link follows it without ticking the box.
 */
export function ConsentCheck({
  checked,
  onChange,
  id = 'consent',
  invalid,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  id?: string
  /** Submitted without the tick: the box says so to screen readers (the message itself is shown by the form). */
  invalid?: boolean
}) {
  return (
    <label className={c.check}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid || undefined} />
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
