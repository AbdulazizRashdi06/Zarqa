import { Link } from 'react-router'
import { useSession } from '../auth/session'
import { BackHeader, Ticket } from '../components/ui'
import { t, type StringKey } from '../i18n'
import s from './Launch.module.css'

export type InfoPage = 'terms' | 'privacy' | 'help' | 'tips'
const sections = { terms: 4, privacy: 7, help: 3, tips: 4 }
export default function Info({ page }: { page: InfoPage }) {
  const { me } = useSession()
  return <main className={s.page}>
    <BackHeader to={me ? '/profile' : '/signin'} label={t(`info.${page}.title` as StringKey)} />
    <h1>{t(`info.${page}.title` as StringKey)}</h1>
    {(page === 'privacy' || page === 'terms') && <p className={s.notice}>{t('info.review')}</p>}
    <Ticket className={s.card}>
      {Array.from({ length: sections[page] }, (_, i) => <section key={i}>
        <h2>{t(`info.${page}.${i}.title` as StringKey)}</h2>
        <p>{t(`info.${page}.${i}.body` as StringKey)}</p>
      </section>)}
      <a href="mailto:hello@tryzarqa.com">{t('info.contact')}</a>
      {page === 'privacy' && <p><a href="https://www.mtcit.gov.om/sectors/governance/personal">{t('info.pdpl')}</a></p>}
    </Ticket>
    <nav className={s.actions} aria-label={t('info.navigation')}>
      {(['terms', 'privacy', 'help', 'tips'] as const).filter(p => p !== page).map(p => <Link key={p} to={`/${p}`}>{t(`info.${p}.title` as StringKey)}</Link>)}
    </nav>
  </main>
}
