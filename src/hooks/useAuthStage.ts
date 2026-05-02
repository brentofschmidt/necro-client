import { useEffect, useRef, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Stage = 'loading' | 'login' | 'enroll' | 'challenge' | 'dashboard' | 'recovery'

export function useAuthStage() {
  const [session, setSession] = useState<Session | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const recoveryRef = useRef(false)

  useEffect(() => {
    let mounted = true

    async function evaluate(current: Session | null) {
      if (!mounted) return
      if (recoveryRef.current && current) {
        setStage('recovery')
        return
      }
      if (!current) {
        setStage('login')
        return
      }
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!mounted) return
      if (error || !data) {
        setStage('login')
        return
      }
      if (data.currentLevel === 'aal2') {
        setStage('dashboard')
      } else if (data.nextLevel === 'aal2') {
        setStage('challenge')
      } else {
        setStage('enroll')
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      evaluate(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') {
        recoveryRef.current = true
      } else if (event === 'USER_UPDATED' && recoveryRef.current) {
        recoveryRef.current = false
      } else if (event === 'SIGNED_OUT') {
        recoveryRef.current = false
      }
      evaluate(next)
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  return { session, stage }
}
