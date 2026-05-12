import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getPublicCharacter,
  getPublicCharacterAbilityScores,
  getPublicCharacterActiveAuras,
  getPublicCharacterCalculatedStats,
  getPublicCharacterEquipment,
  getPublicCharacterGuild,
  getPublicCharacterResources,
  getPublicCharacterSkills,
  Item,
  ItemClass,
  ItemSubclass,
  InventorySlot,
  listInventorySlots,
  listItems,
  listItemClasses,
  listItemSubclasses,
  listRarities,
  PublicCharacterAbilityScore,
  PublicCharacterActiveAura,
  PublicCharacterCalculatedStat,
  PublicCharacterDetail,
  PublicCharacterEquipmentSlot,
  PublicCharacterGuild,
  PublicCharacterResource,
  PublicCharacterSkill,
  Rarity,
} from '../lib/necroContent'
import { describeStatEffect } from '../lib/statEffects'
import { formatRelativeShort } from '../lib/time'
import { DataTable, type DataTableColumn } from './DataTable'
import {
  ItemDetails,
  RARITY_COLORS,
  equipmentToDetailsData,
} from './ItemDetails'
import { SkillIcon } from './SkillIcon'
import { InventorySlotIcon } from './InventorySlotIcon'
import { AbilityIcon } from './AbilityIcon'
import { ResourceIcon } from './ResourceIcon'
import { ItemIcon } from './ItemIcon'
import { StatIcon } from './StatIcon'

type CharTabId = 'overview' | 'stats' | 'equipment' | 'skills'

const TABS: { id: CharTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'stats', label: 'Stats' },
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

// Per-ability "what does this drive" mapping, mirroring the
// derived_effects JSON updated in migration 0070. Source-of-truth for
// the actual stat values is `necro_content.abilities.derived_effects`
// (consumed by `get_public_character_calculated_stats`) — this client
// copy only powers the inline breakdown next to each ability score.
// Keep the two in sync when formulas change.
type AbilityDrive = (n: number) => { value: number; isPercent: boolean; suffix: string }

const ABILITY_DRIVES: Record<string, AbilityDrive[]> = {
  strength: [
    (n) => ({ value: n * 2, isPercent: false, suffix: 'attack power' }),
  ],
  dexterity: [
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'crit' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'accuracy' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'evasion' }),
    (n) => ({ value: Math.floor(n / 4), isPercent: false, suffix: 'attack speed' }),
    (n) => ({ value: Math.floor(n / 4), isPercent: false, suffix: 'stamina regen' }),
  ],
  constitution: [
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'block (w/ shield)' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'spell block (w/ shield)' }),
    (n) => ({ value: Math.floor(n / 5), isPercent: false, suffix: 'health regen' }),
  ],
  intelligence: [
    (n) => ({ value: n * 2, isPercent: false, suffix: 'spell power' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'spell crit' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'spell accuracy' }),
    (n) => ({ value: Math.floor(n / 4), isPercent: false, suffix: 'mana regen' }),
  ],
  wisdom: [
    (n) => ({ value: n * 2, isPercent: false, suffix: 'healing power' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'heal crit' }),
    (n) => ({ value: Math.floor((n - 10) / 2), isPercent: true, suffix: 'spell evasion' }),
    (n) => ({ value: n, isPercent: false, suffix: 'magic resist' }),
    (n) => ({ value: Math.floor(n / 4), isPercent: false, suffix: 'mana regen' }),
  ],
  charisma: [],
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
    case 'stats':
      content = <StatsSection characterId={character.id} />
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
  const { gameId } = useParams<{ gameId: string }>()

  const [scores, setScores] = useState<PublicCharacterAbilityScore[] | null>(null)
  const [resources, setResources] = useState<PublicCharacterResource[] | null>(null)
  const [auras, setAuras] = useState<PublicCharacterActiveAura[] | null>(null)
  const [guild, setGuild] = useState<PublicCharacterGuild | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getPublicCharacterAbilityScores(characterId).then((rows) => {
      if (!cancelled) setScores(rows)
    })
    getPublicCharacterResources(characterId).then((rows) => {
      if (!cancelled) setResources(rows)
    })
    getPublicCharacterActiveAuras(characterId).then((rows) => {
      if (!cancelled) setAuras(rows)
    })
    getPublicCharacterGuild(characterId).then((g) => {
      if (!cancelled) setGuild(g)
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  return (
    <>
      <ProfileCard character={character} guild={guild} gameId={gameId} />

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Ability Scores</h2>
          <p>Click a card for the source breakdown and full driver list.</p>
        </header>
        <AbilityScoresGrid scores={scores} />
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Resources</h2>
          <p>Click a row for the base / abilities / aura breakdown.</p>
        </header>
        <ResourcesTable resources={resources} />
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

// New top-of-page identity card. Replaces the old "Profile" definition list
// with a horizontal layout: name + lv/race subtitle on the left, secondary
// metadata (alignment, realm, zone, created) inline as compact pills, and a
// guild "card" anchored bottom-right when present.
function ProfileCard({
  character,
  guild,
  gameId,
}: {
  character: PublicCharacterDetail
  guild: PublicCharacterGuild | null | undefined
  gameId: string | undefined
}) {
  const facts: { label: string; value: ReactNode }[] = []
  if (character.alignment_id) {
    facts.push({ label: 'Alignment', value: capitalize(character.alignment_id) })
  }
  if (character.realm_name) {
    facts.push({ label: 'Realm', value: character.realm_name })
  }
  facts.push({
    label: 'Created',
    value: (
      <>
        {formatRelativeShort(character.created_at)} ago
        <span className="text-dim">
          {' · '}
          {new Date(character.created_at).toLocaleDateString()}
        </span>
      </>
    ),
  })

  return (
    <section className="profile-card">
      <div className="profile-card-main">
        <h2 className="profile-card-name">{character.character_name}</h2>
        <div className="profile-card-subtitle">
          Lv {character.level} {capitalize(character.race)}
        </div>
        <ul className="profile-card-facts">
          {facts.map((f) => (
            <li key={f.label}>
              <span className="profile-card-fact-label">{f.label}</span>
              <span className="profile-card-fact-value">{f.value}</span>
            </li>
          ))}
        </ul>
      </div>
      <ProfileGuildBadge guild={guild} gameId={gameId} />
    </section>
  )
}

function ProfileGuildBadge({
  guild,
  gameId,
}: {
  guild: PublicCharacterGuild | null | undefined
  gameId: string | undefined
}) {
  if (guild === undefined) {
    return <div className="profile-card-guild text-dim">Loading guild…</div>
  }
  if (guild === null) {
    return <div className="profile-card-guild text-dim">No guild</div>
  }
  const inner = (
    <>
      <div className="profile-card-guild-label">Guild</div>
      <div className="profile-card-guild-name">{guild.guild_name}</div>
      <div className="profile-card-guild-meta">
        {guild.rank_name}
        {' · '}
        {guild.member_count} member{guild.member_count === 1 ? '' : 's'}
      </div>
    </>
  )
  return gameId ? (
    <Link
      to={`/g/${gameId}/guilds/${guild.guild_id}`}
      className="profile-card-guild profile-card-guild-link"
    >
      {inner}
    </Link>
  ) : (
    <div className="profile-card-guild">{inner}</div>
  )
}

// 6-card D&D-style grid for ability scores. Each card shows the
// abbreviation, big total, modifier badge, source breakdown, and the
// list of derived effects. Click toggles the breakdown open like a
// DataTable row.
function AbilityScoresGrid({
  scores,
}: {
  scores: PublicCharacterAbilityScore[] | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (scores === null) return <p className="text-dim">Loading…</p>
  if (scores.length === 0) return <p className="text-dim">No ability scores set.</p>
  return (
    <div className="ability-grid">
      {scores.map((s) => (
        <AbilityScoreCard
          key={s.ability}
          score={s}
          open={openId === s.ability}
          onToggle={() => setOpenId((cur) => (cur === s.ability ? null : s.ability))}
        />
      ))}
    </div>
  )
}

function AbilityScoreCard({
  score,
  open,
  onToggle,
}: {
  score: PublicCharacterAbilityScore
  open: boolean
  onToggle: () => void
}) {
  const total = Math.round(score.total_value)
  const base = Math.round(score.base_value)
  const eq = Math.round(score.equipment_bonus_value)
  const au = Math.round(score.aura_bonus_value)
  const mod = Math.floor((total - 10) / 2)
  const drives = (ABILITY_DRIVES[score.ability] ?? [])
    .map((fn) => fn(total))
    .filter((d) => d.value !== 0)

  // 3-letter D&D abbreviation; falls back to first 3 chars of slug when
  // the ability name is non-standard.
  const abbr = score.ability.slice(0, 3).toUpperCase()
  const modClass =
    mod > 0 ? 'ability-card-mod-pos' : mod < 0 ? 'ability-card-mod-neg' : ''

  return (
    <button
      type="button"
      className={`ability-card${open ? ' ability-card-open' : ''}`}
      onClick={onToggle}
      aria-expanded={open}
    >
      <AbilityIcon name={score.ability} />
      <div className="ability-card-abbr">{abbr}</div>
      <div className="ability-card-name">{score.display_name ?? score.ability}</div>
      <div className="ability-card-score">{total}</div>
      <div className={`ability-card-mod ${modClass}`}>
        {mod >= 0 ? `+${mod}` : mod}
      </div>
      {open && (
        <div className="ability-card-detail">
          <div className="ability-card-sources">
            <span>Base {base}</span>
            {eq !== 0 && <span>{eq > 0 ? '+' : ''}{eq} gear</span>}
            {au !== 0 && <span>{au > 0 ? '+' : ''}{au} aura</span>}
          </div>
          {drives.length > 0 ? (
            <ul className="ability-card-drives">
              {drives.map((d, i) => (
                <li key={i}>{formatDrive(d)}</li>
              ))}
            </ul>
          ) : (
            <div className="ability-card-drives-empty">No active drives</div>
          )}
        </div>
      )}
    </button>
  )
}

function StatsSection({ characterId }: { characterId: string }) {
  const [stats, setStats] = useState<PublicCharacterCalculatedStat[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getPublicCharacterCalculatedStats(characterId).then((rows) => {
      if (!cancelled) setStats(rows)
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Stats</h2>
        <p>Click a row for the per-point conversion details.</p>
      </header>
      <StatsTable stats={stats} />
    </section>
  )
}

function ResourcesTable({
  resources,
}: {
  resources: PublicCharacterResource[] | null
}) {
  const columns: DataTableColumn<PublicCharacterResource>[] = [
    {
      id: 'name',
      header: 'Resource',
      cell: (r) => (
        <>
          <ResourceIcon id={r.type} color={r.display_color} />
          <span className="data-cell-name">
            {r.display_name ?? capitalize(r.type)}
          </span>
        </>
      ),
      sortKey: (r) => r.sort_order ?? 999,
    },
    {
      id: 'current',
      header: 'Current / Max',
      cell: (r) => `${Math.round(r.current_value)} / ${Math.round(r.max_value)}`,
      sortKey: (r) => r.max_value,
      align: 'right',
    },
    {
      id: 'regen',
      header: 'Regen',
      cell: (r) =>
        r.regen_rate > 0
          ? r.regen_delay > 0
            ? `${r.regen_rate}/s · ${r.regen_delay}s OOC`
            : `${r.regen_rate}/s`
          : '—',
      sortKey: (r) => r.regen_rate,
      align: 'right',
    },
  ]

  return (
    <DataTable<PublicCharacterResource>
      rows={resources}
      columns={columns}
      rowKey={(r) => r.type}
      emptyText="No resource pools set."
      defaultSort={{ columnId: 'name', direction: 'asc' }}
      expandedContent={(r) => {
        const base = Math.round(r.base_max_value)
        const ability = Math.round(r.ability_bonus_max_value)
        const aura = Math.round(r.bonus_max_value)
        return (
          <dl className="data-expansion">
            <dt>Type</dt>
            <dd>
              <code className="data-table-mono">{r.type}</code>
            </dd>
            <dt>Base max</dt>
            <dd>{base}</dd>
            {ability !== 0 && (
              <>
                <dt>Ability bonus</dt>
                <dd
                  className={
                    ability > 0
                      ? 'data-expansion-positive'
                      : 'data-expansion-negative'
                  }
                >
                  {ability > 0 ? '+' : ''}
                  {ability}
                </dd>
              </>
            )}
            {aura !== 0 && (
              <>
                <dt>Aura bonus</dt>
                <dd
                  className={
                    aura > 0
                      ? 'data-expansion-positive'
                      : 'data-expansion-negative'
                  }
                >
                  {aura > 0 ? '+' : ''}
                  {aura}
                </dd>
              </>
            )}
            <dt>Total max</dt>
            <dd>{Math.round(r.max_value)}</dd>
            <dt>Current</dt>
            <dd>{Math.round(r.current_value)}</dd>
            {r.regen_rate > 0 && (
              <>
                <dt>Regen rate</dt>
                <dd>{r.regen_rate} / second</dd>
              </>
            )}
            {r.regen_delay > 0 && (
              <>
                <dt>Regen delay</dt>
                <dd>{r.regen_delay}s out of combat</dd>
              </>
            )}
          </dl>
        )
      }}
    />
  )
}

function StatsTable({
  stats,
}: {
  stats: PublicCharacterCalculatedStat[] | null
}) {
  const columns: DataTableColumn<PublicCharacterCalculatedStat>[] = [
    {
      id: 'name',
      header: 'Stat',
      cell: (s) => (
        <>
          <StatIcon category={s.category} />
          <span className="data-cell-name">{s.display_name}</span>
        </>
      ),
      sortKey: (s) => s.display_name.toLowerCase(),
    },
    {
      id: 'category',
      header: 'Category',
      cell: (s) => s.category,
      sortKey: (s) => s.category.toLowerCase(),
    },
    {
      id: 'value',
      header: 'Value',
      cell: (s) => {
        const v = s.is_percent
          ? `${Math.round(s.value * 10) / 10}%`
          : Math.round(s.value).toString()
        const isZero = Math.round(s.value * 10) === 0
        return (
          <span className={isZero ? 'text-dim' : undefined}>{v}</span>
        )
      },
      sortKey: (s) => s.value,
      align: 'right',
    },
  ]

  return (
    <DataTable<PublicCharacterCalculatedStat>
      rows={stats}
      columns={columns}
      rowKey={(s) => s.id}
      searchPlaceholder="Search stats…"
      searchKeys={(s) => [s.id, s.display_name, s.category, s.affects]}
      emptyText="No stats catalog defined."
      defaultSort={{ columnId: 'category', direction: 'asc' }}
      expandedContent={(s) => {
        const effect = describeStatEffect(s.value, s.conversion_per_point)
        return (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd>
              <code className="data-table-mono">{s.id}</code>
            </dd>
            <dt>Category</dt>
            <dd>{s.category}</dd>
            <dt>Value</dt>
            <dd>
              {s.is_percent
                ? `${Math.round(s.value * 10) / 10}%`
                : Math.round(s.value).toString()}
            </dd>
            {s.affects && (
              <>
                <dt>Affects</dt>
                <dd>{s.affects}</dd>
              </>
            )}
            {s.conversion_per_point && (
              <>
                <dt>Per point</dt>
                <dd>
                  <code className="data-table-mono">{s.conversion_per_point}</code>
                </dd>
              </>
            )}
            {effect && (
              <>
                <dt>Effect</dt>
                <dd>{effect.formatted}</dd>
              </>
            )}
          </dl>
        )
      }}
    />
  )
}

// `InventoryOnly` is a special slot for currency/consumables that can never
// be equipped; we hide it from the equipped-gear table.
const HIDDEN_EQUIP_SLOTS = new Set(['InventoryOnly'])

function EquipmentSection({ characterId }: { characterId: string }) {
  const { gameId } = useParams<{ gameId: string }>()
  const [equipment, setEquipment] = useState<PublicCharacterEquipmentSlot[] | null>(
    null,
  )
  const [slots, setSlots] = useState<InventorySlot[] | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [rarities, setRarities] = useState<Rarity[] | null>(null)
  const [subclasses, setSubclasses] = useState<ItemSubclass[] | null>(null)
  const [classes, setClasses] = useState<ItemClass[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getPublicCharacterEquipment(characterId),
      listInventorySlots(),
      listItems(),
      listRarities(),
      listItemSubclasses(),
      listItemClasses(),
    ]).then(([eq, sl, it, ra, sc, cl]) => {
      if (cancelled) return
      setEquipment(eq)
      setSlots(sl)
      setItems(it)
      setRarities(ra)
      setSubclasses(sc)
      setClasses(cl)
    })
    return () => {
      cancelled = true
    }
  }, [characterId])

  // Lookup tables for the drawer detail block.
  const itemById = new Map((items ?? []).map((i) => [i.id, i]))
  const rarityById = new Map((rarities ?? []).map((r) => [r.id, r]))
  const subclassById = new Map((subclasses ?? []).map((sc) => [sc.name, sc]))
  const classById = new Map((classes ?? []).map((c) => [c.id, c]))
  const slotById = new Map((slots ?? []).map((s) => [s.id, s]))

  // Merge: every visible inventory slot, filled with the matching equipment
  // row when one exists. Empty slots get a sentinel row that the table
  // renders as a non-expandable greyed-out line.
  const rows: PublicCharacterEquipmentSlot[] | null =
    slots === null || equipment === null
      ? null
      : (() => {
          const equipBySlot = new Map(equipment.map((e) => [e.slot, e]))
          return slots
            .filter((s) => !HIDDEN_EQUIP_SLOTS.has(s.id))
            .map(
              (s) =>
                equipBySlot.get(s.id) ?? {
                  slot: s.id,
                  item_id: '',
                  item_name: null,
                  item_rarity: null,
                  item_subclass: null,
                  description: null,
                  weapon_speed: null,
                  ability_bonuses: [],
                  stats: [],
                },
            )
        })()

  const columns: DataTableColumn<PublicCharacterEquipmentSlot>[] = [
    {
      id: 'slot',
      header: 'Slot',
      cell: (e) => {
        const slot = slotById.get(e.slot)
        return (
          <>
            <InventorySlotIcon id={e.slot} region={slot?.body_region} />
            {slot?.display_name ?? e.slot}
          </>
        )
      },
      sortKey: (e) => SLOT_ORDER[e.slot] ?? 999,
    },
    {
      id: 'name',
      header: 'Item',
      cell: (e) =>
        e.item_id ? (
          <>
            <ItemIcon id={e.item_id} rarity={e.item_rarity} />
            <span
              style={{
                color: e.item_rarity ? RARITY_COLORS[e.item_rarity] : undefined,
              }}
            >
              {e.item_name ?? e.item_id}
            </span>
          </>
        ) : (
          <span className="text-dim">Empty</span>
        ),
      sortKey: (e) => (e.item_name ?? '').toLowerCase(),
    },
    {
      id: 'subclass',
      header: 'Subclass',
      cell: (e) =>
        e.item_subclass
          ? (subclassById.get(e.item_subclass)?.display_name ?? e.item_subclass)
          : '—',
      sortKey: (e) => (e.item_subclass ?? '').toLowerCase(),
      align: 'right',
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Equipment</h2>
        <p>All equipment slots. Click an equipped row for details.</p>
      </header>

      <DataTable<PublicCharacterEquipmentSlot>
        rows={rows}
        columns={columns}
        rowKey={(e) => e.slot}
        searchPlaceholder="Search equipment…"
        searchKeys={(e) => [
          e.slot,
          e.item_name ?? '',
          e.item_subclass ?? '',
          e.description ?? '',
        ]}
        emptyText="No equipment slots configured."
        defaultSort={{ columnId: 'slot', direction: 'asc' }}
        isExpandable={(e) => !!e.item_id}
        expandedContent={(e) => {
          const subclass = e.item_subclass
            ? subclassById.get(e.item_subclass)
            : undefined
          return (
            <ItemDetails
              data={equipmentToDetailsData({
                slot: e,
                catalogItem: itemById.get(e.item_id),
                rarity: e.item_rarity ? rarityById.get(e.item_rarity) : undefined,
                subclass,
                itemClass: subclass ? classById.get(subclass.item_class) : undefined,
              })}
              viewHref={gameId ? `/g/${gameId}/items/${e.item_id}` : undefined}
            />
          )
        }}
      />
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
            <td>
              <SkillIcon name={s.skill} category={s.category} />
              {s.display_name ?? s.skill}
            </td>
            <td>{s.level}</td>
            <td>{s.current_xp.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
