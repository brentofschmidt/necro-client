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
// WoW historically used scaling-by-attacker-level constants; this is a flat
// placeholder, easy to swap once the formula stabilises.
const MITIGATION_K = 100

// Base miss chance the attacker has to overcome with hit_chance bonuses.
// 5% follows the WoW classic convention (white-attack base miss).
const BASE_MISS_CHANCE = 5

// Damage multiplier applied on a successful BLOCK outcome. 0.5 = "blocked
// for half" — block isn't a full evasion, it's a partial mitigation.
const BLOCK_MITIGATION = 0.5

// Cap that level / MAX_SKILL_LEVEL is divided by to produce the damage-roll
// peak position. Matches max_level on the seeded weapon proficiencies
// (migration 0012).
const MAX_SKILL_LEVEL = 99

// Peak position used when no weapon proficiency applies — spells, generic
// abilities. Range [0, 1]: the peak of the triangle distribution sits at
// `value * SPELL_PROFICIENCY_PEAK` along the [0, value] roll range.
//   0   = peak at 0 (untrained — low damage common, max rare)
//   0.5 = peak in middle (symmetric bell)
//   1.0 = peak at max (deterministic-feeling, max common, low rare)
// Single knob so the design can shift without code changes.
const SPELL_PROFICIENCY_PEAK = 0

// The proficiency-driven peak fraction is mapped from prof 0..99 onto this
// sub-range of [min, max]. With Beta sampling there's no clamping artefact
// at the edges, so wide settings (e.g. [0, 1]) put the bell's mode flush
// against the bound — most rolls land near min at prof 0 and near max at
// prof 99. Tighten to e.g. [0.2, 0.8] if you want low-prof characters to
// still occasionally roll mid-range.
const PEAK_FRACTION_MIN = 0
const PEAK_FRACTION_MAX = 1

// Z-score the σ-fitting uses: 99% of a Gaussian's mass lies within ±Z·σ
// of the mean. We pick σ so that Z·σ equals the distance from peak to the
// CLOSER bound, which keeps clamping pile-up under ~0.5% per edge — i.e.
// invisible in the histogram.
const ROLL_HALF_Z = 2.576

// Standard normal sample via Box-Muller. Used by rollDamage below.
function gaussian01(): number {
  const u1 = Math.max(Math.random(), 1e-10)
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// Damage roll on [min, max] from a single, symmetric Gaussian centered at
// `peak = min + range × peakFraction`, with σ chosen to fit the NARROWER
// side cleanly (Z·σ = distance from peak to the closer bound). This keeps
// the bell visually symmetric on both sides of the peak and avoids any
// pile-up spike at the bounds.
//
// For peak=20 on [1, 100]:
//   distToNearEdge = min(19, 80) = 19
//   σ = 19 / 2.576 ≈ 7.4
//   Bell extends from ~1 to ~39 — symmetric, clean, no pile-up
//   But: doesn't reach 100 — far side of the range is unused at extreme peaks
//
// At peak=50 (mid):
//   distToNearEdge = 49 → σ ≈ 19  → bell almost spans full [1, 100]
//
// Median = peak by construction (Gaussian's mean = median = mode = peak).
// The accepted tradeoff vs the previous split-normal: at off-centre peaks
// the bell occupies only the symmetric window around peak, not the whole
// damage range.
function rollParams(
  min: number,
  max: number,
  peakFraction: number,
): { peak: number; sigma: number } {
  if (max <= min) return { peak: min, sigma: 0 }
  const range = max - min
  const p = Math.max(0, Math.min(1, peakFraction))
  const peak = min + range * p
  const distToNearEdge = Math.min(peak - min, max - peak)
  // Floor prevents σ=0 at peak=min or peak=max where the near edge IS the
  // peak. 2% of range stays below typical histogram bin width but keeps
  // sampling well-defined.
  const sigmaFloor = Math.max(0.5, range * 0.02)
  const sigma = Math.max(distToNearEdge / ROLL_HALF_Z, sigmaFloor)
  return { peak, sigma }
}

function rollDamage(min: number, max: number, peakFraction: number): number {
  if (max <= min) return min
  const { peak, sigma } = rollParams(min, max, peakFraction)
  const sample = peak + gaussian01() * sigma
  return Math.max(min, Math.min(max, sample))
}

// ─── Attack outcome resolver ───────────────────────────────────────────────
// Single-roll attack table à la WoW. Cumulative probability bands resolved
// in priority order: MISS → DODGE → PARRY → BLOCK → HIT. Whichever band the
// roll lands in is the (only) outcome for that attack. This gives the log
// distinct events ("dodged", "parried", "blocked") instead of collapsing
// everything into a single "miss" bucket.
//
// Spells use a reduced table — only MISS or HIT — because dodge / parry /
// block are physical-only responses. (We may add spell_hit / magic_resist
// to the spell miss chance later; for now the bonus comes from hit_chance.)
//
// Block is a partial mitigation, not an evasion — on BLOCK the attack still
// lands but its damage is multiplied by BLOCK_MITIGATION.
type AttackOutcome = 'MISS' | 'DODGE' | 'PARRY' | 'BLOCK' | 'HIT'

type AttackBand = { name: AttackOutcome; chance: number }

type AttackResolution = {
  outcome: AttackOutcome
  roll: number
  bands: AttackBand[]
  forced: boolean
}

function resolveAttack(args: {
  isMagic: boolean
  hitChanceBonus: number
  defenderDodge: number
  defenderParry: number
  defenderBlock: number
  forceHit: boolean
}): AttackResolution {
  const missChance = Math.max(0, BASE_MISS_CHANCE - args.hitChanceBonus)
  const bands: AttackBand[] = [{ name: 'MISS', chance: missChance }]
  if (!args.isMagic) {
    bands.push({ name: 'DODGE', chance: Math.max(0, args.defenderDodge) })
    bands.push({ name: 'PARRY', chance: Math.max(0, args.defenderParry) })
    bands.push({ name: 'BLOCK', chance: Math.max(0, args.defenderBlock) })
  }
  if (args.forceHit) {
    return { outcome: 'HIT', roll: 0, bands, forced: true }
  }
  const roll = Math.random() * 100
  let cumulative = 0
  for (const band of bands) {
    cumulative += band.chance
    if (roll < cumulative) return { outcome: band.name, roll, bands, forced: false }
  }
  return { outcome: 'HIT', roll, bands, forced: false }
}

// Capitalises the first letter of a lowercased band name for display
// ("miss" → "Miss"). Used by the attack-band step builder.
function bandLabel(name: AttackOutcome): string {
  return name.charAt(0) + name.slice(1).toLowerCase()
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
  const strBase = f((a.strength - 10) / 2)
  const conBase = f((a.constitution - 10) / 2)
  const chaBase = f((a.charisma - 10) / 2)
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
    dodge_chance: dexBase,
    // Parry: timing + muscle (STR + DEX) — migration 0060.
    parry_chance: strBase + dexBase,
    block_chance: conBase, // shield-gated server-side; ignored here
    magic_resist: a.wisdom,
    // Drivers updated in migration 0059 + 0060:
    //   hit_chance = brawn + agility
    //   spell_hit  = focus + attunement + force-of-will
    // Keep these in sync with the SQL CASE arms in
    // get_public_character_calculated_stats.
    hit_chance: dexBase + strBase,
    spell_hit: intBase + wisBase + chaBase,
    expertise: chaBase,
    mana_regen: f(a.wisdom / 4),
    health_regen: f(a.constitution / 5),
    versatility: f(a.charisma / 5),
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

// Resolves the FLAT base damage for an ability. Per migration 0064 every
// damaging ability is now percentage-of-power scaled (base damage flows
// from `power_coefficient × power_stat` in the pipeline's power-scaling
// step), so this just returns the ability's intrinsic flat baseline (0
// for the seeded percentage-scaled abilities; non-zero only if a future
// design wants a hybrid flat+percent model).
//
// Equipment is no longer consulted — weapons contribute via stat bonuses
// (str/agi/int) which feed AP/SP, not via a damage range.
function resolveBaseDamage(ability: Action): { base: number } {
  return { base: ability.damage }
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
  const [spellDamageOv, setSpellDamageOv] = useState<number | undefined>()
  const [spellPowerCoefOv, setSpellPowerCoefOv] = useState<number | undefined>()
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
    setSpellDamageOv(undefined)
    setSpellPowerCoefOv(undefined)
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
              damageOv={spellDamageOv}
              setDamageOv={setSpellDamageOv}
              powerCoefOv={spellPowerCoefOv}
              setPowerCoefOv={setSpellPowerCoefOv}
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
          spellDamageOv={spellDamageOv}
          spellPowerCoefOv={spellPowerCoefOv}
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
    ['Hit (%)', 'hit_chance'],
    ['Spell Hit (%)', 'spell_hit'],
  ]
  const defenceFields: [string, string][] = [
    ['Armor', 'armor'],
    ['Magic Resist', 'magic_resist'],
    ['Dodge (%)', 'dodge_chance'],
    ['Parry (%)', 'parry_chance'],
    ['Block (%)', 'block_chance'],
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

// Spell card. Base damage and power coefficient are editable; the rest
// (school, type, cast time, …) stays read-only since changing them would
// mean the spell isn't really the same spell anymore.
//
// For weapon-gated actions, the displayed Base damage default comes from
// the attacker's equipped weapon (resolveBaseDamage). The user can still
// override either way.
function EditableSpellCard({
  spell,
  damageOv,
  setDamageOv,
  powerCoefOv,
  setPowerCoefOv,
}: {
  spell: Action
  damageOv: number | undefined
  setDamageOv: (n: number | undefined) => void
  powerCoefOv: number | undefined
  setPowerCoefOv: (n: number | undefined) => void
}) {
  const resolved = resolveBaseDamage(spell)
  const baseIsOverride = damageOv !== undefined
  const baseDamage = baseIsOverride ? (damageOv as number) : resolved.base
  const coefIsOverride = powerCoefOv !== undefined
  const coef = coefIsOverride ? (powerCoefOv as number) : spell.power_coefficient

  return (
    <>
      <div className="dmg-char-id">{spell.ability_name}</div>
      <dl className="dmg-keyvals">
        <div className="dmg-kv">
          <dt>Flat base damage</dt>
          <dd>
            <input
              type="number"
              step="1"
              min="0"
              value={baseDamage}
              onChange={(e) => setDamageOv(Math.max(0, Number(e.target.value) || 0))}
              className={`dmg-stat-input${baseIsOverride ? ' dmg-stat-input-override' : ''}`}
            />
            {baseIsOverride && (
              <button
                type="button"
                className="dmg-stat-reset"
                onClick={() => setDamageOv(undefined)}
                title={`Reset to ability value (${fmt(resolved.base)})`}
                aria-label="Reset base damage"
              >
                ×
              </button>
            )}
            <div className="dmg-stat-caption">
              percentage-scaled abilities use 0; sets a flat baseline added
              before stat scaling.
            </div>
          </dd>
        </div>
        <div className="dmg-kv">
          <dt>Power coef</dt>
          <dd>
            <input
              type="number"
              step="0.1"
              min="0"
              value={coef}
              onChange={(e) => setPowerCoefOv(Math.max(0, Number(e.target.value) || 0))}
              className={`dmg-stat-input${coefIsOverride ? ' dmg-stat-input-override' : ''}`}
            />
            {coefIsOverride && (
              <button
                type="button"
                className="dmg-stat-reset"
                onClick={() => setPowerCoefOv(undefined)}
                title={`Reset to ability value (${fmt(spell.power_coefficient)})`}
                aria-label="Reset power coefficient"
              >
                ×
              </button>
            )}
          </dd>
        </div>
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
  // Override the ability's flat-base damage. Most percentage-scaled
  // abilities have base = 0 so this is mostly a testing knob.
  spellDamageOv: number | undefined
  spellPowerCoefOv: number | undefined
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
  // 'physical' is now an explicit damage_school (migration 0062) for
  // weapon attacks, so plain truthiness no longer works — anything other
  // than 'physical' (and not heal-style null) routes through the magical
  // pipeline (spell_power scaling, magic_resist mitigation, spell_hit, …).
  const isMagic =
    !!spell.damage_school && spell.damage_school !== 'physical'
  const aStats = attacker.stats
  const dStats = defender.stats
  // Base damage = ability flat baseline (usually 0 for percentage-scaled
  // abilities post-migration 0064) + power × ability_coef × global_mult.
  // Override available for testing arbitrary base values.
  const resolvedBase = resolveBaseDamage(spell)
  const flatBase = opts.spellDamageOv ?? resolvedBase.base
  const powerStat = isHeal ? 'healing_power' : isMagic ? 'spell_power' : 'attack_power'
  const power = effStat(aStats, powerStat, opts.attackerOv, attacker.abilities, opts.attackerAbilityOv)
  const abilityCoef = opts.spellPowerCoefOv ?? spell.power_coefficient
  const effCoef = abilityCoef * opts.powerCoefficient
  const baseDamage = flatBase + power * effCoef

  let value = baseDamage
  let range: { min: number; mean: number; max: number } | null = null
  let stepIdx = 0

  // Bell-window propagation helpers — used by Crit and Mitigation steps to
  // shift / scale the displayed [min, peak, max] window alongside `value`.
  const scaleRange = (factor: number) => {
    if (range)
      range = {
        min: range.min * factor,
        mean: range.mean * factor,
        max: range.max * factor,
      }
  }

  // Base damage step — collapses the previous separate Base + Power-scaling
  // steps into one since base now lives in `power × coef`. The flat
  // baseline (spell.damage) is shown alongside as a transparent addition.
  steps.push({
    title: `${++stepIdx}. Base damage`,
    inputs: (
      <>
        flat base = {fmt(flatBase)} · attacker.{powerStat} = {fmt(power)} ·
        ability coef = {fmt(abilityCoef, 2)} · global mult ={' '}
        {fmt(opts.powerCoefficient, 2)} · effective = {fmt(effCoef, 2)}
      </>
    ),
    formula: (
      <>
        value = {fmt(flatBase)} + {fmt(power)} × {fmt(effCoef, 2)} ={' '}
        {fmt(value)}
      </>
    ),
    output: value,
  })

  // Damage roll — proficiency-driven Gaussian on [1, value]. Doing this
  // BEFORE the rest of the pipeline (in roll-first mode) matches the WoW
  // weapon-roll model: the bell carries variance, then stats amplify
  // whatever you rolled. Heals skip the roll — deterministic.
  if (!isHeal && value > 0) {
    const fetchedProf = proficiencyLevelFor(attacker, spell, skillsCatalog)
    const effLevel = Math.max(
      1,
      opts.proficiencyOv !== undefined
        ? opts.proficiencyOv
        : fetchedProf?.level ?? Math.round(SPELL_PROFICIENCY_PEAK * MAX_SKILL_LEVEL),
    )
    const rawPeakFraction = Math.max(0, Math.min(1, effLevel / MAX_SKILL_LEVEL))
    const peakFraction =
      PEAK_FRACTION_MIN + (PEAK_FRACTION_MAX - PEAK_FRACTION_MIN) * rawPeakFraction
    const peakSource =
      opts.proficiencyOv !== undefined
        ? `override lv ${effLevel} / ${MAX_SKILL_LEVEL}`
        : fetchedProf !== null
          ? `${fetchedProf.skillName} lv ${effLevel} / ${MAX_SKILL_LEVEL}`
          : `no weapon proficiency · default lv ${effLevel}`
    // Bell curve always runs on [1, value] regardless of source — for
    // weapons, value is the post-weapon-roll cap; for spells it's
    // spell.damage. Proficiency drives where the bell peaks within that
    // window.
    const a = 1
    const b = Math.max(1, Math.ceil(value))
    const { peak, sigma } = rollParams(a, b, peakFraction)
    const x = rollDamage(a, b, peakFraction)
    const sample = Math.max(1, Math.round(x))
    const bellMin = Math.max(a, peak - ROLL_HALF_Z * sigma)
    const bellMax = Math.min(b, peak + ROLL_HALF_Z * sigma)
    range = { min: bellMin, mean: peak, max: bellMax }
    value = sample
    steps.push({
      title: `${++stepIdx}. Damage roll`,
      inputs: (
        <>
          peak fraction = {fmt(peakFraction, 2)} (raw {fmt(rawPeakFraction, 2)}{' '}
          → clamped to [{PEAK_FRACTION_MIN}, {PEAK_FRACTION_MAX}], {peakSource}){' '}
          · σ = {fmt(sigma, 2)} · sampled x = {fmt(x, 2)}
        </>
      ),
      formula: (
        <>
          round(clamp(N({fmt(peak, 1)}, σ={fmt(sigma, 2)}) → [{a}, {b}])) ={' '}
          {sample}
        </>
      ),
      output: sample,
      range,
    })
  } else if (isHeal) {
    steps.push({
      title: `${++stepIdx}. Damage roll`,
      inputs: <>heals are deterministic — no roll</>,
      formula: <>value unchanged</>,
      output: value,
      skipped: 'Heals skip the roll',
    })
  }

  // Attack outcome — one step per band so the user can read the
  // resolution sequence: miss → dodge → parry → block → hit. All bands
  // share the SAME roll value (single-roll attack table); each step shows
  // its band's [lo, hi) range and whether the roll fell inside it.
  const resolution = resolveAttack({
    isMagic,
    hitChanceBonus: effStat(aStats, isMagic ? 'spell_hit' : 'hit_chance', opts.attackerOv, attacker.abilities, opts.attackerAbilityOv),
    defenderDodge: effStat(dStats, 'dodge_chance', opts.defenderOv, defender.abilities, opts.defenderAbilityOv),
    defenderParry: effStat(dStats, 'parry_chance', opts.defenderOv, defender.abilities, opts.defenderAbilityOv),
    defenderBlock: effStat(dStats, 'block_chance', opts.defenderOv, defender.abilities, opts.defenderAbilityOv),
    forceHit: opts.forceHit,
  })
  if (resolution.forced) {
    steps.push({
      title: `${++stepIdx}. Attack roll`,
      inputs: <>forced hit (toggle on)</>,
      formula: <>defensive bands skipped → continue</>,
      output: value,
      outputLabel: 'HIT',
      range: range ?? undefined,
    })
  } else {
    let cum = 0
    let resolved = false
    for (const band of resolution.bands) {
      const lo = cum
      const hi = cum + band.chance
      cum = hi
      if (resolved) break
      const isMine = resolution.outcome === band.name
      const label = bandLabel(band.name)
      const inputs = (
        <>
          chance = {fmt(band.chance, 1)}% · roll = {fmt(resolution.roll, 1)} ·
          band [{fmt(lo, 1)}–{fmt(hi, 1)})
        </>
      )
      if (isMine && (band.name === 'MISS' || band.name === 'DODGE' || band.name === 'PARRY')) {
        value = 0
        range = null
        steps.push({
          title: `${++stepIdx}. ${label} check`,
          inputs,
          formula: <>roll lands in band → {label.toLowerCase()} (0 damage)</>,
          output: 0,
          outputLabel: band.name,
        })
        return appendFinal(steps, value, isHeal, null)
      }
      if (isMine && band.name === 'BLOCK') {
        const before = value
        value *= BLOCK_MITIGATION
        scaleRange(BLOCK_MITIGATION)
        steps.push({
          title: `${++stepIdx}. ${label} check`,
          inputs,
          formula: (
            <>
              roll lands in band → blocked, value = {fmt(before)} ×{' '}
              {BLOCK_MITIGATION} = {fmt(value)}
            </>
          ),
          output: value,
          outputLabel: 'BLOCK',
          range: range ?? undefined,
        })
        resolved = true
      } else {
        steps.push({
          title: `${++stepIdx}. ${label} check`,
          inputs,
          formula: <>roll outside band → continue</>,
          output: value,
          range: range ?? undefined,
        })
      }
    }
  }

  // Crit — multiplicative on the rolled-and-scaled value. The bell window
  // stretches by the same factor.
  const critStat = isHeal ? 'heal_crit' : isMagic ? 'spell_crit' : 'crit_chance'
  const critChance = effStat(aStats, critStat, opts.attackerOv, attacker.abilities, opts.attackerAbilityOv)
  const critBonus = effStat(aStats, 'crit_damage', opts.attackerOv, attacker.abilities, opts.attackerAbilityOv) / 100
  const critRoll = opts.forceCrit ? 0 : Math.random() * 100
  const isCrit = opts.forceCrit || critRoll < critChance
  const before5 = value
  if (isCrit) {
    const critFactor = 1 + critBonus
    value = value * critFactor
    scaleRange(critFactor)
    steps.push({
      title: `${++stepIdx}. Crit roll`,
      inputs: (
        <>
          {critStat} = {fmt(critChance)}% · roll = {fmt(critRoll, 0)} · crit
          damage = +{fmt(critBonus * 100)}%
        </>
      ),
      formula: (
        <>
          value = {fmt(before5)} × (1 + {fmt(critBonus)}) = {fmt(value)}
        </>
      ),
      output: value,
      outputLabel: 'CRIT',
      range: range ?? undefined,
    })
  } else {
    steps.push({
      title: `${++stepIdx}. Crit roll`,
      inputs: (
        <>
          {critStat} = {fmt(critChance)}% · roll = {fmt(critRoll, 0)}
        </>
      ),
      formula: <>roll ≥ chance → no crit</>,
      output: value,
      range: range ?? undefined,
    })
  }

  // Mitigation — multiplicative on the (rolled + scaled + maybe-crit)
  // value. Bell window scales by the same factor. Heals skip this.
  if (isHeal) {
    steps.push({
      title: `${++stepIdx}. Mitigation`,
      inputs: <>heals are not mitigated</>,
      formula: <>value unchanged</>,
      output: value,
      skipped: 'Heals skip mitigation',
      range: range ?? undefined,
    })
  } else {
    const mitStat = isMagic ? 'magic_resist' : 'armor'
    const mitValue = effStat(dStats, mitStat, opts.defenderOv, defender.abilities, opts.defenderAbilityOv)
    const multiplier = MITIGATION_K / (MITIGATION_K + mitValue)
    const before6 = value
    value = value * multiplier
    scaleRange(multiplier)
    steps.push({
      title: `${++stepIdx}. ${isMagic ? 'Magic resist' : 'Armor'} mitigation`,
      inputs: (
        <>
          defender.{mitStat} = {fmt(mitValue)} · K = {MITIGATION_K}
        </>
      ),
      formula: (
        <>
          mult = K / (K + {mitStat}) = {fmt(multiplier, 3)} · value ={' '}
          {fmt(before6)} × {fmt(multiplier, 3)} = {fmt(value)}
        </>
      ),
      output: value,
      range: range ?? undefined,
    })
  }

  // Round the propagated bell window for the final display.
  const finalRange = range
    ? {
        min: Math.max(0, Math.round(range.min)),
        mean: Math.max(0, Math.round(range.mean)),
        max: Math.max(0, Math.round(range.max)),
      }
    : null

  return appendFinal(steps, value, isHeal, finalRange)
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
  // 'physical' is now an explicit damage_school (migration 0062) for
  // weapon attacks, so plain truthiness no longer works — anything other
  // than 'physical' (and not heal-style null) routes through the magical
  // pipeline (spell_power scaling, magic_resist mitigation, spell_hit, …).
  const isMagic =
    !!spell.damage_school && spell.damage_school !== 'physical'
  const aStats = attacker.stats
  const dStats = defender.stats
  // Base damage = ability flat baseline (usually 0 for percentage-scaled
  // abilities post-migration 0064) + power × ability_coef × global_mult.
  // This collapses the previous separate Base + Power-scaling steps —
  // damage now flows from stats × coefficient as the source of truth.
  const resolvedBase = resolveBaseDamage(spell)
  const flatBase = opts.spellDamageOv ?? resolvedBase.base
  const powerStat = isHeal ? 'healing_power' : isMagic ? 'spell_power' : 'attack_power'
  const power = effStat(aStats, powerStat, opts.attackerOv, attacker.abilities, opts.attackerAbilityOv)
  const abilityCoef = opts.spellPowerCoefOv ?? spell.power_coefficient
  const effCoef = abilityCoef * opts.powerCoefficient
  const baseDamage = flatBase + power * effCoef

  let value = baseDamage
  let stepIdx = 0
  steps.push({
    title: `${++stepIdx}. Base damage`,
    inputs: (
      <>
        flat base = {fmt(flatBase)} · attacker.{powerStat} = {fmt(power)} ·
        ability coef = {fmt(abilityCoef, 2)} · global mult ={' '}
        {fmt(opts.powerCoefficient, 2)} · effective = {fmt(effCoef, 2)}
      </>
    ),
    formula: (
      <>
        value = {fmt(flatBase)} + {fmt(power)} × {fmt(effCoef, 2)} ={' '}
        {fmt(value)}
      </>
    ),
    output: value,
  })

  // Attack outcome — one step per band so the user can read the
  // resolution sequence (miss → dodge → parry → block → hit). All bands
  // share the same roll value (single-roll attack table).
  const resolution = resolveAttack({
    isMagic,
    hitChanceBonus: effStat(aStats, isMagic ? 'spell_hit' : 'hit_chance', opts.attackerOv, attacker.abilities, opts.attackerAbilityOv),
    defenderDodge: effStat(dStats, 'dodge_chance', opts.defenderOv, defender.abilities, opts.defenderAbilityOv),
    defenderParry: effStat(dStats, 'parry_chance', opts.defenderOv, defender.abilities, opts.defenderAbilityOv),
    defenderBlock: effStat(dStats, 'block_chance', opts.defenderOv, defender.abilities, opts.defenderAbilityOv),
    forceHit: opts.forceHit,
  })
  if (resolution.forced) {
    steps.push({
      title: `${++stepIdx}. Attack roll`,
      inputs: <>forced hit (toggle on)</>,
      formula: <>defensive bands skipped → continue</>,
      output: value,
      outputLabel: 'HIT',
    })
  } else {
    let cum = 0
    let resolved = false
    for (const band of resolution.bands) {
      const lo = cum
      const hi = cum + band.chance
      cum = hi
      if (resolved) break
      const isMine = resolution.outcome === band.name
      const label = bandLabel(band.name)
      const inputs = (
        <>
          chance = {fmt(band.chance, 1)}% · roll = {fmt(resolution.roll, 1)} ·
          band [{fmt(lo, 1)}–{fmt(hi, 1)})
        </>
      )
      if (isMine && (band.name === 'MISS' || band.name === 'DODGE' || band.name === 'PARRY')) {
        value = 0
        steps.push({
          title: `${++stepIdx}. ${label} check`,
          inputs,
          formula: <>roll lands in band → {label.toLowerCase()} (0 damage)</>,
          output: 0,
          outputLabel: band.name,
        })
        return appendFinal(steps, value, isHeal, null)
      }
      if (isMine && band.name === 'BLOCK') {
        const before = value
        value *= BLOCK_MITIGATION
        steps.push({
          title: `${++stepIdx}. ${label} check`,
          inputs,
          formula: (
            <>
              roll lands in band → blocked, value = {fmt(before)} ×{' '}
              {BLOCK_MITIGATION} = {fmt(value)}
            </>
          ),
          output: value,
          outputLabel: 'BLOCK',
        })
        resolved = true
      } else {
        steps.push({
          title: `${++stepIdx}. ${label} check`,
          inputs,
          formula: <>roll outside band → continue</>,
          output: value,
        })
      }
    }
  }

  // Crit — multiplicative on the running max value.
  const critStat = isHeal ? 'heal_crit' : isMagic ? 'spell_crit' : 'crit_chance'
  const critChance = effStat(aStats, critStat, opts.attackerOv, attacker.abilities, opts.attackerAbilityOv)
  const critBonus = effStat(aStats, 'crit_damage', opts.attackerOv, attacker.abilities, opts.attackerAbilityOv) / 100
  const critRoll = opts.forceCrit ? 0 : Math.random() * 100
  const isCrit = opts.forceCrit || critRoll < critChance
  const before4 = value
  if (isCrit) {
    value = value * (1 + critBonus)
    steps.push({
      title: `${++stepIdx}. Crit roll`,
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
      title: `${++stepIdx}. Crit roll`,
      inputs: (
        <>
          {critStat} = {fmt(critChance)}% · roll = {fmt(critRoll, 0)}
        </>
      ),
      formula: <>roll ≥ chance → no crit</>,
      output: value,
    })
  }

  // Mitigation — multiplicative on the running max value.
  if (isHeal) {
    steps.push({
      title: `${++stepIdx}. Mitigation`,
      inputs: <>heals are not mitigated</>,
      formula: <>value unchanged</>,
      output: value,
      skipped: 'Heals skip mitigation',
    })
  } else {
    const mitStat = isMagic ? 'magic_resist' : 'armor'
    const mitValue = effStat(dStats, mitStat, opts.defenderOv, defender.abilities, opts.defenderAbilityOv)
    const multiplier = MITIGATION_K / (MITIGATION_K + mitValue)
    const before5 = value
    value = value * multiplier
    steps.push({
      title: `${++stepIdx}. ${isMagic ? 'Magic resist' : 'Armor'} mitigation`,
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

  // Damage roll — proficiency-driven Gaussian on [1, value] (the post-
  // mitigation cap). The "weapon damage roll" earlier already injected
  // weapon-range randomness; this bell adds the proficiency-driven curve
  // on top. Heals skip — they stay deterministic.
  let range: { min: number; mean: number; max: number } | null = null
  if (!isHeal && value > 0) {
    const fetchedProf = proficiencyLevelFor(attacker, spell, skillsCatalog)
    const effLevel = Math.max(
      1,
      opts.proficiencyOv !== undefined
        ? opts.proficiencyOv
        : fetchedProf?.level ?? Math.round(SPELL_PROFICIENCY_PEAK * MAX_SKILL_LEVEL),
    )
    const rawPeakFraction = Math.max(0, Math.min(1, effLevel / MAX_SKILL_LEVEL))
    const peakFraction =
      PEAK_FRACTION_MIN + (PEAK_FRACTION_MAX - PEAK_FRACTION_MIN) * rawPeakFraction
    const peakSource =
      opts.proficiencyOv !== undefined
        ? `override lv ${effLevel} / ${MAX_SKILL_LEVEL}`
        : fetchedProf !== null
          ? `${fetchedProf.skillName} lv ${effLevel} / ${MAX_SKILL_LEVEL}`
          : `no weapon proficiency · default lv ${effLevel}`
    const a = 1
    const b = Math.max(1, Math.ceil(value))
    const { peak, sigma } = rollParams(a, b, peakFraction)
    const x = rollDamage(a, b, peakFraction)
    const sample = Math.max(1, Math.round(x))
    const bellMin = Math.max(a, Math.round(peak - ROLL_HALF_Z * sigma))
    const bellMax = Math.min(b, Math.round(peak + ROLL_HALF_Z * sigma))
    const mean = Math.max(1, Math.round(peak))
    range = { min: bellMin, mean, max: bellMax }
    steps.push({
      title: `${++stepIdx}. Damage roll`,
      inputs: (
        <>
          peak fraction = {fmt(peakFraction, 2)} (raw {fmt(rawPeakFraction, 2)}{' '}
          → clamped to [{PEAK_FRACTION_MIN}, {PEAK_FRACTION_MAX}], {peakSource}){' '}
          · σ = {fmt(sigma, 2)} · sampled x = {fmt(x, 2)}
        </>
      ),
      formula: (
        <>
          round(clamp(N({fmt(peak, 1)}, σ={fmt(sigma, 2)}) → [{a}, {b}])) ={' '}
          {sample}
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
  rollFirst,
  attackerOv,
  defenderOv,
  attackerAbilityOv,
  defenderAbilityOv,
  spellDamageOv,
  spellPowerCoefOv,
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
  spellDamageOv: number | undefined
  spellPowerCoefOv: number | undefined
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
        spellDamageOv,
        spellPowerCoefOv,
        proficiencyOv,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      attacker, defender, spell, skillsCatalog,
      forceCrit, forceHit, powerCoefficient, rollFirst,
      attackerOv, defenderOv, attackerAbilityOv, defenderAbilityOv,
      spellDamageOv, spellPowerCoefOv, proficiencyOv,
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
        spellDamageOv,
        spellPowerCoefOv,
        proficiencyOv,
      })
      const final = s[s.length - 1].output
      samples[i] = final
      if (final < min) min = final
      if (final > max) max = final
      total += final
      freq.set(final, (freq.get(final) ?? 0) + 1)

      // Tally the defensive outcome by scanning step labels. The pipeline
      // emits at most one of MISS/DODGE/PARRY/BLOCK; absence of any of
      // those means the attack landed cleanly (HIT). CRIT is independent
      // (sub-outcome of hit/block) and tracked separately.
      let landed: 'miss' | 'dodge' | 'parry' | 'block' | 'hit' = 'hit'
      let didCrit = false
      for (const step of s) {
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
    spellDamageOv, spellPowerCoefOv, proficiencyOv,
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

