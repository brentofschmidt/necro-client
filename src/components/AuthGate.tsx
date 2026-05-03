import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Session } from '@supabase/supabase-js'
import { Stage, useAuthStage } from '../hooks/useAuthStage'
import { AccountProfile } from '../lib/profile'

const PUBLIC_INFO_PATHS = [
  '/about',
  '/contact',
  '/careers',
  '/help',
  '/status',
  '/bugs',
  '/privacy',
  '/terms',
  '/cookies',
]

const STAGE_ALLOWED_PATHS: Record<Exclude<Stage, 'loading'>, string[]> = {
  login: ['/', '/play', '/social', '/login', '/register', '/forgot-password', ...PUBLIC_INFO_PATHS],
  enroll: ['/mfa-enroll'],
  challenge: ['/mfa'],
  dashboard: ['/', '/play', '/social', '/account', '/publish', ...PUBLIC_INFO_PATHS],
  recovery: ['/reset-password'],
}

const STAGE_ALLOWED_PREFIXES: Record<Exclude<Stage, 'loading'>, string[]> = {
  login: ['/u/', '/g/'],
  enroll: [],
  challenge: [],
  dashboard: ['/u/', '/g/'],
  recovery: [],
}

function isPathAllowed(stage: Exclude<Stage, 'loading'>, pathname: string): boolean {
  if (STAGE_ALLOWED_PATHS[stage].includes(pathname)) return true
  return STAGE_ALLOWED_PREFIXES[stage].some((prefix) => pathname.startsWith(prefix))
}

const STAGE_DEFAULT_PATH: Record<Exclude<Stage, 'loading'>, string> = {
  login: '/',
  enroll: '/mfa-enroll',
  challenge: '/mfa',
  dashboard: '/',
  recovery: '/reset-password',
}

export type AuthOutletContext = {
  session: Session | null
  profile: AccountProfile | null
  refreshProfile: () => Promise<void>
}

export function AuthGate() {
  const { session, stage, profile, refreshProfile } = useAuthStage()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (stage === 'loading') return
    if (!isPathAllowed(stage, location.pathname)) {
      navigate(STAGE_DEFAULT_PATH[stage], { replace: true })
    }
  }, [stage, location.pathname, navigate])

  if (stage === 'loading') return null

  const ctx: AuthOutletContext = { session, profile, refreshProfile }
  return <Outlet context={ctx} />
}
