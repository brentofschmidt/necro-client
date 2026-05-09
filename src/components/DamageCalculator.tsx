import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Action,
  getPublicCharacter,
  getPublicCharacterAbilityScores,
  getPublicCharacterCalculatedStats,
  getPublicCharacterEquipment,
  getPublicCharacterSkills,
  listActions,
  listPublicCharacters,
  listSkills,
  listSpells,
  PublicCharacter,
  PublicCharacterAbilityScore,
  PublicCharacterCalculatedStat,
  PublicCharacterDetail,
  PublicCharacterEquipmentSlot,
  PublicCharacterSkill,
  Skill,
} from '../lib/necroContent'
import { DamageConstantsLegend } from './DamageFlowchart'

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
  // Effective ability scores (base + equipment + aura), keyed by ability id
  // (e.g. 'strength', 'dexterity'). Editable in the calculator.
  abilities: PublicCharacterAbilityScore[]
  // Equipped items keyed by slot. Weapon attacks (actions with a
  // required_weapon_types gate) pull base damage from whichever equipped
  // item matches the gate.
  equipment: PublicCharacterEquipmentSlot[]
}

// Mitigation constant. Higher K means armor/resist matter less per point.
// Hit-size-independent — same % reduction regardless of incoming damage.
// Easy to swap once the formula stabilises.
const MITIGATION_K = 100

// Hit-chance formula constants (migration 0069). The pipeline runs ONE
// avoid roll per group: hitChance = clamp(BASE_HIT + accuracy − evasion,
// MIN_HIT, MAX_HIT). Symmetric for physical (accuracy / evasion) and
// magical (spell_accuracy / spell_evasion). Linear in the delta so every
// +1 stat moves hit chance by 1% — easy to mental-math at the table.
const BASE_HIT = 90  // Naked-vs-naked baseline.
const MAX_HIT  = 98  // "Always some chance to miss" residual.
const MIN_HIT  =  5  // "Always some chance to hit" floor.

// Damage multiplier applied on a successful BLOCK roll. 0.5 = "blocked
// for half" — block is partial mitigation, not full evasion. Block now
// fires as an INDEPENDENT roll alongside the avoid roll instead of
// living in a band, so the effective block rate matches block_chance
// directly (no overlap with miss / dodge eating into it).
const BLOCK_MITIGATION = 0.5

// Cap that level / MAX_SKILL_LEVEL is divided by to produce the damage-
// roll floor fraction. Matches max_level on the seeded weapon
// proficiencies (migration 0012).
const MAX_SKILL_LEVEL = 99

// At max proficiency, the uniform damage roll's lower bound is
// `value × FLOOR_CAP`. So a level-99 master rolls uniform on [0.3·max,
// max] (still swingy but never whiffs), while a level-1 novice rolls
// uniform on [0, max] (pure RuneScape-flavoured swing). Tunable: 0.5
// gives a tighter top-end (master rolls [0.5·max, max]); 0.0 collapses
// the system back to "everyone is RS-untrained."
const FLOOR_CAP = 0.3

// Damage roll on [value · profFloor, value], uniformly. Heals skip this
// (deterministic). The min/mean/max returned here drives Step.range so
// the renderer can show the rolled-window envelope alongside the sample.
//
// At profFloor = 0 the roll is uniform [0, value] — RuneScape-style: a
// max-stat attacker still occasionally whiffs to 0. At profFloor = 0.3
// the roll is uniform [0.3·value, value] — skill raises the floor, top
// end stays just as swingy. Mean of a uniform is its midpoint, so
// (min+max)/2 is what the histogram peak settles around.
function rollDamageUniform(
  value: number,
  profFloor: number,
): { sample: number; min: number; max: number; mean: number } {
  if (value <= 0) return { sample: 0, min: 0, max: 0, mean: 0 }
  const min = Math.max(0, value * profFloor)
  const max = value
  const sample = min + Math.random() * (max - min)
  return { sample, min, max, mean: (min + max) / 2 }
}

// Persistence — saved choices survive tab switches and page reloads.
// Bumped key suffix invalidates old shapes if the schema ever changes.
const SAVED_KEY = 'necro:damage-calculator:v1'

type SavedState = {
  attackerId?: string
  defenderId?: string
  spellId?: string
  forceCrit?: boolean
  forceHit?: boolean
  powerCoefficient?: number
  nRolls?: number
  rollFirst?: boolean
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    return raw ? (JSON.parse(raw) as SavedState) : {}
  } catch {
    return {}
  }
}

function saveSaved(s: SavedState) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(s))
  } catch {
    // quota or disabled storage — best-effort persistence, ignore.
  }
}

function statValue(stats: PublicCharacterCalculatedStat[], id: string): number {
  return stats.find((s) => s.id === id)?.value ?? 0
}

// Stat overrides, lifted to the calculator's top level so any UI can edit
// them. Reset whenever the underlying character changes.
type StatOverrides = Record<string, number>

// Resolves an ability score to its effective value (override > rpc total).
function effAbility(
  abilities: PublicCharacterAbilityScore[],
  id: string,
  overrides: StatOverrides,
): number {
  const ov = overrides[id]
  if (Number.isFinite(ov)) return ov as number
  return abilities.find((a) => a.ability === id)?.total_value ?? 10
}

// Mirrors the SQL formulas in migration 0054 — given the six ability values
// (and the spell context), returns each calc stat's ability-driven base.
// Equipment / aura stat bonuses on top come from the RPC, which we keep as
// the additive baseline; ability overrides only change the ability-driven
// portion via a delta in effStat below.
//
// Stats not produced by an ability formula (or constant ones like
// crit_damage = 50) are absent from the returned object.
function statContributionsFromAbilities(a: {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}): Record<string, number> {
  const f = Math.floor
  const dexBase = f((a.dexterity - 10) / 2)
  const intBase = f((a.intelligence - 10) / 2)
  const wisBase = f((a.wisdom - 10) / 2)
  const conBase = f((a.constitution - 10) / 2)
  return {
    attack_power: a.strength * 2,
    spell_power: a.intelligence * 2,
    healing_power: a.wisdom * 2,
    crit_damage: 50,
    crit_chance: dexBase,
    spell_crit: intBase,
    heal_crit: wisBase,
    haste: f(a.dexterity / 4),
    attack_speed: f(a.dexterity / 4),
    movement_speed: f(a.dexterity / 5),
    // Armor is equipment-only as of migration 0060 — no ability contribution.
    armor: 0,
    // Defense stats — symmetric physical / magical pair (migration 0069).
    // DEX drives physical evasion, WIS drives spell evasion. Block stays
    // shield-gated server-side; ignored here for the calc tool.
    evasion: dexBase,
    spell_evasion: wisBase,
    block_chance: conBase,
    spell_block_chance: conBase,
    magic_resist: a.wisdom,
    // Precision stats — single-ability drivers, mod-scale magnitudes
    // (migration 0069). The pipeline's hit formula is linear: hitChance =
    // clamp(BASE_HIT + accuracy − evasion, MIN_HIT, MAX_HIT).
    accuracy: dexBase,
    spell_accuracy: intBase,
    mana_regen: f(a.wisdom / 4),
    health_regen: f(a.constitution / 5),
    // dodge_chance / parry_chance / hit_chance / spell_hit — dropped in
    // 0069 (renamed / collapsed into the new symmetric pair). STR no
    // longer contributes to physical accuracy; CHA no longer contributes
    // to spell accuracy.
  }
}

// Bundles the six ability values into a struct, applying any user overrides.
function effAbilities(
  abilities: PublicCharacterAbilityScore[],
  overrides: StatOverrides,
) {
  return {
    strength: effAbility(abilities, 'strength', overrides),
    dexterity: effAbility(abilities, 'dexterity', overrides),
    constitution: effAbility(abilities, 'constitution', overrides),
    intelligence: effAbility(abilities, 'intelligence', overrides),
    wisdom: effAbility(abilities, 'wisdom', overrides),
    charisma: effAbility(abilities, 'charisma', overrides),
  }
}

// Resolves a calc stat to its effective value, considering BOTH the calc
// stat override AND any ability score overrides. Calc stat override wins
// outright; otherwise we add the delta between formula(overridden abilities)
// and formula(base abilities) to the RPC value, which preserves the gear/
// aura contributions baked into the RPC.
function effStat(
  stats: PublicCharacterCalculatedStat[],
  id: string,
  calcOverrides: StatOverrides,
  abilities: PublicCharacterAbilityScore[],
  abilityOverrides: StatOverrides,
): number {
  const calcOv = calcOverrides[id]
  if (Number.isFinite(calcOv)) return calcOv as number

  const baseRpc = statValue(stats, id)
  const hasAbilityOverride = Object.keys(abilityOverrides).length > 0
  if (!hasAbilityOverride) return baseRpc

  const baseAbilContrib = statContributionsFromAbilities(
    effAbilities(abilities, {}),
  )[id]
  const newAbilContrib = statContributionsFromAbilities(
    effAbilities(abilities, abilityOverrides),
  )[id]
  if (baseAbilContrib === undefined || newAbilContrib === undefined) return baseRpc

  return baseRpc - baseAbilContrib + newAbilContrib
}

function fmt(n: number, digits = 1): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(digits)
}

// Loads detail + calculated stats + skill levels + ability scores together
// so the picker handlers stay simple. Skills feed the proficiency-driven
// damage roll curve in buildPipeline; abilities feed the formula deltas
// when a user overrides an ability score.
async function loadCharacter(id: string): Promise<SimpleCharacter | null> {
  const [detail, stats, skills, abilities, equipment] = await Promise.all([
    getPublicCharacter(id),
    getPublicCharacterCalculatedStats(id),
    getPublicCharacterSkills(id),
    getPublicCharacterAbilityScores(id),
    getPublicCharacterEquipment(id),
  ])
  if (!detail) return null
  return { detail, stats, skills, abilities, equipment }
}

// A "calculable" effect — Damage or Heal — pulled out of an ability's
// effects array and normalised. Each one runs through the pipeline as its
// own sub-resolution: base damage, crit application, mitigation (routed
// by THIS effect's school), damage roll. Total damage/healing for an
// attack is the sum across all calculable effects.
//
// StatModifier / non-numeric effects are filtered out — they apply as
// auras and don't contribute to the damage number.
type CalcEffect = {
  index: number
  description: string
  type: 'Damage' | 'Heal'
  coefficient: number
  school: string | null
  target: string
}

// Normalises a spell's effects array into per-effect calc inputs. As of
// migration 0066, abilities are required to declare their own Damage/Heal
// effects — no parent-level fallback. If the array is empty (a buff or
// non-damaging utility), the calculator simply produces 0 damage; the
// attack outcome and crit rolls still fire for completeness.
function normaliseEffects(ability: Action): CalcEffect[] {
  const calculable: CalcEffect[] = []
  let idx = 0
  for (const eff of ability.effects ?? []) {
    if (eff.type !== 'Damage' && eff.type !== 'Heal') continue
    const coef =
      typeof eff.coefficient === 'number' ? eff.coefficient : 0
    const school =
      typeof eff.school === 'string' ? eff.school : ability.damage_school ?? null
    calculable.push({
      index: idx++,
      description:
        typeof eff.description === 'string'
          ? eff.description
          : `${eff.type} effect`,
      type: eff.type,
      coefficient: coef,
      school,
      target: typeof eff.target === 'string' ? eff.target : 'Primary',
    })
  }
  return calculable
}

// Given an effect's school, returns whether the calculator should route
// it through the magical (spell_power, magic_resist) pipeline or the
// physical (attack_power, armor) one. Heals use healing_power regardless
// of school.
function effectIsMagic(effect: CalcEffect): boolean {
  return !!effect.school && effect.school !== 'physical'
}

// Splits an ability's calculable effects into groups keyed by `target`
// ('Primary', 'SplashRadius', …). Each group is a separate damage / heal
// resolution that lands on a *different* set of characters: only the
// Primary group hits the picked defender; SplashRadius effects represent
// damage to OTHER characters in the radius and are reported separately
// rather than summed into the defender's hit. Primary is always returned
// first so the pipeline resolves the defender's number before any
// informational splash groups.
type CalcEffectGroup = { target: string; effects: CalcEffect[] }
function groupEffectsByTarget(effects: CalcEffect[]): CalcEffectGroup[] {
  const buckets = new Map<string, CalcEffect[]>()
  for (const eff of effects) {
    const arr = buckets.get(eff.target) ?? []
    arr.push(eff)
    buckets.set(eff.target, arr)
  }
  const ordered: CalcEffectGroup[] = []
  if (buckets.has('Primary')) {
    ordered.push({ target: 'Primary', effects: buckets.get('Primary')! })
    buckets.delete('Primary')
  }
  for (const [target, effs] of buckets) {
    ordered.push({ target, effects: effs })
  }
  return ordered
}

// Resolves the attacker's weapon proficiency level for the action being used.
// `spell.required_weapon_types[0]` (e.g. 'sword') matches against the catalog
// skill row whose `item_types[0]` is the same value (e.g. 'swords' / 'Sword').
// Returns null when the action has no weapon-type gate (spells, generic
// abilities) — the caller falls back to SPELL_PROFICIENCY_FLOOR in that case.
function proficiencyLevelFor(
  attacker: SimpleCharacter,
  spell: Action,
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
  // Spells + actions merged into a single picker list so the calculator
  // can walk both physical weapon attacks and magical spells through the
  // same pipeline. Each entry is just an Action (Spell extends Action with
  // splash fields the calculator doesn't use yet).
  const [spells, setSpells] = useState<Action[] | null>(null)
  const [skillsCatalog, setSkillsCatalog] = useState<Skill[] | null>(null)

  // Hydrate once from localStorage on first render so picks survive tab
  // switches and reloads. Lazy initializers keep the read off the render path.
  const [attackerId, setAttackerId] = useState<string>(() => loadSaved().attackerId ?? '')
  const [defenderId, setDefenderId] = useState<string>(() => loadSaved().defenderId ?? '')
  const [spellId, setSpellId] = useState<string>(() => loadSaved().spellId ?? '')

  const [attacker, setAttacker] = useState<SimpleCharacter | null>(null)
  const [defender, setDefender] = useState<SimpleCharacter | null>(null)

  const [forceCrit, setForceCrit] = useState(() => loadSaved().forceCrit ?? false)
  const [forceHit, setForceHit] = useState(() => loadSaved().forceHit ?? true)
  const [powerCoefficient, setPowerCoefficient] = useState(
    () => loadSaved().powerCoefficient ?? 1.0,
  )
  const [nRolls, setNRolls] = useState(() => loadSaved().nRolls ?? 1000)
  // Pipeline ordering toggle. false (default) = roll last: stats apply
  // first, then bell-curve roll on the post-mitigation envelope. true =
  // roll first: bell-curve roll on the spell's base damage, then stats
  // shift/scale the rolled value through downstream steps.
  const [rollFirst, setRollFirst] = useState(() => loadSaved().rollFirst ?? false)
  // Bumping rollSeed forces buildPipeline's useMemo to re-run, which
  // re-rolls the damage sample. Reroll button writes to it.
  const [rollSeed, setRollSeed] = useState(0)

  // Stat / spell / proficiency overrides. The user types over any displayed
  // value to play "what if". These reset whenever the underlying entity
  // changes — overrides are entity-specific, and silently carrying them
  // across selections would be confusing.
  const [attackerOv, setAttackerOv] = useState<StatOverrides>({})
  const [defenderOv, setDefenderOv] = useState<StatOverrides>({})
  const [attackerAbilityOv, setAttackerAbilityOv] = useState<StatOverrides>({})
  const [defenderAbilityOv, setDefenderAbilityOv] = useState<StatOverrides>({})
  const [proficiencyOv, setProficiencyOv] = useState<number | undefined>()
  useEffect(() => {
    setAttackerOv({})
    setAttackerAbilityOv({})
  }, [attackerId])
  useEffect(() => {
    setDefenderOv({})
    setDefenderAbilityOv({})
  }, [defenderId])
  useEffect(() => {
    setProficiencyOv(undefined)
  }, [spellId, attackerId])

  // Persist any choice change so a tab switch or reload restores them.
  useEffect(() => {
    saveSaved({
      attackerId,
      defenderId,
      spellId,
      forceCrit,
      forceHit,
      powerCoefficient,
      nRolls,
      rollFirst,
    })
  }, [
    attackerId, defenderId, spellId,
    forceCrit, forceHit, powerCoefficient,
    nRolls, rollFirst,
  ])

  // Boot: fetch the option lists for the three pickers + the skills
  // catalog (needed to map action.required_weapon_types[0] → proficiency).
  // Spells and actions are merged into a single ability list — both share
  // the Action shape (damage + damage_school + …) post-migration 0062.
  useEffect(() => {
    listPublicCharacters().then(setCharacters)
    Promise.all([listSpells(), listActions()]).then(([sp, ac]) => {
      const merged = [...sp, ...ac].sort((a, b) =>
        a.ability_name.localeCompare(b.ability_name),
      )
      setSpells(merged)
    })
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

      <DamageConstantsLegend />

      <div className="dmg-pickers">
        <PickerCard title="Attacker" tone="attacker">
          <CharacterPicker
            characters={characters}
            value={attackerId}
            onChange={setAttackerId}
          />
          {attacker && (
            <EditableCharacterCard
              char={attacker}
              mode="offence"
              overrides={attackerOv}
              setOverrides={setAttackerOv}
              abilityOverrides={attackerAbilityOv}
              setAbilityOverrides={setAttackerAbilityOv}
              spell={spell}
              skillsCatalog={skillsCatalog}
              proficiencyOv={proficiencyOv}
              setProficiencyOv={setProficiencyOv}
            />
          )}
        </PickerCard>

        <PickerCard title="Ability" tone="ability">
          <select
            className="dmg-select"
            value={spellId}
            onChange={(e) => setSpellId(e.target.value)}
          >
            <option value="">Pick an ability…</option>
            {(spells ?? []).map((s) => (
              <option key={s.asset_name} value={s.asset_name}>
                {s.ability_name}
              </option>
            ))}
          </select>
          {spell && (
            <EditableSpellCard
              spell={spell}
              attacker={attacker}
              attackerOv={attackerOv}
              attackerAbilityOv={attackerAbilityOv}
              powerCoefficient={powerCoefficient}
            />
          )}
        </PickerCard>

        <PickerCard title="Defender" tone="defender">
          <CharacterPicker
            characters={characters}
            value={defenderId}
            onChange={setDefenderId}
          />
          {defender && (
            <EditableCharacterCard
              char={defender}
              mode="defence"
              overrides={defenderOv}
              setOverrides={setDefenderOv}
              abilityOverrides={defenderAbilityOv}
              setAbilityOverrides={setDefenderAbilityOv}
              spell={spell}
              skillsCatalog={skillsCatalog}
              proficiencyOv={proficiencyOv}
              setProficiencyOv={setProficiencyOv}
            />
          )}
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
        <label
          className="dmg-toggle"
          title="Multiplier on top of each ability's own power_coefficient. 1 = no-op."
        >
          <span>Power coef multiplier</span>
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
        <label className="dmg-toggle">
          <input
            type="checkbox"
            checked={rollFirst}
            onChange={(e) => setRollFirst(e.target.checked)}
          />
          <span>
            Roll first (bell on base damage, then scale stats)
          </span>
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
          rollFirst={rollFirst}
          attackerOv={attackerOv}
          defenderOv={defenderOv}
          attackerAbilityOv={attackerAbilityOv}
          defenderAbilityOv={defenderAbilityOv}
          proficiencyOv={proficiencyOv}
          rollSeed={rollSeed}
          onReroll={() => setRollSeed((s) => s + 1)}
          nRolls={nRolls}
          setNRolls={setNRolls}
        />
      ) : (
        <div className="dmg-placeholder">
          Pick an attacker, defender, and ability to see the math.
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

// One editable stat row. Shows the current effective value (override if set,
// else fetched). User typing flips it into "overridden" state — visually
// distinct so it's obvious which numbers are real and which were tweaked.
// The reset button (×) appears only when an override is active.
function EditableStat({
  label,
  statId,
  fetched,
  overrides,
  setOverrides,
}: {
  label: string
  statId: string
  fetched: number
  overrides: StatOverrides
  setOverrides: (o: StatOverrides) => void
}) {
  const ov = overrides[statId]
  const isOverride = Number.isFinite(ov)
  const value = isOverride ? (ov as number) : fetched
  return (
    <div className="dmg-kv">
      <dt>{label}</dt>
      <dd>
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={(e) =>
            setOverrides({ ...overrides, [statId]: Number(e.target.value) })
          }
          className={`dmg-stat-input${isOverride ? ' dmg-stat-input-override' : ''}`}
        />
        {isOverride && (
          <button
            type="button"
            className="dmg-stat-reset"
            onClick={() => {
              const next = { ...overrides }
              delete next[statId]
              setOverrides(next)
            }}
            title={`Reset to character value (${fmt(fetched)})`}
            aria-label={`Reset ${label} to ${fmt(fetched)}`}
          >
            ×
          </button>
        )}
      </dd>
    </div>
  )
}

// Attacker / defender summary card with inline-editable ability scores,
// calc stats, and (for the attacker) a proficiency slider auto-populated
// from whichever skill matches spell.required_weapon_types[0]. Editing an
// ability score auto-recomputes the affected calc stats below it via the
// formula deltas in effStat — calc stat overrides on top of that still win
// outright.
function EditableCharacterCard({
  char,
  mode,
  overrides,
  setOverrides,
  abilityOverrides,
  setAbilityOverrides,
  spell,
  skillsCatalog,
  proficiencyOv,
  setProficiencyOv,
}: {
  char: SimpleCharacter
  mode: 'offence' | 'defence'
  overrides: StatOverrides
  setOverrides: (o: StatOverrides) => void
  abilityOverrides: StatOverrides
  setAbilityOverrides: (o: StatOverrides) => void
  spell: Action | null
  skillsCatalog: Skill[] | null
  proficiencyOv: number | undefined
  setProficiencyOv: (n: number | undefined) => void
}) {
  // % is folded into the label (e.g. "Hit (%)") rather than rendered as a
  // suffix after the input — keeps every input field's right edge aligned
  // in the card's column layout.
  const offenceFields: [string, string][] = [
    ['Attack Power', 'attack_power'],
    ['Spell Power', 'spell_power'],
    ['Healing Power', 'healing_power'],
    ['Crit (%)', 'crit_chance'],
    ['Spell Crit (%)', 'spell_crit'],
    ['Crit Damage (%)', 'crit_damage'],
    ['Accuracy', 'accuracy'],
    ['Spell Accuracy', 'spell_accuracy'],
  ]
  const defenceFields: [string, string][] = [
    ['Armor', 'armor'],
    ['Magic Resist', 'magic_resist'],
    ['Evasion', 'evasion'],
    ['Spell Evasion', 'spell_evasion'],
    ['Block (%)', 'block_chance'],
    ['Spell Block (%)', 'spell_block_chance'],
  ]
  const fields = mode === 'offence' ? offenceFields : defenceFields
  const hasOverrides = Object.keys(overrides).length > 0

  // Resolve the proficiency that applies to this attack so we can show its
  // name + slider. Only relevant for the attacker side.
  const prof =
    mode === 'offence' && spell ? proficiencyLevelFor(char, spell, skillsCatalog) : null
  // Proficiency floors at 1 — level 0 collapses the bell to a single integer
  // at the lower bound (σ floor only, no spread to either side) which is a
  // useless display state. The character may legitimately have level 0 in
  // the DB; we just don't let the slider/override go below 1.
  const profLevel = Math.max(1, proficiencyOv ?? prof?.level ?? 1)
  const profIsOverride = proficiencyOv !== undefined

  // Six D&D-style ability scores. Editing any of these auto-flows into
  // the calc stats below via the formula-delta in effStat — e.g. bumping
  // Strength bumps the Attack Power input's displayed value too.
  const abilityFields: [string, string][] = [
    ['Strength', 'strength'],
    ['Dexterity', 'dexterity'],
    ['Constitution', 'constitution'],
    ['Intelligence', 'intelligence'],
    ['Wisdom', 'wisdom'],
    ['Charisma', 'charisma'],
  ]
  const hasAbilityOverrides = Object.keys(abilityOverrides).length > 0

  return (
    <>
      <div className="dmg-char-id">
        Lv {char.detail.level} {char.detail.race}
      </div>

      <div className="dmg-card-section-label">Ability scores</div>
      <dl className="dmg-keyvals">
        {abilityFields.map(([label, abilityId]) => (
          <EditableStat
            key={abilityId}
            label={label}
            statId={abilityId}
            fetched={
              char.abilities.find((a) => a.ability === abilityId)?.total_value ?? 10
            }
            overrides={abilityOverrides}
            setOverrides={setAbilityOverrides}
          />
        ))}
      </dl>

      <div className="dmg-card-section-label">
        {mode === 'offence' ? 'Offence stats' : 'Defence stats'}
      </div>
      <dl className="dmg-keyvals">
        {fields.map(([label, statId]) => (
          <EditableStat
            key={statId}
            label={label}
            // fetched reflects ability overrides (same delta math used by the
            // pipeline) so the displayed default updates live when the user
            // tweaks an ability score above. Calc stat overrides on top still
            // sit on top in EditableStat itself.
            fetched={effStat(
              char.stats,
              statId,
              {},
              char.abilities,
              abilityOverrides,
            )}
            statId={statId}
            overrides={overrides}
            setOverrides={setOverrides}
          />
        ))}
      </dl>

      {mode === 'offence' && (
        <div className="dmg-prof">
          <div className="dmg-prof-label">
            Proficiency
            <span className="dmg-prof-name">
              {prof
                ? `${prof.skillName} (default lv ${prof.level})`
                : '— no weapon required'}
            </span>
          </div>
          <div className="dmg-prof-control">
            <input
              type="range"
              min={1}
              max={MAX_SKILL_LEVEL}
              step={1}
              value={profLevel}
              onChange={(e) =>
                setProficiencyOv(Math.max(1, Number(e.target.value)))
              }
              className="dmg-prof-slider"
            />
            <input
              type="number"
              min={1}
              max={MAX_SKILL_LEVEL}
              step={1}
              value={profLevel}
              onChange={(e) =>
                setProficiencyOv(
                  Math.max(1, Math.min(MAX_SKILL_LEVEL, Number(e.target.value) || 1)),
                )
              }
              className={`dmg-stat-input${profIsOverride ? ' dmg-stat-input-override' : ''}`}
            />
            {profIsOverride && (
              <button
                type="button"
                className="dmg-stat-reset"
                onClick={() => setProficiencyOv(undefined)}
                title={`Reset to character value (${prof?.level ?? 0})`}
                aria-label="Reset proficiency"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {(hasOverrides || hasAbilityOverrides) && (
        <button
          type="button"
          className="dmg-reset-all"
          onClick={() => {
            setOverrides({})
            setAbilityOverrides({})
          }}
        >
          Reset all stat overrides
        </button>
      )}
    </>
  )
}

// Spell card. Damage / heal output is fully effect-driven (migration 0066),
// so there's no parent-level base damage or power coefficient to override
// at the spell card level. Per-effect coefficients live on the effects
// themselves and would need a per-effect override UI to tweak — out of
// scope for now. The card shows ability metadata + each Damage/Heal
// effect's scaling summary AND — when an attacker is selected — the
// calculated base damage right next to it (power × coef × global,
// matching the per-effect base step the pipeline runs in step 3).
function EditableSpellCard({
  spell,
  attacker,
  attackerOv,
  attackerAbilityOv,
  powerCoefficient,
}: {
  spell: Action
  attacker: SimpleCharacter | null
  attackerOv: StatOverrides
  attackerAbilityOv: StatOverrides
  powerCoefficient: number
}) {
  // normaliseEffects already filters to Damage / Heal entries and resolves
  // each effect's school (falling back to the parent's damage_school when
  // the effect doesn't declare one). Iterating it directly keeps the spell
  // card's effect rows in 1:1 correspondence with the per-effect rows the
  // pipeline emits below.
  const calcEffects = normaliseEffects(spell)
  // Mirrors buildPipeline's per-effect base step: power stat is chosen by
  // (heal? → healing_power; non-physical school → spell_power; else →
  // attack_power), and value = power × effect.coefficient × global_mult.
  const effRows = calcEffects.map((eff) => {
    const isHeal = eff.type === 'Heal'
    const isMagic = effectIsMagic(eff)
    const powerStat = isHeal
      ? 'healing_power'
      : isMagic
        ? 'spell_power'
        : 'attack_power'
    const power = attacker
      ? effStat(
          attacker.stats,
          powerStat,
          attackerOv,
          attacker.abilities,
          attackerAbilityOv,
        )
      : null
    const effCoef = eff.coefficient * powerCoefficient
    return {
      eff,
      powerStat,
      power,
      effCoef,
      value: power !== null ? power * effCoef : null,
    }
  })
  // Total bases bucketed by target so the card mirrors the pipeline's
  // per-target subtotal — Primary effects hit the picked defender,
  // SplashRadius effects hit other characters, and the calculator
  // shouldn't pretend they sum into one number.
  const baseByTarget = new Map<string, number>()
  for (const r of effRows) {
    if (r.value === null) continue
    baseByTarget.set(r.eff.target, (baseByTarget.get(r.eff.target) ?? 0) + r.value)
  }
  const targetGroups = (() => {
    const ordered: { target: string; value: number }[] = []
    if (baseByTarget.has('Primary')) {
      ordered.push({ target: 'Primary', value: baseByTarget.get('Primary')! })
      baseByTarget.delete('Primary')
    }
    for (const [target, value] of baseByTarget) {
      ordered.push({ target, value })
    }
    return ordered
  })()
  const showTotals =
    attacker !== null &&
    (targetGroups.length > 1 || (effRows.length > 1 && targetGroups.length >= 1))
  return (
    <>
      <div className="dmg-char-id">{spell.ability_name}</div>
      <dl className="dmg-keyvals">
        <div className="dmg-kv">
          <dt>School</dt>
          <dd>{spell.damage_school ?? '—'}</dd>
        </div>
        <div className="dmg-kv">
          <dt>Type</dt>
          <dd>{spell.is_heal ? 'Heal' : 'Damage'}</dd>
        </div>
        <div className="dmg-kv">
          <dt>Targeting</dt>
          <dd>{spell.targeting}</dd>
        </div>
        <div className="dmg-kv">
          <dt>Resource</dt>
          <dd>{`${spell.resource_cost} ${spell.resource_type}`}</dd>
        </div>
        <div className="dmg-kv">
          <dt>Cast time</dt>
          <dd>{spell.cast_time > 0 ? `${spell.cast_time}s` : 'Instant'}</dd>
        </div>
      </dl>

      <div className="dmg-card-section-label">Effects</div>
      {effRows.length === 0 ? (
        <div className="dmg-effects-empty">no damage / heal effects</div>
      ) : (
        <div className="dmg-effects">
          {effRows.map((r, i) => {
            const schoolKind = effectIsMagic(r.eff) ? 'magical' : 'physical'
            const targetKind =
              r.eff.target === 'Primary' ? 'primary' : 'splash'
            return (
              <div key={i} className="dmg-effect">
                <div className="dmg-effect-head">
                  <span className="dmg-effect-num">
                    Effect {r.eff.index + 1}
                  </span>
                  <span className="dmg-effect-tags">
                    <span className={`dmg-effect-tag dmg-effect-tag-${r.eff.type.toLowerCase()}`}>
                      {r.eff.type}
                    </span>
                    {r.eff.school && (
                      <span className={`dmg-effect-tag dmg-effect-tag-${schoolKind}`}>
                        {r.eff.school}
                      </span>
                    )}
                    <span className={`dmg-effect-tag dmg-effect-tag-target-${targetKind}`}>
                      → {r.eff.target}
                    </span>
                  </span>
                </div>
                <dl className="dmg-effect-grid">
                  <dt>Coef</dt>
                  <dd>
                    {fmt(r.eff.coefficient, 2)}
                    {powerCoefficient !== 1 && (
                      <span className="dmg-effect-grid-mute">
                        {' '}
                        × {fmt(powerCoefficient, 2)} = {fmt(r.effCoef, 2)}
                      </span>
                    )}
                  </dd>
                  <dt>Power</dt>
                  <dd>
                    {r.power === null ? (
                      <span className="dmg-effect-grid-mute">—</span>
                    ) : (
                      <>
                        <span className="dmg-effect-grid-mute">
                          {r.powerStat}
                        </span>{' '}
                        {fmt(r.power)}
                      </>
                    )}
                  </dd>
                  <dt>Base</dt>
                  <dd className="dmg-effect-grid-base">
                    {r.value === null ? (
                      <span className="dmg-effect-grid-mute">
                        pick an attacker
                      </span>
                    ) : (
                      fmt(r.value)
                    )}
                  </dd>
                </dl>
              </div>
            )
          })}
          {showTotals &&
            targetGroups.map((g) => {
              const isPrimary = g.target === 'Primary'
              return (
                <div
                  key={g.target}
                  className={`dmg-effect-total${
                    isPrimary ? '' : ' dmg-effect-total-splash'
                  }`}
                >
                  <span className="dmg-effect-total-label">
                    {isPrimary
                      ? 'Total base — Primary'
                      : `Per-target base — ${g.target}`}
                  </span>
                  <span className="dmg-effect-total-value">{fmt(g.value)}</span>
                </div>
              )
            })}
        </div>
      )}
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
  // Outcome breakdown across all rolls. miss + dodge + parry + block + hit
  // = count. Crit is a sub-outcome of hit/block (the attack still landed)
  // so it's tracked separately and not part of this sum.
  outcomes: {
    miss: number
    dodge: number
    parry: number
    block: number
    hit: number
    crit: number
  }
  // Bins for the distribution histogram. One bin per integer value when the
  // range is small; aggregated bins (covering multiple integers each) when
  // the range gets wide enough that per-integer bars would be sub-pixel.
  histogram: {
    bins: { start: number; end: number; count: number }[]
    binSize: number
  }
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
  // Target-group tag ('Primary', 'SplashRadius', …). Set on every step
  // emitted inside a group's resolution so the multi-roll outcome counter
  // can filter to the Primary group — splash-group MISS/CRIT labels live
  // in the steps view but shouldn't pollute "did the cast hit / crit the
  // picked defender" tallies above the histogram.
  group?: string
}

type PipelineOpts = {
  forceCrit: boolean
  forceHit: boolean
  // Global multiplier on top of the ability's own power_coefficient.
  // Default 1 = no-op; lets the user globally amplify or zero-out scaling
  // for what-if testing without editing each ability.
  powerCoefficient: number
  rollFirst: boolean
  attackerOv: StatOverrides
  defenderOv: StatOverrides
  attackerAbilityOv: StatOverrides
  defenderAbilityOv: StatOverrides
  proficiencyOv: number | undefined
}

function buildPipeline(
  attacker: SimpleCharacter,
  defender: SimpleCharacter,
  spell: Action,
  skillsCatalog: Skill[] | null,
  opts: PipelineOpts,
): Step[] {
  return opts.rollFirst
    ? buildPipelineRollFirst(attacker, defender, spell, skillsCatalog, opts)
    : buildPipelineRollLast(attacker, defender, spell, skillsCatalog, opts)
}

// Pushes the attack-table steps for ONE target group. Two-roll model
// (migration 0069):
//
//   1. Hit/Avoid roll — single d100 vs. the linear hit formula
//        hitChance = clamp(BASE_HIT + accuracy − evasion, MIN_HIT, MAX_HIT)
//      using accuracy/evasion for physical or spell_accuracy/spell_evasion
//      for magical. On avoid: group ends at 0 damage. (Replaces the four
//      bands MISS/DODGE/PARRY/BLOCK with one symmetric outcome.)
//
//   2. Block roll — independent d100 vs. block_chance (or
//      spell_block_chance). On block: damage will be halved later. Heals
//      ignore the block flag downstream. Block is its own roll now, so
//      its effective rate matches block_chance directly (no overlap
//      eating into it like the old band model).
//
// The defender stands in as the sample target for non-primary groups
// (the calc only knows one defender). The `titleSuffix` is appended to
// step titles when there's more than one group so the user can scan
// which roll belongs to which target.
function pushAttackTableForGroup(
  steps: Step[],
  stepIdx: number,
  ctx: {
    groupTarget: string
    titleSuffix: string
    groupIsMagic: boolean
    attacker: SimpleCharacter
    defender: SimpleCharacter
    opts: PipelineOpts
  },
): { stepIdx: number; missed: boolean; blocked: boolean } {
  const { groupTarget, titleSuffix, groupIsMagic, attacker, defender, opts } = ctx
  const aStats = attacker.stats
  const dStats = defender.stats

  // ── 1. Hit/Avoid roll ──────────────────────────────────────────────────
  const accuracyStat = groupIsMagic ? 'spell_accuracy' : 'accuracy'
  const evasionStat = groupIsMagic ? 'spell_evasion' : 'evasion'
  const accuracy = effStat(
    aStats,
    accuracyStat,
    opts.attackerOv,
    attacker.abilities,
    opts.attackerAbilityOv,
  )
  const evasion = effStat(
    dStats,
    evasionStat,
    opts.defenderOv,
    defender.abilities,
    opts.defenderAbilityOv,
  )
  const hitChance = Math.max(
    MIN_HIT,
    Math.min(MAX_HIT, BASE_HIT + accuracy - evasion),
  )
  const hitRoll = opts.forceHit ? 0 : Math.random() * 100
  const hit = opts.forceHit || hitRoll < hitChance
  if (opts.forceHit) {
    steps.push({
      title: `${++stepIdx}. Hit roll${titleSuffix}`,
      inputs: <>forced hit (toggle on)</>,
      formula: <>avoid roll skipped → HIT</>,
      output: 0,
      outputLabel: 'HIT',
      group: groupTarget,
    })
  } else {
    steps.push({
      title: `${++stepIdx}. Hit roll${titleSuffix}`,
      inputs: (
        <>
          {accuracyStat} = {fmt(accuracy)} · {evasionStat} = {fmt(evasion)} ·
          roll = {fmt(hitRoll, 1)}
        </>
      ),
      formula: (
        <>
          hitChance = clamp({BASE_HIT} + {fmt(accuracy)} − {fmt(evasion)},{' '}
          {MIN_HIT}, {MAX_HIT}) = {fmt(hitChance, 1)}% ·{' '}
          {hit ? (
            <>roll &lt; chance → HIT</>
          ) : (
            <>
              roll ≥ chance → AVOID (0 damage to {groupTarget} target)
            </>
          )}
        </>
      ),
      output: 0,
      outputLabel: hit ? 'HIT' : 'MISS',
      group: groupTarget,
    })
  }
  if (!hit) {
    return { stepIdx, missed: true, blocked: false }
  }

  // ── 2. Block roll (independent) ────────────────────────────────────────
  const blockStat = groupIsMagic ? 'spell_block_chance' : 'block_chance'
  const blockChance = Math.max(
    0,
    effStat(
      dStats,
      blockStat,
      opts.defenderOv,
      defender.abilities,
      opts.defenderAbilityOv,
    ),
  )
  const blockRoll = Math.random() * 100
  const blocked = blockRoll < blockChance
  steps.push({
    title: `${++stepIdx}. Block roll${titleSuffix}`,
    inputs: (
      <>
        {blockStat} = {fmt(blockChance)}% · roll = {fmt(blockRoll, 1)}
      </>
    ),
    formula: blocked ? (
      <>
        roll &lt; chance → BLOCK (each damage effect × {BLOCK_MITIGATION})
      </>
    ) : (
      <>roll ≥ chance → no block</>
    ),
    output: 0,
    outputLabel: blocked ? 'BLOCK' : undefined,
    group: groupTarget,
  })
  return { stepIdx, missed: false, blocked }
}

// Pushes the crit-roll step for ONE target group. Each group rolls its
// own d100 against the relevant crit stat (heal_crit / spell_crit /
// crit_chance — picked from the group's first effect). Crit lands per-
// hit-per-target rather than once per cast, matching the PoE convention.
function pushCritRollForGroup(
  steps: Step[],
  stepIdx: number,
  ctx: {
    groupTarget: string
    titleSuffix: string
    groupIsHeal: boolean
    groupIsMagic: boolean
    attacker: SimpleCharacter
    opts: PipelineOpts
  },
): { stepIdx: number; isCrit: boolean; critBonus: number } {
  const { groupTarget, titleSuffix, groupIsHeal, groupIsMagic, attacker, opts } = ctx
  const aStats = attacker.stats
  const critStat = groupIsHeal ? 'heal_crit' : groupIsMagic ? 'spell_crit' : 'crit_chance'
  const critChance = effStat(aStats, critStat, opts.attackerOv, attacker.abilities, opts.attackerAbilityOv)
  const critBonus = effStat(aStats, 'crit_damage', opts.attackerOv, attacker.abilities, opts.attackerAbilityOv) / 100
  const critRoll = opts.forceCrit ? 0 : Math.random() * 100
  const isCrit = opts.forceCrit || critRoll < critChance
  steps.push({
    title: `${++stepIdx}. Crit roll${titleSuffix}`,
    inputs: (
      <>
        {critStat} = {fmt(critChance)}% · roll = {fmt(critRoll, 0)}
        {isCrit && <> · crit damage = +{fmt(critBonus * 100)}%</>}
      </>
    ),
    formula: isCrit ? (
      <>roll &lt; chance → CRIT (each effect × {fmt(1 + critBonus, 2)})</>
    ) : (
      <>roll ≥ chance → no crit</>
    ),
    output: 0,
    outputLabel: isCrit ? 'CRIT' : undefined,
    group: groupTarget,
  })
  return { stepIdx, isCrit, critBonus }
}

// ─── Roll-FIRST pipeline (variance lives in the weapon-base roll) ───────────
function buildPipelineRollFirst(
  attacker: SimpleCharacter,
  defender: SimpleCharacter,
  spell: Action,
  skillsCatalog: Skill[] | null,
  opts: PipelineOpts,
): Step[] {
  const steps: Step[] = []
  const isHeal = spell.is_heal
  const aStats = attacker.stats
  const dStats = defender.stats
  const calcEffects = normaliseEffects(spell)
  let stepIdx = 0

  // ── Damage roll setup (uniform window with skill floor) ────────────────
  // Uniform [value · profFloor, value] (migration 0069). At level 1
  // profFloor = 0 → uniform [0, value] (RuneScape-flavoured pure swing).
  // At level 99 profFloor = FLOOR_CAP (0.3) → uniform [0.3·value, value]
  // (still swingy, never whiffs). Spells with no weapon proficiency
  // default to level 0 floor, matching "no skill = max swing."
  const fetchedProf = proficiencyLevelFor(attacker, spell, skillsCatalog)
  const effLevel = Math.max(
    0,
    opts.proficiencyOv !== undefined
      ? opts.proficiencyOv
      : fetchedProf?.level ?? 0,
  )
  const profFloor =
    Math.max(0, Math.min(1, effLevel / MAX_SKILL_LEVEL)) * FLOOR_CAP

  // ── Per-group resolution ────────────────────────────────────────────────
  // Effects are grouped by target ('Primary', 'SplashRadius', …) and each
  // group runs the FULL pipeline: its own attack-table check, its own
  // crit roll, then per-effect base → damage roll → crit applied → block
  // applied → mitigation. Only the Primary group's resolved total flows
  // into the defender's HP. Splash-group rolls treat the picked defender
  // as the sample target — the calc only knows one defender — and are
  // shown as informational (not subtracted from the defender's HP).
  const groups = groupEffectsByTarget(calcEffects)
  const renderSubtotals =
    groups.length > 1 || (groups[0]?.effects.length ?? 0) > 1
  const useTitleSuffix = groups.length > 1
  let primaryValue = 0
  let primaryRange: { min: number; mean: number; max: number } | null = null

  for (const group of groups) {
    const isPrimaryGroup = group.target === 'Primary'
    const titleSuffix = useTitleSuffix ? ` — ${group.target}` : ''
    // Group-level routing comes from the FIRST effect: a uniform-school
    // group resolves naturally; a hypothetical mixed group falls back on
    // the lead effect for hit/crit-stat selection. The seed data has no
    // mixed-school groups today, so this stays predictable.
    const groupFirst = group.effects[0]
    const groupIsHeal = groupFirst ? groupFirst.type === 'Heal' : isHeal
    const groupIsMagic = groupFirst ? effectIsMagic(groupFirst) : false

    // Attack-table for THIS group.
    const attackResult = pushAttackTableForGroup(steps, stepIdx, {
      groupTarget: group.target,
      titleSuffix,
      groupIsMagic,
      attacker,
      defender,
      opts,
    })
    stepIdx = attackResult.stepIdx
    const blocked = attackResult.blocked
    const groupMissed = attackResult.missed

    // Group missed → 0 damage to this group's target. Skip crit + per-
    // effect resolution and emit a zero subtotal so the running tally
    // stays legible. Continue to the next group (a primary miss doesn't
    // stop splash from rolling against the splash sample target).
    if (groupMissed) {
      if (renderSubtotals) {
        steps.push({
          title: `${++stepIdx}. Subtotal — ${group.target}${
            isPrimaryGroup ? '' : ' (other targets)'
          }`,
          inputs: (
            <>
              attack missed → 0 damage to {group.target} target
            </>
          ),
          formula: (
            <>
              {group.target} = 0
            </>
          ),
          output: 0,
          group: group.target,
        })
      }
      if (isPrimaryGroup) {
        primaryValue = 0
        primaryRange = null
      }
      continue
    }

    // Crit roll for THIS group.
    const critResult = pushCritRollForGroup(steps, stepIdx, {
      groupTarget: group.target,
      titleSuffix,
      groupIsHeal,
      groupIsMagic,
      attacker,
      opts,
    })
    stepIdx = critResult.stepIdx
    const isCrit = critResult.isCrit
    const critBonus = critResult.critBonus

    let groupValue = 0
    let groupRange: { min: number; mean: number; max: number } | null = null

    for (const eff of group.effects) {
      const effIsHeal = eff.type === 'Heal'
      const effIsMagic = effectIsMagic(eff)
      const effPowerStat = effIsHeal
        ? 'healing_power'
        : effIsMagic
          ? 'spell_power'
          : 'attack_power'
      const effPower = effStat(
        aStats,
        effPowerStat,
        opts.attackerOv,
        attacker.abilities,
        opts.attackerAbilityOv,
      )
      const effCoef = eff.coefficient * opts.powerCoefficient
      let value = effPower * effCoef
      const effLabel = `Effect ${eff.index + 1}: ${eff.description}`

      // Effect base
      steps.push({
        title: `${++stepIdx}. ${effLabel} — base`,
        inputs: (
          <>
            {effPowerStat} = {fmt(effPower)} · effect coef ={' '}
            {fmt(eff.coefficient, 2)} · global mult ={' '}
            {fmt(opts.powerCoefficient, 2)} · school = {eff.school ?? '—'}
          </>
        ),
        formula: (
          <>
            value = {fmt(effPower)} × {fmt(effCoef, 2)} = {fmt(value)}
          </>
        ),
        output: value,
        group: group.target,
      })

      // Damage roll (roll-first: happens before crit/mit). Uniform
      // [value · profFloor, value] — RuneScape-flavoured swing tightened
      // by proficiency. The Step.range carries the sampled window so the
      // renderer can show "rolled X out of [min..max]".
      let effRange: { min: number; mean: number; max: number } | null = null
      if (!effIsHeal && value > 0) {
        const roll = rollDamageUniform(value, profFloor)
        const sample = Math.max(0, Math.round(roll.sample))
        effRange = { min: roll.min, mean: roll.mean, max: roll.max }
        steps.push({
          title: `${++stepIdx}. ${effLabel} — damage roll`,
          inputs: (
            <>
              uniform [{fmt(roll.min, 1)}, {fmt(roll.max, 1)}] · floor ={' '}
              {fmt(profFloor, 2)} · sampled x = {fmt(roll.sample, 2)}
            </>
          ),
          formula: (
            <>
              round(uniform({fmt(roll.min, 1)}, {fmt(roll.max, 1)})) = {sample}
            </>
          ),
          output: sample,
          range: effRange,
          group: group.target,
        })
        value = sample
      }

      // Crit applied (uses THIS group's isCrit)
      if (isCrit) {
        const before = value
        const critFactor = 1 + critBonus
        value *= critFactor
        if (effRange) {
          effRange = {
            min: effRange.min * critFactor,
            mean: effRange.mean * critFactor,
            max: effRange.max * critFactor,
          }
        }
        steps.push({
          title: `${++stepIdx}. ${effLabel} — crit applied`,
          inputs: <>group crit damage = +{fmt(critBonus * 100)}%</>,
          formula: (
            <>
              {fmt(before)} × {fmt(critFactor, 2)} = {fmt(value)}
            </>
          ),
          output: value,
          range: effRange ?? undefined,
          group: group.target,
        })
      }

      // Block applied (uses THIS group's blocked flag)
      if (blocked && !effIsHeal) {
        const before = value
        value *= BLOCK_MITIGATION
        if (effRange) {
          effRange = {
            min: effRange.min * BLOCK_MITIGATION,
            mean: effRange.mean * BLOCK_MITIGATION,
            max: effRange.max * BLOCK_MITIGATION,
          }
        }
        steps.push({
          title: `${++stepIdx}. ${effLabel} — block applied`,
          inputs: <>group block · multiplier = {BLOCK_MITIGATION}</>,
          formula: (
            <>
              {fmt(before)} × {BLOCK_MITIGATION} = {fmt(value)}
            </>
          ),
          output: value,
          range: effRange ?? undefined,
          group: group.target,
        })
      }

      // Mitigation (per effect, routed by effect.school)
      if (!effIsHeal) {
        const mitStat = effIsMagic ? 'magic_resist' : 'armor'
        const mitValue = effStat(
          dStats,
          mitStat,
          opts.defenderOv,
          defender.abilities,
          opts.defenderAbilityOv,
        )
        const multiplier = MITIGATION_K / (MITIGATION_K + mitValue)
        const before = value
        value *= multiplier
        if (effRange) {
          effRange = {
            min: effRange.min * multiplier,
            mean: effRange.mean * multiplier,
            max: effRange.max * multiplier,
          }
        }
        steps.push({
          title: `${++stepIdx}. ${effLabel} — ${effIsMagic ? 'magic resist' : 'armor'} mitigation`,
          inputs: (
            <>
              defender.{mitStat} = {fmt(mitValue)} · K = {MITIGATION_K} ·
              school = {eff.school}
            </>
          ),
          formula: (
            <>
              mult = {fmt(multiplier, 3)} · {fmt(before)} × {fmt(multiplier, 3)}{' '}
              = {fmt(value)}
            </>
          ),
          output: value,
          range: effRange ?? undefined,
          group: group.target,
        })
      }

      groupValue += value
      if (effRange) {
        groupRange = groupRange
          ? {
              min: groupRange.min + effRange.min,
              mean: groupRange.mean + effRange.mean,
              max: groupRange.max + effRange.max,
            }
          : { ...effRange }
      }
    }

    // Per-group subtotal — emitted whenever there's more than one effect
    // total in the ability (so multi-effect abilities and split-target
    // abilities both get a labelled rollup). Single-effect single-target
    // abilities skip this and let the Final step carry the only number.
    if (renderSubtotals) {
      steps.push({
        title: `${++stepIdx}. Subtotal — ${group.target}${
          isPrimaryGroup ? '' : ' (other targets)'
        }`,
        inputs: (
          <>
            sum across {group.effects.length} effect
            {group.effects.length === 1 ? '' : 's'} ·{' '}
            {isPrimaryGroup
              ? 'applied to defender'
              : 'NOT applied to picked defender — separate target(s)'}
          </>
        ),
        formula: (
          <>
            {group.target} = {fmt(groupValue)}
          </>
        ),
        output: Math.round(groupValue),
        range: groupRange
          ? {
              min: Math.round(groupRange.min),
              mean: Math.round(groupRange.mean),
              max: Math.round(groupRange.max),
            }
          : undefined,
        group: group.target,
      })
    }

    if (isPrimaryGroup) {
      primaryValue = groupValue
      primaryRange = groupRange
    }
  }

  const finalRange = primaryRange
    ? {
        min: Math.max(0, Math.round(primaryRange.min)),
        mean: Math.max(0, Math.round(primaryRange.mean)),
        max: Math.max(0, Math.round(primaryRange.max)),
      }
    : null

  return appendFinal(steps, primaryValue, isHeal, finalRange)
}

// ─── Roll-LAST pipeline (OSRS-style: stats build up to a max, then roll) ────
function buildPipelineRollLast(
  attacker: SimpleCharacter,
  defender: SimpleCharacter,
  spell: Action,
  skillsCatalog: Skill[] | null,
  opts: PipelineOpts,
): Step[] {
  const steps: Step[] = []
  const isHeal = spell.is_heal
  const aStats = attacker.stats
  const dStats = defender.stats
  const calcEffects = normaliseEffects(spell)
  let stepIdx = 0

  // ── Damage roll setup (uniform window with skill floor) ────────────────
  // Uniform [value · profFloor, value] (migration 0069). Same setup as
  // roll-FIRST mode; the difference between modes is when the roll fires
  // in the per-effect chain, not how the window is computed.
  const fetchedProf = proficiencyLevelFor(attacker, spell, skillsCatalog)
  const effLevel = Math.max(
    0,
    opts.proficiencyOv !== undefined
      ? opts.proficiencyOv
      : fetchedProf?.level ?? 0,
  )
  const profFloor =
    Math.max(0, Math.min(1, effLevel / MAX_SKILL_LEVEL)) * FLOOR_CAP

  // ── Per-group resolution ────────────────────────────────────────────────
  // Each target group ('Primary', 'SplashRadius', …) runs the FULL
  // pipeline: its own attack-table check, its own crit roll, then per-
  // effect base → crit applied → block applied → mitigation → damage
  // roll. Only the Primary group's resolved total flows into the
  // defender's HP. Splash-group rolls treat the picked defender as the
  // sample target and are shown as informational (not subtracted).
  const groups = groupEffectsByTarget(calcEffects)
  const renderSubtotals =
    groups.length > 1 || (groups[0]?.effects.length ?? 0) > 1
  const useTitleSuffix = groups.length > 1
  let primaryValue = 0
  let primaryRange: { min: number; mean: number; max: number } | null = null

  for (const group of groups) {
    const isPrimaryGroup = group.target === 'Primary'
    const titleSuffix = useTitleSuffix ? ` — ${group.target}` : ''
    const groupFirst = group.effects[0]
    const groupIsHeal = groupFirst ? groupFirst.type === 'Heal' : isHeal
    const groupIsMagic = groupFirst ? effectIsMagic(groupFirst) : false

    // Attack-table for THIS group.
    const attackResult = pushAttackTableForGroup(steps, stepIdx, {
      groupTarget: group.target,
      titleSuffix,
      groupIsMagic,
      attacker,
      defender,
      opts,
    })
    stepIdx = attackResult.stepIdx
    const blocked = attackResult.blocked
    const groupMissed = attackResult.missed

    if (groupMissed) {
      if (renderSubtotals) {
        steps.push({
          title: `${++stepIdx}. Subtotal — ${group.target}${
            isPrimaryGroup ? '' : ' (other targets)'
          }`,
          inputs: (
            <>
              attack missed → 0 damage to {group.target} target
            </>
          ),
          formula: (
            <>
              {group.target} = 0
            </>
          ),
          output: 0,
          group: group.target,
        })
      }
      if (isPrimaryGroup) {
        primaryValue = 0
        primaryRange = null
      }
      continue
    }

    // Crit roll for THIS group.
    const critResult = pushCritRollForGroup(steps, stepIdx, {
      groupTarget: group.target,
      titleSuffix,
      groupIsHeal,
      groupIsMagic,
      attacker,
      opts,
    })
    stepIdx = critResult.stepIdx
    const isCrit = critResult.isCrit
    const critBonus = critResult.critBonus

    let groupValue = 0
    let groupRange: { min: number; mean: number; max: number } | null = null

    for (const eff of group.effects) {
      const effIsHeal = eff.type === 'Heal'
      const effIsMagic = effectIsMagic(eff)
      const effPowerStat = effIsHeal
        ? 'healing_power'
        : effIsMagic
          ? 'spell_power'
          : 'attack_power'
      const effPower = effStat(
        aStats,
        effPowerStat,
        opts.attackerOv,
        attacker.abilities,
        opts.attackerAbilityOv,
      )
      const effCoef = eff.coefficient * opts.powerCoefficient
      let value = effPower * effCoef
      const effLabel = `Effect ${eff.index + 1}: ${eff.description}`

      // Effect base
      steps.push({
        title: `${++stepIdx}. ${effLabel} — base`,
        inputs: (
          <>
            {effPowerStat} = {fmt(effPower)} · effect coef ={' '}
            {fmt(eff.coefficient, 2)} · global mult ={' '}
            {fmt(opts.powerCoefficient, 2)} · school = {eff.school ?? '—'}
          </>
        ),
        formula: (
          <>
            value = {fmt(effPower)} × {fmt(effCoef, 2)} = {fmt(value)}
          </>
        ),
        output: value,
        group: group.target,
      })

      // Crit applied (uses THIS group's isCrit)
      if (isCrit) {
        const before = value
        value *= 1 + critBonus
        steps.push({
          title: `${++stepIdx}. ${effLabel} — crit applied`,
          inputs: <>group crit damage = +{fmt(critBonus * 100)}%</>,
          formula: (
            <>
              {fmt(before)} × {fmt(1 + critBonus, 2)} = {fmt(value)}
            </>
          ),
          output: value,
          group: group.target,
        })
      }

      // Block applied (uses THIS group's blocked flag)
      if (blocked && !effIsHeal) {
        const before = value
        value *= BLOCK_MITIGATION
        steps.push({
          title: `${++stepIdx}. ${effLabel} — block applied`,
          inputs: <>group block · multiplier = {BLOCK_MITIGATION}</>,
          formula: (
            <>
              {fmt(before)} × {BLOCK_MITIGATION} = {fmt(value)}
            </>
          ),
          output: value,
          group: group.target,
        })
      }

      // Mitigation (per effect, routed by effect.school)
      if (effIsHeal) {
        // heals skip mitigation
      } else {
        const mitStat = effIsMagic ? 'magic_resist' : 'armor'
        const mitValue = effStat(
          dStats,
          mitStat,
          opts.defenderOv,
          defender.abilities,
          opts.defenderAbilityOv,
        )
        const multiplier = MITIGATION_K / (MITIGATION_K + mitValue)
        const before = value
        value *= multiplier
        steps.push({
          title: `${++stepIdx}. ${effLabel} — ${effIsMagic ? 'magic resist' : 'armor'} mitigation`,
          inputs: (
            <>
              defender.{mitStat} = {fmt(mitValue)} · K = {MITIGATION_K} ·
              school = {eff.school}
            </>
          ),
          formula: (
            <>
              mult = K / (K + {mitStat}) = {fmt(multiplier, 3)} · value ={' '}
              {fmt(before)} × {fmt(multiplier, 3)} = {fmt(value)}
            </>
          ),
          output: value,
          group: group.target,
        })
      }

      // Damage roll (per effect; heals stay deterministic). Uniform
      // [value · profFloor, value] — same RuneScape-flavoured swing as
      // roll-FIRST mode, just applied AFTER stat ops in this pipeline.
      let effRange: { min: number; mean: number; max: number } | null = null
      if (!effIsHeal && value > 0) {
        const roll = rollDamageUniform(value, profFloor)
        const sample = Math.max(0, Math.round(roll.sample))
        effRange = {
          min: Math.round(roll.min),
          mean: Math.round(roll.mean),
          max: Math.round(roll.max),
        }
        steps.push({
          title: `${++stepIdx}. ${effLabel} — damage roll`,
          inputs: (
            <>
              uniform [{fmt(roll.min, 1)}, {fmt(roll.max, 1)}] · floor ={' '}
              {fmt(profFloor, 2)} · sampled x = {fmt(roll.sample, 2)}
            </>
          ),
          formula: (
            <>
              round(uniform({fmt(roll.min, 1)}, {fmt(roll.max, 1)})) = {sample}
            </>
          ),
          output: sample,
          range: effRange,
          group: group.target,
        })
        value = sample
      }

      // Subtotal — merge into running group total + range
      groupValue += value
      if (effRange) {
        groupRange = groupRange
          ? {
              min: groupRange.min + effRange.min,
              mean: groupRange.mean + effRange.mean,
              max: groupRange.max + effRange.max,
            }
          : { ...effRange }
      }
    }

    // Per-group subtotal — emitted whenever the ability has more than one
    // effect total OR splits across multiple targets, so each target gets
    // a labelled rollup. Single-effect single-target abilities skip this
    // and let the Final step carry the only number.
    if (renderSubtotals) {
      steps.push({
        title: `${++stepIdx}. Subtotal — ${group.target}${
          isPrimaryGroup ? '' : ' (other targets)'
        }`,
        inputs: (
          <>
            sum across {group.effects.length} effect
            {group.effects.length === 1 ? '' : 's'} ·{' '}
            {isPrimaryGroup
              ? 'applied to defender'
              : 'NOT applied to picked defender — separate target(s)'}
          </>
        ),
        formula: (
          <>
            {group.target} = {fmt(groupValue)}
          </>
        ),
        output: Math.round(groupValue),
        range: groupRange ?? undefined,
        group: group.target,
      })
    }

    if (isPrimaryGroup) {
      primaryValue = groupValue
      primaryRange = groupRange
    }
  }

  return appendFinal(steps, primaryValue, isHeal, primaryRange)
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
  rollFirst,
  attackerOv,
  defenderOv,
  attackerAbilityOv,
  defenderAbilityOv,
  proficiencyOv,
  rollSeed,
  onReroll,
  nRolls,
  setNRolls,
}: {
  attacker: SimpleCharacter
  defender: SimpleCharacter
  spell: Action
  skillsCatalog: Skill[] | null
  forceCrit: boolean
  forceHit: boolean
  powerCoefficient: number
  rollFirst: boolean
  attackerOv: StatOverrides
  defenderOv: StatOverrides
  attackerAbilityOv: StatOverrides
  defenderAbilityOv: StatOverrides
  proficiencyOv: number | undefined
  rollSeed: number
  onReroll: () => void
  nRolls: number
  setNRolls: (n: number) => void
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
        rollFirst,
        attackerOv,
        defenderOv,
        attackerAbilityOv,
        defenderAbilityOv,
        proficiencyOv,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      attacker, defender, spell, skillsCatalog,
      forceCrit, forceHit, powerCoefficient, rollFirst,
      attackerOv, defenderOv, attackerAbilityOv, defenderAbilityOv,
      proficiencyOv,
      rollSeed,
    ],
  )

  // Multi-roll: simulate the full pipeline N times and aggregate the final
  // values. Re-runs automatically (debounced) whenever any input changes so
  // the histogram always reflects current settings — no "Run" button needed.
  // nRolls is owned by the parent so it persists across tab switches.
  const [multi, setMulti] = useState<MultiRollResult | null>(null)
  // Bumping multiSeed forces the auto-run useEffect to re-fire with the same
  // inputs — used by the "Rerun" button to regenerate the histogram without
  // having to nudge a stat.
  const [multiSeed, setMultiSeed] = useState(0)
  // Drives the spinner shown during the debounce + compute window so the
  // user knows the displayed histogram is mid-refresh after they tweak a
  // stat or drag the slider.
  const [isComputing, setIsComputing] = useState(false)

  function computeMulti(): MultiRollResult {
    const count = Math.max(1, Math.min(100000, Math.floor(nRolls)))
    let min = Infinity
    let max = -Infinity
    let total = 0
    const samples = new Array<number>(count)
    const freq = new Map<number, number>()
    const outcomes = { miss: 0, dodge: 0, parry: 0, block: 0, hit: 0, crit: 0 }
    for (let i = 0; i < count; i++) {
      const s = buildPipeline(attacker, defender, spell, skillsCatalog, {
        forceCrit,
        forceHit,
        powerCoefficient,
        rollFirst,
        attackerOv,
        defenderOv,
        attackerAbilityOv,
        defenderAbilityOv,
        proficiencyOv,
      })
      const final = s[s.length - 1].output
      samples[i] = final
      if (final < min) min = final
      if (final > max) max = final
      total += final
      freq.set(final, (freq.get(final) ?? 0) + 1)

      // Tally the defensive outcome by scanning step labels — but only
      // the Primary group's, since splash groups roll against other
      // characters and their MISS/CRIT shouldn't pollute "did the cast
      // hit / crit the defender" tallies. Steps without a `group` field
      // (e.g. the final step) are ignored here.
      let landed: 'miss' | 'dodge' | 'parry' | 'block' | 'hit' = 'hit'
      let didCrit = false
      for (const step of s) {
        if (step.group !== 'Primary') continue
        if (step.outputLabel === 'MISS') landed = 'miss'
        else if (step.outputLabel === 'DODGE') landed = 'dodge'
        else if (step.outputLabel === 'PARRY') landed = 'parry'
        else if (step.outputLabel === 'BLOCK') landed = 'block'
        else if (step.outputLabel === 'CRIT') didCrit = true
      }
      outcomes[landed]++
      if (didCrit) outcomes.crit++
    }

    const sorted = samples.slice().sort((a, b) => a - b)
    const mid = Math.floor(count / 2)
    const median =
      count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]

    // Mode (most-rolled value) — still surfaced in the stats row even
    // though the top-10 list is gone.
    let modeValue = min
    let modeCount = 0
    for (const [value, c] of freq) {
      if (c > modeCount || (c === modeCount && value < modeValue)) {
        modeValue = value
        modeCount = c
      }
    }

    const range = max - min + 1
    const binSize = range > 60 ? Math.ceil(range / 60) : 1
    const binCount = Math.ceil(range / binSize)
    const bins: { start: number; end: number; count: number }[] = []
    for (let i = 0; i < binCount; i++) {
      bins.push({ start: min + i * binSize, end: min + (i + 1) * binSize - 1, count: 0 })
    }
    for (const [value, c] of freq) {
      const idx = Math.floor((value - min) / binSize)
      bins[idx].count += c
    }

    return {
      count,
      min,
      max,
      mean: total / count,
      median,
      mode: modeValue,
      modeCount,
      outcomes,
      histogram: { bins, binSize },
    }
  }

  // Auto-rerun on any meaningful input change. Debounced 200ms so a slider
  // drag or rapid keystrokes coalesce into one recompute after the user
  // settles — without this, a 1000-roll sweep per slider tick chokes the
  // main thread on dense inputs.
  useEffect(() => {
    setIsComputing(true)
    const handle = setTimeout(() => {
      setMulti(computeMulti())
      setIsComputing(false)
    }, 200)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attacker, defender, spell, skillsCatalog,
    forceCrit, forceHit, powerCoefficient, rollFirst,
    attackerOv, defenderOv, attackerAbilityOv, defenderAbilityOv,
    proficiencyOv,
    nRolls, multiSeed,
  ])

  return (
    <div className="dmg-pipeline">
      {!multi && isComputing && (
        <div className="dmg-multi-results dmg-multi-pending">
          <span className="dmg-spinner" aria-label="Computing rolls" />
          <span>Running first batch of rolls…</span>
        </div>
      )}
      {multi && (
        <div className="dmg-multi-results">
          <div className="dmg-multi-header">
            <div className="dmg-multi-title">
              Across {multi.count.toLocaleString()} rolls
              {isComputing && (
                <span
                  className="dmg-spinner"
                  aria-label="Recomputing rolls"
                  title="Recomputing…"
                />
              )}
            </div>
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
              <button
                type="button"
                className="dmg-reroll"
                onClick={() => setMultiSeed((s) => s + 1)}
                title="Re-randomise without changing inputs"
              >
                Rerun
              </button>
            </div>
          </div>
          <OutcomeCounts multi={multi} />
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
          <Histogram multi={multi} />
          <div className="dmg-multi-caption">
            Auto-recomputes whenever you change any input. Use Rerun to
            re-randomise without touching settings.
          </div>
        </div>
      )}
      {steps.map((step, i) => {
        // Tag attack-outcome labels with side-border accents so the pipeline
        // reads at a glance: green = lands cleanly, gold = crit, red-ish =
        // partial mitigation (block), grey = whiffed (miss/dodge/parry).
        const outcomeClass =
          step.outputLabel === 'FINAL'
            ? ' dmg-step-final'
            : step.outputLabel === 'CRIT'
              ? ' dmg-step-crit'
              : step.outputLabel === 'MISS' ||
                  step.outputLabel === 'DODGE' ||
                  step.outputLabel === 'PARRY'
                ? ' dmg-step-miss'
                : step.outputLabel === 'BLOCK'
                  ? ' dmg-step-block'
                  : step.outputLabel === 'HIT'
                    ? ' dmg-step-hit'
                    : ''
        return (
        <div
          key={i}
          className={`dmg-step${outcomeClass}`}
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
              Bell window: <strong>{step.range.min}</strong> –{' '}
              <strong>{step.range.max}</strong> · Peak{' '}
              <strong>{step.range.mean}</strong>
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
        )
      })}
      <div className="dmg-pipeline-toolbar">
        <button type="button" className="dmg-reroll" onClick={onReroll}>
          Reroll single pipeline
        </button>
      </div>
    </div>
  )
}

// Compact row showing the count of each defensive outcome (and crits)
// across the multi-roll batch. Sits just under the header so the user can
// see at a glance how many attacks landed cleanly vs were dodged/parried/
// blocked. Counts of 0 are still rendered (greyed) so the row stays
// stable as inputs change.
function OutcomeCounts({ multi }: { multi: MultiRollResult }) {
  const total = multi.count
  const o = multi.outcomes
  const cells: { label: string; count: number; cls: string }[] = [
    { label: 'Miss', count: o.miss, cls: 'dmg-outcome-miss' },
    { label: 'Dodge', count: o.dodge, cls: 'dmg-outcome-miss' },
    { label: 'Parry', count: o.parry, cls: 'dmg-outcome-miss' },
    { label: 'Block', count: o.block, cls: 'dmg-outcome-block' },
    { label: 'Hit', count: o.hit, cls: 'dmg-outcome-hit' },
    { label: 'Crit', count: o.crit, cls: 'dmg-outcome-crit' },
  ]
  return (
    <div className="dmg-outcomes">
      {cells.map((c) => {
        const pct = total > 0 ? (c.count / total) * 100 : 0
        return (
          <div
            key={c.label}
            className={`dmg-outcome ${c.cls}${c.count === 0 ? ' dmg-outcome-zero' : ''}`}
          >
            <span className="dmg-outcome-label">{c.label}</span>
            <strong>{c.count.toLocaleString()}</strong>
            <span className="dmg-outcome-pct">{pct.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

function Histogram({ multi }: { multi: MultiRollResult }) {
  const { bins, binSize } = multi.histogram
  const maxCount = bins.reduce((m, b) => Math.max(m, b.count), 1)
  const medianBinIdx = bins.findIndex(
    (b) => multi.median >= b.start && multi.median <= b.end,
  )

  return (
    <div className="dmg-multi-hist-wrap">
      <div className="dmg-multi-top-label">Distribution</div>
      <div className="dmg-multi-hist" role="img" aria-label="Roll distribution histogram">
        {bins.map((bin, i) => {
          const pct = (bin.count / multi.count) * 100
          const label =
            binSize === 1
              ? `${bin.start}: ${bin.count.toLocaleString()} (${pct.toFixed(1)}%)`
              : `${bin.start}–${bin.end}: ${bin.count.toLocaleString()} (${pct.toFixed(1)}%)`
          return (
            <span
              key={i}
              className={`dmg-multi-hist-bar${
                i === medianBinIdx ? ' dmg-multi-hist-bar-median' : ''
              }`}
              title={label}
              style={{ height: `${(bin.count / maxCount) * 100}%` }}
            />
          )
        })}
      </div>
      <div className="dmg-multi-hist-axis">
        <span>{multi.min}</span>
        <span>{Math.round((multi.min + multi.max) / 2)}</span>
        <span>{multi.max}</span>
      </div>
    </div>
  )
}

