import { Session } from '@supabase/supabase-js'
import { useOutletContext } from 'react-router-dom'
import { Dashboard } from './Dashboard'

export function DashboardRoute() {
  const { session } = useOutletContext<{ session: Session | null }>()
  if (!session?.user) return null
  return <Dashboard user={session.user} />
}
