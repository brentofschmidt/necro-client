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
  const [stats, setStats] = useState<PublicCharacterCalculatedStat[] | null>(null)
  const [resources, setResources] = useState<PublicCharacterResource[] | null>(null)
  const [auras, setAuras] = useState<PublicCharacterActiveAura[] | null>(null)
  const [guild, setGuild] = useState<PublicCharacterGuild | null | undefined>(undefined)

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
    getPublicCharacterGuild(characterId).then((g) => {
      if (!cancelled) setGuild(g)
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

          <dt>Guild</dt>
          <dd>
            {guild === undefined ? (
              <span className="text-dim">Loading…</span>
            ) : guild === null ? (
              '—'
            ) : (
              <>
                {gameId ? (
                  <Link
                    to={`/g/${gameId}/guilds/${guild.guild_id}`}
                    className="character-back-link"
                  >
                    {guild.guild_name}
                  </Link>
                ) : (
                  guild.guild_name
                )}
                <span className="text-dim">
                  {' · '}
                  {guild.rank_name}
                  {' · '}
                  {guild.member_count} member{guild.member_count === 1 ? '' : 's'}
                </span>
              </>
            )}
          </dd>
        </dl>
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
          <h2>Ability Scores</h2>
          <p>Click a row for the source breakdown and full driver list.</p>
        </header>
        <AbilityScoresTable scores={scores} />
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Stats</h2>
          <p>Click a row for the per-point conversion details.</p>
        </header>
        <StatsTable stats={stats} />
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
        <span className="resource-name-cell">
          <span
            className="resource-color-dot"
            style={{ background: r.display_color ?? 'var(--accent)' }}
            aria-hidden="true"
          />
          {r.display_name ?? capitalize(r.type)}
        </span>
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

function AbilityScoresTable({
  scores,
}: {
  scores: PublicCharacterAbilityScore[] | null
}) {
  const columns: DataTableColumn<PublicCharacterAbilityScore>[] = [
    {
      id: 'name',
      header: 'Ability',
      cell: (s) => s.display_name ?? s.ability,
      sortKey: (s) => (s.display_name ?? s.ability).toLowerCase(),
    },
    {
      id: 'score',
      header: 'Score',
      cell: (s) => {
        const total = Math.round(s.total_value)
        const mod = Math.floor((total - 10) / 2)
        return (
          <span>
            {total}{' '}
            <span className="stat-mod">{mod >= 0 ? `+${mod}` : mod}</span>
          </span>
        )
      },
      sortKey: (s) => s.total_value,
      align: 'right',
    },
    {
      id: 'drives',
      header: 'Drives',
      cell: (s) => {
        const total = Math.round(s.total_value)
        const drives = (ABILITY_DRIVES[s.ability] ?? [])
          .map((fn) => fn(total))
          .filter((d) => d.value !== 0)
        if (drives.length === 0) return '—'
        const shown = drives.slice(0, 2).map(formatDrive).join(', ')
        const extra = drives.length > 2 ? ` +${drives.length - 2} more` : ''
        return `${shown}${extra}`
      },
      align: 'right',
    },
  ]

  return (
    <DataTable<PublicCharacterAbilityScore>
      rows={scores}
      columns={columns}
      rowKey={(s) => s.ability}
      emptyText="No ability scores set."
      expandedContent={(s) => {
        const total = Math.round(s.total_value)
        const base = Math.round(s.base_value)
        const eq = Math.round(s.equipment_bonus_value)
        const au = Math.round(s.aura_bonus_value)
        const mod = Math.floor((total - 10) / 2)
        const drives = (ABILITY_DRIVES[s.ability] ?? [])
          .map((fn) => fn(total))
          .filter((d) => d.value !== 0)
        return (
          <dl className="data-expansion">
            <dt>Ability</dt>
            <dd>
              <code className="data-table-mono">{s.ability}</code>
            </dd>
            <dt>Total</dt>
            <dd>
              {total} <span className="text-dim">(modifier {mod >= 0 ? `+${mod}` : mod})</span>
            </dd>
            <dt>Base</dt>
            <dd>{base}</dd>
            {eq !== 0 && (
              <>
                <dt>Equipment</dt>
                <dd
                  className={
                    eq > 0 ? 'data-expansion-positive' : 'data-expansion-negative'
                  }
                >
                  {eq > 0 ? '+' : ''}
                  {eq}
                </dd>
              </>
            )}
            {au !== 0 && (
              <>
                <dt>Aura</dt>
                <dd
                  className={
                    au > 0 ? 'data-expansion-positive' : 'data-expansion-negative'
                  }
                >
                  {au > 0 ? '+' : ''}
                  {au}
                </dd>
              </>
            )}
            {drives.length > 0 && (
              <>
                <dt>Drives</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {drives.map((d, i) => (
                      <li
                        key={i}
                        className={
                          d.value > 0
                            ? 'data-expansion-positive'
                            : d.value < 0
                              ? 'data-expansion-negative'
                              : ''
                        }
                      >
                        {formatDrive(d)}
                      </li>
                    ))}
                  </ul>
                </dd>
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
      id: 'category',
      header: 'Category',
      cell: (s) => s.category,
      sortKey: (s) => s.category.toLowerCase(),
    },
    {
      id: 'name',
      header: 'Stat',
      cell: (s) => s.display_name,
      sortKey: (s) => s.display_name.toLowerCase(),
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
    {
      id: 'effect',
      header: 'Effect',
      cell: (s) => {
        const isZero = Math.round(s.value * 10) === 0
        const effect = describeStatEffect(s.value, s.conversion_per_point)
        return (!isZero && effect ? effect.formatted : s.affects) || '—'
      },
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
      cell: (e) => slotById.get(e.slot)?.display_name ?? e.slot,
      sortKey: (e) => SLOT_ORDER[e.slot] ?? 999,
    },
    {
      id: 'name',
      header: 'Item',
      cell: (e) =>
        e.item_id ? (
          <span
            style={{
              color: e.item_rarity ? RARITY_COLORS[e.item_rarity] : undefined,
            }}
          >
            {e.item_name ?? e.item_id}
          </span>
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
            <td>{s.display_name ?? s.skill}</td>
            <td>{s.level}</td>
            <td>{s.current_xp.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
