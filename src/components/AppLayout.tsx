import { Outlet, useOutletContext } from 'react-router-dom'
import { AuthOutletContext } from './AuthGate'
import { Navbar } from './Navbar'

export function AppLayout() {
  const ctx = useOutletContext<AuthOutletContext>()

  return (
    <div className="app-shell">
      <Navbar user={ctx.session?.user ?? null} profile={ctx.profile} />
      <main className="app-main">
        <Outlet context={ctx} />
      </main>
    </div>
  )
}
