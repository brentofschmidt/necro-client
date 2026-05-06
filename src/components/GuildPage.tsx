import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getPublicGuildDetail,
  listPublicGuildMembers,
  PublicGuildDetail,
  PublicGuildMember,
} from '../lib/necroContent'
import { formatRelativeShort } from '../lib/time'

type LoadState = 'loading' | 'found' | 'not-found'

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

export function GuildPage() {
  const { gameId, guildId } = useParams<{ gameId: string; guildId: string }>()
  const [guild, setGuild] = useState<PublicGuildDetail | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [members, setMembers] = useState<PublicGuildMember[] | null>(null)

  useEffect(() => {
    if (!guildId) {
      setLoadState('not-found')
      return
    }
    let cancelled = false
    setLoadState('loading')
    getPublicGuildDetail(guildId).then((g) => {
      if (cancelled) return
      if (g) {
        setGuild(g)
        setLoadState('found')
      } else {
        setGuild(null)
        setLoadState('not-found')
      }
    })
    listPublicGuildMembers(guildId).then((rows) => {
      if (!cancelled) setMembers(rows)
    })
    return () => {
      cancelled = true
    }
  }, [guildId])

  if (loadState === 'loading') {
    return (
      <div className="settings-page settings-page-flow">
        <p className="text-dim">Loading…</p>
      </div>
    )
  }

  if (loadState === 'not-found' || !guild) {
    return (
      <div className="settings-page settings-page-flow">
        <h1 className="settings-title">Guild not found</h1>
        <p className="text-dim">
          No guild exists with that id, or it has been disbanded.
        </p>
        {gameId && (
          <Link to={`/g/${gameId}?tab=guilds`} className="character-back-link">
            ← Back to Guilds
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="settings-page settings-page-flow">
      <div className="character-page-header">
        {gameId && (
          <Link to={`/g/${gameId}?tab=guilds`} className="character-back-link">
            ← Guilds
          </Link>
        )}
        <h1 className="settings-title">{guild.name}</h1>
        <div className="character-page-subtitle">
          Lv {guild.level}
          {guild.realm_name && <> · {guild.realm_name}</>}
          {' · '}
          {guild.member_count} / {guild.member_limit} member
          {guild.member_count === 1 ? '' : 's'}
        </div>
      </div>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>About</h2>
        </header>
        {guild.motd && (
          <p className="content-card-body">
            <em>“{guild.motd}”</em>
          </p>
        )}
        <dl className="info-grid">
          {guild.info && (
            <>
              <dt>Charter</dt>
              <dd>{guild.info}</dd>
            </>
          )}
          <dt>Founded</dt>
          <dd>
            {formatRelativeShort(guild.created_at)} ago
            {' · '}
            <span className="text-dim">
              {new Date(guild.created_at).toLocaleDateString()}
            </span>
          </dd>
          <dt>Realm</dt>
          <dd>{guild.realm_name ?? '—'}</dd>
          <dt>Level</dt>
          <dd>{guild.level}</dd>
          <dt>Members</dt>
          <dd>
            {guild.member_count} / {guild.member_limit}
          </dd>
        </dl>
      </section>

      <section className="settings-section">
        <header className="settings-section-header">
          <h2>Roster</h2>
          <p>Members ranked from leader down. Click any name to open their character page.</p>
        </header>
        {members === null ? (
          <p className="text-dim">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-dim">No members.</p>
        ) : (
          <div className="stat-list">
            {members.map((m) => (
              <MemberRow key={m.character_id} member={m} gameId={gameId} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function MemberRow({
  member,
  gameId,
}: {
  member: PublicGuildMember
  gameId: string | undefined
}) {
  return (
    <div className="stat-row">
      <div className="stat-name">
        {gameId ? (
          <Link
            to={`/g/${gameId}/characters/${member.character_id}/overview`}
            className="character-back-link"
          >
            {member.character_name}
          </Link>
        ) : (
          member.character_name
        )}
      </div>
      <div className="stat-value-cell">
        <div className="stat-value-line">
          <span className="stat-value">Lv {member.level}</span>
        </div>
        <div className="stat-value-meta">
          <span>{capitalize(member.race)}</span>
        </div>
      </div>
      <div className="stat-effect">
        <span>{member.rank_name}</span>
        {member.note && <span className="text-dim">{member.note}</span>}
      </div>
    </div>
  )
}
