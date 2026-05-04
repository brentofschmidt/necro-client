import { supabase } from './supabase'

export type RealmType = 'PvE' | 'PvP' | 'RP' | 'RP-PvP'
export type RealmPopulation = 'Low' | 'Medium' | 'High' | 'Full' | 'Locked'

export type Realm = {
  id: string
  short_name: string
  display_name: string
  region: string
  locale: string
  realm_type: RealmType
  timezone: string
  is_online: boolean
  population: RealmPopulation
  connected_to_id: string | null
  created_at: string
}

export type RealmStats = {
  realm_id: string
  total_characters: number
  online_characters: number
}

export type PublicCharacter = {
  id: string
  character_name: string
  race: string
  level: number
  realm_id: string
}

export type Resource = {
  id: string
  display_name: string
  description: string
  display_color: string
  sort_order: number
}

export type StatCategory =
  | 'Power'
  | 'Crit'
  | 'Speed'
  | 'Defense'
  | 'Precision'
  | 'Sustain'
  | 'Mastery'
  | 'Gathering'

export type Stat = {
  id: string
  display_name: string
  description: string
  category: StatCategory
  is_percent: boolean
  affects: string
  conversion_per_point: string
  sort_order: number
}

export type AbilityEffect = {
  type: 'Resource' | 'Stat'
  affects: string
  ratio: number
  description: string
}

export type Ability = {
  name: string
  display_name: string
  category: string
  description: string
  derived_effects: AbilityEffect[]
}

export type Alignment = {
  id: string
  display_name: string
  description: string
  sort_order: number
  gameplay_rules: string[]
}

export type DamageType = {
  id: string
  display_name: string
  description: string
  display_color: string
  is_physical: boolean
  resistance_stat: string
}

export type ActionEffect = {
  type: string
  description: string
  [key: string]: unknown
}

export type Action = {
  asset_name: string
  ability_name: string
  description: string
  type: string
  targeting: string
  resource_type: string
  resource_cost: number
  cooldown: number
  cast_time: number
  global_cooldown: number
  range: number
  requires_target: boolean
  is_heal: boolean
  required_weapon_types: string[]
  effects: ActionEffect[]
}

export type Spell = Action & {
  damage: number
  damage_school: string | null
  splash_radius: number | null
  splash_damage_multiplier: number | null
}

export type SkillCategory = 'Proficiency' | 'Activity'

export type SkillEffect = {
  type: 'Resource' | 'Stat'
  affects: string
  ratio: number
  description: string
}

export type Skill = {
  name: string
  category: SkillCategory
  display_name: string
  description: string
  max_level: number
  item_types: string[]
  per_level_effects: SkillEffect[]
}

export type AbilityBonus = {
  ability: string
  value: number
  modifier_type: 'Flat' | 'Percent'
  description: string
}

export type Race = {
  id: string
  display_name: string
  description: string
  ability_bonuses: AbilityBonus[]
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

export async function listRealms(): Promise<Realm[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('realms')
    .select(
      'id, short_name, display_name, region, locale, realm_type, timezone, is_online, population, connected_to_id, created_at',
    )
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load realms:', error.message)
    return []
  }
  return (data as Realm[] | null) ?? []
}

export async function getRealmStats(): Promise<RealmStats[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_realm_stats')
  if (error) {
    console.error('Failed to load realm stats:', error.message)
    return []
  }
  // RPC returns bigint as string in some configurations; coerce to number.
  return ((data as { realm_id: string; total_characters: number | string; online_characters: number | string }[] | null) ?? []).map(
    (row) => ({
      realm_id: row.realm_id,
      total_characters: Number(row.total_characters),
      online_characters: Number(row.online_characters),
    }),
  )
}

export async function listResources(): Promise<Resource[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('resources')
    .select('id, display_name, description, display_color, sort_order')
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('Failed to load resources:', error.message)
    return []
  }
  return (data as Resource[] | null) ?? []
}

export async function listStats(): Promise<Stat[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('stats')
    .select('id, display_name, description, category, is_percent, affects, conversion_per_point, sort_order')
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('Failed to load stats:', error.message)
    return []
  }
  return (data as Stat[] | null) ?? []
}

export async function listAbilities(): Promise<Ability[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('abilities')
    .select('name, display_name, category, description, derived_effects')
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load abilities:', error.message)
    return []
  }
  return ((data as Ability[] | null) ?? []).map((a) => ({
    ...a,
    derived_effects: Array.isArray(a.derived_effects) ? a.derived_effects : [],
  }))
}

export async function listAlignments(): Promise<Alignment[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('alignments')
    .select('id, display_name, description, sort_order, gameplay_rules')
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('Failed to load alignments:', error.message)
    return []
  }
  return (data as Alignment[] | null) ?? []
}

export async function listPublicCharacters(): Promise<PublicCharacter[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('list_public_characters')
  if (error) {
    console.error('Failed to load characters:', error.message)
    return []
  }
  return (data as PublicCharacter[] | null) ?? []
}

export async function listDamageTypes(): Promise<DamageType[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('damage_types')
    .select('id, display_name, description, display_color, is_physical, resistance_stat')
    .order('is_physical', { ascending: false })
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load damage types:', error.message)
    return []
  }
  return (data as DamageType[] | null) ?? []
}

const ACTION_COLUMNS =
  'asset_name, ability_name, description, type, targeting, resource_type, resource_cost, cooldown, cast_time, global_cooldown, range, requires_target, is_heal, required_weapon_types, effects'

export async function listActions(): Promise<Action[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('actions')
    .select(ACTION_COLUMNS)
    .order('ability_name', { ascending: true })
  if (error) {
    console.error('Failed to load actions:', error.message)
    return []
  }
  return ((data as Action[] | null) ?? []).map((a) => ({
    ...a,
    required_weapon_types: Array.isArray(a.required_weapon_types) ? a.required_weapon_types : [],
    effects: Array.isArray(a.effects) ? a.effects : [],
  }))
}

export async function listSpells(): Promise<Spell[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('spells')
    .select(`${ACTION_COLUMNS}, damage, damage_school, splash_radius, splash_damage_multiplier`)
    .order('ability_name', { ascending: true })
  if (error) {
    console.error('Failed to load spells:', error.message)
    return []
  }
  return ((data as Spell[] | null) ?? []).map((s) => ({
    ...s,
    required_weapon_types: Array.isArray(s.required_weapon_types) ? s.required_weapon_types : [],
    effects: Array.isArray(s.effects) ? s.effects : [],
  }))
}

export async function listSkills(): Promise<Skill[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('skills')
    .select('name, category, display_name, description, max_level, item_types, per_level_effects')
    .order('category', { ascending: true })
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load skills:', error.message)
    return []
  }
  return ((data as Skill[] | null) ?? []).map((s) => ({
    ...s,
    per_level_effects: Array.isArray(s.per_level_effects) ? s.per_level_effects : [],
  }))
}

export async function listRaces(): Promise<Race[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('races')
    .select('id, display_name, description, ability_bonuses')
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load races:', error.message)
    return []
  }
  return ((data as Race[] | null) ?? []).map((r) => ({
    ...r,
    ability_bonuses: Array.isArray(r.ability_bonuses) ? r.ability_bonuses : [],
  }))
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
