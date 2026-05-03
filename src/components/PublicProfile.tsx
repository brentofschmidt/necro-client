import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchPublicProfile, PublicProfile as PublicProfileT } from '../lib/profile'

const joinedFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

function initialsFor(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?'
}

function tierLabel(tier: PublicProfileT['account_tier'] | null | undefined): string | null {
  if (!tier || tier === 'standard') return null
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function roleLabel(role: PublicProfileT['role'] | null | undefined): string {
  if (role === 'admin') return 'Admin'
  if (role === 'moderator') return 'Moderator'
  return 'Member'
}

function roleVariant(role: PublicProfileT['role'] | null | undefined): string {
  if (role === 'admin') return 'admin'
  if (role === 'moderator') return 'moderator'
  return 'member'
}

const suspendedUntilFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

type StatusInfo = {
  kind: 'active' | 'suspended' | 'banned' | 'locked' | 'closed'
  label: string
}

function statusInfo(profile: PublicProfileT): StatusInfo {
  switch (profile.status) {
    case 'banned':
      return { kind: 'banned', label: 'Banned' }
    case 'locked':
      return { kind: 'locked', label: 'Locked' }
    case 'closed':
      return { kind: 'closed', label: 'Closed' }
    case 'suspended': {
      if (profile.suspended_until) {
        const until = new Date(profile.suspended_until)
        if (!isNaN(until.getTime()) && until.getTime() > Date.now()) {
          return {
            kind: 'suspended',
            label: `Suspended until ${suspendedUntilFormatter.format(until)}`,
          }
        }
      }
      return { kind: 'suspended', label: 'Suspended' }
    }
    case 'active':
    default:
      return { kind: 'active', label: 'Active' }
  }
}

type Status = 'loading' | 'found' | 'not-found'

export function PublicProfile() {
  const { userId } = useParams<{ userId: string }>()
  const [status, setStatus] = useState<Status>('loading')
  const [profile, setProfile] = useState<PublicProfileT | null>(null)

  useEffect(() => {
    if (!userId) {
      setStatus('not-found')
      return
    }
    let cancelled = false
    setStatus('loading')
    fetchPublicProfile(userId).then((p) => {
      if (cancelled) return
      if (p) {
        setProfile(p)
        setStatus('found')
      } else {
        setProfile(null)
        setStatus('not-found')
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  if (status === 'loading') {
    return (
      <div className="public-profile-page">
        <p className="text-dim">Loading…</p>
      </div>
    )
  }

  if (status === 'not-found' || !profile) {
    return (
      <div className="public-profile-page">
        <h1 className="settings-title">Profile not found</h1>
        <p className="text-dim">This user does not exist or is no longer available.</p>
      </div>
    )
  }

  const displayName = profile.display_name?.trim() || 'Necronet'
  const tier = tierLabel(profile.account_tier)
  const role = roleLabel(profile.role)
  const roleClass = roleVariant(profile.role)
  const accountStatus = statusInfo(profile)
  const joinedAt = profile.created_at ? new Date(profile.created_at) : null
  const joinedLabel =
    joinedAt && !isNaN(joinedAt.getTime()) ? joinedFormatter.format(joinedAt) : null

  return (
    <div className="public-profile-page">
      <header className="public-profile-header">
        <div className="public-profile-avatar">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" />
          ) : (
            <span>{initialsFor(displayName)}</span>
          )}
        </div>
        <div className="public-profile-identity">
          <h1 className="public-profile-name">
            {displayName}
            <span className={`user-status-pill user-status-pill-${accountStatus.kind}`}>
              {accountStatus.label}
            </span>
            <span className={`role-pill role-pill-${roleClass}`}>{role}</span>
            {tier && <span className="tier-pill">{tier}</span>}
          </h1>
          {profile.region && (
            <div className="public-profile-meta">
              <span>{profile.region}</span>
            </div>
          )}
        </div>
      </header>

      {joinedLabel && (
        <dl className="info-grid public-profile-info">
          <dt>Joined</dt>
          <dd>{joinedLabel}</dd>
        </dl>
      )}

      {profile.bio?.trim() && (
        <section className="public-profile-bio">
          <p>{profile.bio}</p>
        </section>
      )}
    </div>
  )
}
