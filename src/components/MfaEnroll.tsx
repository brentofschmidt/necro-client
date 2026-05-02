import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

type EnrollData = {
  factorId: string
  qrCode: string
  secret: string
}

export function MfaEnroll() {
  const [enroll, setEnroll] = useState<EnrollData | null>(null)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealSecret, setRevealSecret] = useState(false)
  const enrollPromiseRef = useRef<ReturnType<typeof supabase.auth.mfa.enroll> | null>(null)

  useEffect(() => {
    if (!enrollPromiseRef.current) {
      enrollPromiseRef.current = supabase.auth.mfa.enroll({ factorType: 'totp' })
    }
    let cancelled = false
    enrollPromiseRef.current.then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setError(error.message)
        return
      }
      if (data.type !== 'totp') {
        setError(`Unexpected factor type: ${data.type}`)
        return
      }
      setEnroll({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!enroll) return
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enroll.factorId,
        code,
      })
      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (enroll) {
      await supabase.auth.mfa.unenroll({ factorId: enroll.factorId })
    }
    await supabase.auth.signOut()
  }

  return (
    <div>
      <div className="brand">
        <div className="brand-mark">
          NECRO<span>NET</span>
        </div>
        <div className="brand-tag">Set up authenticator</div>
      </div>

      <div className="card">
        <p className="lede">
          NecroNet requires an authenticator app (Google Authenticator, 1Password, Authy, etc.).
          Scan the QR code, then enter the 6-digit code to finish enrollment.
        </p>

        {error && <div className="message error">{error}</div>}

        {!enroll ? (
          <div className="qr-placeholder">Generating...</div>
        ) : (
          <>
            <div className="qr-wrap">
              <img className="qr-image" src={enroll.qrCode} alt="Authenticator QR code" />
            </div>

            <div className="secret-row">
              {revealSecret ? (
                <code className="secret">{enroll.secret}</code>
              ) : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setRevealSecret(true)}
                >
                  Can't scan? Reveal secret
                </button>
              )}
            </div>

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
                />
              </div>

              <button className="btn" type="submit" disabled={submitting || code.length !== 6}>
                {submitting ? 'Verifying...' : 'Activate'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
