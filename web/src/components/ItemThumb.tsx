import type { ReactElement } from 'react'
import { BagIcon, BottleIcon, BudsIcon, CalcIcon, CardIcon, KeyIcon, TagIcon } from './icons'

type IconFn = (p: { size?: number; color?: string }) => ReactElement

const byCategory: Record<string, IconFn> = {
  Electronics: BudsIcon,
  'Wallets & cards': CardIcon,
  Bottles: BottleIcon,
  Stationery: CalcIcon,
  Keys: KeyIcon,
  Bags: BagIcon,
}

/** A report's first photo, or its category icon on a Lost/Found tint. Card photos never show as thumbnails. */
export function ItemThumb({
  kind,
  categoryKey,
  photoId,
  sensitive,
  size = 60,
}: {
  kind: 'lost' | 'found'
  categoryKey: string | null
  photoId?: string
  sensitive?: boolean
  size?: number
}) {
  const Icon = (categoryKey && byCategory[categoryKey]) || TagIcon
  return (
    <span
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 12,
        overflow: 'hidden',
        background: kind === 'lost' ? '#E8D6C6' : '#D3DBDC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photoId && !sensitive ? (
        <img src={`/api/photos/${photoId}`} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Icon size={Math.round(size / 2)} color="var(--ink)" />
      )}
    </span>
  )
}
