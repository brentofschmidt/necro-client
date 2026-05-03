import { ReactNode, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { fetchGameById, Game, GameStatus } from '../lib/games'
import {
  Faction,
  listFactions,
  listRaces,
  listZones,
  Race,
  Zone,
} from '../lib/necroContent'

type TabId =
  | 'information'
  | 'characters'
  | 'items'
  | 'abilities'
  | 'skills'
  | 'races'
  | 'factions'
  | 'zones'
  | 'leaderboards'
  | 'guilds'

const TABS: { id: TabId; label: string }[] = [
  { id: 'information', label: 'Game Information' },
  { id: 'characters', label: 'Characters' },
  { id: 'items', label: 'Items' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'skills', label: 'Skills' },
  { id: 'races', label: 'Races' },
  { id: 'factions', label: 'Factions' },
  { id: 'zones', label: 'Zones' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'guilds', label: 'Guilds' },
]

const DEFAULT_TAB: TabId = 'information'

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value)
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

const TAB_ICONS: Record<TabId, ReactNode> = {
  information: (
    <TabIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </TabIcon>
  ),
  characters: (
    <TabIcon>
      <circle cx="9" cy="9" r="3" />
      <path d="M3 19c0-3 3-5 6-5s6 2 6 5" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M15 19c0-2 1.5-4 4-4" />
    </TabIcon>
  ),
  items: (
    <TabIcon>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </TabIcon>
  ),
  abilities: (
    <TabIcon>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
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
  leaderboards: (
    <TabIcon>
      <rect x="4" y="13" width="4" height="8" />
      <rect x="10" y="8" width="4" height="13" />
      <rect x="16" y="3" width="4" height="18" />
    </TabIcon>
  ),
  guilds: (
    <TabIcon>
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-7h6v7" />
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
  const { gameId } = useParams<{ gameId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [game, setGame] = useState<Game | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')

  const queryTab = searchParams.get('tab')
  const activeTab: TabId = isTabId(queryTab) ? queryTab : DEFAULT_TAB

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

  function setTab(id: TabId) {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  if (loadState === 'loading') {
    return (
      <div className="settings-page">
        <p className="text-dim">Loading…</p>
      </div>
    )
  }

  if (loadState === 'not-found' || !game) {
    return (
      <div className="settings-page">
        <h1 className="settings-title">Game not found</h1>
        <p className="text-dim">No game exists with that id.</p>
      </div>
    )
  }

  let content: ReactNode = null
  switch (activeTab) {
    case 'information':
      content = <InformationSection game={game} />
      break
    case 'characters':
      content = (
        <ComingSoonSection
          title="Characters"
          description="A directory of player characters in Necro — class, level, realm, and last seen."
        />
      )
      break
    case 'items':
      content = (
        <ComingSoonSection
          title="Items"
          description="Browse and search every item in the game — weapons, armor, consumables, and more."
        />
      )
      break
    case 'abilities':
      content = (
        <ComingSoonSection
          title="Abilities"
          description="Class abilities, auras, and triggered effects pulled from necro_content.abilities."
        />
      )
      break
    case 'skills':
      content = (
        <ComingSoonSection
          title="Skills"
          description="Player skills and proficiencies — what characters train and improve over time."
        />
      )
      break
    case 'races':
      content = <RacesSection />
      break
    case 'factions':
      content = <FactionsSection />
      break
    case 'zones':
      content = <ZonesSection />
      break
    case 'leaderboards':
      content = (
        <ComingSoonSection
          title="Leaderboards"
          description="Top players by level, achievements, PvP rating, and more."
        />
      )
      break
    case 'guilds':
      content = (
        <ComingSoonSection
          title="Guilds"
          description="Public guild directory — rosters, ranks, and recruitment status."
        />
      )
      break
  }

  return (
    <div className="settings-page">
      <h1 className="settings-title">{game.name}</h1>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label={`${game.name} sections`}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
            >
              {TAB_ICONS[t.id]}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-content">{content}</div>
      </div>
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
  children,
}: {
  title: string
  description: string
  items: unknown[] | null
  emptyText: string
  children: ReactNode
}) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
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
            <h3 className="content-card-title">{r.display_name}</h3>
            <span className="content-card-id">{r.id}</span>
          </header>
          {r.description && <p className="content-card-body">{r.description}</p>}
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
            <h3 className="content-card-title">{f.display_name}</h3>
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
