import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Step = 'checking' | 'mfa' | 'password'

export function ResetPassword() {
  const [step, setStep] = useState<Step>('checking')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      if (aalError || !aal) {
        setStep('password')
        return
      }
      if (aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        if (cancelled) return
        const verified = factors?.totp?.find((f) => f.status === 'verified')
        if (verified) {
          setFactorId(verified.id)
          setStep('mfa')
          return
        }
      }
      setStep('password')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleMfa(e: FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: mfaCode })
      if (error) throw error
      setStep('password')
      setMfaCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
      setMfaCode('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
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
        <div className="brand-tag">
          {step === 'mfa' ? 'Verify your identity' : 'Set a new password'}
        </div>
      </div>

      <div className="card">
        {error && <div className="message error">{error}</div>}

        {step === 'checking' && <div className="qr-placeholder">Loading...</div>}

        {step === 'mfa' && (
          <>
            <p className="lede">
              Enter the 6-digit code from your authenticator app to confirm it's you before
              changing your password.
            </p>
            <form onSubmit={handleMfa}>
              <div className="field">
                <label htmlFor="otp">Authentication Code</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </div>
              <button
                className="btn"
                type="submit"
                disabled={submitting || mfaCode.length !== 6}
              >
                {submitting ? 'Verifying...' : 'Verify'}
              </button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <p className="lede">Choose a new password for your NecroNet account.</p>
            <form onSubmit={handlePassword}>
              <div className="field">
                <label htmlFor="password">New Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="confirm">Confirm Password</label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              <button className="btn" type="submit" disabled={submitting}>
                {submitting ? 'Updating...' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
