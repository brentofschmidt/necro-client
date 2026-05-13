import { ReactNode } from 'react'
import { ActionEffect, DamageType } from '../lib/necroContent'
import { DamageTypeIcon } from './DamageTypeIcon'

// Renders an ability's `effects` JSONB array as a stack of per-effect
// cards. Same visual language as the damage calculator's spell card
// (dmg-effect* classes): each effect is a small bordered tile with a
// header strip of chips (type / school / target) and a 2-col grid for
// numeric properties (coefficient, tick interval, duration, etc.).
//
// Damage school lives on each *effect* (not on the parent spell), so
// the school chip is rendered per-card with the matching catalog icon
// and display_color — matching the Damage Types tab styling. Caller
// passes the damage_types catalog so the chip can look up display_name
// and color by id; if omitted (or the effect's school isn't in the
// catalog) the chip falls back to the raw id capitalized.
//
// Used by the database Actions and Spells expansions so a reader can
// scan an ability's effects without parsing the prose description. The
// calculator version layers attacker-driven "Base damage" computation
// on top; this is the same shape minus that column.
export function EffectsList({
  effects,
  damageTypes,
  emptyText = 'No effects.',
}: {
  effects: ActionEffect[]
  damageTypes?: DamageType[] | null
  emptyText?: string
}) {
  if (effects.length === 0) {
    return <div className="dmg-effects-empty">{emptyText}</div>
  }
  return (
    <div className="dmg-effects">
      {effects.map((eff, i) => (
        <EffectCard key={i} effect={eff} index={i} damageTypes={damageTypes} />
      ))}
    </div>
  )
}

function EffectCard({
  effect,
  index,
  damageTypes,
}: {
  effect: ActionEffect
  index: number
  damageTypes?: DamageType[] | null
}) {
  const type = typeof effect.type === 'string' ? effect.type : ''
  const school = typeof effect.school === 'string' ? effect.school : ''
  const target = typeof effect.target === 'string' ? effect.target : ''

  const isHeal = type === 'Heal'
  const typeClass = type ? type.toLowerCase() : 'effect'
  const targetKind: 'primary' | 'splash' = target === 'Primary' ? 'primary' : 'splash'

  // Look up the damage-type catalog row so the school chip can show the
  // canonical display_name + display_color. Falls back to capitalize(id)
  // if the catalog isn't loaded yet or doesn't know this id.
  const schoolEntry = school
    ? damageTypes?.find((d) => d.id === school)
    : undefined
  const schoolColor = schoolEntry?.display_color
  const schoolLabel =
    schoolEntry?.display_name ??
    (school ? school.charAt(0).toUpperCase() + school.slice(1) : '')

  // Build the grid rows by inspecting the effect's loosely-typed fields.
  // Shape varies per type:
  //   Damage / Heal           → coefficient + school + target
  //   DamageOverTime          → coefficient + school + target + tick + duration
  //   StatModifier            → stat + amount(+modifierType) + duration + radius
  //   anything else           → just the description (and whatever we can pick out)
  const rows: { label: string; value: ReactNode }[] = []

  if (typeof effect.coefficient === 'number') {
    rows.push({
      label: 'Coef',
      value: (
        <>
          {fmt2(effect.coefficient)}{' '}
          <span className="dmg-effect-grid-mute">
            ({Math.round(effect.coefficient * 100)}% {isHeal ? 'heal' : 'power'})
          </span>
        </>
      ),
    })
  }

  if (
    typeof effect.amount === 'number' &&
    typeof effect.coefficient !== 'number'
  ) {
    const isPercent = effect.modifier_type === 'Percent'
    rows.push({
      label: 'Amount',
      value: `${effect.amount}${isPercent ? '%' : ''}`,
    })
  }

  if (typeof effect.stat === 'string' && effect.stat) {
    rows.push({
      label: 'Stat',
      value: <span className="dmg-effect-grid-mute">{effect.stat}</span>,
    })
  }

  if (typeof effect.tick_interval === 'number') {
    rows.push({ label: 'Tick', value: `${fmt2(effect.tick_interval)}s` })
  }

  if (typeof effect.duration === 'number') {
    rows.push({ label: 'Duration', value: `${fmt2(effect.duration)}s` })
  }

  if (typeof effect.radius === 'number') {
    rows.push({ label: 'Radius', value: `${effect.radius}m` })
  }

  const description =
    typeof effect.description === 'string' ? effect.description : ''

  return (
    <div className="dmg-effect">
      <div className="dmg-effect-head">
        <span className="dmg-effect-num">Effect {index + 1}</span>
        <span className="dmg-effect-tags">
          {type && (
            <span className={`dmg-effect-tag dmg-effect-tag-${typeClass}`}>
              {type}
            </span>
          )}
          {school && (
            <span
              className="dmg-effect-tag dmg-effect-tag-school"
              style={schoolColor ? { color: schoolColor } : undefined}
            >
              <DamageTypeIcon id={school} color={schoolColor} />
              {schoolLabel}
            </span>
          )}
          {target && (
            <span className={`dmg-effect-tag dmg-effect-tag-target-${targetKind}`}>
              → {target}
            </span>
          )}
        </span>
      </div>
      {rows.length > 0 && (
        <dl className="dmg-effect-grid">
          {rows.map((r, i) => (
            <FragRow key={i} label={r.label} value={r.value} />
          ))}
        </dl>
      )}
      {description && <div className="dmg-effect-desc">{description}</div>}
    </div>
  )
}

// Tiny wrapper so each grid row is a paired dt+dd inside the `dl`.
function FragRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function fmt2(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/\.?0+$/, '')
}
