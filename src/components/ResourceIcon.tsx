import { ReactNode } from 'react'

// Per-resource SVG glyphs. 24×24 viewBox, currentColor stroke. The
// renderer takes the resource's display_color from the database so a
// custom resource added later picks up its own tint without code
// changes. Health is a heart, mana a teardrop, stamina a lightning bolt.
const RESOURCE_ICONS: Record<string, ReactNode> = {
  health: (
    <>
      <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />
    </>
  ),
  mana: (
    <>
      <path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z" />
    </>
  ),
  stamina: (
    <>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </>
  ),
}

export function ResourceIcon({
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
      className="resource-icon"
      style={{ color: color ?? 'var(--text)' }}
      aria-hidden="true"
    >
      {RESOURCE_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
