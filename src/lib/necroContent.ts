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
  created_at: string
  realm_id: string
}

export type PublicCharacterDetail = {
  id: string
  character_name: string
  race: string
  level: number
  alignment_id: string | null
  last_zone: string
  created_at: string
  realm_id: string
  realm_name: string | null
}

export type ItemStatBonus = {
  stat: string
  value: number
  modifierType?: string
}

export type PublicGuild = {
  guild_id: string
  name: string
  motd: string
  info: string
  level: number
  realm_id: string
  realm_name: string | null
  member_count: number
  created_at: string
}

export type PublicGuildDetail = PublicGuild & {
  xp: number
  member_limit: number
  disbanded_at: string | null
}

export type PublicGuildMember = {
  character_id: string
  character_name: string
  race: string
  level: number
  rank_index: number
  rank_name: string
  note: string
  joined_at: string
}

export type PublicCharacterGuild = {
  guild_id: string
  guild_name: string
  motd: string
  rank_index: number
  rank_name: string
  joined_at: string
  member_count: number
}

export type PublicCharacterEquipmentSlot = {
  slot: string
  item_id: string
  item_name: string | null
  item_rarity: string | null
  item_type: string | null
  description: string | null
  weapon_min_damage: number | null
  weapon_max_damage: number | null
  weapon_speed: number | null
  ability_bonuses: AbilityBonus[]
  stats: ItemStatBonus[]
}

export type PublicCharacterAbilityScore = {
  ability: string
  display_name: string | null
  base_value: number
  equipment_bonus_value: number
  aura_bonus_value: number
  total_value: number
}

export type PublicCharacterCalculatedStat = {
  id: string
  display_name: string
  category: string
  is_percent: boolean
  affects: string
  conversion_per_point: string
  value: number
  sort_order: number
}

export type PublicCharacterSkill = {
  skill: string
  display_name: string | null
  category: string | null
  level: number
  current_xp: number
}

export type PublicCharacterResource = {
  type: string
  display_name: string | null
  display_color: string | null
  sort_order: number | null
  base_max_value: number
  ability_bonus_max_value: number
  bonus_max_value: number
  max_value: number
  current_value: number
  regen_rate: number
  regen_delay: number
}

export type AuraModifier = {
  ability?: string
  stat?: string
  resource?: string
  value: number
  modifier_type: 'Flat' | 'Percent'
  description?: string
}

export type PublicCharacterActiveAura = {
  instance_id: string
  aura_id: string
  display_name: string
  description: string
  icon_path: string | null
  is_harmful: boolean
  duration: number
  remaining_time: number
  stacks: number
  applied_at_utc: string
  caster_name: string
  ability_bonuses: AuraModifier[]
  stat_bonuses: AuraModifier[]
  resource_bonuses: AuraModifier[]
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

export type Rarity = {
  id: string
  display_name: string
  description: string
  display_color: string
  sort_order: number
  show_ground_glow: boolean
  ground_glow_brightness: number
  ground_glow_scale: number
}

export type ItemType = {
  name: string
  group: string
  display_name: string
  stackable: boolean
  equip_slot: string
}

export type RecipeIngredient = {
  itemId: string
  quantity: number
}

export type Recipe = {
  id: string
  display_name: string
  description: string
  skill: string
  required_skill_level: number
  xp_reward: number
  craft_time_seconds: number
  station_tag: string
  ingredients: RecipeIngredient[]
  outputs: RecipeIngredient[]
}

export type Item = {
  id: string
  item_name: string
  description: string
  rarity: string
  item_type: string
  slot: string
  required_skill_level: number
  is_stackable: boolean
  max_stack_size: number
  weight: number
  weapon_min_damage: number | null
  weapon_max_damage: number | null
  weapon_speed: number | null
  ability_bonuses: AbilityBonus[]
  is_craftable: boolean
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

export async function getPublicCharacter(
  id: string,
): Promise<PublicCharacterDetail | null> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character', { p_character_id: id })
  if (error) {
    console.error('Failed to load character:', error.message)
    return null
  }
  const rows = (data as PublicCharacterDetail[] | null) ?? []
  return rows[0] ?? null
}

export async function getPublicGuildDetail(
  id: string,
): Promise<PublicGuildDetail | null> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_guild_detail', { p_guild_id: id })
  if (error) {
    console.error('Failed to load guild:', error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    ...row,
    member_count: Number(row.member_count),
    xp: Number(row.xp),
  } as PublicGuildDetail
}

export async function listPublicGuildMembers(
  id: string,
): Promise<PublicGuildMember[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('list_public_guild_members', { p_guild_id: id })
  if (error) {
    console.error('Failed to load guild members:', error.message)
    return []
  }
  return (data as PublicGuildMember[] | null) ?? []
}

export async function listPublicGuilds(): Promise<PublicGuild[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('list_public_guilds')
  if (error) {
    console.error('Failed to load guilds:', error.message)
    return []
  }
  return ((data as PublicGuild[] | null) ?? []).map((g) => ({
    ...g,
    member_count: Number(g.member_count),
  }))
}

export async function getPublicCharacterGuild(
  id: string,
): Promise<PublicCharacterGuild | null> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_guild', { p_character_id: id })
  if (error) {
    console.error('Failed to load guild:', error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    ...row,
    member_count: Number(row.member_count),
  } as PublicCharacterGuild
}

export async function getPublicCharacterEquipment(
  id: string,
): Promise<PublicCharacterEquipmentSlot[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_equipment', { p_character_id: id })
  if (error) {
    console.error('Failed to load equipment:', error.message)
    return []
  }
  return ((data as PublicCharacterEquipmentSlot[] | null) ?? []).map((e) => ({
    ...e,
    ability_bonuses: Array.isArray(e.ability_bonuses) ? e.ability_bonuses : [],
    stats: Array.isArray(e.stats) ? e.stats : [],
  }))
}

export async function getPublicCharacterAbilityScores(
  id: string,
): Promise<PublicCharacterAbilityScore[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_ability_scores', { p_character_id: id })
  if (error) {
    console.error('Failed to load ability scores:', error.message)
    return []
  }
  return (data as PublicCharacterAbilityScore[] | null) ?? []
}

export async function getPublicCharacterSkills(
  id: string,
): Promise<PublicCharacterSkill[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_skills', { p_character_id: id })
  if (error) {
    console.error('Failed to load skills:', error.message)
    return []
  }
  return (data as PublicCharacterSkill[] | null) ?? []
}

export async function getPublicCharacterResources(
  id: string,
): Promise<PublicCharacterResource[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_resources', { p_character_id: id })
  if (error) {
    console.error('Failed to load resources:', error.message)
    return []
  }
  return (data as PublicCharacterResource[] | null) ?? []
}

export async function getPublicCharacterCalculatedStats(
  id: string,
): Promise<PublicCharacterCalculatedStat[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_calculated_stats', { p_character_id: id })
  if (error) {
    console.error('Failed to load calculated stats:', error.message)
    return []
  }
  return (data as PublicCharacterCalculatedStat[] | null) ?? []
}

export async function getPublicCharacterActiveAuras(
  id: string,
): Promise<PublicCharacterActiveAura[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .rpc('get_public_character_active_auras', { p_character_id: id })
  if (error) {
    console.error('Failed to load active auras:', error.message)
    return []
  }
  return (data as PublicCharacterActiveAura[] | null) ?? []
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

export async function listRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('recipes')
    .select(
      'id, display_name, description, skill, required_skill_level, xp_reward, craft_time_seconds, station_tag, ingredients, outputs',
    )
    .order('skill', { ascending: true })
    .order('required_skill_level', { ascending: true })
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load recipes:', error.message)
    return []
  }
  return ((data as Recipe[] | null) ?? []).map((r) => ({
    ...r,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    outputs: Array.isArray(r.outputs) ? r.outputs : [],
  }))
}

export async function listItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('items')
    .select(
      'id, item_name, description, rarity, item_type, slot, required_skill_level, is_stackable, max_stack_size, weight, weapon_min_damage, weapon_max_damage, weapon_speed, ability_bonuses, is_craftable',
    )
    .order('item_name', { ascending: true })
  if (error) {
    console.error('Failed to load items:', error.message)
    return []
  }
  return ((data as Item[] | null) ?? []).map((i) => ({
    ...i,
    ability_bonuses: Array.isArray(i.ability_bonuses) ? i.ability_bonuses : [],
  }))
}

export async function listRarities(): Promise<Rarity[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('rarities')
    .select(
      'id, display_name, description, display_color, sort_order, show_ground_glow, ground_glow_brightness, ground_glow_scale',
    )
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('Failed to load rarities:', error.message)
    return []
  }
  return (data as Rarity[] | null) ?? []
}

export async function listItemTypes(): Promise<ItemType[]> {
  const { data, error } = await supabase
    .schema('necro_content')
    .from('item_types')
    .select('name, group, display_name, stackable, equip_slot')
    .order('display_name', { ascending: true })
  if (error) {
    console.error('Failed to load item types:', error.message)
    return []
  }
  return (data as ItemType[] | null) ?? []
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
