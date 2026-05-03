import { Outlet, useOutletContext } from 'react-router-dom'
import { AuthOutletContext } from './AuthGate'

export function AuthLayout() {
  const ctx = useOutletContext<AuthOutletContext>()
  return (
    <div className="auth-shell">
      <Outlet context={ctx} />
    </div>
  )
}
