import { Link } from 'react-router-dom'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AccountProfile, isAdmin } from '../lib/profile'

function displayNameFor(user: User, profile: AccountProfile | null): string {
  if (profile?.display_name) return profile.display_name
  return user.email?.split('@')[0] || 'Necromancer'
}

function initialsFor(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

function PersonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

export function Navbar({
  user,
  profile,
}: {
  user: User | null
  profile: AccountProfile | null
}) {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          <Link to="/" className="logo">
            NECRO<span>NET</span>
          </Link>
        </div>

        <div className="navbar-right">
          {user ? (
            <>
              <button className="user-menu-trigger" type="button" aria-haspopup="menu">
                <span className="status-dot" />
                <span className="user-name">{displayNameFor(user, profile)}</span>
                <span className="user-avatar">{initialsFor(displayNameFor(user, profile))}</span>
              </button>
              <div className="user-menu" role="menu">
                <div className="user-menu-header">
                  <div className="user-menu-name">{displayNameFor(user, profile)}</div>
                  <div className="user-menu-email">{user.email}</div>
                </div>
                <Link to="/account" className="user-menu-item">
                  Account settings
                </Link>
                {isAdmin(profile) && (
                  <Link to="/publish" className="user-menu-item">
                    Publish article
                  </Link>
                )}
                <button className="user-menu-item" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="user-menu-trigger" type="button" aria-haspopup="menu">
                <span className="user-avatar user-avatar-empty">
                  <PersonIcon />
                </span>
                <span className="user-name">Account</span>
              </button>
              <div className="user-menu" role="menu">
                <Link to="/login" className="user-menu-item">
                  Log in
                </Link>
                <Link to="/register" className="user-menu-item">
                  Create account
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
