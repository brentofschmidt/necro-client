import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  AccountProfile,
  nullIfEmpty,
  OnlineVisibility,
  ProfileVisibility,
  Region,
  updateProfile,
} from '../lib/profile'
import { AuthOutletContext } from './AuthGate'

const REGIONS: Region[] = ['NA', 'EU', 'KR', 'CN', 'OCE', 'TW']
const PROFILE_VISIBILITY: ProfileVisibility[] = ['public', 'friends', 'private']
const ONLINE_VISIBILITY: OnlineVisibility[] = ['online', 'away', 'invisible']

type TabId =
  | 'profile'
  | 'personal'
  | 'region'
  | 'privacy'
  | 'communications'
  | 'login'
  | 'security'
  | 'account'

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'personal', label: 'Personal Info' },
  { id: 'region', label: 'Region & Language' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'communications', label: 'Communications' },
  { id: 'login', label: 'Login' },
  { id: 'security', label: 'Security' },
  { id: 'account', label: 'Account' },
]

const DEFAULT_TAB: TabId = 'profile'

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value)
}

export function AccountSettings() {
  const ctx = useOutletContext<AuthOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const user = ctx.session?.user
  if (!user) return null

  const queryTab = searchParams.get('tab')
  const activeTab: TabId = isTabId(queryTab) ? queryTab : DEFAULT_TAB

  function setTab(id: TabId) {
    setSearchParams({ tab: id }, { replace: true })
  }

  const sectionProps: SectionProps = {
    user,
    profile: ctx.profile,
    onSaved: ctx.refreshProfile,
  }

  let content: ReactNode = null
  switch (activeTab) {
    case 'profile':
      content = <ProfileSection {...sectionProps} />
      break
    case 'personal':
      content = <PersonalSection {...sectionProps} />
      break
    case 'region':
      content = <RegionSection {...sectionProps} />
      break
    case 'privacy':
      content = <PrivacySection {...sectionProps} />
      break
    case 'communications':
      content = <CommunicationSection {...sectionProps} />
      break
    case 'login':
      content = (
        <>
          <EmailSection user={user} />
          <PasswordSection />
        </>
      )
      break
    case 'security':
      content = <MfaSection />
      break
    case 'account':
      content = <AccountInfoSection profile={ctx.profile} />
      break
  }

  return (
    <div className="settings-page">
      <h1 className="settings-title">Account Settings</h1>
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Account settings sections">
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

type SectionProps = {
  user: User
  profile: AccountProfile | null
  onSaved: () => Promise<void>
}

function useFeedback() {
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  function reset() {
    setError(null)
    setInfo(null)
  }
  return { error, info, setError, setInfo, reset }
}

function ProfileSection({ user, profile, onSaved }: SectionProps) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '')
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
    setAvatarUrl(profile?.avatar_url ?? '')
    setBio(profile?.bio ?? '')
    setPronouns(profile?.pronouns ?? '')
  }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    setSubmitting(true)
    try {
      await updateProfile(user.id, {
        display_name: displayName.trim(),
        avatar_url: nullIfEmpty(avatarUrl),
        bio: bio.trim(),
        pronouns: pronouns.trim(),
      })
      await onSaved()
      f.setInfo('Profile updated.')
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Profile</h2>
        <p>Public information shown to other players.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            placeholder="Necromancer"
          />
        </div>

        <div className="field">
          <label htmlFor="pronouns">Pronouns</label>
          <input
            id="pronouns"
            type="text"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            maxLength={32}
            placeholder="they/them"
          />
        </div>

        <div className="field">
          <label htmlFor="avatar-url">Avatar URL</label>
          <input
            id="avatar-url"
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="A short blurb about yourself"
          />
        </div>

        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save profile'}
        </button>
      </form>
    </section>
  )
}

function PersonalSection({ user, profile, onSaved }: SectionProps) {
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [dob, setDob] = useState(profile?.date_of_birth ?? '')
  const [country, setCountry] = useState(profile?.country ?? '')
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  useEffect(() => {
    setFirstName(profile?.first_name ?? '')
    setLastName(profile?.last_name ?? '')
    setDob(profile?.date_of_birth ?? '')
    setCountry(profile?.country ?? '')
  }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    if (country !== '' && country.trim().length !== 2) {
      f.setError('Country must be a 2-letter ISO code (e.g. US, GB, JP).')
      return
    }
    setSubmitting(true)
    try {
      await updateProfile(user.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: nullIfEmpty(dob),
        country: country.trim().toUpperCase(),
      })
      await onSaved()
      f.setInfo('Personal info updated.')
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Personal Info</h2>
        <p>Private to you. Used for legal compliance and age gating.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="first-name">First name</label>
            <input
              id="first-name"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={64}
            />
          </div>
          <div className="field">
            <label htmlFor="last-name">Last name</label>
            <input
              id="last-name"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={64}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="dob">Date of birth</label>
            <input
              id="dob"
              type="date"
              value={dob ?? ''}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="country">Country (ISO code)</label>
            <input
              id="country"
              type="text"
              autoComplete="country"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="US"
            />
          </div>
        </div>

        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </section>
  )
}

function RegionSection({ user, profile, onSaved }: SectionProps) {
  const [region, setRegion] = useState<string>(profile?.region ?? '')
  const [locale, setLocale] = useState(profile?.locale ?? 'en-US')
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'UTC')
  const [currency, setCurrency] = useState(profile?.currency ?? 'USD')
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  useEffect(() => {
    setRegion(profile?.region ?? '')
    setLocale(profile?.locale ?? 'en-US')
    setTimezone(profile?.timezone ?? 'UTC')
    setCurrency(profile?.currency ?? 'USD')
  }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    setSubmitting(true)
    try {
      await updateProfile(user.id, {
        region: region === '' ? null : (region as Region),
        locale: locale.trim(),
        timezone: timezone.trim(),
        currency: currency.trim().toUpperCase(),
      })
      await onSaved()
      f.setInfo('Region settings updated.')
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Region & Language</h2>
        <p>Affects matchmaking, payment region, and localization.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="region">Game region</label>
            <select id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">— Not set —</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="currency">Display currency</label>
            <input
              id="currency"
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              placeholder="USD"
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="locale">Language (BCP 47)</label>
            <input
              id="locale"
              type="text"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              placeholder="en-US"
            />
          </div>
          <div className="field">
            <label htmlFor="timezone">Timezone (IANA)</label>
            <input
              id="timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Los_Angeles"
            />
          </div>
        </div>

        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </section>
  )
}

function PrivacySection({ user, profile, onSaved }: SectionProps) {
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    profile?.profile_visibility ?? 'friends',
  )
  const [onlineVisibility, setOnlineVisibility] = useState<OnlineVisibility>(
    profile?.online_visibility ?? 'online',
  )
  const [acceptFriendRequests, setAcceptFriendRequests] = useState(
    profile?.accept_friend_requests ?? true,
  )
  const [searchableByEmail, setSearchableByEmail] = useState(
    profile?.searchable_by_email ?? true,
  )
  const [searchableByPhone, setSearchableByPhone] = useState(
    profile?.searchable_by_phone ?? false,
  )
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  useEffect(() => {
    if (!profile) return
    setProfileVisibility(profile.profile_visibility)
    setOnlineVisibility(profile.online_visibility)
    setAcceptFriendRequests(profile.accept_friend_requests)
    setSearchableByEmail(profile.searchable_by_email)
    setSearchableByPhone(profile.searchable_by_phone)
  }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    setSubmitting(true)
    try {
      await updateProfile(user.id, {
        profile_visibility: profileVisibility,
        online_visibility: onlineVisibility,
        accept_friend_requests: acceptFriendRequests,
        searchable_by_email: searchableByEmail,
        searchable_by_phone: searchableByPhone,
      })
      await onSaved()
      f.setInfo('Privacy settings updated.')
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Privacy</h2>
        <p>Who can see your profile and find you.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field-row">
          <div className="field">
            <label htmlFor="profile-visibility">Profile visibility</label>
            <select
              id="profile-visibility"
              value={profileVisibility}
              onChange={(e) => setProfileVisibility(e.target.value as ProfileVisibility)}
            >
              {PROFILE_VISIBILITY.map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="online-visibility">Online visibility</label>
            <select
              id="online-visibility"
              value={onlineVisibility}
              onChange={(e) => setOnlineVisibility(e.target.value as OnlineVisibility)}
            >
              {ONLINE_VISIBILITY.map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Toggle
          label="Accept friend requests"
          checked={acceptFriendRequests}
          onChange={setAcceptFriendRequests}
        />
        <Toggle
          label="Allow others to find me by email"
          checked={searchableByEmail}
          onChange={setSearchableByEmail}
        />
        <Toggle
          label="Allow others to find me by phone"
          checked={searchableByPhone}
          onChange={setSearchableByPhone}
        />

        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </section>
  )
}

function CommunicationSection({ user, profile, onSaved }: SectionProps) {
  const [backupEmail, setBackupEmail] = useState(profile?.backup_email ?? '')
  const [marketing, setMarketing] = useState(profile?.marketing_opt_in ?? false)
  const [analytics, setAnalytics] = useState(profile?.analytics_opt_in ?? false)
  const [crashReports, setCrashReports] = useState(profile?.crash_reports_opt_in ?? true)
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  useEffect(() => {
    if (!profile) return
    setBackupEmail(profile.backup_email ?? '')
    setMarketing(profile.marketing_opt_in)
    setAnalytics(profile.analytics_opt_in)
    setCrashReports(profile.crash_reports_opt_in)
  }, [profile])

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    setSubmitting(true)
    try {
      await updateProfile(user.id, {
        backup_email: nullIfEmpty(backupEmail),
        marketing_opt_in: marketing,
        analytics_opt_in: analytics,
        crash_reports_opt_in: crashReports,
      })
      await onSaved()
      f.setInfo('Communication preferences updated.')
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Communication & Data</h2>
        <p>Backup contact and what we're allowed to send / collect.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="backup-email">Backup email</label>
          <input
            id="backup-email"
            type="email"
            value={backupEmail}
            onChange={(e) => setBackupEmail(e.target.value)}
            placeholder="recovery@example.com"
          />
        </div>

        <Toggle
          label="Marketing emails"
          description="Updates about new content, sales, events"
          checked={marketing}
          onChange={setMarketing}
        />
        <Toggle
          label="Anonymous analytics"
          description="Help us understand how the game is played"
          checked={analytics}
          onChange={setAnalytics}
        />
        <Toggle
          label="Crash reports"
          description="Send error logs when the client crashes"
          checked={crashReports}
          onChange={setCrashReports}
        />

        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
      </form>
    </section>
  )
}

function EmailSection({ user }: { user: User }) {
  const [email, setEmail] = useState(user.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  useEffect(() => {
    setEmail(user.email ?? '')
  }, [user.email])

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    if (email === user.email) {
      f.setInfo('Email is unchanged.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ email })
      if (error) throw error
      f.setInfo(
        'Confirmation links sent. Click the link in both your old and new inboxes to complete the change.',
      )
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update email')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Sign-in Email</h2>
        <p>Used to sign in. Backup email is set in the Communication section.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Update email'}
        </button>
      </form>
    </section>
  )
}

function PasswordSection() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const f = useFeedback()

  async function save(e: FormEvent) {
    e.preventDefault()
    f.reset()
    if (password !== confirm) {
      f.setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      f.setInfo('Password updated.')
      setPassword('')
      setConfirm('')
    } catch (err) {
      f.setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Password</h2>
        <p>Choose a new password. Minimum 6 characters.</p>
      </header>

      {f.error && <div className="message error">{f.error}</div>}
      {f.info && <div className="message info">{f.info}</div>}

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <button className="btn btn-inline" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Update password'}
        </button>
      </form>
    </section>
  )
}

function MfaSection() {
  const [enrolled, setEnrolled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return
      const verified = data?.totp?.find((f) => f.status === 'verified')
      setEnrolled(!!verified)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Two-Factor Authentication</h2>
        <p>An authenticator app provides an extra layer of security on sign in.</p>
      </header>

      <div className="mfa-status">
        {enrolled === null && <span className="text-dim">Loading...</span>}
        {enrolled === true && (
          <>
            <span className="status-pill status-pill-on">Enabled</span>
            <span className="text-dim">Authenticator app is active.</span>
          </>
        )}
        {enrolled === false && (
          <>
            <span className="status-pill status-pill-off">Disabled</span>
            <span className="text-dim">No authenticator enrolled.</span>
          </>
        )}
      </div>
    </section>
  )
}

function AccountInfoSection({ profile }: { profile: AccountProfile | null }) {
  if (!profile) return null
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>Account</h2>
        <p>Read-only details about your NecroNet account.</p>
      </header>

      <dl className="info-grid">
        <InfoRow label="Account tier" value={profile.account_tier} />
        <InfoRow
          label="Platform currency"
          value={profile.platform_currency.toLocaleString()}
        />
        <InfoRow label="Member since" value={formatDate(profile.created_at)} />
        <InfoRow
          label="Last logged in"
          value={profile.last_logged_in_at ? formatDate(profile.last_logged_in_at) : '—'}
        />
      </dl>
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="toggle-row">
      <span className="toggle-label">
        <span className="toggle-title">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
      <span className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-slider" />
      </span>
    </label>
  )
}
