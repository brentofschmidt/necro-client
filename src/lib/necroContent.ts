import { supabase } from './supabase'

export type Race = {
  id: string
  display_name: string
  description: string
}

export type Faction = {
  id: string
  display_name: string
  description: string
  parent_id: string | null
  is_player_faction: boolean
  starting_standing: string
  icon_path: string | null
}

export type Zone = {
  id: string
  display_name: string
  description: string
  parent_zone_id: string | null
  min_level: number
  max_level: number
  controlling_faction_id: string | null
  is_pvp_zone: boolean
  is_sanctuary: boolean
  is_starting_zone: boolean
}

export async function listRaces(): Promise<Race[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('races')
    .select('id, display_name, description')
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load races:', error.message)
    return []
  }
  return (data as Race[] | null) ?? []
}

export async function listFactions(): Promise<Faction[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('factions')
    .select(
      'id, display_name, description, parent_id, is_player_faction, starting_standing, icon_path',
    )
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load factions:', error.message)
    return []
  }
  return (data as Faction[] | null) ?? []
}

export async function listZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('zones')
    .select(
      'id, display_name, description, parent_zone_id, min_level, max_level, controlling_faction_id, is_pvp_zone, is_sanctuary, is_starting_zone',
    )
    .order('min_level', { ascending: true })
  if (error) {
    console.error('Failed to load zones:', error.message)
    return []
  }
  return (data as Zone[] | null) ?? []
}
