import { useState } from 'react'
import { RARITY_COLORS } from './ItemDetails'

// Renders a WoW-style square item icon: framed art with a rarity-colored
// border. Convention: the icon's filename mirrors the item's id, so a
// row's `id` is enough to resolve it — no extra DB column needed for
// the local-asset phase.
//
// Files live in `public/items/{id}.png` and are served by Vite as static
// assets. When an item doesn't have a matching file yet we fall back to a
// generic placeholder (a dim "?" tile) so the UI doesn't break — useful
// during content authoring before the art catches up.
//
// Sizes:
//   sm — inline cell icons (table rows, lists)
//   md — item-details panels, tooltips
//   lg — paper-doll slots (later)
//
// Switching to Supabase Storage later is a one-line change: replace the
// `iconUrl` build with `${SUPABASE_URL}/storage/v1/object/public/items/…`.
export type ItemIconSize = 'sm' | 'md' | 'lg'

export function ItemIcon({
  id,
  rarity,
  size = 'sm',
  ariaLabel,
}: {
  id: string
  rarity?: string | null
  size?: ItemIconSize
  ariaLabel?: string
}) {
  const [missing, setMissing] = useState(false)
  const border = rarity ? RARITY_COLORS[rarity] : undefined
  const iconUrl = `/items/${id}.png`
  return (
    <span
      className={`item-icon item-icon-${size}`}
      style={border ? { borderColor: border } : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {missing ? (
        <span className="item-icon-fallback">?</span>
      ) : (
        <img
          src={iconUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setMissing(true)}
        />
      )}
    </span>
  )
}
