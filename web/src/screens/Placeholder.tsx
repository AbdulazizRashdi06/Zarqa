import type { ReactNode } from 'react'
import { BackHeader, BigButton, ZarqaBubble, type Mascot } from '../components/ui'
import { t } from '../i18n'
import s from './Placeholder.module.css'

/** Shell for screens that are built in later steps. Same frame as the design's inner screens. */
export default function Placeholder({
  title,
  accent,
  mascot = 'reading',
  zarqa = t('placeholder.zarqa'),
  back = true,
  action,
}: {
  title: string
  accent?: string
  mascot?: Mascot
  zarqa?: ReactNode
  back?: boolean
  action?: ReactNode
}) {
  const [first, ...rest] = title.split(' ')
  return (
    <main className={s.page}>
      {back && <BackHeader label={t('common.comingSoon')} />}
      <h1 className={s.title}>
        {first}
        {rest.length > 0 && (
          <>
            <br />
            <span style={{ color: accent ?? 'var(--tan)' }}>{rest.join(' ')}</span>
          </>
        )}
      </h1>
      <div className={s.bottom}>
        <ZarqaBubble mascot={mascot} alt="Zarqa" width={70} quiet>
          {zarqa}
        </ZarqaBubble>
        {action}
        {!back && <BigButton to="/" label="Back home" />}
      </div>
    </main>
  )
}
