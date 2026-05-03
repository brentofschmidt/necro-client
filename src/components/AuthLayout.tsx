import { Outlet, useOutletContext } from 'react-router-dom'
import { AuthOutletContext } from './AuthGate'
import { Footer } from './Footer'

export function AuthLayout() {
  const ctx = useOutletContext<AuthOutletContext>()
  return (
    <div className="auth-page">
      <main className="auth-shell">
        <Outlet context={ctx} />
      </main>
      <Footer />
    </div>
  )
}
