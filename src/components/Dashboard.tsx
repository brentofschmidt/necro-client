import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function Dashboard({ user }: { user: User }) {
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <div className="brand">
        <div className="brand-mark">
          NECRO<span>NET</span>
        </div>
        <div className="brand-tag">Connected</div>
      </div>

      <div className="card dashboard">
        <h2>Welcome back</h2>
        <div className="email">{user.email}</div>
        <button className="btn btn-ghost" onClick={handleLogout}>
          Disconnect
        </button>
      </div>
    </div>
  )
}
