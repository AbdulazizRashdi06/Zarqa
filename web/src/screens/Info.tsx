import { Fragment, type ReactNode } from 'react'
import { Link } from '../lib/nav'
import { useBack } from '../lib/back'
import { useSession } from '../auth/session'
import { BackHeader, BigButton, Ticket } from '../components/ui'
import { t, type StringKey } from '../i18n'
import s from './Launch.module.css'

export type InfoPage = 'terms' | 'privacy' | 'help' | 'tips'
const CONTACT = 'hello@tryzarqa.com'

// Section numbers in reading order. Help puts "Can't sign in?" first for someone who isn't signed in yet.
const sections = (page: InfoPage, signedIn: boolean): number[] => {
  if (page === 'terms') return [0, 1, 2, 3, 4, 5]
  if (page === 'privacy') return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  if (page === 'tips') return [0, 1, 2, 3]
  return signedIn ? [0, 1, 4, 2, 3] : [3, 0, 1, 4, 2]
}

/** The contact address, wherever the text mentions it, is a link. */
function withLinks(text: string): ReactNode {
  const parts = text.split(CONTACT)
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && <a href={`mailto:${CONTACT}`}>{CONTACT}</a>}
    </Fragment>
  ))
}

/** A section body: paragraphs split by a blank line; lines starting with "- " are a list (a lead-in line may come first). */
function Body({ text }: { text: string }) {
  return text.split('\n\n').map((block, i) => {
    const lines = block.split('\n')
    const items = lines.filter((l) => l.startsWith('- '))
    const lead = lines.filter((l) => !l.startsWith('- ')).join(' ')
    return (
      <Fragment key={i}>
        {lead && <p className={items.length ? s.lead : undefined}>{withLinks(lead)}</p>}
        {items.length > 0 && (
          <ul>
            {items.map((l, j) => (
              <li key={j}>{withLinks(l.slice(2))}</li>
            ))}
          </ul>
        )}
      </Fragment>
    )
  })
}

export default function Info({ page }: { page: InfoPage }) {
  const { me, loading } = useSession()
  const back = useBack()
  // Back returns to whichever in-app page opened this one; on a direct visit it goes home or to sign-in.
  const fallback = me ? '/profile' : loading ? '/' : '/signin'
  return <main className={s.page}>
    <BackHeader to={fallback} previous label={t('info.navigation').toUpperCase()} />
    <h1>{t(`info.${page}.title` as StringKey)}</h1>
    {(page === 'privacy' || page === 'terms') && <p className={s.notice}>{t(`info.review.${page}` as StringKey)}</p>}
    <Ticket className={s.card}>
      {sections(page, !!me).map((i) => <section key={i}>
        <h2>{t(`info.${page}.${i}.title` as StringKey)}</h2>
        <Body text={t(`info.${page}.${i}.body` as StringKey)} />
      </section>)}
      <section className={s.contact}>
        <span className={s.contactLabel}>{t('info.contact.label')}</span>
        <a href={`mailto:${CONTACT}`}>{t('info.contact')}</a>
        {page === 'privacy' && <a href="https://www.mtcit.gov.om/sectors/governance/personal">{t('info.pdpl')}</a>}
      </section>
    </Ticket>
    <BigButton variant="surface" label={t('common.back')} onClick={() => back(fallback, true)} />
    <nav className={s.infoLinks} aria-label={t('info.navigation')}>
      {(['terms', 'privacy', 'help', 'tips'] as const).filter(p => p !== page).map(p => <Link key={p} to={`/${p}`}>{t(`info.${p}.title` as StringKey)}</Link>)}
    </nav>
  </main>
}
