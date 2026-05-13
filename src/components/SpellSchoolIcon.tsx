import { ReactNode } from 'react'

// Per-school SVG glyphs. 24×24 viewBox, currentColor stroke. Each one
// is shaped to read at 20px — a starburst for evocation (radiating
// energy), a medical cross for restoration, musical notes for
// enchantment, a summoning circle for conjuration, a skull for
// necromancy, an eye-with-strikethrough for illusion, a shield-with-rune
// for abjuration, and a crystal ball for divination.
//
// Exported so SkillIcon can reuse the same glyphs for Magic Proficiency
// skills (whose slugs match the spell-school ids).
export const SPELL_SCHOOL_ICONS: Record<string, ReactNode> = {
  evocation: (
    <>
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4 4l3 3" />
      <path d="M17 17l3 3" />
      <path d="M4 20l3-3" />
      <path d="M17 7l3-3" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  restoration: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10" />
      <path d="M7 12h10" />
    </>
  ),
  enchantment: (
    <>
      <path d="M8 18V5l11-2v12" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="17" cy="15" r="2.5" />
    </>
  ),
  conjuration: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
    </>
  ),
  necromancy: (
    <>
      <path d="M5 10c0-4 3-7 7-7s7 3 7 7v5l-2 2h-2v2h-2v-2h-2v2H9v-2H7l-2-2z" />
      <circle cx="9" cy="11" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="11" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  illusion: (
    <>
      <path d="M2 12c2-4 6-7 10-7s8 3 10 7c-2 4-6 7-10 7s-8-3-10-7z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 21L21 3" />
    </>
  ),
  abjuration: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
      <path d="M9 11l3 3 3-3" />
      <path d="M12 8v6" />
    </>
  ),
  divination: (
    <>
      <circle cx="12" cy="14" r="6" />
      <circle cx="10" cy="12" r="1.5" />
      <path d="M6 18l-2 3" />
      <path d="M18 18l2 3" />
      <path d="M12 8V4" />
    </>
  ),
}

// Color comes from the catalog's `display_color` so the icon tint
// matches the corresponding row swatch / tag chip used elsewhere. Falls
// back to neutral text color when no color is provided.
export function SpellSchoolIcon({
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
      className="spell-school-icon"
      style={{ color: color ?? 'var(--text)' }}
      aria-hidden="true"
    >
      {SPELL_SCHOOL_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}
