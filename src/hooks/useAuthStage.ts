import { useCallback, useEffect, useRef, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AccountProfile, fetchProfile } from '../lib/profile'

export type Stage = 'loading' | 'login' | 'enroll' | 'challenge' | 'dashboard' | 'recovery'

export type AuthStageValue = {
  session: Session | null
  stage: Stage
  profile: AccountProfile | null
  refreshProfile: () => Promise<void>
}

export function useAuthStage(): AuthStageValue {
  const [session, setSession] = useState<Session | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const recoveryRef = useRef(false)
  const mountedRef = useRef(true)

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) {
      if (mountedRef.current) setProfile(null)
      return
    }
    const next = await fetchProfile(userId)
    if (mountedRef.current) setProfile(next)
  }, [])

  useEffect(() => {
    mountedRef.current = true

    async function evaluate(current: Session | null) {
      if (!mountedRef.current) return
      if (recoveryRef.current && current) {
        setStage('recovery')
        return
      }
      if (!current) {
        setStage('login')
        return
      }
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!mountedRef.current) return
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

    async function loadProfileFor(userId: string | undefined) {
      if (!userId) {
        if (mountedRef.current) setProfile(null)
        return
      }
      const next = await fetchProfile(userId)
      if (mountedRef.current) setProfile(next)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mountedRef.current) return
      setSession(data.session)
      evaluate(data.session)
      loadProfileFor(data.session?.user?.id)
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
      loadProfileFor(next?.user?.id)
    })

    return () => {
      mountedRef.current = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  return { session, stage, profile, refreshProfile }
}
