import { ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchGameById, Game, GameStatus } from '../lib/games'
import { formatRelativeShort } from '../lib/time'
import { DataTable, DataTableColumn } from './DataTable'
import {
  Ability,
  Action,
  ActionEffect,
  Alignment,
  DamageType,
  Faction,
  getRealmStats,
  Item,
  InventorySlot,
  ItemClass,
  ItemSubclass,
  listAbilities,
  listActions,
  listAlignments,
  listDamageTypes,
  listFactions,
  listItems,
  listInventorySlots,
  listItemClasses,
  listItemSubclasses,
  listPublicCharacters,
  listPublicGuilds,
  listRaces,
  listRarities,
  listRealms,
  listRecipes,
  listResources,
  listSkills,
  listSpells,
  listStats,
  listZones,
  PublicCharacter,
  PublicGuild,
  Race,
  Rarity,
  Realm,
  RealmStats,
  Recipe,
  Resource,
  Skill,
  SkillCategory,
  Spell,
  Stat,
  StatCategory,
  Zone,
} from '../lib/necroContent'

type SectionId =
  | 'game'
  | 'database'
  | 'characters'
  | 'guilds'
  | 'leaderboards'
  | 'patch-notes'

// "Information" tabs: catalogs / descriptors / world-rules — the
// reference material a player consults to understand the game's shape.
type GameInfoTabId = 'overview'

// "Database" tabs: every catalog and content collection the game
// defines. This view is built for technical browsing and data-driven
// insight — anything player-facing gets a richer purpose-built page
// elsewhere.
type DatabaseTabId =
  | 'items'
  | 'item_classes'
  | 'item_subclasses'
  | 'inventory_slots'
  | 'rarities'
  | 'damage_types'
  | 'stats'
  | 'abilities'
  | 'resources'
  | 'skills'
  | 'proficiencies'
  | 'races'
  | 'alignments'
  | 'factions'
  | 'zones'
  | 'realms'
  | 'spells'
  | 'recipes'
  | 'actions'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'game', label: 'Game Information' },
  { id: 'database', label: 'Database' },
  { id: 'characters', label: 'Characters' },
  { id: 'guilds', label: 'Guilds' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'patch-notes', label: 'Patch Notes' },
]

const GAME_INFO_TABS: { id: GameInfoTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
]

const DATABASE_TABS: { id: DatabaseTabId; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'item_classes', label: 'Item Classes' },
  { id: 'item_subclasses', label: 'Item Subclasses' },
  { id: 'inventory_slots', label: 'Inventory Slots' },
  { id: 'rarities', label: 'Rarities' },
  { id: 'damage_types', label: 'Damage Types' },
  { id: 'stats', label: 'Stats' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'resources', label: 'Resources' },
  { id: 'skills', label: 'Skills' },
  { id: 'proficiencies', label: 'Proficiencies' },
  { id: 'races', label: 'Races' },
  { id: 'alignments', label: 'Alignments' },
  { id: 'factions', label: 'Factions' },
  { id: 'zones', label: 'Zones' },
  { id: 'realms', label: 'Realms' },
  { id: 'spells', label: 'Spells' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'actions', label: 'Actions' },
]

const DEFAULT_SECTION: SectionId = 'game'
const DEFAULT_GAME_INFO_TAB: GameInfoTabId = 'overview'
const DEFAULT_DATABASE_TAB: DatabaseTabId = 'items'

function isSectionId(value: string | null | undefined): value is SectionId {
  return SECTIONS.some((s) => s.id === value)
}

function isGameInfoTabId(value: string | null | undefined): value is GameInfoTabId {
  return GAME_INFO_TABS.some((t) => t.id === value)
}

function isDatabaseTabId(value: string | null | undefined): value is DatabaseTabId {
  return DATABASE_TABS.some((t) => t.id === value)
}

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="settings-tab-icon"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const TAB_ICONS: Record<GameInfoTabId | DatabaseTabId, ReactNode> = {
  overview: (
    <TabIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </TabIcon>
  ),
  items: (
    <TabIcon>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </TabIcon>
  ),
  item_classes: (
    <TabIcon>
      <rect x="4" y="4" width="16" height="6" rx="1" />
      <rect x="4" y="14" width="16" height="6" rx="1" />
    </TabIcon>
  ),
  item_subclasses: (
    <TabIcon>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </TabIcon>
  ),
  inventory_slots: (
    <TabIcon>
      <circle cx="12" cy="5" r="2" />
      <path d="M8 11h8l-1 5-2 1v4h-2v-4l-2-1z" />
      <path d="M8 11l-3 1v4" />
      <path d="M16 11l3 1v4" />
    </TabIcon>
  ),
  rarities: (
    <TabIcon>
      <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z" />
    </TabIcon>
  ),
  recipes: (
    <TabIcon>
      <path d="M6 3h11l3 3v15H6z" />
      <path d="M9 8h8" />
      <path d="M9 12h8" />
      <path d="M9 16h5" />
    </TabIcon>
  ),
  abilities: (
    <TabIcon>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 8v8" />
      <path d="M8 10l8 4" />
      <path d="M16 10l-8 4" />
    </TabIcon>
  ),
  resources: (
    <TabIcon>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </TabIcon>
  ),
  stats: (
    <TabIcon>
      <path d="M3 17l5-6 4 3 5-7 4 6" />
      <path d="M3 21h18" />
    </TabIcon>
  ),
  actions: (
    <TabIcon>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </TabIcon>
  ),
  spells: (
    <TabIcon>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </TabIcon>
  ),
  damage_types: (
    <TabIcon>
      <path d="M12 3l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5L12 3z" />
    </TabIcon>
  ),
  skills: (
    <TabIcon>
      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
      <path d="M4 4v12a4 4 0 0 0 4 4" />
      <path d="M9 9h7" />
      <path d="M9 13h7" />
    </TabIcon>
  ),
  proficiencies: (
    <TabIcon>
      <path d="M14 4h6v6" />
      <path d="M20 4L9 15" />
      <path d="M9 15l-2 2 3 3 2-2" />
      <path d="M5 19l2 2" />
    </TabIcon>
  ),
  races: (
    <TabIcon>
      <path d="M12 3l3 5h-2v6l4 5h-10l4-5V8h-2l3-5z" />
    </TabIcon>
  ),
  alignments: (
    <TabIcon>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 5h6z" />
      <path d="M19 7l-3 5h6z" />
    </TabIcon>
  ),
  factions: (
    <TabIcon>
      <path d="M6 3v18" />
      <path d="M6 4h12l-3 4 3 4H6" />
    </TabIcon>
  ),
  zones: (
    <TabIcon>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v16" />
      <path d="M15 6v16" />
    </TabIcon>
  ),
  realms: (
    <TabIcon>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <rect x="3" y="11" width="18" height="5" rx="1" />
      <rect x="3" y="18" width="18" height="3" rx="1" />
      <circle cx="7" cy="6.5" r="0.5" />
      <circle cx="7" cy="13.5" r="0.5" />
    </TabIcon>
  ),
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
})

const STATUS_LABELS: Record<GameStatus, string> = {
  in_development: 'In development',
  alpha: 'Alpha',
  beta: 'Beta',
  live: 'Live',
  sunset: 'Sunset',
  retired: 'Retired',
}

type LoadState = 'loading' | 'found' | 'not-found'

export function GamePage() {
  const params = useParams<{ gameId: string; section?: string; tab?: string }>()
  const navigate = useNavigate()
  const { gameId, section: paramSection, tab: paramTab } = params
  const [game, setGame] = useState<Game | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')

  const activeSection: SectionId = isSectionId(paramSection)
    ? paramSection
    : DEFAULT_SECTION

  const activeGameInfoTab: GameInfoTabId = isGameInfoTabId(paramTab)
    ? paramTab
    : DEFAULT_GAME_INFO_TAB

  const activeDatabaseTab: DatabaseTabId = isDatabaseTabId(paramTab)
    ? paramTab
    : DEFAULT_DATABASE_TAB

  // Remember the last sub-tab the user looked at within each section so
  // switching away to e.g. Characters and back to Game Information /
  // Database lands them on the same sub-tab they had open instead of the
  // section default.
  const [lastGameInfoTab, setLastGameInfoTab] =
    useState<GameInfoTabId>(DEFAULT_GAME_INFO_TAB)
  const [lastDatabaseTab, setLastDatabaseTab] =
    useState<DatabaseTabId>(DEFAULT_DATABASE_TAB)

  useEffect(() => {
    if (paramSection === 'game' && isGameInfoTabId(paramTab)) {
      setLastGameInfoTab(paramTab)
    }
    if (paramSection === 'database' && isDatabaseTabId(paramTab)) {
      setLastDatabaseTab(paramTab)
    }
  }, [paramSection, paramTab])

  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Tabs are page-scrolling now (no inner scroll container) — bring the
    // user back to the top of the new section / sub-tab instead of leaving
    // them wherever they last scrolled.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [activeSection, activeGameInfoTab, activeDatabaseTab])

  useEffect(() => {
    if (!gameId) {
      setLoadState('not-found')
      return
    }
    let cancelled = false
    setLoadState('loading')
    fetchGameById(gameId).then((g) => {
      if (cancelled) return
      if (g) {
        setGame(g)
        setLoadState('found')
      } else {
        setGame(null)
        setLoadState('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [gameId])

  // Canonicalize the URL so any partial / invalid path lands on a real one
  // (e.g. /g/necro → /g/necro/game/overview, /g/necro/database → .../items,
  // /g/necro/characters/foo → /g/necro/characters).
  useEffect(() => {
    if (!gameId) return
    if (!isSectionId(paramSection)) {
      navigate(`/g/${gameId}/game/${DEFAULT_GAME_INFO_TAB}`, { replace: true })
      return
    }
    if (paramSection === 'game' && !isGameInfoTabId(paramTab)) {
      navigate(`/g/${gameId}/game/${DEFAULT_GAME_INFO_TAB}`, { replace: true })
      return
    }
    if (paramSection === 'database' && !isDatabaseTabId(paramTab)) {
      navigate(`/g/${gameId}/database/${DEFAULT_DATABASE_TAB}`, {
        replace: true,
      })
      return
    }
    if (
      paramSection !== 'game' &&
      paramSection !== 'database' &&
      paramTab
    ) {
      navigate(`/g/${gameId}/${paramSection}`, { replace: true })
    }
  }, [gameId, paramSection, paramTab, navigate])

  function setSection(id: SectionId) {
    if (!gameId) return
    if (id === 'game') {
      navigate(`/g/${gameId}/game/${lastGameInfoTab}`, { replace: true })
    } else if (id === 'database') {
      navigate(`/g/${gameId}/database/${lastDatabaseTab}`, { replace: true })
    } else {
      navigate(`/g/${gameId}/${id}`, { replace: true })
    }
  }

  function setGameInfoTab(id: GameInfoTabId) {
    if (!gameId) return
    navigate(`/g/${gameId}/game/${id}`, { replace: true })
  }

  function setDatabaseTab(id: DatabaseTabId) {
    if (!gameId) return
    navigate(`/g/${gameId}/database/${id}`, { replace: true })
  }

  if (loadState === 'loading') {
    return (
      <div className="settings-page settings-page-flow">
        <p className="text-dim">Loading…</p>
      </div>
    )
  }

  if (loadState === 'not-found' || !game) {
    return (
      <div className="settings-page settings-page-flow">
        <h1 className="settings-title">Game not found</h1>
        <p className="text-dim">No game exists with that id.</p>
      </div>
    )
  }

  let gameInfoContent: ReactNode = null
  switch (activeGameInfoTab) {
    case 'overview':
      gameInfoContent = <InformationSection game={game} />
      break
  }

  let databaseContent: ReactNode = null
  switch (activeDatabaseTab) {
    case 'items':
      databaseContent = <ItemsSection />
      break
    case 'item_classes':
      databaseContent = <ItemClassesSection />
      break
    case 'item_subclasses':
      databaseContent = <ItemSubclassesSection />
      break
    case 'inventory_slots':
      databaseContent = <InventorySlotsSection />
      break
    case 'rarities':
      databaseContent = <RaritiesSection />
      break
    case 'damage_types':
      databaseContent = <DamageTypesSection />
      break
    case 'stats':
      databaseContent = <StatsSection />
      break
    case 'abilities':
      databaseContent = <AbilitiesSection />
      break
    case 'resources':
      databaseContent = <ResourcesSection />
      break
    case 'skills':
      databaseContent = <SkillsSection />
      break
    case 'proficiencies':
      databaseContent = <ProficienciesSection />
      break
    case 'races':
      databaseContent = <RacesSection />
      break
    case 'alignments':
      databaseContent = <AlignmentsSection />
      break
    case 'factions':
      databaseContent = <FactionsSection />
      break
    case 'zones':
      databaseContent = <ZonesSection />
      break
    case 'realms':
      databaseContent = <RealmsSection />
      break
    case 'spells':
      databaseContent = <SpellsSection />
      break
    case 'recipes':
      databaseContent = <RecipesSection />
      break
    case 'actions':
      databaseContent = <ActionsSection />
      break
  }

  let sectionContent: ReactNode = null
  switch (activeSection) {
    case 'game':
      sectionContent = (
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label={`${game.name} information`}>
            {GAME_INFO_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`settings-tab ${activeGameInfoTab === t.id ? 'active' : ''}`}
                onClick={() => setGameInfoTab(t.id)}
                aria-current={activeGameInfoTab === t.id ? 'page' : undefined}
              >
                {TAB_ICONS[t.id]}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content" ref={contentRef}>
            {gameInfoContent}
          </div>
        </div>
      )
      break
    case 'database':
      sectionContent = (
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label={`${game.name} database`}>
            {DATABASE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`settings-tab ${activeDatabaseTab === t.id ? 'active' : ''}`}
                onClick={() => setDatabaseTab(t.id)}
                aria-current={activeDatabaseTab === t.id ? 'page' : undefined}
              >
                {TAB_ICONS[t.id]}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content" ref={contentRef}>
            {databaseContent}
          </div>
        </div>
      )
      break
    case 'characters':
      sectionContent = <CharactersSection />
      break
    case 'guilds':
      sectionContent = <GuildsSection />
      break
    case 'leaderboards':
      sectionContent = <LeaderboardSection />
      break
    case 'patch-notes':
      sectionContent = (
        <ComingSoonSection
          title="Patch Notes"
          description="Update history — new content, balance changes, and bug fixes."
        />
      )
      break
  }

  return (
    <div className="settings-page settings-page-flow">
      <h1 className="settings-title">{game.name}</h1>
      <nav className="game-section-tabs" aria-label={`${game.name} sections`}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`game-section-tab ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setSection(s.id)}
            aria-current={activeSection === s.id ? 'page' : undefined}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {sectionContent}
    </div>
  )
}

function InformationSection({ game }: { game: Game }) {
  const released = game.released_at ? new Date(game.released_at) : null
  const releasedLabel =
    released && !isNaN(released.getTime()) ? dateFormatter.format(released) : '—'

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Game Information</h2>
        <p>{game.short_description || '—'}</p>
      </header>

      <dl className="info-grid">
        <dt>Status</dt>
        <dd>{STATUS_LABELS[game.status]}</dd>

        <dt>Released</dt>
        <dd>{releasedLabel}</dd>

        <dt>Game ID</dt>
        <dd>{game.id}</dd>

        <dt>Content schema</dt>
        <dd>{game.content_schema || '—'}</dd>

        <dt>Player schema</dt>
        <dd>{game.player_schema || '—'}</dd>
      </dl>

      {game.description && (
        <div className="game-description">
          <p>{game.description}</p>
        </div>
      )}
    </section>
  )
}

function ComingSoonSection({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <p className="text-dim">Coming soon.</p>
    </section>
  )
}

function useAsyncList<T>(load: () => Promise<T[]>, deps: unknown[] = []) {
  const [items, setItems] = useState<T[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    load().then((rows) => {
      if (!cancelled) setItems(rows)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return items
}

const DAMAGE_TYPE_ICONS: Record<string, ReactNode> = {
  bludgeoning: (
    <>
      <rect x="13" y="3" width="8" height="5" rx="1" />
      <path d="M14 8l-9 9" />
      <path d="M3 19l3 3" />
    </>
  ),
  piercing: (
    <>
      <path d="M4 20L20 4" />
      <path d="M14 4h6v6" />
      <path d="M3 17l4 4" />
    </>
  ),
  slashing: (
    <>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </>
  ),
  acid: (
    <>
      <path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z" />
      <path d="M9 16a3 3 0 0 0 3 3" />
    </>
  ),
  cold: (
    <>
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
      <path d="M9 4l3 2 3-2" />
      <path d="M9 20l3-2 3 2" />
    </>
  ),
  fire: (
    <>
      <path d="M12 3c-2 4-5 6-5 10a5 5 0 0 0 10 0c0-2-1-3-2-5 0 2-1 3-3 3 1-3 1-5 0-8z" />
    </>
  ),
  lightning: (
    <>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </>
  ),
  thunder: (
    <>
      <path d="M5 13a4 4 0 0 1 4-4 5 5 0 0 1 9 1 3 3 0 0 1 0 6H8" />
      <path d="M12 18l3-4h-2l1-3" />
    </>
  ),
  force: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M5 5l3 3" />
      <path d="M16 16l3 3" />
      <path d="M19 5l-3 3" />
      <path d="M8 16l-3 3" />
    </>
  ),
  necrotic: (
    <>
      <path d="M12 3a7 7 0 0 0-7 7v3l2 2v3h10v-3l2-2v-3a7 7 0 0 0-7-7z" />
      <circle cx="9" cy="11" r="1" fill="currentColor" />
      <circle cx="15" cy="11" r="1" fill="currentColor" />
      <path d="M10 16h4" />
    </>
  ),
  poison: (
    <>
      <path d="M9 2h6v4l3 5v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-7l3-5z" />
      <path d="M6 13h12" />
      <circle cx="11" cy="17" r="0.8" fill="currentColor" />
      <circle cx="14" cy="15" r="0.6" fill="currentColor" />
    </>
  ),
  psychic: (
    <>
      <path d="M12 4a4 4 0 0 0-4 4c0 1.5.8 2.7 2 3.5C8.8 12 8 13.2 8 15a4 4 0 0 0 8 0c0-1.8-.8-3-2-3.5 1.2-.8 2-2 2-3.5a4 4 0 0 0-4-4z" />
      <path d="M12 8v8" />
    </>
  ),
  radiant: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M5 5l2 2" />
      <path d="M17 17l2 2" />
      <path d="M19 5l-2 2" />
      <path d="M7 17l-2 2" />
    </>
  ),
}

function DamageTypeIcon({ id, color }: { id: string; color: string }) {
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
      className="damage-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {DAMAGE_TYPE_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

function DamageTypesSection() {
  const types = useAsyncList<DamageType>(() => listDamageTypes())

  const columns: DataTableColumn<DamageType>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (dt) => (
        <>
          <DamageTypeIcon id={dt.id} color={dt.display_color} />
          <span
            className="data-cell-name"
            style={{ color: dt.display_color || 'inherit' }}
          >
            {dt.display_name}
          </span>
        </>
      ),
      sortKey: (dt) => dt.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Damage Types</h2>
        <p>
          Damage classifications used by abilities, weapons, and resistances.
          Physical types map to weapon damage; magical covers elemental and
          arcane. Click a row for details.
        </p>
      </header>
      <DataTable<DamageType>
        rows={types}
        columns={columns}
        rowKey={(dt) => dt.id}
        searchPlaceholder="Search damage types…"
        searchKeys={(dt) => [dt.display_name, dt.id, dt.description]}
        emptyText="No damage types defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(dt) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{dt.id}</code></dd>
            <dt>Kind</dt>
            <dd>{dt.is_physical ? 'Physical' : 'Magical'}</dd>
            {dt.resistance_stat && (
              <>
                <dt>Resistance Stat</dt>
                <dd>{dt.resistance_stat}</dd>
              </>
            )}
            <dt>Color</dt>
            <dd>
              <code className="data-table-mono">
                {dt.display_color.toUpperCase()}
              </code>
            </dd>
            {dt.description && (
              <>
                <dt>Description</dt>
                <dd>{dt.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

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

function SkillIcon({ name, category }: { name: string; category: SkillCategory }) {
  const color = category === 'Proficiency' ? 'var(--accent)' : '#c8a64a'
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
      {SKILL_ICONS[name] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

function SkillsSection() {
  const all = useAsyncList<Skill>(() => listSkills())
  const skills = all == null ? null : all.filter((s) => s.category === 'Activity')

  const columns: DataTableColumn<Skill>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (s) => (
        <>
          <SkillIcon name={s.name} category={s.category} />
          <span className="data-cell-name">{s.display_name}</span>
        </>
      ),
      sortKey: (s) => s.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Skills</h2>
        <p>
          Activity skills — gathering, crafting, and trade. Trained by doing.
          Click a row for details.
        </p>
      </header>
      <DataTable<Skill>
        rows={skills}
        columns={columns}
        rowKey={(s) => s.name}
        searchPlaceholder="Search skills…"
        searchKeys={(s) => [s.display_name, s.name, s.description, ...s.item_types]}
        emptyText="No activity skills defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(s) => <SkillExpansion skill={s} />}
      />
    </section>
  )
}

function ProficienciesSection() {
  const all = useAsyncList<Skill>(() => listSkills())
  const profs =
    all == null ? null : all.filter((s) => s.category === 'Proficiency')

  const columns: DataTableColumn<Skill>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (s) => (
        <>
          <SkillIcon name={s.name} category={s.category} />
          <span className="data-cell-name">{s.display_name}</span>
        </>
      ),
      sortKey: (s) => s.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Proficiencies</h2>
        <p>
          Weapon proficiencies — swords, axes, maces, daggers, bows, staves.
          Gate weapon use and improve accuracy / damage with that family.
          Click a row for details.
        </p>
      </header>
      <DataTable<Skill>
        rows={profs}
        columns={columns}
        rowKey={(s) => s.name}
        searchPlaceholder="Search proficiencies…"
        searchKeys={(s) => [s.display_name, s.name, s.description, ...s.item_types]}
        emptyText="No proficiencies defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(s) => <SkillExpansion skill={s} />}
      />
    </section>
  )
}

function SkillExpansion({ skill: s }: { skill: Skill }) {
  return (
    <dl className="data-expansion">
      <dt>ID</dt>
      <dd><code className="data-table-mono">{s.name}</code></dd>
      <dt>Max Level</dt>
      <dd>{s.max_level}</dd>
      {s.item_types.length > 0 && (
        <>
          <dt>Item Types</dt>
          <dd>{s.item_types.join(', ')}</dd>
        </>
      )}
      {s.description && (
        <>
          <dt>Description</dt>
          <dd>{s.description}</dd>
        </>
      )}
      {s.per_level_effects.length > 0 && (
        <>
          <dt>Per-Level Effects</dt>
          <dd>
            <ul className="data-expansion-list">
              {s.per_level_effects.map((eff, i) => (
                <li key={i}>{eff.description}</li>
              ))}
            </ul>
          </dd>
        </>
      )}
    </dl>
  )
}

const RACE_ICONS: Record<string, ReactNode> = {
  human: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
    </>
  ),
  dwarf: (
    <>
      <path d="M7 6h10v2a5 5 0 0 1-1 3" />
      <path d="M8 11c0 4 2 7 4 8 2-1 4-4 4-8" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="14" cy="10" r="0.6" fill="currentColor" stroke="none" />
      <path d="M12 3v3" />
    </>
  ),
  elf: (
    <>
      <circle cx="12" cy="9" r="4" />
      <path d="M8 8l-4-3 2 5" />
      <path d="M16 8l4-3-2 5" />
      <path d="M6 21c0-3.5 2.5-6 6-6s6 2.5 6 6" />
    </>
  ),
  orc: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M10 12v3" />
      <path d="M14 12v3" />
      <path d="M5 21c0-4 3-7 7-7s7 3 7 7" />
    </>
  ),
}

const RACE_COLORS: Record<string, string> = {
  human: '#d4a861',
  dwarf: '#c97e3d',
  elf: '#6fb98a',
  orc: '#7d9b48',
}

function RaceIcon({ id }: { id: string }) {
  const color = RACE_COLORS[id] ?? 'var(--text)'
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
      className="race-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {RACE_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

function RacesSection() {
  const races = useAsyncList<Race>(() => listRaces())

  const columns: DataTableColumn<Race>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => (
        <>
          <RaceIcon id={r.id} />
          <span className="data-cell-name">{r.display_name}</span>
        </>
      ),
      sortKey: (r) => r.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Races</h2>
        <p>
          Playable races and their lore. Stats and starting abilities live in
          necro_content.races. Click a row for details.
        </p>
      </header>
      <DataTable<Race>
        rows={races}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search races…"
        searchKeys={(r) => [r.display_name, r.id, r.description]}
        emptyText="No races defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(r) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{r.id}</code></dd>
            {r.description && (
              <>
                <dt>Description</dt>
                <dd>{r.description}</dd>
              </>
            )}
            {r.ability_bonuses.length > 0 && (
              <>
                <dt>Ability Bonuses</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {r.ability_bonuses.map((b, i) => (
                      <li
                        key={i}
                        className={
                          b.value > 0
                            ? 'data-expansion-positive'
                            : b.value < 0
                              ? 'data-expansion-negative'
                              : ''
                        }
                      >
                        {b.description}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

const ALIGNMENT_ICONS: Record<string, ReactNode> = {
  good: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </>
  ),
  neutral: (
    <>
      <path d="M12 3v18" />
      <path d="M9 21h6" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 5h6z" />
      <path d="M19 7l-3 5h6z" />
    </>
  ),
  evil: (
    <>
      <path d="M5 14V8l3 4 4-7 4 7 3-4v6z" />
      <path d="M5 14h14v3H5z" />
      <path d="M9 14v3" />
      <path d="M15 14v3" />
    </>
  ),
}

const ALIGNMENT_COLORS: Record<string, string> = {
  good: '#d4b061',
  neutral: '#6a8a9a',
  evil: '#8a2a3a',
}

function AlignmentIcon({ id }: { id: string }) {
  const color = ALIGNMENT_COLORS[id] ?? 'var(--text)'
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
      className="alignment-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {ALIGNMENT_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

const FACTION_ICONS: Record<string, ReactNode> = {
  // Carrion Pact: a sigil — circle with three converging marks
  // (secret-society shorthand). A fitting mark for a death-cult cabal.
  carrion_pact: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v6" />
      <path d="M5 16l4-3" />
      <path d="M19 16l-4-3" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
}

const FACTION_COLORS: Record<string, string> = {
  carrion_pact: '#9c7654',
}

function FactionIcon({ id }: { id: string }) {
  const color = FACTION_COLORS[id] ?? 'var(--text)'
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
      className="faction-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {FACTION_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

const ABILITY_ICONS: Record<string, ReactNode> = {
  strength: (
    <>
      <path d="M5 11h2l1-4 4 4 4-4 1 4h2" />
      <path d="M4 14a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M9 19v2" />
      <path d="M15 19v2" />
    </>
  ),
  dexterity: (
    <>
      <path d="M3 21L21 3" />
      <path d="M21 3v8" />
      <path d="M21 3h-8" />
      <path d="M5 18l1 3 3-1" />
    </>
  ),
  constitution: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
      <path d="M9 13c1.5 1.5 1.5 1.5 3 0s1.5-1.5 3 0" />
    </>
  ),
  intelligence: (
    <>
      <path d="M9 4a4 4 0 0 0-2 7c0 1-1 1-1 3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3c0-2-1-2-1-3a4 4 0 0 0-8 0" />
      <path d="M12 18v3" />
    </>
  ),
  wisdom: (
    <>
      <path d="M2 12c2-4 6-7 10-7s8 3 10 7c-2 4-6 7-10 7s-8-3-10-7z" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  charisma: (
    <>
      <path d="M12 2l2.5 7H22l-6 4.5L18.5 21 12 16.5 5.5 21 8 13.5 2 9h7.5z" />
    </>
  ),
}

const ABILITY_COLORS: Record<string, string> = {
  strength:     '#c95a3d',
  dexterity:    '#5fae6a',
  constitution: '#c97a3d',
  intelligence: '#5b8ad6',
  wisdom:       '#9b6fcf',
  charisma:     '#d4609a',
}

function AbilityIcon({ name }: { name: string }) {
  const color = ABILITY_COLORS[name] ?? 'var(--text)'
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
      className="ability-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {ABILITY_ICONS[name] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

const STAT_CATEGORY_ICONS: Record<StatCategory, ReactNode> = {
  Power: (
    <>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </>
  ),
  Crit: (
    <>
      <path d="M12 2l2.5 7H22l-6 4.5L18.5 21 12 16.5 5.5 21 8 13.5 2 9h7.5z" />
    </>
  ),
  Speed: (
    <>
      <path d="M5 12h13" />
      <path d="M14 7l5 5-5 5" />
      <path d="M3 8l3 4-3 4" />
    </>
  ),
  Defense: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
    </>
  ),
  Precision: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  Sustain: (
    <>
      <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />
      <path d="M12 8v6" />
      <path d="M9 11h6" />
    </>
  ),
  Mastery: (
    <>
      <path d="M5 8l4 3 3-6 3 6 4-3-2 11H7z" />
      <path d="M7 21h10" />
    </>
  ),
  Gathering: (
    <>
      <path d="M4 11h16l-2 9H6z" />
      <path d="M4 11c0-3 4-5 8-5s8 2 8 5" />
      <path d="M9 11c1-2 2-3 3-3s2 1 3 3" />
    </>
  ),
}

const STAT_CATEGORY_COLORS: Record<StatCategory, string> = {
  Power:     '#c95a3d',
  Crit:      '#e84f1a',
  Speed:     '#d4b061',
  Defense:   '#5b8ad6',
  Precision: '#c0c0c0',
  Sustain:   '#5fae6a',
  Mastery:   '#9b6fcf',
  Gathering: '#8b9b3a',
}

function StatIcon({ category }: { category: StatCategory }) {
  const color = STAT_CATEGORY_COLORS[category] ?? 'var(--text)'
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
      className="stat-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {STAT_CATEGORY_ICONS[category] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

function StatsSection() {
  const stats = useAsyncList<Stat>(() => listStats())

  const columns: DataTableColumn<Stat>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (s) => (
        <>
          <StatIcon category={s.category} />
          <span className="data-cell-name">{s.display_name}</span>
        </>
      ),
      sortKey: (s) => s.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Stats</h2>
        <p>
          Derived combat stats — attack power, crit, haste, armor, and the rest.
          Most values come from gear and buffs rather than character creation.
          Click a row for details.
        </p>
      </header>
      <DataTable<Stat>
        rows={stats}
        columns={columns}
        rowKey={(s) => s.id}
        searchPlaceholder="Search stats…"
        searchKeys={(s) => [
          s.display_name,
          s.id,
          s.affects,
          s.category,
          s.conversion_per_point,
          s.description,
        ]}
        emptyText="No stats defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(s) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{s.id}</code></dd>
            <dt>Category</dt>
            <dd>{s.category}</dd>
            <dt>Type</dt>
            <dd>{s.is_percent ? 'Percentage' : 'Flat'}</dd>
            {s.affects && (
              <>
                <dt>Affects</dt>
                <dd>{s.affects}</dd>
              </>
            )}
            {s.conversion_per_point && (
              <>
                <dt>Per Point</dt>
                <dd>{s.conversion_per_point}</dd>
              </>
            )}
            {s.description && (
              <>
                <dt>Description</dt>
                <dd>{s.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

const RESOURCE_ICONS: Record<string, ReactNode> = {
  health: (
    <>
      <path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z" />
    </>
  ),
  mana: (
    <>
      <path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z" />
    </>
  ),
  stamina: (
    <>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </>
  ),
}

function ResourceIcon({ id, color }: { id: string; color: string }) {
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
      className="resource-icon"
      style={{ color }}
      aria-hidden="true"
    >
      {RESOURCE_ICONS[id] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

function ResourcesSection() {
  const resources = useAsyncList<Resource>(() => listResources())

  const columns: DataTableColumn<Resource>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => (
        <>
          <ResourceIcon id={r.id} color={r.display_color} />
          <span
            className="data-cell-name"
            style={{ color: r.display_color || 'inherit' }}
          >
            {r.display_name}
          </span>
        </>
      ),
      sortKey: (r) => r.sort_order,
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Resources</h2>
        <p>
          Pools every character carries — health, mana, and stamina. Catalog
          values define defaults; each character's current and max values live
          on necro_player.character_resources. Click a row for details.
        </p>
      </header>
      <DataTable<Resource>
        rows={resources}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search resources…"
        searchKeys={(r) => [r.display_name, r.id, r.description]}
        emptyText="No resources defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(r) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{r.id}</code></dd>
            <dt>Color</dt>
            <dd>
              <code className="data-table-mono">
                {r.display_color.toUpperCase()}
              </code>
            </dd>
            <dt>Order</dt>
            <dd>{r.sort_order}</dd>
            {r.description && (
              <>
                <dt>Description</dt>
                <dd>{r.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

// Keyed by item_class id (lowercase, matching necro_content.item_classes.id).
const ITEM_CLASS_ICONS: Record<string, ReactNode> = {
  weapon: (
    <>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </>
  ),
  armor: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
    </>
  ),
  jewelry: (
    <>
      <path d="M12 4l4 5-4 11-4-11z" />
      <path d="M8 9h8" />
    </>
  ),
  tool: (
    <>
      <path d="M14 4l6 6-3 3-6-6z" />
      <path d="M11 7L4 14l3 3 7-7" />
      <path d="M4 14l-1 4 4-1" />
    </>
  ),
  consumable: (
    <>
      <path d="M9 3h6v3l3 5v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8l3-5z" />
      <path d="M6 14h12" />
    </>
  ),
  material: (
    <>
      <path d="M5 8l7-4 7 4-7 4z" />
      <path d="M5 8v8l7 4" />
      <path d="M19 8v8l-7 4" />
    </>
  ),
  container: (
    <>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3" />
    </>
  ),
  currency: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10c0-1.5 1.3-2 3-2s3 .5 3 2-1 1.8-3 2-3 .5-3 2 1.3 2 3 2 3-.5 3-2" />
      <path d="M12 5v2" />
      <path d="M12 17v2" />
    </>
  ),
}

function ItemClassIcon({ itemClass }: { itemClass: string }) {
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
      className="item-icon"
      aria-hidden="true"
    >
      {ITEM_CLASS_ICONS[itemClass] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

// Renders the rich metadata of an action/spell effect as a compact
// "Key: Value · Key: Value" row beneath the prose description. Knows how to
// format common fields (amount-with-percent, radius-in-meters, etc.) and
// quietly skips fields it doesn't recognise so a future effect type with a
// new field still renders the basics.
function EffectMeta({ effect }: { effect: ActionEffect }) {
  const entries: Array<[string, string]> = []

  if (typeof effect.type === 'string' && effect.type) {
    entries.push(['Type', effect.type])
  }
  if (typeof effect.amount === 'number') {
    const isPercent = effect.modifier_type === 'Percent'
    entries.push(['Amount', `${effect.amount}${isPercent ? '%' : ''}`])
  }
  if (typeof effect.school === 'string' && effect.school) {
    entries.push(['School', effect.school])
  }
  if (typeof effect.stat === 'string' && effect.stat) {
    entries.push(['Stat', effect.stat])
  }
  if (typeof effect.target === 'string' && effect.target) {
    entries.push(['Target', effect.target])
  }
  if (typeof effect.radius === 'number') {
    entries.push(['Radius', `${effect.radius}m`])
  }
  if (typeof effect.duration === 'number') {
    entries.push(['Duration', `${effect.duration}s`])
  }

  if (entries.length === 0) return null
  return (
    <div className="effect-meta">
      {entries.map(([k, v], i) => (
        <span key={k} className="effect-meta-pair">
          <span className="effect-meta-key">{k}:</span>{' '}
          <span className="effect-meta-value">{v}</span>
          {i < entries.length - 1 && (
            <span className="effect-meta-sep" aria-hidden="true">
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function ItemClassesSection() {
  const classes = useAsyncList<ItemClass>(() => listItemClasses())
  const subclasses = useAsyncList<ItemSubclass>(() => listItemSubclasses())

  const subclassCount = new Map<string, number>()
  for (const sc of subclasses ?? []) {
    subclassCount.set(sc.item_class, (subclassCount.get(sc.item_class) ?? 0) + 1)
  }

  const columns: DataTableColumn<ItemClass>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (c) => (
        <>
          <ItemClassIcon itemClass={c.id} />
          <span className="data-cell-name">{c.display_name}</span>
        </>
      ),
      sortKey: (c) => c.sort_order,
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Item Classes</h2>
        <p>
          Top-level item categorisation — Weapon, Armor, Consumable, etc.
          Mirrors WoW's ItemClass concept. Click a row for details.
        </p>
      </header>
      <DataTable<ItemClass>
        rows={classes}
        columns={columns}
        rowKey={(c) => c.id}
        searchPlaceholder="Search item classes…"
        searchKeys={(c) => [c.display_name, c.id, c.description]}
        emptyText="No item classes defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(c) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{c.id}</code></dd>
            <dt>Subclasses</dt>
            <dd>{subclassCount.get(c.id) ?? 0}</dd>
            <dt>Order</dt>
            <dd>{c.sort_order}</dd>
            {c.description && (
              <>
                <dt>Description</dt>
                <dd>{c.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function ItemSubclassesSection() {
  const subclasses = useAsyncList<ItemSubclass>(() => listItemSubclasses())
  const classes = useAsyncList<ItemClass>(() => listItemClasses())

  const classById = new Map((classes ?? []).map((c) => [c.id, c]))

  // Composite sort key: class sort_order (zero-padded so it sorts as text),
  // then subclass display_name. Keeps subclasses grouped under their class
  // in the canonical class order (Weapon, Armor, Jewelry, …).
  function classThenName(sc: ItemSubclass): string {
    const cls = classById.get(sc.item_class)
    const order = String(cls?.sort_order ?? 9999).padStart(5, '0')
    return `${order}::${sc.display_name.toLowerCase()}`
  }

  const columns: DataTableColumn<ItemSubclass>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (sc) => (
        <>
          <ItemClassIcon itemClass={sc.item_class} />
          <span className="data-cell-name">{sc.display_name}</span>
        </>
      ),
      sortKey: classThenName,
    },
    {
      id: 'class',
      header: 'Class',
      cell: (sc) => classById.get(sc.item_class)?.display_name ?? sc.item_class,
      sortKey: classThenName,
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Item Subclasses</h2>
        <p>
          The specific shape an item takes within its class — Sword, Helmet,
          Bow, etc. Mirrors WoW's ItemSubClass concept. Click a row for
          details.
        </p>
      </header>
      <DataTable<ItemSubclass>
        rows={subclasses}
        columns={columns}
        rowKey={(sc) => sc.name}
        searchPlaceholder="Search item subclasses…"
        searchKeys={(sc) => [
          sc.display_name,
          sc.name,
          sc.item_class,
          classById.get(sc.item_class)?.display_name ?? '',
          sc.inventory_slot,
        ]}
        emptyText="No item subclasses defined yet."
        defaultSort={{ columnId: 'class', direction: 'asc' }}
        expandedContent={(sc) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{sc.name}</code></dd>
            <dt>Class</dt>
            <dd>{sc.item_class}</dd>
            <dt>Inventory Slot</dt>
            <dd>{sc.inventory_slot}</dd>
            <dt>Stackable</dt>
            <dd>{sc.stackable ? 'Yes' : 'No'}</dd>
          </dl>
        )}
      />
    </section>
  )
}

function InventorySlotsSection() {
  const slots = useAsyncList<InventorySlot>(() => listInventorySlots())
  const subclasses = useAsyncList<ItemSubclass>(() => listItemSubclasses())

  const slotUsage = new Map<string, number>()
  for (const sc of subclasses ?? []) {
    slotUsage.set(sc.inventory_slot, (slotUsage.get(sc.inventory_slot) ?? 0) + 1)
  }

  const columns: DataTableColumn<InventorySlot>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (s) => <span className="data-cell-name">{s.display_name}</span>,
      sortKey: (s) => s.sort_order,
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Inventory Slots</h2>
        <p>
          Where each piece of gear lives on the character. Sorted anatomically
          top-down, with two-handed weapons and the inventory-only bucket at the
          end. Click a row for details.
        </p>
      </header>
      <DataTable<InventorySlot>
        rows={slots}
        columns={columns}
        rowKey={(s) => s.id}
        searchPlaceholder="Search slots…"
        searchKeys={(s) => [s.display_name, s.id, s.body_region, s.description]}
        emptyText="No inventory slots defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(s) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{s.id}</code></dd>
            <dt>Region</dt>
            <dd>{capitalize(s.body_region)}</dd>
            <dt>Subclasses</dt>
            <dd>{slotUsage.get(s.id) ?? 0}</dd>
            <dt>Order</dt>
            <dd>{s.sort_order}</dd>
            {s.description && (
              <>
                <dt>Description</dt>
                <dd>{s.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function formatStation(tag: string): string {
  return tag
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function RecipesSection() {
  const recipes = useAsyncList<Recipe>(() => listRecipes())
  const items = useAsyncList<Item>(() => listItems())

  const itemNameById = new Map((items ?? []).map((i) => [i.id, i.item_name]))
  const nameOf = (id: string) => itemNameById.get(id) ?? id

  function formatCraftTime(seconds: number): string {
    return seconds % 1 === 0
      ? `${seconds.toFixed(0)}s`
      : `${seconds.toFixed(1)}s`
  }

  const columns: DataTableColumn<Recipe>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => <span className="data-cell-name">{r.display_name}</span>,
      sortKey: (r) => r.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Recipes</h2>
        <p>
          Crafting blueprints that turn ingredients into finished items at a
          station. Click a row for details.
        </p>
      </header>
      <DataTable<Recipe>
        rows={recipes}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search recipes…"
        searchKeys={(r) => [
          r.display_name,
          r.id,
          r.description,
          r.skill,
          r.station_tag,
          ...r.outputs.map((o) => nameOf(o.itemId)),
          ...r.ingredients.map((i) => nameOf(i.itemId)),
        ]}
        emptyText="No recipes defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(r) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{r.id}</code></dd>
            <dt>Skill</dt>
            <dd>{formatStation(r.skill)}</dd>
            <dt>Required Level</dt>
            <dd>{r.required_skill_level}</dd>
            <dt>Station</dt>
            <dd>{formatStation(r.station_tag)}</dd>
            <dt>Craft Time</dt>
            <dd>{formatCraftTime(r.craft_time_seconds)}</dd>
            {r.xp_reward > 0 && (
              <>
                <dt>XP Reward</dt>
                <dd>+{r.xp_reward}</dd>
              </>
            )}
            {r.ingredients.length > 0 && (
              <>
                <dt>Ingredients</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {r.ingredients.map((ing, i) => (
                      <li key={i}>
                        {ing.quantity}× {nameOf(ing.itemId)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            {r.outputs.length > 0 && (
              <>
                <dt>Produces</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {r.outputs.map((out, i) => (
                      <li key={i} className="data-expansion-positive">
                        {out.quantity}× {nameOf(out.itemId)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            {r.description && (
              <>
                <dt>Description</dt>
                <dd>{r.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function RaritiesSection() {
  const rarities = useAsyncList<Rarity>(() => listRarities())
  const items = useAsyncList<Item>(() => listItems())

  const rarityUsage = new Map<string, number>()
  for (const i of items ?? []) {
    rarityUsage.set(i.rarity, (rarityUsage.get(i.rarity) ?? 0) + 1)
  }

  const columns: DataTableColumn<Rarity>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => (
        <>
          <span
            className="rarity-swatch"
            style={{ background: r.display_color }}
            aria-hidden="true"
          />
          <span
            className="data-cell-name"
            style={{ color: r.display_color }}
          >
            {r.display_name}
          </span>
        </>
      ),
      sortKey: (r) => r.sort_order,
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Rarities</h2>
        <p>
          The tier ladder loot is colored by. Higher tiers carry more bonuses,
          glow brighter on the ground, and show up much less often. Click a row
          for details.
        </p>
      </header>
      <DataTable<Rarity>
        rows={rarities}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search rarities…"
        searchKeys={(r) => [r.display_name, r.id, r.description]}
        emptyText="No rarities defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(r) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{r.id}</code></dd>
            <dt>Color</dt>
            <dd>
              <code className="data-table-mono">
                {r.display_color.toUpperCase()}
              </code>
            </dd>
            <dt>Tier</dt>
            <dd>{r.sort_order}</dd>
            <dt>Ground Glow</dt>
            <dd>{r.show_ground_glow ? `×${r.ground_glow_brightness}` : 'No'}</dd>
            <dt>Items at this rarity</dt>
            <dd>{rarityUsage.get(r.id) ?? 0}</dd>
            {r.description && (
              <>
                <dt>Description</dt>
                <dd>{r.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function ItemsSection() {
  const items = useAsyncList<Item>(() => listItems())
  const rarities = useAsyncList<Rarity>(() => listRarities())
  const classes = useAsyncList<ItemClass>(() => listItemClasses())
  const subclasses = useAsyncList<ItemSubclass>(() => listItemSubclasses())

  const rarityById = new Map((rarities ?? []).map((r) => [r.id, r]))
  const classById = new Map((classes ?? []).map((c) => [c.id, c]))
  const subclassById = new Map((subclasses ?? []).map((sc) => [sc.name, sc]))

  function classFor(i: Item): ItemClass | undefined {
    const sc = subclassById.get(i.item_subclass)
    return sc ? classById.get(sc.item_class) : undefined
  }

  const columns: DataTableColumn<Item>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (i) => {
        const rarity = rarityById.get(i.rarity)
        return (
          <span
            className="data-cell-name"
            style={{ color: rarity?.display_color ?? 'inherit' }}
          >
            {i.item_name}
          </span>
        )
      },
      sortKey: (i) => i.item_name.toLowerCase(),
    },
    {
      id: 'class',
      header: 'Class',
      cell: (i) => classFor(i)?.display_name ?? '—',
      sortKey: (i) => classFor(i)?.display_name.toLowerCase() ?? '',
    },
    {
      id: 'subclass',
      header: 'Subclass',
      cell: (i) =>
        subclassById.get(i.item_subclass)?.display_name ?? i.item_subclass,
      sortKey: (i) =>
        (subclassById.get(i.item_subclass)?.display_name ?? i.item_subclass)
          .toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Items</h2>
        <p>
          Equipment, tools, currency, and other things you can carry. Color-coded
          by rarity. Click a row for details.
        </p>
      </header>
      <DataTable<Item>
        rows={items}
        columns={columns}
        rowKey={(i) => i.id}
        searchPlaceholder="Search items…"
        searchKeys={(i) => [
          i.item_name,
          i.id,
          i.description,
          subclassById.get(i.item_subclass)?.display_name ?? '',
          rarityById.get(i.rarity)?.display_name ?? '',
        ]}
        emptyText="No items defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(i) => {
          const rarity = rarityById.get(i.rarity)
          const subclass = subclassById.get(i.item_subclass)
          const isWeapon = i.weapon_min_damage != null
          return (
            <dl className="data-expansion">
              <dt>ID</dt>
              <dd><code className="data-table-mono">{i.id}</code></dd>
              <dt>Subclass</dt>
              <dd>{subclass?.display_name ?? i.item_subclass}</dd>
              {subclass?.item_class && (
                <>
                  <dt>Class</dt>
                  <dd>{subclass.item_class}</dd>
                </>
              )}
              <dt>Inventory Slot</dt>
              <dd>{i.inventory_slot}</dd>
              <dt>Rarity</dt>
              <dd>
                <span style={{ color: rarity?.display_color ?? 'inherit' }}>
                  {rarity?.display_name ?? i.rarity}
                </span>
              </dd>
              {isWeapon && (
                <>
                  <dt>Damage</dt>
                  <dd>
                    {i.weapon_min_damage}–{i.weapon_max_damage}
                  </dd>
                </>
              )}
              {isWeapon && i.weapon_speed != null && (
                <>
                  <dt>Speed</dt>
                  <dd>{i.weapon_speed}s</dd>
                </>
              )}
              {i.weight > 0 && (
                <>
                  <dt>Weight</dt>
                  <dd>{i.weight}</dd>
                </>
              )}
              {i.required_skill_level > 0 && (
                <>
                  <dt>Required Level</dt>
                  <dd>{i.required_skill_level}</dd>
                </>
              )}
              {i.is_stackable && i.max_stack_size > 1 && (
                <>
                  <dt>Max Stack</dt>
                  <dd>{i.max_stack_size.toLocaleString()}</dd>
                </>
              )}
              <dt>Craftable</dt>
              <dd>{i.is_craftable ? 'Yes' : 'No'}</dd>
              {i.description && (
                <>
                  <dt>Description</dt>
                  <dd>{i.description}</dd>
                </>
              )}
              {i.ability_bonuses.length > 0 && (
                <>
                  <dt>Bonuses</dt>
                  <dd>
                    <ul className="data-expansion-list">
                      {i.ability_bonuses.map((b, idx) => (
                        <li
                          key={idx}
                          className={
                            b.value > 0
                              ? 'data-expansion-positive'
                              : b.value < 0
                                ? 'data-expansion-negative'
                                : ''
                          }
                        >
                          {b.description}
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
    </section>
  )
}

function ActionsSection() {
  const actions = useAsyncList<Action>(() => listActions())

  const columns: DataTableColumn<Action>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (a) => <span className="data-cell-name">{a.ability_name}</span>,
      sortKey: (a) => a.ability_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Actions</h2>
        <p>
          Physical things characters do with weapons — strikes, blocks, shoves,
          technique-based moves. Damage comes from the equipped weapon. Click a
          row for details.
        </p>
      </header>
      <DataTable<Action>
        rows={actions}
        columns={columns}
        rowKey={(a) => a.asset_name}
        searchPlaceholder="Search actions…"
        searchKeys={(a) => [
          a.ability_name,
          a.asset_name,
          a.description,
          a.type,
          a.targeting,
        ]}
        emptyText="No actions defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(a) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{a.asset_name}</code></dd>
            <dt>Type</dt>
            <dd>{a.type}</dd>
            <dt>Targeting</dt>
            <dd>{a.targeting}</dd>
            {a.resource_cost > 0 && (
              <>
                <dt>Cost</dt>
                <dd>
                  {a.resource_cost} {a.resource_type}
                </dd>
              </>
            )}
            <dt>Cast Time</dt>
            <dd>{a.cast_time > 0 ? `${a.cast_time}s` : 'Instant'}</dd>
            {a.cooldown > 0 && (
              <>
                <dt>Cooldown</dt>
                <dd>{a.cooldown}s</dd>
              </>
            )}
            {a.range > 0 && (
              <>
                <dt>Range</dt>
                <dd>{a.range}m</dd>
              </>
            )}
            {a.required_weapon_types.length > 0 && (
              <>
                <dt>Required Weapons</dt>
                <dd>{a.required_weapon_types.join(', ')}</dd>
              </>
            )}
            {a.description && (
              <>
                <dt>Description</dt>
                <dd>{a.description}</dd>
              </>
            )}
            {a.effects.length > 0 && (
              <>
                <dt>Effects</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {a.effects
                      .filter(
                        (eff) =>
                          typeof eff.description === 'string' && eff.description,
                      )
                      .map((eff, i) => (
                        <li key={i}>
                          <div>{eff.description}</div>
                          <EffectMeta effect={eff} />
                        </li>
                      ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function SpellsSection() {
  const spells = useAsyncList<Spell>(() => listSpells())

  const columns: DataTableColumn<Spell>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (s) => <span className="data-cell-name">{s.ability_name}</span>,
      sortKey: (s) => s.ability_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Spells</h2>
        <p>
          Magical effects — fire, frost, healing, summons, wards. Damage and
          school are intrinsic to the spell. Click a row for details.
        </p>
      </header>
      <DataTable<Spell>
        rows={spells}
        columns={columns}
        rowKey={(s) => s.asset_name}
        searchPlaceholder="Search spells…"
        searchKeys={(s) => [
          s.ability_name,
          s.asset_name,
          s.description,
          s.damage_school ?? '',
        ]}
        emptyText="No spells defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(s) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{s.asset_name}</code></dd>
            {s.damage_school && (
              <>
                <dt>School</dt>
                <dd>{s.damage_school}</dd>
              </>
            )}
            {s.damage > 0 && (
              <>
                <dt>Damage</dt>
                <dd>
                  {s.damage}
                  {s.is_heal ? ' (heal)' : ''}
                </dd>
              </>
            )}
            {s.resource_cost > 0 && (
              <>
                <dt>Cost</dt>
                <dd>
                  {s.resource_cost} {s.resource_type}
                </dd>
              </>
            )}
            <dt>Cast Time</dt>
            <dd>{s.cast_time > 0 ? `${s.cast_time}s` : 'Instant'}</dd>
            {s.cooldown > 0 && (
              <>
                <dt>Cooldown</dt>
                <dd>{s.cooldown}s</dd>
              </>
            )}
            {s.range > 0 && (
              <>
                <dt>Range</dt>
                <dd>{s.range}m</dd>
              </>
            )}
            <dt>Targeting</dt>
            <dd>{s.targeting}</dd>
            {s.splash_radius != null && s.splash_radius > 0 && (
              <>
                <dt>Splash Radius</dt>
                <dd>{s.splash_radius}m</dd>
              </>
            )}
            {s.description && (
              <>
                <dt>Description</dt>
                <dd>{s.description}</dd>
              </>
            )}
            {s.effects.length > 0 && (
              <>
                <dt>Effects</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {s.effects
                      .filter(
                        (eff) =>
                          typeof eff.description === 'string' && eff.description,
                      )
                      .map((eff, i) => (
                        <li key={i}>
                          <div>{eff.description}</div>
                          <EffectMeta effect={eff} />
                        </li>
                      ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function AbilitiesSection() {
  const abilities = useAsyncList<Ability>(() => listAbilities())

  const columns: DataTableColumn<Ability>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (a) => (
        <>
          <AbilityIcon name={a.name} />
          <span className="data-cell-name">{a.display_name}</span>
        </>
      ),
      sortKey: (a) => a.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Abilities</h2>
        <p>
          The six core ability scores every character carries. Each one drives
          different rolls, resources, and damage scaling. Click a row for
          details.
        </p>
      </header>
      <DataTable<Ability>
        rows={abilities}
        columns={columns}
        rowKey={(a) => a.name}
        searchPlaceholder="Search abilities…"
        searchKeys={(a) => [a.display_name, a.name, a.category, a.description]}
        emptyText="No abilities defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(a) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd>
              <code className="data-table-mono">{a.name}</code>
            </dd>
            {a.category && (
              <>
                <dt>Category</dt>
                <dd>{a.category}</dd>
              </>
            )}
            {a.description && (
              <>
                <dt>Description</dt>
                <dd>{a.description}</dd>
              </>
            )}
            {a.derived_effects.length > 0 && (
              <>
                <dt>Derived Effects</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {a.derived_effects.map((eff, i) => (
                      <li key={i}>{eff.description}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function AlignmentsSection() {
  const alignments = useAsyncList<Alignment>(() => listAlignments())

  const columns: DataTableColumn<Alignment>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (a) => (
        <>
          <AlignmentIcon id={a.id} />
          <span className="data-cell-name">{a.display_name}</span>
        </>
      ),
      sortKey: (a) => a.sort_order,
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Alignments</h2>
        <p>
          Ideological axes characters drift along over time. Alignment is set by
          gameplay actions — moral choices, kills, faction reputations — not
          chosen at creation. Click a row for details.
        </p>
      </header>
      <DataTable<Alignment>
        rows={alignments}
        columns={columns}
        rowKey={(a) => a.id}
        searchPlaceholder="Search alignments…"
        searchKeys={(a) => [a.display_name, a.id, a.description]}
        emptyText="No alignments defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(a) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{a.id}</code></dd>
            <dt>Order</dt>
            <dd>{a.sort_order}</dd>
            {a.description && (
              <>
                <dt>Description</dt>
                <dd>{a.description}</dd>
              </>
            )}
            {a.gameplay_rules.length > 0 && (
              <>
                <dt>Gameplay Rules</dt>
                <dd>
                  <ul className="data-expansion-list">
                    {a.gameplay_rules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function FactionsSection() {
  const factions = useAsyncList<Faction>(() => listFactions())

  const columns: DataTableColumn<Faction>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (f) => (
        <>
          <FactionIcon id={f.id} />
          <span className="data-cell-name">{f.display_name}</span>
        </>
      ),
      sortKey: (f) => f.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Factions</h2>
        <p>
          In-game factions and reputation. Inter-faction stances live in
          necro_content.faction_hostility. Click a row for details.
        </p>
      </header>
      <DataTable<Faction>
        rows={factions}
        columns={columns}
        rowKey={(f) => f.id}
        searchPlaceholder="Search factions…"
        searchKeys={(f) => [
          f.display_name,
          f.id,
          f.description,
          f.starting_standing,
        ]}
        emptyText="No factions defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(f) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{f.id}</code></dd>
            <dt>Player Faction</dt>
            <dd>{f.is_player_faction ? 'Yes' : 'No'}</dd>
            <dt>Starting Standing</dt>
            <dd>{f.starting_standing}</dd>
            {f.parent_id && (
              <>
                <dt>Parent</dt>
                <dd><code className="data-table-mono">{f.parent_id}</code></dd>
              </>
            )}
            {f.description && (
              <>
                <dt>Description</dt>
                <dd>{f.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function ZonesSection() {
  const zones = useAsyncList<Zone>(() => listZones())

  function zoneFlags(z: Zone): string {
    const flags: string[] = []
    if (z.is_starting_zone) flags.push('Starting')
    if (z.is_pvp_zone) flags.push('PvP')
    if (z.is_sanctuary) flags.push('Sanctuary')
    return flags.length > 0 ? flags.join(', ') : 'None'
  }

  const columns: DataTableColumn<Zone>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (z) => <span className="data-cell-name">{z.display_name}</span>,
      sortKey: (z) => z.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Zones</h2>
        <p>
          Zones and sub-zones. Sub-zones live in necro_content.sub_zones. Click
          a row for details.
        </p>
      </header>
      <DataTable<Zone>
        rows={zones}
        columns={columns}
        rowKey={(z) => z.id}
        searchPlaceholder="Search zones…"
        searchKeys={(z) => [
          z.display_name,
          z.id,
          z.description,
          z.controlling_faction_id ?? '',
        ]}
        emptyText="No zones defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(z) => (
          <dl className="data-expansion">
            <dt>ID</dt>
            <dd><code className="data-table-mono">{z.id}</code></dd>
            <dt>Level Range</dt>
            <dd>
              {z.max_level !== z.min_level
                ? `${z.min_level}–${z.max_level}`
                : `${z.min_level}`}
            </dd>
            <dt>Controlling Faction</dt>
            <dd>
              {z.controlling_faction_id ? (
                <code className="data-table-mono">
                  {z.controlling_faction_id}
                </code>
              ) : (
                '—'
              )}
            </dd>
            <dt>Flags</dt>
            <dd>{zoneFlags(z)}</dd>
            {z.description && (
              <>
                <dt>Description</dt>
                <dd>{z.description}</dd>
              </>
            )}
          </dl>
        )}
      />
    </section>
  )
}

function GuildsSection() {
  const guilds = useAsyncList<PublicGuild>(() => listPublicGuilds())
  const { gameId } = useParams<{ gameId: string }>()

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
  })

  const columns: DataTableColumn<PublicGuild>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (g) => g.name,
      sortKey: (g) => g.name.toLowerCase(),
    },
    {
      id: 'level',
      header: 'Level',
      cell: (g) => g.level,
      align: 'right',
      sortKey: (g) => g.level,
    },
    {
      id: 'members',
      header: 'Members',
      cell: (g) => g.member_count,
      align: 'right',
      sortKey: (g) => g.member_count,
    },
    {
      id: 'realm',
      header: 'Realm',
      cell: (g) => g.realm_name ?? '—',
      sortKey: (g) => (g.realm_name ?? '').toLowerCase(),
    },
    {
      id: 'created',
      header: 'Founded',
      cell: (g) => {
        const d = new Date(g.created_at)
        const tip = isNaN(d.getTime()) ? g.created_at : dateFormatter.format(d)
        return <span title={tip}>{formatRelativeShort(g.created_at)} ago</span>
      },
      sortKey: (g) => new Date(g.created_at).getTime(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Guilds</h2>
        <p>Public directory of guilds across all realms.</p>
      </header>
      <DataTable<PublicGuild>
        rows={guilds}
        columns={columns}
        rowKey={(g) => g.guild_id}
        rowHref={(g) => `/g/${gameId ?? 'necro'}/guilds/${g.guild_id}`}
        rowAriaLabel={(g) => `View ${g.name}`}
        searchPlaceholder="Search guilds…"
        searchKeys={(g) => [g.name, g.motd, g.info, g.realm_name ?? '']}
        emptyText="No guilds yet."
        defaultSort={{ columnId: 'members', direction: 'desc' }}
      />
    </section>
  )
}

type RankedCharacter = PublicCharacter & { rank: number }

function LeaderboardSection() {
  const { gameId } = useParams<{ gameId: string }>()
  const characters = useAsyncList<PublicCharacter>(() => listPublicCharacters())
  const realms = useAsyncList<Realm>(() => listRealms())
  const realmNameById = new Map((realms ?? []).map((r) => [r.id, r.display_name]))

  // Rank is precomputed off the level-desc ordering so the position number
  // stays attached to the character even if the user re-sorts the table.
  const ranked: RankedCharacter[] | null =
    characters == null
      ? null
      : [...characters]
          .sort(
            (a, b) =>
              b.level - a.level ||
              a.character_name.localeCompare(b.character_name),
          )
          .map((c, i) => ({ ...c, rank: i + 1 }))

  const columns: DataTableColumn<RankedCharacter>[] = [
    {
      id: 'rank',
      header: 'Rank',
      cell: (c) => `#${c.rank}`,
      align: 'right',
      sortKey: (c) => c.rank,
    },
    {
      id: 'name',
      header: 'Name',
      cell: (c) => (
        <>
          <RaceIcon id={c.race} />
          <span className="data-cell-name">{c.character_name}</span>
        </>
      ),
      sortKey: (c) => c.character_name.toLowerCase(),
    },
    {
      id: 'level',
      header: 'Level',
      cell: (c) => c.level,
      align: 'right',
      sortKey: (c) => c.level,
    },
    {
      id: 'race',
      header: 'Race',
      cell: (c) => capitalize(c.race),
      sortKey: (c) => c.race,
    },
    {
      id: 'realm',
      header: 'Realm',
      cell: (c) => realmNameById.get(c.realm_id) ?? '—',
      sortKey: (c) => (realmNameById.get(c.realm_id) ?? '').toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Leaderboard</h2>
        <p>Top characters across all realms, ranked by level.</p>
      </header>
      <DataTable<RankedCharacter>
        rows={ranked}
        columns={columns}
        rowKey={(c) => c.id}
        rowHref={(c) => `/g/${gameId ?? 'necro'}/characters/${c.id}`}
        rowAriaLabel={(c) => `View ${c.character_name}`}
        searchPlaceholder="Search players…"
        searchKeys={(c) => [
          c.character_name,
          c.race,
          realmNameById.get(c.realm_id) ?? '',
        ]}
        emptyText="No characters yet."
        defaultSort={{ columnId: 'rank', direction: 'asc' }}
      />
    </section>
  )
}

function CharactersSection() {
  const { gameId } = useParams<{ gameId: string }>()
  const characters = useAsyncList<PublicCharacter>(() => listPublicCharacters())
  const realms = useAsyncList<Realm>(() => listRealms())
  const realmNameById = new Map((realms ?? []).map((r) => [r.id, r.display_name]))

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const columns: DataTableColumn<PublicCharacter>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (c) => (
        <>
          <RaceIcon id={c.race} />
          <span className="data-cell-name">{c.character_name}</span>
        </>
      ),
      sortKey: (c) => c.character_name.toLowerCase(),
    },
    {
      id: 'level',
      header: 'Level',
      cell: (c) => c.level,
      align: 'right',
      sortKey: (c) => c.level,
    },
    {
      id: 'race',
      header: 'Race',
      cell: (c) => capitalize(c.race),
      sortKey: (c) => c.race,
    },
    {
      id: 'realm',
      header: 'Realm',
      cell: (c) => realmNameById.get(c.realm_id) ?? '—',
      sortKey: (c) => (realmNameById.get(c.realm_id) ?? '').toLowerCase(),
    },
    {
      id: 'created',
      header: 'Created',
      cell: (c) => {
        const d = new Date(c.created_at)
        const tip = isNaN(d.getTime()) ? c.created_at : dateFormatter.format(d)
        return <span title={tip}>{formatRelativeShort(c.created_at)} ago</span>
      },
      sortKey: (c) => new Date(c.created_at).getTime(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Characters</h2>
        <p>Player characters across all realms.</p>
      </header>
      <DataTable<PublicCharacter>
        rows={characters}
        columns={columns}
        rowKey={(c) => c.id}
        rowHref={(c) => `/g/${gameId ?? 'necro'}/characters/${c.id}`}
        rowAriaLabel={(c) => `View ${c.character_name}`}
        searchPlaceholder="Search characters…"
        searchKeys={(c) => [
          c.character_name,
          c.race,
          realmNameById.get(c.realm_id) ?? '',
        ]}
        emptyText="No characters yet."
        defaultSort={{ columnId: 'created', direction: 'desc' }}
      />
    </section>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

function RealmsSection() {
  const realms = useAsyncList<Realm>(() => listRealms())
  const stats = useAsyncList<RealmStats>(() => getRealmStats())

  const statsById = new Map((stats ?? []).map((s) => [s.realm_id, s]))

  const columns: DataTableColumn<Realm>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (r) => <span className="data-cell-name">{r.display_name}</span>,
      sortKey: (r) => r.display_name.toLowerCase(),
    },
  ]

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Realms</h2>
        <p>
          Logical shards players choose between. Characters are realm-bound —
          name uniqueness, guilds, and mail all scope to a realm. Click a row
          for details.
        </p>
      </header>
      <DataTable<Realm>
        rows={realms}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search realms…"
        searchKeys={(r) => [
          r.display_name,
          r.short_name,
          r.region,
          r.realm_type,
          r.locale,
          r.timezone,
          r.population,
        ]}
        emptyText="No realms defined yet."
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        expandedContent={(r) => {
          const s = statsById.get(r.id)
          return (
            <dl className="data-expansion">
              <dt>Short Name</dt>
              <dd><code className="data-table-mono">{r.short_name}</code></dd>
              <dt>Region</dt>
              <dd>{r.region}</dd>
              <dt>Type</dt>
              <dd>{r.realm_type}</dd>
              <dt>Status</dt>
              <dd>{r.is_online ? 'Online' : 'Offline'}</dd>
              <dt>Population</dt>
              <dd>{r.population}</dd>
              <dt>Total Characters</dt>
              <dd>{(s?.total_characters ?? 0).toLocaleString()}</dd>
              <dt>Online Characters</dt>
              <dd>{(s?.online_characters ?? 0).toLocaleString()}</dd>
              <dt>Locale</dt>
              <dd>{r.locale}</dd>
              <dt>Timezone</dt>
              <dd>{r.timezone}</dd>
              {r.connected_to_id && (
                <>
                  <dt>Connected To</dt>
                  <dd><code className="data-table-mono">{r.connected_to_id}</code></dd>
                </>
              )}
            </dl>
          )
        }}
      />
    </section>
  )
}
