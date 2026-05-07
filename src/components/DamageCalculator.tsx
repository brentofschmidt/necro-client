import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  getPublicCharacter,
  getPublicCharacterCalculatedStats,
  getPublicCharacterSkills,
  listPublicCharacters,
  listSkills,
  listSpells,
  PublicCharacter,
  PublicCharacterCalculatedStat,
  PublicCharacterDetail,
  PublicCharacterSkill,
  Skill,
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
  skills: PublicCharacterSkill[]
}

// Mitigation constant. Higher K means armor/resist matter less per point.
// WoW historically used scaling-by-attacker-level constants; this is a flat
// placeholder, easy to swap once the formula stabilises.
const MITIGATION_K = 100

// Cap that level / MAX_SKILL_LEVEL is divided by to produce the damage-roll
// floor. Matches max_level on the seeded weapon proficiencies (migration 0012).
const MAX_SKILL_LEVEL = 99

// Floor used when no weapon proficiency applies — spells, generic abilities.
// 0 = full uniform 0..max with min 1 (untrained casters).
// 0.5 = roll between 50% and 100% of max ("reliable but variable").
// 1.0 = always max (deterministic).
// Single knob so the design can shift without code changes.
const SPELL_PROFICIENCY_FLOOR = 0

function statValue(stats: PublicCharacterCalculatedStat[], id: string): number {
  return stats.find((s) => s.id === id)?.value ?? 0
}

function fmt(n: number, digits = 1): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(digits)
}

// Loads detail + calculated stats + skill levels together so the picker
// handlers stay simple. Skills feed the proficiency-driven damage roll
// curve in buildPipeline.
async function loadCharacter(id: string): Promise<SimpleCharacter | null> {
  const [detail, stats, skills] = await Promise.all([
    getPublicCharacter(id),
    getPublicCharacterCalculatedStats(id),
    getPublicCharacterSkills(id),
  ])
  if (!detail) return null
  return { detail, stats, skills }
}

// Resolves the attacker's weapon proficiency level for the action being used.
// `spell.required_weapon_types[0]` (e.g. 'sword') matches against the catalog
// skill row whose `item_types[0]` is the same value (e.g. 'swords' / 'Sword').
// Returns null when the action has no weapon-type gate (spells, generic
// abilities) — the caller falls back to SPELL_PROFICIENCY_FLOOR in that case.
function proficiencyLevelFor(
  attacker: SimpleCharacter,
  spell: Spell,
  skillsCatalog: Skill[] | null,
): { level: number; skillName: string } | null {
  const weaponType = spell.required_weapon_types?.[0]
  if (!weaponType || !skillsCatalog) return null
  const catalogEntry = skillsCatalog.find(
    (s) => s.category === 'Proficiency' && s.item_types.includes(weaponType),
  )
  if (!catalogEntry) return null
  const charSkill = attacker.skills.find((s) => s.skill === catalogEntry.name)
  return {
    level: charSkill?.level ?? 0,
    skillName: catalogEntry.display_name ?? catalogEntry.name,
  }
}

export function DamageCalculator() {
  const [characters, setCharacters] = useState<PublicCharacter[] | null>(null)
  const [spells, setSpells] = useState<Spell[] | null>(null)
  const [skillsCatalog, setSkillsCatalog] = useState<Skill[] | null>(null)

  const [attackerId, setAttackerId] = useState<string>('')
  const [defenderId, setDefenderId] = useState<string>('')
  const [spellId, setSpellId] = useState<string>('')

  const [attacker, setAttacker] = useState<SimpleCharacter | null>(null)
  const [defender, setDefender] = useState<SimpleCharacter | null>(null)

  const [forceCrit, setForceCrit] = useState(false)
  const [forceHit, setForceHit] = useState(true) // assume hit by default
  const [powerCoefficient, setPowerCoefficient] = useState(1.0)
  // Bumping rollSeed forces buildPipeline's useMemo to re-run, which
  // re-rolls the damage sample. Reroll button writes to it.
  const [rollSeed, setRollSeed] = useState(0)

  // Boot: fetch the option lists for the three pickers + the skills
  // catalog (needed to map action.required_weapon_types[0] → proficiency).
  useEffect(() => {
    listPublicCharacters().then(setCharacters)
    listSpells().then(setSpells)
    listSkills().then(setSkillsCatalog)
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
          skillsCatalog={skillsCatalog}
          forceCrit={forceCrit}
          forceHit={forceHit}
          powerCoefficient={powerCoefficient}
          rollSeed={rollSeed}
          onReroll={() => setRollSeed((s) => s + 1)}
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

type MultiRollResult = {
  count: number
  min: number
  max: number
  mean: number
  median: number
  mode: number
  modeCount: number
  top10: { value: number; count: number }[]
}

type Step = {
  title: string
  formula: ReactNode
  inputs: ReactNode
  output: number
  outputLabel?: string
  skipped?: string
  // Optional min/mean/max triple so the renderer can show the full damage
  // roll range alongside the sampled value (used by Damage roll + Final).
  range?: { min: number; mean: number; max: number }
}

function buildPipeline(
  attacker: SimpleCharacter,
  defender: SimpleCharacter,
  spell: Spell,
  skillsCatalog: Skill[] | null,
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
      return appendFinal(steps, value, isHeal, null)
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

  // 6. Damage roll — proficiency-driven curve. Heals skip this entirely;
  //    they stay deterministic at full computed value.
  let range: { min: number; mean: number; max: number } | null = null
  if (!isHeal && value > 0) {
    const prof = proficiencyLevelFor(attacker, spell, skillsCatalog)
    const floor =
      prof !== null
        ? Math.max(0, Math.min(1, prof.level / MAX_SKILL_LEVEL))
        : SPELL_PROFICIENCY_FLOOR
    const floorSource =
      prof !== null
        ? `${prof.skillName} lv ${prof.level} / ${MAX_SKILL_LEVEL}`
        : `no weapon proficiency · default ${SPELL_PROFICIENCY_FLOOR}`
    const r = Math.random()
    const rollMult = floor + (1 - floor) * r
    const sample = Math.max(1, Math.ceil(value * rollMult))
    const min = Math.max(1, Math.ceil(value * floor))
    const max = Math.max(1, Math.ceil(value))
    const mean = Math.max(1, Math.ceil(value * (floor + 1) / 2))
    range = { min, mean, max }
    steps.push({
      title: '6. Damage roll',
      inputs: (
        <>
          floor = {fmt(floor, 2)} ({floorSource}) · roll ={' '}
          {fmt(rollMult, 3)}
        </>
      ),
      formula: (
        <>
          max(1, ceil({fmt(value)} × ({fmt(floor, 2)} + (1 − {fmt(floor, 2)})
          × rand))) = {sample}
        </>
      ),
      output: sample,
      range,
    })
    value = sample
  }

  return appendFinal(steps, value, isHeal, range)
}

function appendFinal(
  steps: Step[],
  value: number,
  isHeal: boolean,
  range: { min: number; mean: number; max: number } | null,
): Step[] {
  const final = Math.max(0, Math.round(value))
  steps.push({
    title: isHeal ? 'Final heal' : 'Final damage',
    inputs: <>round(max(0, value))</>,
    formula: <>= {final}</>,
    output: final,
    outputLabel: 'FINAL',
    range: range ?? undefined,
  })
  return steps
}

function Pipeline({
  attacker,
  defender,
  spell,
  skillsCatalog,
  forceCrit,
  forceHit,
  powerCoefficient,
  rollSeed,
  onReroll,
}: {
  attacker: SimpleCharacter
  defender: SimpleCharacter
  spell: Spell
  skillsCatalog: Skill[] | null
  forceCrit: boolean
  forceHit: boolean
  powerCoefficient: number
  rollSeed: number
  onReroll: () => void
}) {
  // Recompute when any input changes — including rollSeed, which the Reroll
  // button bumps to re-randomize the damage roll sample without touching the
  // upstream picks.
  const steps = useMemo(
    () =>
      buildPipeline(attacker, defender, spell, skillsCatalog, {
        forceCrit,
        forceHit,
        powerCoefficient,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attacker, defender, spell, skillsCatalog, forceCrit, forceHit, powerCoefficient, rollSeed],
  )

  // Multi-roll: simulate the full pipeline N times and aggregate the
  // final values. Useful for sanity-checking the curve in aggregate.
  const [nRolls, setNRolls] = useState(1000)
  const [multi, setMulti] = useState<MultiRollResult | null>(null)

  function runMultiRoll() {
    const count = Math.max(1, Math.min(100000, Math.floor(nRolls)))
    let min = Infinity
    let max = -Infinity
    let total = 0
    const samples = new Array<number>(count)
    const freq = new Map<number, number>()
    for (let i = 0; i < count; i++) {
      const s = buildPipeline(attacker, defender, spell, skillsCatalog, {
        forceCrit,
        forceHit,
        powerCoefficient,
      })
      const final = s[s.length - 1].output
      samples[i] = final
      if (final < min) min = final
      if (final > max) max = final
      total += final
      freq.set(final, (freq.get(final) ?? 0) + 1)
    }

    // Median — sort a copy so we don't disturb sample order.
    const sorted = samples.slice().sort((a, b) => a - b)
    const mid = Math.floor(count / 2)
    const median =
      count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]

    // Top 10 by frequency. Ties broken by larger value first so the user
    // sees the more impressive number when counts are equal.
    const ranked = Array.from(freq.entries())
      .map(([value, c]) => ({ value, count: c }))
      .sort((a, b) => b.count - a.count || b.value - a.value)
    const top10 = ranked.slice(0, 10)
    const mode = ranked[0]

    setMulti({
      count,
      min,
      max,
      mean: total / count,
      median,
      mode: mode.value,
      modeCount: mode.count,
      top10,
    })
  }

  // Multi-roll results are stale once any upstream input changes — clear
  // them so the user isn't comparing apples and oranges.
  useEffect(() => {
    setMulti(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacker, defender, spell, forceCrit, forceHit, powerCoefficient])

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
          {step.range && (
            <div className="dmg-step-range">
              Min <strong>{step.range.min}</strong> · Avg{' '}
              <strong>{step.range.mean}</strong> · Max{' '}
              <strong>{step.range.max}</strong>
            </div>
          )}
          <div className="dmg-step-output">
            {step.outputLabel === 'FINAL' ? '→ ' : '= '}
            <strong>{fmt(step.output)}</strong>
            {step.range && step.outputLabel === 'FINAL' && (
              <span className="dmg-step-note"> · rolled</span>
            )}
            {step.skipped && (
              <span className="dmg-step-note"> · {step.skipped}</span>
            )}
          </div>
        </div>
      ))}
      <div className="dmg-pipeline-toolbar">
        <button type="button" className="dmg-reroll" onClick={onReroll}>
          Reroll
        </button>
        <div className="dmg-multi-roll">
          <label className="dmg-multi-label">
            <span>Roll</span>
            <input
              type="number"
              min={1}
              max={100000}
              step={100}
              value={nRolls}
              onChange={(e) => setNRolls(Number(e.target.value) || 1)}
              className="dmg-multi-input"
            />
            <span>times</span>
          </label>
          <button type="button" className="dmg-reroll" onClick={runMultiRoll}>
            Run
          </button>
        </div>
      </div>
      {multi && (
        <div className="dmg-multi-results">
          <div className="dmg-multi-title">
            Across {multi.count.toLocaleString()} rolls
          </div>
          <div className="dmg-multi-stats">
            <div className="dmg-multi-stat">
              <span className="dmg-multi-stat-label">Lowest</span>
              <strong>{multi.min}</strong>
            </div>
            <div className="dmg-multi-stat">
              <span className="dmg-multi-stat-label">Mean</span>
              <strong>{multi.mean.toFixed(1)}</strong>
            </div>
            <div className="dmg-multi-stat">
              <span className="dmg-multi-stat-label">Median</span>
              <strong>{fmt(multi.median, 1)}</strong>
            </div>
            <div className="dmg-multi-stat">
              <span className="dmg-multi-stat-label">
                Mode ({multi.modeCount.toLocaleString()}×)
              </span>
              <strong>{multi.mode}</strong>
            </div>
            <div className="dmg-multi-stat">
              <span className="dmg-multi-stat-label">Highest</span>
              <strong>{multi.max}</strong>
            </div>
          </div>
          <div className="dmg-multi-top">
            <div className="dmg-multi-top-label">
              Top {multi.top10.length} most-rolled values
            </div>
            <ol className="dmg-multi-top-list">
              {multi.top10.map((row, i) => {
                const pct = (row.count / multi.count) * 100
                return (
                  <li key={i} className="dmg-multi-top-row">
                    <span className="dmg-multi-top-rank">{i + 1}.</span>
                    <span className="dmg-multi-top-value">{row.value}</span>
                    <span className="dmg-multi-top-bar" aria-hidden="true">
                      <span
                        className="dmg-multi-top-bar-fill"
                        style={{ width: `${(row.count / multi.top10[0].count) * 100}%` }}
                      />
                    </span>
                    <span className="dmg-multi-top-count">
                      {row.count.toLocaleString()} ({pct.toFixed(1)}%)
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}
