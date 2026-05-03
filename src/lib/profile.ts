import { supabase } from './supabase'

export type ProfileVisibility = 'public' | 'friends' | 'private'
export type OnlineVisibility = 'online' | 'away' | 'invisible'
export type Region = 'NA' | 'EU' | 'KR' | 'CN' | 'OCE' | 'TW'
export type AccountTier =
  | 'standard'
  | 'founder'
  | 'subscriber'
  | 'employee'
  | 'tester'
  | 'vip'
export type UserRole = 'member' | 'moderator' | 'admin'
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'closed' | 'locked'

export type AccountProfile = {
  id: string

  // Public identity
  display_name: string
  avatar_url: string | null
  bio: string
  pronouns: string

  // Legal identity (PII)
  first_name: string
  last_name: string
  date_of_birth: string | null
  country: string

  // Locale / region
  region: Region | null
  locale: string
  timezone: string
  currency: string

  // Contact
  backup_email: string | null

  // Preferences
  marketing_opt_in: boolean
  analytics_opt_in: boolean
  crash_reports_opt_in: boolean
  accept_friend_requests: boolean
  searchable_by_email: boolean
  searchable_by_phone: boolean
  profile_visibility: ProfileVisibility
  online_visibility: OnlineVisibility

  // Account tier (read-only for users)
  account_tier: AccountTier

  // Role + moderation (read-only for users; admin-only writes)
  role: UserRole
  status: AccountStatus
  status_reason: string
  suspended_until: string | null

  // Wallet
  platform_currency: number

  // Timestamps
  created_at: string
  last_logged_in_at: string | null
}

export function isAdmin(profile: AccountProfile | null): boolean {
  return profile?.role === 'admin'
}

export function isStaff(profile: AccountProfile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'moderator'
}

const PROFILE_COLUMNS = [
  'id',
  'display_name',
  'avatar_url',
  'bio',
  'pronouns',
  'first_name',
  'last_name',
  'date_of_birth',
  'country',
  'region',
  'locale',
  'timezone',
  'currency',
  'backup_email',
  'marketing_opt_in',
  'analytics_opt_in',
  'crash_reports_opt_in',
  'accept_friend_requests',
  'searchable_by_email',
  'searchable_by_phone',
  'profile_visibility',
  'online_visibility',
  'account_tier',
  'role',
  'status',
  'status_reason',
  'suspended_until',
  'platform_currency',
  'created_at',
  'last_logged_in_at',
].join(', ')

export async function fetchProfile(userId: string): Promise<AccountProfile | null> {
  const { data, error } = await supabase
    .schema('accounts')
    .from('users')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('Failed to load accounts.users profile:', error.message)
    return null
  }
  return (data as AccountProfile | null) ?? null
}

export async function updateProfile(
  userId: string,
  patch: Partial<
    Omit<
      AccountProfile,
      | 'id'
      | 'account_tier'
      | 'role'
      | 'status'
      | 'status_reason'
      | 'suspended_until'
      | 'platform_currency'
      | 'created_at'
      | 'last_logged_in_at'
    >
  >,
): Promise<AccountProfile | null> {
  const { data, error } = await supabase
    .schema('accounts')
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return (data as AccountProfile | null) ?? null
}

export type PublicProfile = {
  id: string
  display_name: string
  avatar_url: string | null
  bio: string
  pronouns: string
  region: Region | null
  account_tier: AccountTier
  role: UserRole
  status: AccountStatus
  suspended_until: string | null
  created_at: string
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .schema('accounts')
    .rpc('get_public_profile', { target_id: userId })
  if (error) {
    console.error('Failed to load public profile:', error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  return (row as PublicProfile | undefined) ?? null
}

export function nullIfEmpty(s: string): string | null {
  const trimmed = s.trim()
  return trimmed === '' ? null : trimmed
}
