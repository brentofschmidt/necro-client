import { ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchGameById, Game, GameStatus } from '../lib/games'
import { formatRelativeShort } from '../lib/time'
import {
  Ability,
  Action,
  Alignment,
  DamageType,
  Faction,
  getRealmStats,
  Item,
  ItemType,
  listAbilities,
  listActions,
  listAlignments,
  listDamageTypes,
  listFactions,
  listItems,
  listItemTypes,
  listPublicCharacters,
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

type SectionId = 'game' | 'characters' | 'guilds' | 'leaderboards' | 'patch-notes'

type GameInfoTabId =
  | 'overview'
  | 'items'
  | 'item_types'
  | 'rarities'
  | 'recipes'
  | 'abilities'
  | 'resources'
  | 'stats'
  | 'actions'
  | 'spells'
  | 'damage_types'
  | 'skills'
  | 'races'
  | 'alignments'
  | 'factions'
  | 'zones'
  | 'realms'

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'game', label: 'Game Information' },
  { id: 'characters', label: 'Characters' },
  { id: 'guilds', label: 'Guilds' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'patch-notes', label: 'Patch Notes' },
]

const GAME_INFO_TABS: { id: GameInfoTabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'items', label: 'Items' },
  { id: 'item_types', label: 'Item Types' },
  { id: 'rarities', label: 'Rarities' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'resources', label: 'Resources' },
  { id: 'stats', label: 'Stats' },
  { id: 'actions', label: 'Actions' },
  { id: 'spells', label: 'Spells' },
  { id: 'damage_types', label: 'Damage Types' },
  { id: 'skills', label: 'Skills' },
  { id: 'races', label: 'Races' },
  { id: 'alignments', label: 'Alignments' },
  { id: 'factions', label: 'Factions' },
  { id: 'zones', label: 'Zones' },
  { id: 'realms', label: 'Realms' },
]

const DEFAULT_SECTION: SectionId = 'game'
const DEFAULT_GAME_INFO_TAB: GameInfoTabId = 'overview'

function isSectionId(value: string | null | undefined): value is SectionId {
  return SECTIONS.some((s) => s.id === value)
}

function isGameInfoTabId(value: string | null | undefined): value is GameInfoTabId {
  return GAME_INFO_TABS.some((t) => t.id === value)
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

const TAB_ICONS: Record<GameInfoTabId, ReactNode> = {
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
  item_types: (
    <TabIcon>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
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

  // Remember the last game-info sub-tab the user looked at so switching
  // away to e.g. Characters and back to Game Information lands them on the
  // same sub-tab they had open, not the default Overview.
  const [lastGameInfoTab, setLastGameInfoTab] =
    useState<GameInfoTabId>(DEFAULT_GAME_INFO_TAB)

  useEffect(() => {
    if (paramSection === 'game' && paramTab && isGameInfoTabId(paramTab)) {
      setLastGameInfoTab(paramTab)
    }
  }, [paramSection, paramTab])

  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Tabs are page-scrolling now (no inner scroll container) — bring the
    // user back to the top of the new section / sub-tab instead of leaving
    // them wherever they last scrolled.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [activeSection, activeGameInfoTab])

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
  // (e.g. /g/necro → /g/necro/game/overview, /g/necro/game → same,
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
    if (paramSection !== 'game' && paramTab) {
      navigate(`/g/${gameId}/${paramSection}`, { replace: true })
    }
  }, [gameId, paramSection, paramTab, navigate])

  function setSection(id: SectionId) {
    if (!gameId) return
    if (id === 'game') {
      navigate(`/g/${gameId}/game/${lastGameInfoTab}`, { replace: true })
    } else {
      navigate(`/g/${gameId}/${id}`, { replace: true })
    }
  }

  function setGameInfoTab(id: GameInfoTabId) {
    if (!gameId) return
    navigate(`/g/${gameId}/game/${id}`, { replace: true })
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
    case 'items':
      gameInfoContent = <ItemsSection />
      break
    case 'item_types':
      gameInfoContent = <ItemTypesSection />
      break
    case 'rarities':
      gameInfoContent = <RaritiesSection />
      break
    case 'recipes':
      gameInfoContent = <RecipesSection />
      break
    case 'abilities':
      gameInfoContent = <AbilitiesSection />
      break
    case 'resources':
      gameInfoContent = <ResourcesSection />
      break
    case 'stats':
      gameInfoContent = <StatsSection />
      break
    case 'actions':
      gameInfoContent = <ActionsSection />
      break
    case 'spells':
      gameInfoContent = <SpellsSection />
      break
    case 'damage_types':
      gameInfoContent = <DamageTypesSection />
      break
    case 'skills':
      gameInfoContent = <SkillsSection />
      break
    case 'races':
      gameInfoContent = <RacesSection />
      break
    case 'alignments':
      gameInfoContent = <AlignmentsSection />
      break
    case 'factions':
      gameInfoContent = <FactionsSection />
      break
    case 'zones':
      gameInfoContent = <ZonesSection />
      break
    case 'realms':
      gameInfoContent = <RealmsSection />
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
    case 'characters':
      sectionContent = <CharactersSection />
      break
    case 'guilds':
      sectionContent = (
        <ComingSoonSection
          title="Guilds"
          description="Public guild directory — rosters, ranks, and recruitment status."
        />
      )
      break
    case 'leaderboards':
      sectionContent = (
        <ComingSoonSection
          title="Leaderboards"
          description="Top players by level, achievements, PvP rating, and more."
        />
      )
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

function ContentSection({
  title,
  description,
  items,
  emptyText,
  headerExtra,
  children,
}: {
  title: string
  description: string
  items: unknown[] | null
  emptyText: string
  headerExtra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {headerExtra}
      {items === null ? (
        <p className="text-dim">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-dim">{emptyText}</p>
      ) : (
        <div className="content-card-grid">{children}</div>
      )}
    </section>
  )
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
  const physical = types?.filter((t) => t.is_physical) ?? []
  const magical = types?.filter((t) => !t.is_physical) ?? []

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Damage Types</h2>
        <p>
          Damage classifications used by abilities, weapons, and resistances.
          Physical types map to weapon damage; magical covers elemental and arcane.
        </p>
      </header>

      {types === null ? (
        <p className="text-dim">Loading…</p>
      ) : types.length === 0 ? (
        <p className="text-dim">No damage types defined yet.</p>
      ) : (
        <>
          {physical.length > 0 && (
            <DamageTypeGroup title="Physical" types={physical} />
          )}
          {magical.length > 0 && (
            <DamageTypeGroup title="Magical" types={magical} />
          )}
        </>
      )}
    </section>
  )
}

function DamageTypeGroup({ title, types }: { title: string; types: DamageType[] }) {
  return (
    <div className="content-subgroup">
      <h3 className="content-subgroup-heading">{title}</h3>
      <div className="content-card-grid">
        {types.map((dt) => (
          <article key={dt.id} className="content-card">
            <header className="content-card-header">
              <h3 className="content-card-title">
                <DamageTypeIcon id={dt.id} color={dt.display_color} />
                {dt.display_name}
              </h3>
              <span className="content-card-id">{dt.id}</span>
            </header>
            {dt.description && <p className="content-card-body">{dt.description}</p>}
          </article>
        ))}
      </div>
    </div>
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
  const skills = useAsyncList<Skill>(() => listSkills())
  const proficiencies = skills?.filter((s) => s.category === 'Proficiency') ?? []
  const activities = skills?.filter((s) => s.category === 'Activity') ?? []

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Skills</h2>
        <p>
          Player skills and proficiencies — combat profs gate weapon use; activities
          cover gathering, crafting, and trade.
        </p>
      </header>

      {skills === null ? (
        <p className="text-dim">Loading…</p>
      ) : skills.length === 0 ? (
        <p className="text-dim">No skills defined yet.</p>
      ) : (
        <>
          {proficiencies.length > 0 && (
            <SkillGroup title="Proficiencies" skills={proficiencies} />
          )}
          {activities.length > 0 && (
            <SkillGroup title="Activities" skills={activities} />
          )}
        </>
      )}
    </section>
  )
}

function SkillGroup({ title, skills }: { title: string; skills: Skill[] }) {
  return (
    <div className="content-subgroup">
      <h3 className="content-subgroup-heading">{title}</h3>
      <div className="content-card-grid">
        {skills.map((s) => (
          <article key={s.name} className="content-card">
            <header className="content-card-header">
              <h3 className="content-card-title">
                <SkillIcon name={s.name} category={s.category} />
                {s.display_name}
              </h3>
              <span className="content-card-id">{s.name}</span>
            </header>
            {s.description && <p className="content-card-body">{s.description}</p>}
            {s.per_level_effects.length > 0 && (
              <ul className="content-card-rules">
                {s.per_level_effects.map((eff, i) => (
                  <li key={i}>{eff.description}</li>
                ))}
              </ul>
            )}
            <div className="content-card-meta">
              <span className="tag-muted">Max lv {s.max_level}</span>
              {s.item_types.map((t) => (
                <span key={t} className="tag-muted">
                  {t}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
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

function BonusList({
  title,
  entries,
}: {
  title: string
  entries: { value: number; description: string }[]
}) {
  return (
    <div className="content-card-bonus-group">
      <div className="content-card-bonus-heading">{title}</div>
      <ul className="content-card-bonuses">
        {entries.map((b, i) => (
          <li
            key={i}
            className={
              b.value > 0
                ? 'content-card-bonus-positive'
                : b.value < 0
                  ? 'content-card-bonus-negative'
                  : ''
            }
          >
            {b.description}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RacesSection() {
  const races = useAsyncList<Race>(() => listRaces())
  return (
    <ContentSection
      title="Races"
      description="Playable races and their lore. Stats and starting abilities live in necro_content.races."
      items={races}
      emptyText="No races defined yet."
    >
      {races?.map((r) => (
        <article key={r.id} className="content-card">
          <header className="content-card-header">
            <h3 className="content-card-title">
              <RaceIcon id={r.id} />
              {r.display_name}
            </h3>
            <span className="content-card-id">{r.id}</span>
          </header>
          {r.description && <p className="content-card-body">{r.description}</p>}
          {r.ability_bonuses.length > 0 && (
            <BonusList title="Abilities" entries={r.ability_bonuses} />
          )}
        </article>
      ))}
    </ContentSection>
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

const STAT_CATEGORY_ORDER: StatCategory[] = [
  'Power',
  'Crit',
  'Speed',
  'Defense',
  'Precision',
  'Sustain',
  'Mastery',
  'Gathering',
]

function StatsSection() {
  const stats = useAsyncList<Stat>(() => listStats())

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Stats</h2>
        <p>
          Derived combat stats — attack power, crit, haste, armor, and the rest. Most
          values come from gear and buffs rather than character creation.
        </p>
      </header>

      {stats === null ? (
        <p className="text-dim">Loading…</p>
      ) : stats.length === 0 ? (
        <p className="text-dim">No stats defined yet.</p>
      ) : (
        <>
          {STAT_CATEGORY_ORDER.map((cat) => {
            const group = stats.filter((s) => s.category === cat)
            if (group.length === 0) return null
            return <StatGroup key={cat} title={cat} stats={group} />
          })}
        </>
      )}
    </section>
  )
}

function StatGroup({ title, stats }: { title: StatCategory; stats: Stat[] }) {
  return (
    <div className="content-subgroup">
      <h3 className="content-subgroup-heading">{title}</h3>
      <div className="content-card-grid">
        {stats.map((s) => (
          <article key={s.id} className="content-card">
            <header className="content-card-header">
              <h3 className="content-card-title">
                <StatIcon category={s.category} />
                {s.display_name}
              </h3>
              <span className="content-card-id">{s.is_percent ? '%' : '#'}</span>
            </header>
            {s.description && <p className="content-card-body">{s.description}</p>}
            {s.conversion_per_point && (
              <p className="content-card-metric">{s.conversion_per_point}</p>
            )}
            {s.affects && (
              <div className="content-card-meta">
                <span className="tag-muted">{s.affects}</span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
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
  return (
    <ContentSection
      title="Resources"
      description="Pools every character carries — health, mana, and stamina. Catalog values define defaults; each character's current and max values live on necro_player.character_resources."
      items={resources}
      emptyText="No resources defined yet."
    >
      {resources?.map((r) => (
        <article key={r.id} className="content-card">
          <header className="content-card-header">
            <h3 className="content-card-title">
              <ResourceIcon id={r.id} color={r.display_color} />
              {r.display_name}
            </h3>
            <span className="content-card-id">{r.id}</span>
          </header>
          {r.description && <p className="content-card-body">{r.description}</p>}
        </article>
      ))}
    </ContentSection>
  )
}

function formatSeconds(value: number): string {
  if (value === 0) return 'Instant'
  if (value < 1) return `${(value * 1000).toFixed(0)}ms`
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}s`
}

function ActiveEffectCard({
  effect,
  variant,
}: {
  effect: Action | Spell
  variant: 'action' | 'spell'
}) {
  const damage = 'damage' in effect ? effect.damage : 0
  const damageSchool = 'damage_school' in effect ? effect.damage_school : null
  const splashRadius = 'splash_radius' in effect ? effect.splash_radius : null

  const isHeal = effect.is_heal
  const damageLabel = isHeal
    ? `Heals ${damage}`
    : damage > 0
      ? `${damage} damage`
      : null

  return (
    <article className="content-card">
      <header className="content-card-header">
        <h3 className="content-card-title">
          <span
            className={`active-effect-mark active-effect-mark-${variant}`}
            aria-hidden="true"
          />
          {effect.ability_name}
        </h3>
        <span className="content-card-id">{effect.asset_name}</span>
      </header>
      {effect.description && <p className="content-card-body">{effect.description}</p>}
      {effect.effects.length > 0 && (
        <ul className="content-card-rules">
          {effect.effects
            .filter((eff) => typeof eff.description === 'string' && eff.description)
            .map((eff, i) => (
              <li key={i}>{eff.description}</li>
            ))}
        </ul>
      )}

      <div className="content-card-stats">
        {damageLabel && (
          <span className={isHeal ? 'stat-pill stat-pill-heal' : 'stat-pill'}>
            {damageLabel}
          </span>
        )}
        {damageSchool && (
          <span className="stat-pill stat-pill-muted">{damageSchool}</span>
        )}
        {effect.cast_time > 0 && (
          <span className="stat-pill stat-pill-muted">
            Cast {formatSeconds(effect.cast_time)}
          </span>
        )}
        {effect.global_cooldown > 0 && effect.cast_time === 0 && (
          <span className="stat-pill stat-pill-muted">
            GCD {formatSeconds(effect.global_cooldown)}
          </span>
        )}
        {effect.cooldown > 0 && (
          <span className="stat-pill stat-pill-muted">
            CD {formatSeconds(effect.cooldown)}
          </span>
        )}
        {effect.resource_cost > 0 && (
          <span className="stat-pill stat-pill-muted">
            {effect.resource_cost} {effect.resource_type.toLowerCase()}
          </span>
        )}
        {effect.range > 0 && (
          <span className="stat-pill stat-pill-muted">{effect.range}m range</span>
        )}
      </div>

      <div className="content-card-meta">
        <span className="tag-muted">{effect.targeting}</span>
        {splashRadius != null && splashRadius > 0 && (
          <span className="tag-muted">AoE {splashRadius}m</span>
        )}
        {effect.required_weapon_types.map((w) => (
          <span key={w} className="tag-muted">
            {w}
          </span>
        ))}
        {isHeal && <span className="tag">Heal</span>}
      </div>
    </article>
  )
}

const ITEM_GROUP_ICONS: Record<string, ReactNode> = {
  Weapon: (
    <>
      <path d="M5 19L19 5" />
      <path d="M16 5h4v4" />
      <path d="M3 21l4-4" />
    </>
  ),
  Armor: (
    <>
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
    </>
  ),
  Jewelry: (
    <>
      <path d="M12 4l4 5-4 11-4-11z" />
      <path d="M8 9h8" />
    </>
  ),
  Tool: (
    <>
      <path d="M14 4l6 6-3 3-6-6z" />
      <path d="M11 7L4 14l3 3 7-7" />
      <path d="M4 14l-1 4 4-1" />
    </>
  ),
  Consumable: (
    <>
      <path d="M9 3h6v3l3 5v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8l3-5z" />
      <path d="M6 14h12" />
    </>
  ),
  Material: (
    <>
      <path d="M5 8l7-4 7 4-7 4z" />
      <path d="M5 8v8l7 4" />
      <path d="M19 8v8l-7 4" />
    </>
  ),
  Container: (
    <>
      <path d="M5 8h14l-1 12H6z" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3" />
    </>
  ),
  Currency: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10c0-1.5 1.3-2 3-2s3 .5 3 2-1 1.8-3 2-3 .5-3 2 1.3 2 3 2 3-.5 3-2" />
      <path d="M12 5v2" />
      <path d="M12 17v2" />
    </>
  ),
}

const ITEM_GROUP_ORDER = [
  'Weapon',
  'Armor',
  'Jewelry',
  'Tool',
  'Consumable',
  'Material',
  'Container',
  'Currency',
]

function ItemGroupIcon({ group }: { group: string }) {
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
      {ITEM_GROUP_ICONS[group] ?? <circle cx="12" cy="12" r="6" />}
    </svg>
  )
}

function ItemTypesSection() {
  const types = useAsyncList<ItemType>(() => listItemTypes())

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Item Types</h2>
        <p>
          The catalog of item shapes the game knows about — what slot they equip
          to, whether they stack, and which group the inventory UI files them under.
        </p>
      </header>

      {types === null ? (
        <p className="text-dim">Loading…</p>
      ) : types.length === 0 ? (
        <p className="text-dim">No item types defined yet.</p>
      ) : (
        <>
          {ITEM_GROUP_ORDER.map((group) => {
            const groupTypes = types.filter((t) => t.group === group)
            if (groupTypes.length === 0) return null
            return (
              <div key={group} className="content-subgroup">
                <h3 className="content-subgroup-heading">{group}</h3>
                <div className="content-card-grid">
                  {groupTypes.map((t) => (
                    <article key={t.name} className="content-card">
                      <header className="content-card-header">
                        <h3 className="content-card-title">
                          <ItemGroupIcon group={group} />
                          {t.display_name}
                        </h3>
                        <span className="content-card-id">{t.name}</span>
                      </header>
                      <div className="content-card-meta">
                        <span className="tag-muted">{t.equip_slot}</span>
                        {t.stackable && <span className="tag-muted">Stackable</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
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
  const [query, setQuery] = useState('')

  const itemNameById = new Map((items ?? []).map((i) => [i.id, i.item_name]))

  const filtered =
    recipes?.filter((r) => {
      if (!query) return true
      const haystack = `${r.display_name} ${r.id} ${r.description} ${r.skill}`.toLowerCase()
      return haystack.includes(query.toLowerCase())
    }) ?? null

  const skillsInOrder = Array.from(new Set((filtered ?? []).map((r) => r.skill))).sort()

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Recipes</h2>
        <p>
          Crafting blueprints that turn ingredients into finished items at a station.
          Grouped by the skill they train.
        </p>
      </header>

      <input
        type="search"
        className="content-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes…"
        aria-label="Search recipes"
      />

      {filtered === null ? (
        <p className="text-dim">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-dim">
          {query ? `No recipes match "${query}".` : 'No recipes defined yet.'}
        </p>
      ) : (
        <>
          {skillsInOrder.map((skill) => {
            const group = filtered.filter((r) => r.skill === skill)
            if (group.length === 0) return null
            return (
              <div key={skill} className="content-subgroup">
                <h3 className="content-subgroup-heading">{formatStation(skill)}</h3>
                <div className="content-card-grid">
                  {group.map((r) => (
                    <RecipeCard key={r.id} recipe={r} itemNameById={itemNameById} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}

function RecipeCard({
  recipe,
  itemNameById,
}: {
  recipe: Recipe
  itemNameById: Map<string, string>
}) {
  const nameOf = (id: string) => itemNameById.get(id) ?? id
  return (
    <article className="content-card">
      <header className="content-card-header">
        <h3 className="content-card-title">{recipe.display_name}</h3>
        <span className="content-card-id">{recipe.id}</span>
      </header>
      {recipe.description && <p className="content-card-body">{recipe.description}</p>}

      <div className="content-card-stats">
        <span className="stat-pill stat-pill-muted">
          Lv {recipe.required_skill_level}
        </span>
        <span className="stat-pill stat-pill-muted">
          {formatStation(recipe.station_tag)}
        </span>
        <span className="stat-pill stat-pill-muted">
          {recipe.craft_time_seconds % 1 === 0
            ? `${recipe.craft_time_seconds.toFixed(0)}s`
            : `${recipe.craft_time_seconds.toFixed(1)}s`}
        </span>
        {recipe.xp_reward > 0 && (
          <span className="stat-pill">+{recipe.xp_reward} XP</span>
        )}
      </div>

      {recipe.ingredients.length > 0 && (
        <div className="content-card-bonus-group">
          <div className="content-card-bonus-heading">Ingredients</div>
          <ul className="content-card-bonuses">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.quantity}× {nameOf(ing.itemId)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recipe.outputs.length > 0 && (
        <div className="content-card-bonus-group">
          <div className="content-card-bonus-heading">Produces</div>
          <ul className="content-card-bonuses">
            {recipe.outputs.map((out, i) => (
              <li key={i} className="content-card-bonus-positive">
                {out.quantity}× {nameOf(out.itemId)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

function RaritiesSection() {
  const rarities = useAsyncList<Rarity>(() => listRarities())
  return (
    <ContentSection
      title="Rarities"
      description="The tier ladder loot is colored by. Higher tiers carry more bonuses, glow brighter on the ground, and show up much less often."
      items={rarities}
      emptyText="No rarities defined yet."
    >
      {rarities?.map((r) => (
        <article key={r.id} className="content-card">
          <header className="content-card-header">
            <h3
              className="content-card-title"
              style={{ color: r.display_color }}
            >
              <span
                className="rarity-swatch"
                style={{ background: r.display_color }}
                aria-hidden="true"
              />
              {r.display_name}
            </h3>
            <span className="content-card-id">{r.id}</span>
          </header>
          {r.description && <p className="content-card-body">{r.description}</p>}
          <div className="content-card-meta">
            <span className="tag-muted">{r.display_color.toUpperCase()}</span>
            {r.show_ground_glow ? (
              <span
                className="tag"
                style={{
                  color: r.display_color,
                  borderColor: r.display_color + '55',
                  background: r.display_color + '14',
                }}
              >
                Glow ×{r.ground_glow_brightness}
              </span>
            ) : (
              <span className="tag-muted">No ground glow</span>
            )}
          </div>
        </article>
      ))}
    </ContentSection>
  )
}

function ItemsSection() {
  const items = useAsyncList<Item>(() => listItems())
  const rarities = useAsyncList<Rarity>(() => listRarities())
  const itemTypes = useAsyncList<ItemType>(() => listItemTypes())
  const [query, setQuery] = useState('')

  const rarityById = new Map((rarities ?? []).map((r) => [r.id, r]))
  const typeById = new Map((itemTypes ?? []).map((t) => [t.name, t]))

  const filtered =
    items?.filter((i) => {
      if (!query) return true
      const haystack = `${i.item_name} ${i.id} ${i.description}`.toLowerCase()
      return haystack.includes(query.toLowerCase())
    }) ?? null

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Items</h2>
        <p>
          Equipment, tools, currency, and other things you can carry. Color-coded by
          rarity (white → orange).
        </p>
      </header>

      <input
        type="search"
        className="content-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search items…"
        aria-label="Search items"
      />

      {filtered === null ? (
        <p className="text-dim">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-dim">
          {query ? `No items match "${query}".` : 'No items defined yet.'}
        </p>
      ) : (
        <>
          {ITEM_GROUP_ORDER.map((group) => {
            const groupItems = filtered.filter(
              (i) => typeById.get(i.item_type)?.group === group,
            )
            if (groupItems.length === 0) return null
            return (
              <ItemGroup
                key={group}
                group={group}
                items={groupItems}
                rarityById={rarityById}
                typeById={typeById}
              />
            )
          })}
        </>
      )}
    </section>
  )
}

function ItemGroup({
  group,
  items,
  rarityById,
  typeById,
}: {
  group: string
  items: Item[]
  rarityById: Map<string, Rarity>
  typeById: Map<string, ItemType>
}) {
  return (
    <div className="content-subgroup">
      <h3 className="content-subgroup-heading">{group}</h3>
      <div className="content-card-grid">
        {items.map((i) => {
          const rarity = rarityById.get(i.rarity)
          const type = typeById.get(i.item_type)
          const isWeapon = i.weapon_min_damage != null
          return (
            <article key={i.id} className="content-card">
              <header className="content-card-header">
                <h3
                  className="content-card-title"
                  style={{ color: rarity?.display_color ?? 'inherit' }}
                >
                  <ItemGroupIcon group={group} />
                  {i.item_name}
                </h3>
                <span className="content-card-id">{i.id}</span>
              </header>
              {i.description && <p className="content-card-body">{i.description}</p>}
              {i.ability_bonuses.length > 0 && (
                <BonusList title="Bonuses" entries={i.ability_bonuses} />
              )}

              <div className="content-card-stats">
                {isWeapon && (
                  <span className="stat-pill">
                    {i.weapon_min_damage}–{i.weapon_max_damage} dmg
                  </span>
                )}
                {isWeapon && i.weapon_speed != null && (
                  <span className="stat-pill stat-pill-muted">
                    Spd {i.weapon_speed}s
                  </span>
                )}
                {i.weight > 0 && (
                  <span className="stat-pill stat-pill-muted">
                    Wt {i.weight}
                  </span>
                )}
                {i.is_stackable && i.max_stack_size > 1 && (
                  <span className="stat-pill stat-pill-muted">
                    Stack {i.max_stack_size.toLocaleString()}
                  </span>
                )}
                {i.required_skill_level > 0 && (
                  <span className="stat-pill stat-pill-muted">
                    Lv {i.required_skill_level}
                  </span>
                )}
              </div>

              <div className="content-card-meta">
                {type && <span className="tag-muted">{type.display_name}</span>}
                {i.slot && i.slot !== 'InventoryOnly' && (
                  <span className="tag-muted">{i.slot}</span>
                )}
                {rarity && (
                  <span
                    className="tag-muted"
                    style={{
                      color: rarity.display_color,
                      borderColor: rarity.display_color + '55',
                    }}
                  >
                    {rarity.display_name}
                  </span>
                )}
                {i.is_craftable && (
                  <span className="tag" style={{
                    color: '#78dc8c',
                    borderColor: 'rgba(120, 220, 140, 0.3)',
                    background: 'rgba(120, 220, 140, 0.10)',
                  }}>
                    Craftable
                  </span>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function matchesEffectQuery(effect: Action, query: string): boolean {
  if (!query) return true
  const haystack = `${effect.ability_name} ${effect.asset_name} ${effect.description}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function ActionsSection() {
  const actions = useAsyncList<Action>(() => listActions())
  const [query, setQuery] = useState('')
  const filtered = actions?.filter((a) => matchesEffectQuery(a, query)) ?? null

  return (
    <ContentSection
      title="Actions"
      description="Physical things characters do with weapons — strikes, blocks, shoves, technique-based moves. Damage comes from the equipped weapon."
      items={filtered}
      emptyText={query ? `No actions match "${query}".` : 'No actions defined yet.'}
      headerExtra={
        <input
          type="search"
          className="content-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions…"
          aria-label="Search actions"
        />
      }
    >
      {filtered?.map((a) => (
        <ActiveEffectCard key={a.asset_name} effect={a} variant="action" />
      ))}
    </ContentSection>
  )
}

function SpellsSection() {
  const spells = useAsyncList<Spell>(() => listSpells())
  const [query, setQuery] = useState('')
  const filtered = spells?.filter((s) => matchesEffectQuery(s, query)) ?? null

  return (
    <ContentSection
      title="Spells"
      description="Magical effects — fire, frost, healing, summons, wards. Damage and school are intrinsic to the spell."
      items={filtered}
      emptyText={query ? `No spells match "${query}".` : 'No spells defined yet.'}
      headerExtra={
        <input
          type="search"
          className="content-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search spells…"
          aria-label="Search spells"
        />
      }
    >
      {filtered?.map((s) => (
        <ActiveEffectCard key={s.asset_name} effect={s} variant="spell" />
      ))}
    </ContentSection>
  )
}

function AbilitiesSection() {
  const abilities = useAsyncList<Ability>(() => listAbilities())
  return (
    <ContentSection
      title="Abilities"
      description="The six core ability scores every character carries. Each one drives different rolls, resources, and damage scaling."
      items={abilities}
      emptyText="No abilities defined yet."
    >
      {abilities?.map((a) => (
        <article key={a.name} className="content-card">
          <header className="content-card-header">
            <h3 className="content-card-title">
              <AbilityIcon name={a.name} />
              {a.display_name}
            </h3>
            <span className="content-card-id">{a.name.slice(0, 3).toUpperCase()}</span>
          </header>
          {a.description && <p className="content-card-body">{a.description}</p>}
          {a.derived_effects.length > 0 && (
            <ul className="content-card-rules">
              {a.derived_effects.map((eff, i) => (
                <li key={i}>{eff.description}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </ContentSection>
  )
}

function AlignmentsSection() {
  const alignments = useAsyncList<Alignment>(() => listAlignments())
  return (
    <ContentSection
      title="Alignments"
      description="Ideological axes characters drift along over time. Alignment is set by gameplay actions — moral choices, kills, faction reputations — not chosen at creation."
      items={alignments}
      emptyText="No alignments defined yet."
    >
      {alignments?.map((a) => (
        <article key={a.id} className="content-card">
          <header className="content-card-header">
            <h3 className="content-card-title">
              <AlignmentIcon id={a.id} />
              {a.display_name}
            </h3>
            <span className="content-card-id">{a.id}</span>
          </header>
          {a.description && <p className="content-card-body">{a.description}</p>}
          {a.gameplay_rules.length > 0 && (
            <ul className="content-card-rules">
              {a.gameplay_rules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </ContentSection>
  )
}

function FactionsSection() {
  const factions = useAsyncList<Faction>(() => listFactions())
  return (
    <ContentSection
      title="Factions"
      description="In-game factions and reputation. Inter-faction stances live in necro_content.faction_hostility."
      items={factions}
      emptyText="No factions defined yet."
    >
      {factions?.map((f) => (
        <article key={f.id} className="content-card">
          <header className="content-card-header">
            <h3 className="content-card-title">
              <FactionIcon id={f.id} />
              {f.display_name}
            </h3>
            <span className="content-card-id">{f.id}</span>
          </header>
          {f.description && <p className="content-card-body">{f.description}</p>}
          <div className="content-card-meta">
            {f.is_player_faction && <span className="tag">Player faction</span>}
            <span className="tag-muted">Starts {f.starting_standing}</span>
          </div>
        </article>
      ))}
    </ContentSection>
  )
}

function ZonesSection() {
  const zones = useAsyncList<Zone>(() => listZones())
  return (
    <ContentSection
      title="Zones"
      description="Zones and sub-zones. Sub-zones live in necro_content.sub_zones."
      items={zones}
      emptyText="No zones defined yet."
    >
      {zones?.map((z) => (
        <article key={z.id} className="content-card">
          <header className="content-card-header">
            <h3 className="content-card-title">{z.display_name}</h3>
            <span className="content-card-id">{z.id}</span>
          </header>
          {z.description && <p className="content-card-body">{z.description}</p>}
          <div className="content-card-meta">
            <span className="tag-muted">
              Lv {z.min_level}
              {z.max_level !== z.min_level ? `–${z.max_level}` : ''}
            </span>
            {z.controlling_faction_id && (
              <span className="tag-muted">{z.controlling_faction_id}</span>
            )}
            {z.is_starting_zone && <span className="tag">Starting zone</span>}
            {z.is_pvp_zone && <span className="tag">PvP</span>}
            {z.is_sanctuary && <span className="tag-muted">Sanctuary</span>}
          </div>
        </article>
      ))}
    </ContentSection>
  )
}

function CharactersSection() {
  const { gameId } = useParams<{ gameId: string }>()
  const characters = useAsyncList<PublicCharacter>(() => listPublicCharacters())
  const realms = useAsyncList<Realm>(() => listRealms())
  const realmNameById = new Map((realms ?? []).map((r) => [r.id, r.display_name]))

  return (
    <ContentSection
      title="Characters"
      description="Player characters across all realms, sorted by level."
      items={characters}
      emptyText="No characters yet."
    >
      {characters?.map((c) => (
        <Link
          key={c.id}
          to={`/g/${gameId ?? 'necro'}/characters/${c.id}`}
          className="content-card content-card-link"
        >
          <header className="content-card-header">
            <h3 className="content-card-title">
              <RaceIcon id={c.race} />
              {c.character_name}
            </h3>
            <span className="content-card-id">Lv {c.level}</span>
          </header>
          <div className="content-card-meta">
            <span className="tag-muted">{capitalize(c.race)}</span>
            <span className="tag-muted">
              {formatRelativeShort(c.created_at)} ago
            </span>
            <span className="tag-muted">
              {realmNameById.get(c.realm_id) ?? '—'}
            </span>
          </div>
        </Link>
      ))}
    </ContentSection>
  )
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

function RealmsSection() {
  const realms = useAsyncList<Realm>(() => listRealms())
  const stats = useAsyncList<RealmStats>(() => getRealmStats())

  const statsById = new Map((stats ?? []).map((s) => [s.realm_id, s]))

  return (
    <ContentSection
      title="Realms"
      description="Logical shards players choose between. Characters are realm-bound — name uniqueness, guilds, and mail all scope to a realm."
      items={realms}
      emptyText="No realms defined yet."
    >
      {realms?.map((r) => {
        const s = statsById.get(r.id)
        const total = s?.total_characters ?? 0
        const online = s?.online_characters ?? 0
        return (
          <article key={r.id} className="content-card">
            <header className="content-card-header">
              <h3 className="content-card-title">{r.display_name}</h3>
              <span className="content-card-id">{r.short_name}</span>
            </header>
            <p className="content-card-body">
              {r.region} · {r.locale} · {r.timezone}
            </p>
            <div className="content-card-meta">
              <span className={r.is_online ? 'tag' : 'tag-muted'}>
                {r.is_online ? 'Online' : 'Offline'}
              </span>
              <span className="tag-muted">{r.realm_type}</span>
              <span className="tag-muted">{r.population}</span>
              {r.connected_to_id && <span className="tag-muted">Connected</span>}
              <span className="tag-muted">
                {total.toLocaleString()} character{total === 1 ? '' : 's'}
              </span>
              <span className="tag-muted">{online.toLocaleString()} online</span>
            </div>
          </article>
        )
      })}
    </ContentSection>
  )
}
