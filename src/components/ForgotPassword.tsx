import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="brand">
        <div className="brand-mark">
          NECRO<span>NET</span>
        </div>
        <div className="brand-tag">Recover access</div>
      </div>

      <div className="card">
        {error && <div className="message error">{error}</div>}

        {sent ? (
          <>
            <div className="message info">
              If an account exists for <strong>{email}</strong>, a reset link has been sent.
              Check your inbox.
            </div>
            <Link className="btn btn-ghost" to="/login" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="lede">
              Enter the email associated with your NecroNet account and we'll send you a
              link to set a new password.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button className="btn" type="submit" disabled={submitting}>
                {submitting ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <div className="auth-switch">
              Remembered it? <Link to="/login">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
