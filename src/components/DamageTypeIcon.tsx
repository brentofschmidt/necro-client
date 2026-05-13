import { ReactNode } from 'react'

// Per-damage-type SVG glyphs. 24×24 viewBox, currentColor stroke. Each
// one is shaped to read at 20px — a mace for bludgeoning, an arrow for
// piercing, a sword-slash for slashing, droplet for acid, snowflake for
// cold, flame for fire, lightning bolt for lightning, etc.
//
// Exported so EffectsList / DataTable cells / DamageCalculator can all
// render the same glyph for a given damage type.
export const DAMAGE_TYPE_ICONS: Record<string, ReactNode> = {
  bludgeoning: (
    <>
      <rect x="13" y="3" width="8" height="5" rx="1" />
      <path d="M14 8l-9 9" />
      <path d="M3 19l3 3" />
    </>
  ),
  piercing: (
    <>
      <path d="M4 20L20 4" />
      <path d="M14 4h6v6" />
      <path d="M3 17l4 4" />
    </>
  ),
  slashing: (
    <>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </>
  ),
  acid: (
    <>
      <path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z" />
      <path d="M9 16a3 3 0 0 0 3 3" />
    </>
  ),
  cold: (
    <>
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
      <path d="M9 4l3 2 3-2" />
      <path d="M9 20l3-2 3 2" />
    </>
  ),
  fire: (
    <>
      <path d="M12 3c-2 4-5 6-5 10a5 5 0 0 0 10 0c0-2-1-3-2-5 0 2-1 3-3 3 1-3 1-5 0-8z" />
    </>
  ),
  lightning: (
    <>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </>
  ),
  thunder: (
    <>
      <path d="M5 13a4 4 0 0 1 4-4 5 5 0 0 1 9 1 3 3 0 0 1 0 6H8" />
      <path d="M12 18l3-4h-2l1-3" />
    </>
  ),
  force: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M5 5l3 3" />
      <path d="M16 16l3 3" />
      <path d="M19 5l-3 3" />
      <path d="M8 16l-3 3" />
    </>
  ),
  necrotic: (
    <>
      <path d="M12 3a7 7 0 0 0-7 7v3l2 2v3h10v-3l2-2v-3a7 7 0 0 0-7-7z" />
      <circle cx="9" cy="11" r="1" fill="currentColor" />
      <circle cx="15" cy="11" r="1" fill="currentColor" />
      <path d="M10 16h4" />
    </>
  ),
  poison: (
    <>
      <path d="M9 2h6v4l3 5v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-7l3-5z" />
      <path d="M6 13h12" />
      <circle cx="11" cy="17" r="0.8" fill="currentColor" />
      <circle cx="14" cy="15" r="0.6" fill="currentColor" />
    </>
  ),
  psychic: (
    <>
      <path d="M12 4a4 4 0 0 0-4 4c0 1.5.8 2.7 2 3.5C8.8 12 8 13.2 8 15a4 4 0 0 0 8 0c0-1.8-.8-3-2-3.5 1.2-.8 2-2 2-3.5a4 4 0 0 0-4-4z" />
      <path d="M12 8v8" />
    </>
  ),
  radiant: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M5 5l2 2" />
      <path d="M17 17l2 2" />
      <path d="M19 5l-2 2" />
      <path d="M7 17l-2 2" />
    </>
  ),
}

export function DamageTypeIcon({
  id,
  color,
}: {
  id: string
  color?: string | null
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="damage-icon"
      style={{ color: color ?? 'var(--text)' }}
      aria-hidden="true"
    >
      {DAMAGE_TYPE_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
