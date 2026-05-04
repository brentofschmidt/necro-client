import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getPublicCharacter,
  getPublicCharacterAbilityScores,
  getPublicCharacterActiveAuras,
  getPublicCharacterCalculatedStats,
  getPublicCharacterEquipment,
  getPublicCharacterResources,
  getPublicCharacterSkills,
  PublicCharacterAbilityScore,
  PublicCharacterActiveAura,
  PublicCharacterCalculatedStat,
  PublicCharacterDetail,
  PublicCharacterEquipmentSlot,
  PublicCharacterResource,
  PublicCharacterSkill,
} from '../lib/necroContent'
import { describeStatEffect } from '../lib/statEffects'
import { formatRelativeShort } from '../lib/time'

type CharTabId = 'overview' | 'equipment' | 'skills'

const TABS: { id: CharTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'skills', label: 'Skills' },
]

const DEFAULT_TAB: CharTabId = 'overview'

function isCharTabId(value: string | null | undefined): value is CharTabId {
  return TABS.some((t) => t.id === value)
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

// Maps rarity → on-screen colour. Mirrors what 0034 / 0037 / 0038 stored
// in necro_content.rarities.display_color, but inlined here so we don't
// need a separate fetch just to colourise an item name.
const RARITY_COLORS: Record<string, string> = {
  trash:     '#7a7a7a',
  common:    '#FFFFFF',
  uncommon:  '#1eff00',
  rare:      '#0070dd',
  epic:      '#a335ee',
  legendary: '#ff8000',
  mythic:    '#ff4ddc',
}

// Per-ability "what does this drive" mapping, mirroring the case
// statement in necro_content.get_public_character_calculated_stats
// (migration 0049 / 0052). Source-of-truth for the actual stat values
// is the SQL function — this client copy only powers the inline
// breakdown next to each ability score. Keep the two in sync when
// formulas change.
type AbilityDrive = (n: number) => { value: number; isPercent: boolean; suffix: string }

const ABILITY_DRIVES: Record<string, AbilityDrive[]> = {
  strength: [
    (n) => ({ value: n * 2, isPercent: false, suffix: 'attack power' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'parry' }),
  ],
  dexterity: [
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'crit' }),
    (n) => ({ value: Math.floor(n / 4), isPercent: true, suffix: 'haste' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'dodge' }),
  ],
  constitution: [
    (n) => ({ value: n, isPercent: false, suffix: 'armor' }),
    (n) => ({ value: Math.floor(n / 5), isPercent: false, suffix: 'health regen' }),
  ],
  intelligence: [
    (n) => ({ value: n * 2, isPercent: false, suffix: 'spell power' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'spell crit' }),
  ],
  wisdom: [
    (n) => ({ value: n * 2, isPercent: false, suffix: 'healing power' }),
    (n) => ({ value: n, isPercent: false, suffix: 'magic resist' }),
    (n) => ({ value: Math.floor(n / 4), isPercent: false, suffix: 'mana regen' }),
  ],
  charisma: [
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'expertise' }),
    (n) => ({ value: Math.floor(n / 5), isPercent: true, suffix: 'versatility' }),
  ],
}

function formatDrive(d: { value: number; isPercent: boolean; suffix: string }): string {
  const sign = d.value > 0 ? '+' : ''
  const num = d.isPercent ? `${d.value}%` : `${d.value}`
  return `${sign}${num} ${d.suffix}`
}

// Body-then-hands ordering for the Equipment grid so it reads top-down.
const SLOT_ORDER: Record<string, number> = {
  Head: 0,
  Neck: 1,
  Chest: 2,
  Back: 3,
  Waist: 4,
  Legs: 5,
  Feet: 6,
  Hands: 7,
  Finger: 8,
  MainHand: 9,
  OffHand: 10,
  TwoHand: 11,
}

type LoadState = 'loading' | 'found' | 'not-found'

export function CharacterPage() {
  const params = useParams<{ gameId: string; characterId: string; tab?: string }>()
  const navigate = useNavigate()
  const { gameId, characterId, tab } = params

  const activeTab: CharTabId = isCharTabId(tab) ? tab : DEFAULT_TAB

  const [character, setCharacter] = useState<PublicCharacterDetail | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')

  // Canonicalize the URL so /g/necro/characters/abc → .../abc/overview.
  useEffect(() => {
    if (!gameId || !characterId) return
    if (!isCharTabId(tab)) {
      navigate(`/g/${gameId}/characters/${characterId}/${DEFAULT_TAB}`, {
        replace: true,
      })
    }
  }, [gameId, characterId, tab, navigate])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [activeTab])

  useEffect(() => {
    if (!characterId) {
      setLoadState('not-found')
      return
    }
    let cancelled = false
    setLoadState('loading')
    getPublicCharacter(characterId).then((c) => {
      if (cancelled) return
      if (c) {
        setCharacter(c)
        setLoadState('found')
      } else {
        setCharacter(null)
        setLoadState('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  function setTab(id: CharTabId) {
    if (!gameId || !characterId) return
    navigate(`/g/${gameId}/characters/${characterId}/${id}`, { replace: true })
  }

  if (loadState === 'loading') {
    return (
      <div className="settings-page settings-page-flow">
        <p className="text-dim">Loading…</p>
      </div>
    )
  }

  if (loadState === 'not-found' || !character) {
    return (
      <div className="settings-page settings-page-flow">
        <h1 className="settings-title">Character not found</h1>
        <p className="text-dim">No character exists with that id.</p>
        {gameId && (
          <Link to={`/g/${gameId}/characters`} className="character-back-link">
            ← Back to Characters
          </Link>
        )}
      </div>
    )
  }

  let content: ReactNode = null
  switch (activeTab) {
    case 'overview':
      content = <OverviewSection character={character} />
      break
    case 'equipment':
      content = <EquipmentSection characterId={character.id} />
      break
    case 'skills':
      content = <SkillsSection characterId={character.id} />
      break
  }

  return (
    <div className="settings-page settings-page-flow">
      <div className="character-page-header">
        {gameId && (
          <Link
            to={`/g/${gameId}/characters`}
            className="character-back-link"
          >
            ← Characters
          </Link>
        )}
        <h1 className="settings-title">{character.character_name}</h1>
        <div className="character-page-subtitle">
          Lv {character.level} {capitalize(character.race)}
          {character.realm_name && <> · {character.realm_name}</>}
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Character sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">{content}</div>
      </div>
    </div>
  )
}

function OverviewSection({ character }: { character: PublicCharacterDetail }) {
  const characterId = character.id

  const [scores, setScores] = useState<PublicCharacterAbilityScore[] | null>(null)
  const [stats, setStats] = useState<PublicCharacterCalculatedStat[] | null>(null)
  const [resources, setResources] = useState<PublicCharacterResource[] | null>(null)
  const [auras, setAuras] = useState<PublicCharacterActiveAura[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getPublicCharacterAbilityScores(characterId).then((rows) => {
      if (!cancelled) setScores(rows)
    })
    getPublicCharacterCalculatedStats(characterId).then((rows) => {
      if (!cancelled) setStats(rows)
    })
    getPublicCharacterResources(characterId).then((rows) => {
      if (!cancelled) setResources(rows)
    })
    getPublicCharacterActiveAuras(characterId).then((rows) => {
      if (!cancelled) setAuras(rows)
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  return (
    <>
      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Profile</h2>
        </header>
        <dl className="info-grid">
          <dt>Name</dt>
          <dd>{character.character_name}</dd>

          <dt>Race</dt>
          <dd>{capitalize(character.race)}</dd>

          <dt>Level</dt>
          <dd>{character.level}</dd>

          <dt>Created</dt>
          <dd>
            {formatRelativeShort(character.created_at)} ago
            {' · '}
            <span className="text-dim">
              {new Date(character.created_at).toLocaleDateString()}
            </span>
          </dd>

          <dt>Alignment</dt>
          <dd>{character.alignment_id ? capitalize(character.alignment_id) : '—'}</dd>

          <dt>Realm</dt>
          <dd>{character.realm_name ?? '—'}</dd>

          <dt>Last Zone</dt>
          <dd>{character.last_zone || '—'}</dd>
        </dl>
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Resources</h2>
        </header>
        {resources === null ? (
          <p className="text-dim">Loading…</p>
        ) : resources.length === 0 ? (
          <p className="text-dim">No resource pools set.</p>
        ) : (
          <div className="resource-list">
            {resources.map((r) => (
              <ResourceRow key={r.type} resource={r} />
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Ability Scores</h2>
        </header>
        {scores === null ? (
          <p className="text-dim">Loading…</p>
        ) : scores.length === 0 ? (
          <p className="text-dim">No ability scores set.</p>
        ) : (
          <div className="stat-list">
            {scores.map((s) => (
              <AbilityRow key={s.ability} score={s} />
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Stats</h2>
        </header>
        {stats === null ? (
          <p className="text-dim">Loading…</p>
        ) : stats.length === 0 ? (
          <p className="text-dim">No stats catalog defined.</p>
        ) : (
          <StatsByCategory stats={stats} />
        )}
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Active Auras</h2>
        </header>
        {auras === null ? (
          <p className="text-dim">Loading…</p>
        ) : auras.length === 0 ? (
          <p className="text-dim">No active auras.</p>
        ) : (
          <div className="aura-list">
            {auras.map((a) => (
              <AuraCard key={a.instance_id} aura={a} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function AbilityRow({ score }: { score: PublicCharacterAbilityScore }) {
  const total = Math.round(score.total_value)
  const eq = Math.round(score.equipment_bonus_value)
  const au = Math.round(score.aura_bonus_value)
  const mod = Math.floor((total - 10) / 2)

  const drives = (ABILITY_DRIVES[score.ability] ?? [])
    .map((fn) => fn(total))
    .filter((d) => d.value !== 0)
  const effect = drives.length > 0 ? drives.map(formatDrive).join(' · ') : '—'

  // Compact "from gear/aura" annotation under the value cell, only when
  // either source is non-zero.
  const sources: string[] = []
  if (eq !== 0) sources.push(`${eq > 0 ? '+' : ''}${eq} gear`)
  if (au !== 0) sources.push(`${au > 0 ? '+' : ''}${au} aura`)

  return (
    <div className="stat-row">
      <div className="stat-name">{score.display_name ?? score.ability}</div>
      <div className="stat-value-cell">
        <div className="stat-value-line">
          <span className="stat-value">{total}</span>
          <span className="stat-mod">{mod >= 0 ? `+${mod}` : mod}</span>
        </div>
        {sources.length > 0 && (
          <div className="stat-value-meta">{sources.join(' · ')}</div>
        )}
      </div>
      <div className="stat-effect">{effect}</div>
    </div>
  )
}

function ResourceRow({ resource }: { resource: PublicCharacterResource }) {
  const pct =
    resource.max_value > 0
      ? Math.max(0, Math.min(100, (resource.current_value / resource.max_value) * 100))
      : 0
  const color = resource.display_color ?? 'var(--accent)'
  const bonus = Math.round(resource.bonus_max_value)
  return (
    <div className="resource-row">
      <div className="resource-row-head">
        <span className="resource-name">
          {resource.display_name ?? capitalize(resource.type)}
        </span>
        <span className="resource-value">
          {Math.round(resource.current_value)} / {Math.round(resource.max_value)}
          {bonus !== 0 && (
            <span className="resource-bonus">
              {' ('}
              {bonus > 0 ? `+${bonus}` : bonus} aura
              {')'}
            </span>
          )}
        </span>
      </div>
      <div className="resource-bar">
        <div
          className="resource-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {resource.regen_rate > 0 && (
        <div className="resource-meta">
          Regenerates {resource.regen_rate}/s
          {resource.regen_delay > 0 && ` after ${resource.regen_delay}s out of combat`}
        </div>
      )}
    </div>
  )
}

function EquipmentSection({ characterId }: { characterId: string }) {
  const [equipment, setEquipment] = useState<PublicCharacterEquipmentSlot[] | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    getPublicCharacterEquipment(characterId).then((rows) => {
      if (!cancelled) setEquipment(rows)
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Equipment</h2>
        <p>Currently equipped items by slot.</p>
      </header>

      {equipment === null && <p className="text-dim">Loading…</p>}
      {equipment !== null && equipment.length === 0 && (
        <p className="text-dim">No equipment.</p>
      )}
      {equipment !== null && equipment.length > 0 && (
        <div className="content-card-grid">
          {[...equipment]
            .sort(
              (a, b) =>
                (SLOT_ORDER[a.slot] ?? 99) - (SLOT_ORDER[b.slot] ?? 99),
            )
            .map((e) => (
              <article key={e.slot} className="content-card">
                <header className="content-card-header">
                  <h3
                    className="content-card-title"
                    style={{
                      color: e.item_rarity
                        ? RARITY_COLORS[e.item_rarity]
                        : undefined,
                    }}
                  >
                    {e.item_name ?? e.item_id}
                  </h3>
                  <span className="content-card-id">{e.slot}</span>
                </header>
                <div className="content-card-meta">
                  {e.item_rarity && (
                    <span className="tag-muted">{capitalize(e.item_rarity)}</span>
                  )}
                  {e.item_type && <span className="tag-muted">{e.item_type}</span>}
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  )
}

function AuraCard({ aura }: { aura: PublicCharacterActiveAura }) {
  const all: { kind: 'ability' | 'stat' | 'resource'; mod: { name: string; value: number; description?: string } }[] = []
  for (const m of aura.ability_bonuses) {
    if (m.ability) all.push({ kind: 'ability', mod: { name: m.ability, value: m.value, description: m.description } })
  }
  for (const m of aura.stat_bonuses) {
    if (m.stat) all.push({ kind: 'stat', mod: { name: m.stat, value: m.value, description: m.description } })
  }
  for (const m of aura.resource_bonuses) {
    if (m.resource) all.push({ kind: 'resource', mod: { name: m.resource, value: m.value, description: m.description } })
  }

  return (
    <article className={`aura-card${aura.is_harmful ? ' aura-card-harmful' : ''}`}>
      <header className="aura-card-header">
        <h3 className="aura-card-title">
          {aura.display_name}
          {aura.stacks > 1 && (
            <span className="aura-card-stacks">×{aura.stacks}</span>
          )}
        </h3>
        <span className="aura-card-kind">
          {aura.is_harmful ? 'Debuff' : 'Buff'}
        </span>
      </header>
      {aura.description && <p className="aura-card-body">{aura.description}</p>}
      {all.length > 0 && (
        <ul className="aura-card-mods">
          {all.map((m, i) => (
            <li key={i}>
              {m.mod.description ?? `${m.mod.value > 0 ? '+' : ''}${m.mod.value} ${m.mod.name}`}
            </li>
          ))}
        </ul>
      )}
      <div className="aura-card-meta">
        {aura.duration === 0
          ? 'Passive'
          : `${Math.round(aura.remaining_time)}s remaining`}
        {aura.caster_name && ` · ${aura.caster_name}`}
      </div>
    </article>
  )
}

function StatsByCategory({ stats }: { stats: PublicCharacterCalculatedStat[] }) {
  // Bucket by category, preserving the per-row sort_order from the catalog.
  const byCategory = new Map<string, PublicCharacterCalculatedStat[]>()
  for (const s of stats) {
    const list = byCategory.get(s.category) ?? []
    list.push(s)
    byCategory.set(s.category, list)
  }

  return (
    <div className="stats-categories">
      {Array.from(byCategory.entries()).map(([category, rows]) => (
        <div key={category} className="content-subgroup">
          <h3 className="content-subgroup-heading">{category}</h3>
          <div className="stat-list">
            {rows.map((s) => (
              <StatRow key={s.id} stat={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatRow({ stat }: { stat: PublicCharacterCalculatedStat }) {
  const value = stat.is_percent
    ? `${Math.round(stat.value * 10) / 10}%`
    : Math.round(stat.value).toString()
  const isZero = Math.round(stat.value * 10) === 0
  const effect = describeStatEffect(stat.value, stat.conversion_per_point)
  // Effect line falls back to the catalog's "affects" tag when:
  //   - we couldn't parse the conversion line
  //   - or the value computes to zero (no point showing "+0% physical damage")
  const effectText =
    !isZero && effect ? effect.formatted : stat.affects || null

  return (
    <div className={`stat-row${isZero ? ' stat-row-zero' : ''}`}>
      <div className="stat-name">{stat.display_name}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-effect">{effectText}</div>
    </div>
  )
}

function SkillsSection({ characterId }: { characterId: string }) {
  const [skills, setSkills] = useState<PublicCharacterSkill[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getPublicCharacterSkills(characterId).then((rows) => {
      if (!cancelled) setSkills(rows)
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  if (skills === null) {
    return (
      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Skills</h2>
          <p>Weapon proficiencies and activity skills, with rank and current XP.</p>
        </header>
        <p className="text-dim">Loading…</p>
      </section>
    )
  }

  const proficiencies = skills.filter((s) => s.category === 'Proficiency')
  const activities = skills.filter(
    (s) => s.category === 'Activity' || s.category === null,
  )

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Skills</h2>
        <p>Weapon proficiencies and activity skills, with rank and current XP.</p>
      </header>

      {proficiencies.length > 0 && (
        <div className="content-subgroup">
          <h3 className="content-subgroup-heading">Weapon Proficiencies</h3>
          <SkillTable skills={proficiencies} />
        </div>
      )}

      {activities.length > 0 && (
        <div className="content-subgroup">
          <h3 className="content-subgroup-heading">Activity Skills</h3>
          <SkillTable skills={activities} />
        </div>
      )}

      {skills.length === 0 && <p className="text-dim">No skills trained.</p>}
    </section>
  )
}

function SkillTable({ skills }: { skills: PublicCharacterSkill[] }) {
  return (
    <table className="skill-table">
      <thead>
        <tr>
          <th>Skill</th>
          <th>Level</th>
          <th>Current XP</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((s) => (
          <tr key={s.skill}>
            <td>{s.display_name ?? s.skill}</td>
            <td>{s.level}</td>
            <td>{s.current_xp.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
