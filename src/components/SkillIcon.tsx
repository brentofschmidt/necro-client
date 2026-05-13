import { ReactNode } from 'react'
import { SPELL_SCHOOL_ICONS } from './SpellSchoolIcon'

// Minimal SVG paths for each skill / proficiency. The renderer wraps
// them in a 24×24 viewBox with currentColor stroke so the parent can
// recolor via CSS — accent blue for weapon profs, purple for magic
// profs, amber for activities. Used by both the game-database tables
// and the per-character skill panels.
//
// Magic proficiency glyphs are not duplicated here — SkillIcon falls
// back to SPELL_SCHOOL_ICONS when the skill name matches a school id.
const SKILL_ICONS: Record<string, ReactNode> = {
  // Weapon proficiencies
  swords: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4L9 15" />
      <path d="M9 15l-2 2 3 3 2-2" />
      <path d="M5 19l2 2" />
    </>
  ),
  axes: (
    <>
      <path d="M4 5c4-2 8-2 10 2-4 2-8 2-10-2z" />
      <path d="M11 9l9 11" />
      <path d="M3 21l3-3" />
    </>
  ),
  maces: (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M3 7h1" />
      <path d="M10 7h1" />
      <path d="M7 3v1" />
      <path d="M7 10v1" />
      <path d="M10 10l10 10" />
      <path d="M3 21l3-3" />
    </>
  ),
  daggers: (
    <>
      <path d="M14 4h5v5" />
      <path d="M19 4L9 14" />
      <path d="M9 14l-2 2 3 3 2-2" />
    </>
  ),
  bows: (
    <>
      <path d="M5 3c8 4 8 14 0 18" />
      <path d="M5 3v18" />
      <path d="M5 12h14" />
      <path d="M17 10l2 2-2 2" />
    </>
  ),
  staves: (
    <>
      <path d="M6 2l3 5-3 5-3-5z" />
      <path d="M6 12L19 21" />
      <path d="M2 6h2" />
      <path d="M8 6h2" />
    </>
  ),

  // Activity skills
  mining: (
    <>
      <path d="M3 4c5-1 13-1 18 0" />
      <path d="M3 4c1 1 2 2 4 2" />
      <path d="M21 4c-1 1-2 2-4 2" />
      <path d="M11 6L19 21" />
      <path d="M3 21l3-3" />
    </>
  ),
  gathering: (
    <>
      <path d="M6 18c0-7 4-12 13-13-1 9-6 13-13 13z" />
      <path d="M6 18l8-8" />
    </>
  ),
  woodcutting: (
    <>
      <path d="M3 7c2-3 7-3 9 0l-4 4-5-1z" />
      <path d="M8 11L20 21" />
      <path d="M3 21l3-3" />
    </>
  ),
  skinning: (
    <>
      <path d="M3 16L17 2l4 4-14 14z" />
      <path d="M3 16l-1 4 4-1" />
    </>
  ),
  fishing: (
    <>
      <path d="M5 4l8 14" />
      <path d="M3 21c0-3 2-5 5-5" />
      <path d="M13 18a3 3 0 0 0 0-6" />
    </>
  ),
  cooking: (
    <>
      <path d="M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
      <path d="M2 11h20" />
      <path d="M9 7l1-3" />
      <path d="M13 7l1-3" />
      <path d="M17 7l1-3" />
    </>
  ),
  alchemy: (
    <>
      <path d="M9 3v6l-4 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-4-9V3" />
      <path d="M8 3h8" />
      <path d="M7 14h10" />
    </>
  ),
  lockpicking: (
    <>
      <circle cx="6" cy="6" r="3" />
      <path d="M8 8l11 11" />
      <path d="M14 14l3-3" />
      <path d="M17 17l3-3" />
    </>
  ),
  pickpocketing: (
    <>
      <path d="M7 9h10l1 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8z" />
      <path d="M9 9c0-2 1-3 3-3s3 1 3 3" />
      <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  smithing: (
    <>
      <path d="M3 17h6v3H3z" />
      <path d="M9 14l4-4 5 5-4 4z" />
      <path d="M13 10l3-3" />
      <path d="M16 7l2-2 3 3-2 2z" />
    </>
  ),
  fletching: (
    <>
      <path d="M3 21L21 3" />
      <path d="M21 3v6" />
      <path d="M21 3h-6" />
      <path d="M5 19l-2 2 4-1" />
    </>
  ),
  carpentry: (
    <>
      <path d="M4 8l9-4 7 4-9 4z" />
      <path d="M4 8v6l9 4" />
      <path d="M20 8v6l-7 4" />
    </>
  ),
}

// `category` is loose-typed (string | null) here because per-character
// skill rows from the RPC come through as a nullable string. Three-way
// color split: weapon profs accent-blue, magic profs purple, everything
// else activity amber.
export function SkillIcon({
  name,
  category,
}: {
  name: string
  category: string | null | undefined
}) {
  const color =
    category === 'Weapon Proficiency'
      ? 'var(--accent)'
      : category === 'Magic Proficiency'
        ? '#9b6fcf'
        : '#c8a64a'
  const glyph = SKILL_ICONS[name] ?? SPELL_SCHOOL_ICONS[name]
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
      className="skill-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {glyph ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
