import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Session } from '@supabase/supabase-js'
import { Stage, useAuthStage } from '../hooks/useAuthStage'
import { AccountProfile } from '../lib/profile'

const STAGE_ALLOWED_PATHS: Record<Exclude<Stage, 'loading'>, string[]> = {
  login: ['/', '/play', '/social', '/login', '/register', '/forgot-password'],
  enroll: ['/mfa-enroll'],
  challenge: ['/mfa'],
  dashboard: ['/', '/play', '/social', '/account'],
  recovery: ['/reset-password'],
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
    const allowed = STAGE_ALLOWED_PATHS[stage]
    if (!allowed.includes(location.pathname)) {
      navigate(STAGE_DEFAULT_PATH[stage], { replace: true })
    }
  }, [stage, location.pathname, navigate])

  if (stage === 'loading') return null

  const ctx: AuthOutletContext = { session, profile, refreshProfile }
  return <Outlet context={ctx} />
}
