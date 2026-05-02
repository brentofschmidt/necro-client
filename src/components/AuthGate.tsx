import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Stage, useAuthStage } from '../hooks/useAuthStage'

const STAGE_ALLOWED_PATHS: Record<Exclude<Stage, 'loading'>, string[]> = {
  login: ['/login', '/register', '/forgot-password'],
  enroll: ['/mfa-enroll'],
  challenge: ['/mfa'],
  dashboard: ['/'],
  recovery: ['/reset-password'],
}

const STAGE_DEFAULT_PATH: Record<Exclude<Stage, 'loading'>, string> = {
  login: '/login',
  enroll: '/mfa-enroll',
  challenge: '/mfa',
  dashboard: '/',
  recovery: '/reset-password',
}

export function AuthGate() {
  const { session, stage } = useAuthStage()
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

  return <Outlet context={{ session }} />
}
