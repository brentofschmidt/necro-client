import { useState } from 'react'

// Renders a WoW-style square icon for a spell or weapon action. Same
// pattern as ItemIcon: framed art, fallback question-mark tile when the
// file is missing, three sizes. Spells and actions live in separate
// tables (asset_name is PK in both), so the component takes a `kind`
// param to pick the right public directory.
//
//   public/spells/${assetName}.png   — for entries from necro_content.spells
//   public/actions/${assetName}.png  — for entries from necro_content.actions
//
// Files are served by Vite as static assets. Switching to Supabase
// Storage later is a one-line change in the iconUrl build.
export type ActionIconSize = 'sm' | 'md' | 'lg'
export type ActionIconKind = 'spell' | 'action'

export function ActionIcon({
  assetName,
  kind,
  size = 'sm',
  ariaLabel,
}: {
  assetName: string
  kind: ActionIconKind
  size?: ActionIconSize
  ariaLabel?: string
}) {
  const [missing, setMissing] = useState(false)
  const folder = kind === 'spell' ? 'spells' : 'actions'
  const iconUrl = `/${folder}/${assetName}.png`
  return (
    <span
      className={`action-icon action-icon-${size} action-icon-${kind}`}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {missing ? (
        <span className="action-icon-fallback">?</span>
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
