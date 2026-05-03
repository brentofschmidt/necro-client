import { supabase } from './supabase'

export type GameStatus =
  | 'in_development'
  | 'alpha'
  | 'beta'
  | 'live'
  | 'sunset'
  | 'retired'

export type Game = {
  id: string
  name: string
  short_description: string
  description: string
  cover_url: string | null
  icon_url: string | null
  status: GameStatus
  released_at: string | null
  sort_order: number
  content_schema: string | null
  player_schema: string | null
  created_at: string
  updated_at: string
}

const GAME_COLUMNS =
  'id, name, short_description, description, cover_url, icon_url, status, released_at, sort_order, content_schema, player_schema, created_at, updated_at'

export async function fetchGameById(gameId: string): Promise<Game | null> {
  const { data, error } = await supabase
    .schema('platform')
    .from('games')
    .select(GAME_COLUMNS)
    .eq('id', gameId)
    .maybeSingle()
  if (error) {
    console.error('Failed to load game:', error.message)
    return null
  }
  return (data as Game | null) ?? null
}

export async function listVisibleGames(): Promise<Game[]> {
  const { data, error } = await supabase
    .schema('platform')
    .from('games')
    .select(GAME_COLUMNS)
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('Failed to list games:', error.message)
    return []
  }
  return (data as Game[] | null) ?? []
}
