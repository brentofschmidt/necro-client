import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function MfaChallenge() {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      if (error) {
        setError(error.message)
        return
      }
      const verified = data?.totp?.find((f) => f.status === 'verified')
      if (!verified) {
        setError('No verified authenticator found.')
        return
      }
      setFactorId(verified.id)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div>
      <div className="brand">
        <div className="brand-mark">
          NECRO<span>NET</span>
        </div>
        <div className="brand-tag">Two-factor required</div>
      </div>

      <div className="card">
        <p className="lede">Enter the 6-digit code from your authenticator app.</p>

        {error && <div className="message error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="otp">Authentication Code</label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
              disabled={!factorId}
            />
          </div>

          <button
            className="btn"
            type="submit"
            disabled={submitting || code.length !== 6 || !factorId}
          >
            {submitting ? 'Verifying...' : 'Verify'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
            Sign Out
          </button>
        </form>
      </div>
    </div>
  )
}
