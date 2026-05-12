import { ReactNode } from 'react'

// Per-ability SVG glyphs. 24×24 viewBox, currentColor stroke. Each ability
// gets a distinct silhouette (anvil for STR, arrow for DEX, shield for CON,
// brain for INT, eye for WIS, star for CHA) so the six show up at a glance
// in both the database view and the per-character ability cards.
const ABILITY_ICONS: Record<string, ReactNode> = {
  strength: (
    <>
      <path d="M5 11h2l1-4 4 4 4-4 1 4h2" />
      <path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9 19v2" />
      <path d="M15 19v2" />
    </>
  ),
  dexterity: (
    <>
      <path d="M3 21L21 3" />
      <path d="M21 3v8" />
      <path d="M21 3h-8" />
      <path d="M5 18l1 3 3-1" />
    </>
  ),
  constitution: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
      <path d="M9 13c1.5 1.5 1.5 1.5 3 0s1.5-1.5 3 0" />
    </>
  ),
  intelligence: (
    <>
      <path d="M9 4a4 4 0 0 0-2 7c0 1-1 1-1 3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3c0-2-1-2-1-3a4 4 0 0 0-8 0" />
      <path d="M12 18v3" />
    </>
  ),
  wisdom: (
    <>
      <path d="M2 12c2-4 6-7 10-7s8 3 10 7c-2 4-6 7-10 7s-8-3-10-7z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  charisma: (
    <>
      <path d="M12 2l2.5 7H22l-6 4.5L18.5 21 12 16.5 5.5 21 8 13.5 2 9h7.5z" />
    </>
  ),
}

// Per-ability color so the six ability cards / icons keep their identity
// across the app (red for STR, green for DEX, etc.). Exported because the
// character page's AbilityScoreCard also uses these to color other UI
// pieces (the abbreviation badge tint, etc.).
export const ABILITY_COLORS: Record<string, string> = {
  strength:     '#c95a3d',
  dexterity:    '#5fae6a',
  constitution: '#c97a3d',
  intelligence: '#5b8ad6',
  wisdom:       '#9b6fcf',
  charisma:     '#d4609a',
}

export function AbilityIcon({ name }: { name: string }) {
  const color = ABILITY_COLORS[name] ?? 'var(--text)'
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
      className="ability-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {ABILITY_ICONS[name] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
