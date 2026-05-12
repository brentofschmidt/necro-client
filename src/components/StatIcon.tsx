import { ReactNode } from 'react'

// Per-category SVG glyphs. Stats share an icon at the category level
// rather than per-stat — there are too many individual stats (attack
// power, crit chance, haste, …) to give each its own glyph, and
// grouping by Power / Crit / Speed / Defense / Precision / Sustain /
// Mastery / Gathering reads well in lists.
const STAT_CATEGORY_ICONS: Record<string, ReactNode> = {
  Power: (
    <>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </>
  ),
  Crit: (
    <>
      <path d="M12 2l2.5 7H22l-6 4.5L18.5 21 12 16.5 5.5 21 8 13.5 2 9h7.5z" />
    </>
  ),
  Speed: (
    <>
      <path d="M5 12h13" />
      <path d="M14 7l5 5-5 5" />
      <path d="M3 8l3 4-3 4" />
    </>
  ),
  Defense: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
    </>
  ),
  Precision: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  Sustain: (
    <>
      <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />
      <path d="M12 8v6" />
      <path d="M9 11h6" />
    </>
  ),
  Mastery: (
    <>
      <path d="M5 8l4 3 3-6 3 6 4-3-2 11H7z" />
      <path d="M7 21h10" />
    </>
  ),
  Gathering: (
    <>
      <path d="M4 11h16l-2 9H6z" />
      <path d="M4 11c0-3 4-5 8-5s8 2 8 5" />
      <path d="M9 11c1-2 2-3 3-3s2 1 3 3" />
    </>
  ),
}

// Per-category accent so stats keep their identity color across the
// app. Same set is exported so other UI pieces (badges, charts, etc.)
// can stay in sync.
export const STAT_CATEGORY_COLORS: Record<string, string> = {
  Power:     '#c95a3d',
  Crit:      '#e84f1a',
  Speed:     '#d4b061',
  Defense:   '#5b8ad6',
  Precision: '#c0c0c0',
  Sustain:   '#5fae6a',
  Mastery:   '#9b6fcf',
  Gathering: '#8b9b3a',
}

// Loose `category: string` so per-character stat rows (which come back
// from the RPC typed as plain string) can use this without casting; the
// database-side StatCategory union is a strict subset.
export function StatIcon({ category }: { category: string }) {
  const color = STAT_CATEGORY_COLORS[category] ?? 'var(--text)'
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
      className="stat-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {STAT_CATEGORY_ICONS[category] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
