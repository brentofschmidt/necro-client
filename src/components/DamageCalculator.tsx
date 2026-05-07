import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  getPublicCharacter,
  getPublicCharacterCalculatedStats,
  listPublicCharacters,
  listSpells,
  PublicCharacter,
  PublicCharacterCalculatedStat,
  PublicCharacterDetail,
  Spell,
} from '../lib/necroContent'

// ─────────────────────────────────────────────────────────────────────────────
// DamageCalculator — a dev/debug page that walks through the math behind a
// single attack between two characters. Hidden from the navbar; reach it via
// /dev/damage-calculator. Computes everything client-side; intentionally not
// the source of truth — keep this in sync with whatever the server eventually
// runs, or move the formula into an RPC once it stabilises.
// ─────────────────────────────────────────────────────────────────────────────

type SimpleCharacter = {
  detail: PublicCharacterDetail
  stats: PublicCharacterCalculatedStat[]
}

// Mitigation constant. Higher K means armor/resist matter less per point.
// WoW historically used scaling-by-attacker-level constants; this is a flat
// placeholder, easy to swap once the formula stabilises.
const MITIGATION_K = 100

function statValue(stats: PublicCharacterCalculatedStat[], id: string): number {
  return stats.find((s) => s.id === id)?.value ?? 0
}

function fmt(n: number, digits = 1): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(digits)
}

// Loads detail + calculated stats together so the picker handlers stay simple.
async function loadCharacter(id: string): Promise<SimpleCharacter | null> {
  const [detail, stats] = await Promise.all([
    getPublicCharacter(id),
    getPublicCharacterCalculatedStats(id),
  ])
  if (!detail) return null
  return { detail, stats }
}

export function DamageCalculator() {
  const [characters, setCharacters] = useState<PublicCharacter[] | null>(null)
  const [spells, setSpells] = useState<Spell[] | null>(null)

  const [attackerId, setAttackerId] = useState<string>('')
  const [defenderId, setDefenderId] = useState<string>('')
  const [spellId, setSpellId] = useState<string>('')

  const [attacker, setAttacker] = useState<SimpleCharacter | null>(null)
  const [defender, setDefender] = useState<SimpleCharacter | null>(null)

  const [forceCrit, setForceCrit] = useState(false)
  const [forceHit, setForceHit] = useState(true) // assume hit by default
  const [powerCoefficient, setPowerCoefficient] = useState(1.0)

  // Boot: fetch the option lists for the three pickers.
  useEffect(() => {
    listPublicCharacters().then(setCharacters)
    listSpells().then(setSpells)
  }, [])

  // When attacker id changes, refetch their stats.
  useEffect(() => {
    if (!attackerId) {
      setAttacker(null)
      return
    }
    let cancelled = false
    loadCharacter(attackerId).then((c) => {
      if (!cancelled) setAttacker(c)
    })
    return () => {
      cancelled = true
    }
  }, [attackerId])

  useEffect(() => {
    if (!defenderId) {
      setDefender(null)
      return
    }
    let cancelled = false
    loadCharacter(defenderId).then((c) => {
      if (!cancelled) setDefender(c)
    })
    return () => {
      cancelled = true
    }
  }, [defenderId])

  const spell = useMemo(
    () => spells?.find((s) => s.asset_name === spellId) ?? null,
    [spells, spellId],
  )

  const ready = !!attacker && !!defender && !!spell

  return (
    <div className="dmg-page">
      <header className="dmg-page-header">
        <h1>Damage Calculator</h1>
        <p>
          A dev tool that walks through every step of a single attack between two
          characters. Hidden from the navbar — reach it via{' '}
          <code>/dev/damage-calculator</code>. Math runs in the browser using
          each character's calculated stats RPC, which already bakes in
          equipment + active auras.
        </p>
      </header>

      <div className="dmg-pickers">
        <PickerCard title="Attacker" tone="attacker">
          <CharacterPicker
            characters={characters}
            value={attackerId}
            onChange={setAttackerId}
          />
          {attacker && <CharacterSummary char={attacker} mode="offence" />}
        </PickerCard>

        <PickerCard title="Ability" tone="ability">
          <select
            className="dmg-select"
            value={spellId}
            onChange={(e) => setSpellId(e.target.value)}
          >
            <option value="">Pick a spell…</option>
            {(spells ?? []).map((s) => (
              <option key={s.asset_name} value={s.asset_name}>
                {s.ability_name}
              </option>
            ))}
          </select>
          {spell && <SpellSummary spell={spell} />}
        </PickerCard>

        <PickerCard title="Defender" tone="defender">
          <CharacterPicker
            characters={characters}
            value={defenderId}
            onChange={setDefenderId}
          />
          {defender && <CharacterSummary char={defender} mode="defence" />}
        </PickerCard>
      </div>

      <div className="dmg-toggles">
        <label className="dmg-toggle">
          <input
            type="checkbox"
            checked={forceHit}
            onChange={(e) => setForceHit(e.target.checked)}
          />
          <span>Force hit (skip miss roll)</span>
        </label>
        <label className="dmg-toggle">
          <input
            type="checkbox"
            checked={forceCrit}
            onChange={(e) => setForceCrit(e.target.checked)}
          />
          <span>Force crit</span>
        </label>
        <label className="dmg-toggle">
          <span>Power coefficient</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={powerCoefficient}
            onChange={(e) =>
              setPowerCoefficient(Math.max(0, Number(e.target.value) || 0))
            }
            className="dmg-coef"
          />
        </label>
      </div>

      {ready ? (
        <Pipeline
          attacker={attacker!}
          defender={defender!}
          spell={spell!}
          forceCrit={forceCrit}
          forceHit={forceHit}
          powerCoefficient={powerCoefficient}
        />
      ) : (
        <div className="dmg-placeholder">
          Pick an attacker, defender, and spell to see the math.
        </div>
      )}
    </div>
  )
}

// ─── Picker UI ───────────────────────────────────────────────────────────────

function PickerCard({
  title,
  tone,
  children,
}: {
  title: string
  tone: 'attacker' | 'defender' | 'ability'
  children: ReactNode
}) {
  return (
    <div className={`dmg-card dmg-card-${tone}`}>
      <header className="dmg-card-header">{title}</header>
      <div className="dmg-card-body">{children}</div>
    </div>
  )
}

function CharacterPicker({
  characters,
  value,
  onChange,
}: {
  characters: PublicCharacter[] | null
  value: string
  onChange: (id: string) => void
}) {
  return (
    <select
      className="dmg-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Pick a character…</option>
      {(characters ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.character_name} (Lv {c.level} {c.race})
        </option>
      ))}
    </select>
  )
}

function CharacterSummary({
  char,
  mode,
}: {
  char: SimpleCharacter
  mode: 'offence' | 'defence'
}) {
  const offenceFields: [string, string][] = [
    ['Attack Power', fmt(statValue(char.stats, 'attack_power'))],
    ['Spell Power', fmt(statValue(char.stats, 'spell_power'))],
    ['Healing Power', fmt(statValue(char.stats, 'healing_power'))],
    ['Crit %', fmt(statValue(char.stats, 'crit_chance')) + '%'],
    ['Spell Crit %', fmt(statValue(char.stats, 'spell_crit')) + '%'],
    ['Crit Damage', '+' + fmt(statValue(char.stats, 'crit_damage')) + '%'],
    ['Hit %', fmt(statValue(char.stats, 'hit_chance')) + '%'],
  ]
  const defenceFields: [string, string][] = [
    ['Armor', fmt(statValue(char.stats, 'armor'))],
    ['Magic Resist', fmt(statValue(char.stats, 'magic_resist'))],
    ['Dodge %', fmt(statValue(char.stats, 'dodge_chance')) + '%'],
    ['Parry %', fmt(statValue(char.stats, 'parry_chance')) + '%'],
    ['Block %', fmt(statValue(char.stats, 'block_chance')) + '%'],
  ]
  const fields = mode === 'offence' ? offenceFields : defenceFields
  return (
    <>
      <div className="dmg-char-id">
        Lv {char.detail.level} {char.detail.race}
      </div>
      <dl className="dmg-keyvals">
        {fields.map(([k, v]) => (
          <div key={k} className="dmg-kv">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function SpellSummary({ spell }: { spell: Spell }) {
  const fields: [string, string][] = [
    ['Base damage', spell.damage > 0 ? fmt(spell.damage) : '—'],
    ['School', spell.damage_school ?? '—'],
    ['Type', spell.is_heal ? 'Heal' : 'Damage'],
    ['Targeting', spell.targeting],
    ['Resource', `${spell.resource_cost} ${spell.resource_type}`],
    ['Cast time', spell.cast_time > 0 ? `${spell.cast_time}s` : 'Instant'],
  ]
  return (
    <>
      <div className="dmg-char-id">{spell.ability_name}</div>
      <dl className="dmg-keyvals">
        {fields.map(([k, v]) => (
          <div key={k} className="dmg-kv">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

type Step = {
  title: string
  formula: ReactNode
  inputs: ReactNode
  output: number
  outputLabel?: string
  skipped?: string
}

function buildPipeline(
  attacker: SimpleCharacter,
  defender: SimpleCharacter,
  spell: Spell,
  opts: { forceCrit: boolean; forceHit: boolean; powerCoefficient: number },
): Step[] {
  const steps: Step[] = []
  const isHeal = spell.is_heal
  const isMagic = !!spell.damage_school
  const aStats = attacker.stats
  const dStats = defender.stats

  // 1. Base
  let value = spell.damage
  steps.push({
    title: '1. Base damage',
    inputs: <>spell.damage = {fmt(spell.damage)}</>,
    formula: <>value = {fmt(spell.damage)}</>,
    output: value,
  })

  // 2. Power scaling
  const powerStat = isHeal ? 'healing_power' : isMagic ? 'spell_power' : 'attack_power'
  const power = statValue(aStats, powerStat)
  const powerLabel = isHeal ? 'healing power' : isMagic ? 'spell power' : 'attack power'
  const before2 = value
  value = value + power * opts.powerCoefficient
  steps.push({
    title: `2. ${capitalize(powerLabel)} scaling`,
    inputs: (
      <>
        attacker.{powerStat} = {fmt(power)} · coefficient ={' '}
        {fmt(opts.powerCoefficient)}
      </>
    ),
    formula: (
      <>
        value = {fmt(before2)} + {fmt(power)} × {fmt(opts.powerCoefficient)} ={' '}
        {fmt(value)}
      </>
    ),
    output: value,
  })

  // 3. Hit
  const hitChance = Math.min(100, 95 + statValue(aStats, 'hit_chance'))
  if (!opts.forceHit) {
    const roll = Math.random() * 100
    if (roll > hitChance) {
      value = 0
      steps.push({
        title: '3. Hit roll',
        inputs: <>hit chance = {fmt(hitChance)}% · roll = {fmt(roll, 0)}</>,
        formula: <>roll &gt; chance → miss</>,
        output: 0,
        outputLabel: 'MISS',
      })
      return appendFinal(steps, value, isHeal)
    } else {
      steps.push({
        title: '3. Hit roll',
        inputs: <>hit chance = {fmt(hitChance)}% · roll = {fmt(roll, 0)}</>,
        formula: <>roll ≤ chance → hit</>,
        output: value,
      })
    }
  } else {
    steps.push({
      title: '3. Hit roll',
      inputs: <>hit chance = {fmt(hitChance)}%</>,
      formula: <>forced hit (toggle on)</>,
      output: value,
    })
  }

  // 4. Crit
  const critStat = isHeal ? 'heal_crit' : isMagic ? 'spell_crit' : 'crit_chance'
  const critChance = statValue(aStats, critStat)
  const critBonus = statValue(aStats, 'crit_damage') / 100
  const critRoll = opts.forceCrit ? 0 : Math.random() * 100
  const isCrit = opts.forceCrit || critRoll < critChance
  const before4 = value
  if (isCrit) {
    value = value * (1 + critBonus)
    steps.push({
      title: '4. Crit roll',
      inputs: (
        <>
          {critStat} = {fmt(critChance)}% · roll = {fmt(critRoll, 0)} · crit
          damage = +{fmt(critBonus * 100)}%
        </>
      ),
      formula: (
        <>
          value = {fmt(before4)} × (1 + {fmt(critBonus)}) = {fmt(value)}
        </>
      ),
      output: value,
      outputLabel: 'CRIT',
    })
  } else {
    steps.push({
      title: '4. Crit roll',
      inputs: (
        <>
          {critStat} = {fmt(critChance)}% · roll = {fmt(critRoll, 0)}
        </>
      ),
      formula: <>roll ≥ chance → no crit</>,
      output: value,
    })
  }

  // 5. Mitigation
  if (isHeal) {
    steps.push({
      title: '5. Mitigation',
      inputs: <>heals are not mitigated</>,
      formula: <>value unchanged</>,
      output: value,
      skipped: 'Heals skip mitigation',
    })
  } else {
    const mitStat = isMagic ? 'magic_resist' : 'armor'
    const mitValue = statValue(dStats, mitStat)
    const multiplier = MITIGATION_K / (MITIGATION_K + mitValue)
    const before5 = value
    value = value * multiplier
    steps.push({
      title: `5. ${isMagic ? 'Magic resist' : 'Armor'} mitigation`,
      inputs: (
        <>
          defender.{mitStat} = {fmt(mitValue)} · K = {MITIGATION_K}
        </>
      ),
      formula: (
        <>
          mult = K / (K + {mitStat}) = {fmt(multiplier, 3)} · value ={' '}
          {fmt(before5)} × {fmt(multiplier, 3)} = {fmt(value)}
        </>
      ),
      output: value,
    })
  }

  return appendFinal(steps, value, isHeal)
}

function appendFinal(steps: Step[], value: number, isHeal: boolean): Step[] {
  const final = Math.max(0, Math.round(value))
  steps.push({
    title: isHeal ? 'Final heal' : 'Final damage',
    inputs: <>round(max(0, value))</>,
    formula: <>= {final}</>,
    output: final,
    outputLabel: 'FINAL',
  })
  return steps
}

function Pipeline({
  attacker,
  defender,
  spell,
  forceCrit,
  forceHit,
  powerCoefficient,
}: {
  attacker: SimpleCharacter
  defender: SimpleCharacter
  spell: Spell
  forceCrit: boolean
  forceHit: boolean
  powerCoefficient: number
}) {
  // Recompute when any input changes. The Math.random() rolls cause hit/crit
  // to vary per re-render, which is what the "Recalculate" button effect of
  // toggling a checkbox achieves naturally — kept simple on purpose.
  const steps = useMemo(
    () =>
      buildPipeline(attacker, defender, spell, {
        forceCrit,
        forceHit,
        powerCoefficient,
      }),
    [attacker, defender, spell, forceCrit, forceHit, powerCoefficient],
  )

  return (
    <div className="dmg-pipeline">
      {steps.map((step, i) => (
        <div
          key={i}
          className={`dmg-step${
            step.outputLabel === 'FINAL' ? ' dmg-step-final' : ''
          }${step.outputLabel === 'CRIT' ? ' dmg-step-crit' : ''}${
            step.outputLabel === 'MISS' ? ' dmg-step-miss' : ''
          }`}
        >
          <div className="dmg-step-title">
            {step.title}
            {step.outputLabel && step.outputLabel !== 'FINAL' && (
              <span className="dmg-step-tag">{step.outputLabel}</span>
            )}
          </div>
          <div className="dmg-step-inputs">{step.inputs}</div>
          <div className="dmg-step-formula">{step.formula}</div>
          <div className="dmg-step-output">
            {step.outputLabel === 'FINAL' ? '→ ' : '= '}
            <strong>{fmt(step.output)}</strong>
            {step.skipped && (
              <span className="dmg-step-note"> · {step.skipped}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}
