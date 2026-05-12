import { Link } from 'react-router-dom'
import {
  AbilityBonus,
  Item,
  ItemClass,
  ItemConsumableBuff,
  ItemConsumableEffect,
  ItemStatBonus,
  ItemSubclass,
  ItemTriggerEffect,
  PublicCharacterEquipmentSlot,
  Rarity,
} from '../lib/necroContent'

// Fallback rarity → colour map for cases where the rarities catalog
// hasn't loaded yet. The catalog (Rarity.display_color) wins when
// available — keep the fallback in sync only if rarities are added.
export const RARITY_COLORS: Record<string, string> = {
  trash: '#7a7a7a',
  common: '#FFFFFF',
  uncommon: '#1eff00',
  rare: '#0070dd',
  epic: '#a335ee',
  legendary: '#ff8000',
  mythic: '#ff4ddc',
}

// Single normalised shape consumed by the drawer. Both the Items table
// (catalog) and the character Equipment table funnel into this so future
// drawer changes only happen in one place.
export type ItemDetailsData = {
  id: string
  description: string | null
  rarityId: string | null
  rarity?: Rarity
  subclassId: string | null
  subclass?: ItemSubclass
  itemClass?: ItemClass
  inventorySlot?: string
  weaponSpeed: number | null
  weight: number
  requiredSkillLevel: number
  isStackable: boolean
  maxStackSize: number
  // null = "not known at this level" (e.g., character equipment fetch
  // doesn't carry is_craftable) — the row gets suppressed.
  isCraftable: boolean | null
  abilityBonuses: AbilityBonus[]
  // Stat-effect bumps the item gives (attack_power, crit_chance, etc.).
  stats: ItemStatBonus[]
  // Procs / on-hit / on-crit triggers — sourced from the catalog Item.
  triggerEffects: ItemTriggerEffect[]
  // Consumable-only fields. `isConsumable=false` (default) hides the
  // whole block; otherwise effects/buffs render when populated.
  isConsumable: boolean
  consumableCooldown: number | null
  consumableEffects: ItemConsumableEffect[]
  consumableBuffs: ItemConsumableBuff[]
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

function formatStatBonus(stat: string, value: number, modifierType?: string): string {
  const sign = value > 0 ? '+' : ''
  const suffix = modifierType === 'Percent' ? '%' : ''
  const label = stat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return `${sign}${value}${suffix} ${label}`
}

export function ItemDetails({
  data,
  viewHref,
}: {
  data: ItemDetailsData
  // When provided, renders a "View item page →" footer link. Used by the
  // character Equipment drawer to deep-link into the dedicated item page.
  viewHref?: string
}) {
  const rarityColor =
    data.rarity?.display_color ??
    (data.rarityId ? RARITY_COLORS[data.rarityId] : undefined)
  return (
    <dl className="data-expansion">
      <dt>ID</dt>
      <dd>
        <code className="data-table-mono">{data.id}</code>
      </dd>

      {(data.subclass || data.subclassId) && (
        <>
          <dt>Subclass</dt>
          <dd>{data.subclass?.display_name ?? data.subclassId}</dd>
        </>
      )}

      {data.itemClass && (
        <>
          <dt>Class</dt>
          <dd>{data.itemClass.display_name}</dd>
        </>
      )}

      {data.inventorySlot && (
        <>
          <dt>Inventory Slot</dt>
          <dd>{data.inventorySlot}</dd>
        </>
      )}

      {(data.rarity || data.rarityId) && (
        <>
          <dt>Rarity</dt>
          <dd style={{ color: rarityColor }}>
            {data.rarity?.display_name ?? capitalize(data.rarityId ?? '')}
          </dd>
        </>
      )}

      {data.weaponSpeed != null && data.weaponSpeed > 0 && (
        <>
          <dt>Swing speed</dt>
          <dd>{data.weaponSpeed}s</dd>
        </>
      )}

      {data.weight > 0 && (
        <>
          <dt>Weight</dt>
          <dd>{data.weight}</dd>
        </>
      )}

      {data.requiredSkillLevel > 0 && (
        <>
          <dt>Required Level</dt>
          <dd>{data.requiredSkillLevel}</dd>
        </>
      )}

      {data.isStackable && data.maxStackSize > 1 && (
        <>
          <dt>Max Stack</dt>
          <dd>{data.maxStackSize.toLocaleString()}</dd>
        </>
      )}

      {data.isCraftable !== null && (
        <>
          <dt>Craftable</dt>
          <dd>{data.isCraftable ? 'Yes' : 'No'}</dd>
        </>
      )}

      {data.description && (
        <>
          <dt>Description</dt>
          <dd>{data.description}</dd>
        </>
      )}

      {data.abilityBonuses.length > 0 && (
        <>
          <dt>Bonuses</dt>
          <dd>
            <ul className="data-expansion-list">
              {data.abilityBonuses.map((b, i) => (
                <li
                  key={i}
                  className={
                    b.value > 0
                      ? 'data-expansion-positive'
                      : b.value < 0
                        ? 'data-expansion-negative'
                        : ''
                  }
                >
                  {b.description}
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}

      {data.stats.length > 0 && (
        <>
          <dt>Stat Effects</dt>
          <dd>
            <ul className="data-expansion-list">
              {data.stats.map((s, i) => (
                <li
                  key={i}
                  className={
                    s.value > 0
                      ? 'data-expansion-positive'
                      : s.value < 0
                        ? 'data-expansion-negative'
                        : ''
                  }
                >
                  {formatStatBonus(s.stat, s.value, s.modifierType)}
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}

      {data.triggerEffects.length > 0 && (
        <>
          <dt>Trigger Effects</dt>
          <dd>
            <ul className="data-expansion-list">
              {data.triggerEffects.map((t, i) => (
                <li key={i}>{formatTriggerEffect(t)}</li>
              ))}
            </ul>
          </dd>
        </>
      )}

      {data.isConsumable && (
        <>
          <dt>Use</dt>
          <dd>
            Consumable
            {data.consumableCooldown != null && data.consumableCooldown > 0 && (
              <span className="text-dim">
                {' · '}
                {data.consumableCooldown}s cooldown
              </span>
            )}
          </dd>

          {data.consumableEffects.length > 0 && (
            <>
              <dt>On Use</dt>
              <dd>
                <ul className="data-expansion-list">
                  {data.consumableEffects.map((c, i) => (
                    <li key={i}>{formatConsumableEffect(c)}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}

          {data.consumableBuffs.length > 0 && (
            <>
              <dt>Granted Buffs</dt>
              <dd>
                <ul className="data-expansion-list">
                  {data.consumableBuffs.map((b, i) => (
                    <li key={i}>{formatConsumableBuff(b)}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </>
      )}

      {viewHref && (
        <>
          <dt>&nbsp;</dt>
          <dd>
            <Link to={viewHref} className="data-expansion-link">
              View item page →
            </Link>
          </dd>
        </>
      )}
    </dl>
  )
}

function formatTriggerEffect(t: ItemTriggerEffect): string {
  // "On hit (10% chance, 3s ICD): Burn — 5 fire dmg over 3s"
  const trig = capitalize(t.trigger.replace(/_/g, ' '))
  const chance = `${(t.chance * 100).toFixed(0)}%`
  const icd =
    t.internalCooldown != null && t.internalCooldown > 0
      ? `, ${t.internalCooldown}s ICD`
      : ''
  const desc =
    t.effect.description ??
    `${t.effect.type}${t.effect.amount != null ? ` ${t.effect.amount}` : ''}${
      t.effect.school ? ` ${t.effect.school}` : ''
    }${
      t.effect.duration != null && t.effect.duration > 0
        ? ` over ${t.effect.duration}s`
        : ''
    }`
  return `${trig} (${chance}${icd}): ${desc}`
}

function formatConsumableEffect(c: ItemConsumableEffect): string {
  const resource = capitalize(c.resourceType)
  const amount =
    c.flatAmount != null && c.flatAmount !== 0
      ? `${c.flatAmount > 0 ? '+' : ''}${c.flatAmount}`
      : c.percentOfMax != null && c.percentOfMax !== 0
        ? `${c.percentOfMax > 0 ? '+' : ''}${c.percentOfMax}% of max`
        : ''
  const over =
    c.overTime && c.duration != null && c.duration > 0
      ? ` over ${c.duration}s`
      : ''
  return `${amount} ${resource}${over}`.trim()
}

function formatConsumableBuff(b: ItemConsumableBuff): string {
  const sign = (b.value ?? 0) > 0 ? '+' : ''
  const suffix = b.modifierType === 'Percent' ? '%' : ''
  const stat = b.stat ? capitalize(b.stat.replace(/_/g, ' ')) : (b.auraId ?? 'Buff')
  const dur =
    b.duration != null && b.duration > 0 ? ` for ${b.duration}s` : ''
  return `${sign}${b.value ?? 0}${suffix} ${stat}${dur}`
}

// Adapter — turn a catalog `Item` (plus resolved rarity / subclass / class
// objects) into the normalised drawer shape.
export function itemToDetailsData({
  item,
  rarity,
  subclass,
  itemClass,
}: {
  item: Item
  rarity?: Rarity
  subclass?: ItemSubclass
  itemClass?: ItemClass
}): ItemDetailsData {
  return {
    id: item.id,
    description: item.description,
    rarityId: item.rarity,
    rarity,
    subclassId: item.item_subclass,
    subclass,
    itemClass,
    inventorySlot: item.inventory_slot,
    weaponSpeed: item.weapon_speed,
    weight: item.weight,
    requiredSkillLevel: item.required_skill_level,
    isStackable: item.is_stackable,
    maxStackSize: item.max_stack_size,
    isCraftable: item.is_craftable,
    abilityBonuses: item.ability_bonuses,
    stats: item.stats,
    triggerEffects: item.trigger_effects,
    isConsumable: item.is_consumable,
    consumableCooldown: item.consumable_cooldown,
    consumableEffects: item.consumable_effects,
    consumableBuffs: item.consumable_buffs,
  }
}

// Adapter — turn an equipped slot row into the normalised drawer shape.
// `catalogItem` is the matching Item row from `listItems()` (used to fill
// in fields the equipment fetch doesn't carry: weight, stack, craftable).
export function equipmentToDetailsData({
  slot,
  catalogItem,
  rarity,
  subclass,
  itemClass,
}: {
  slot: PublicCharacterEquipmentSlot
  catalogItem?: Item
  rarity?: Rarity
  subclass?: ItemSubclass
  itemClass?: ItemClass
}): ItemDetailsData {
  return {
    id: slot.item_id,
    description: slot.description,
    rarityId: slot.item_rarity,
    rarity,
    subclassId: slot.item_subclass,
    subclass,
    itemClass,
    inventorySlot: catalogItem?.inventory_slot,
    weaponSpeed: slot.weapon_speed,
    weight: catalogItem?.weight ?? 0,
    requiredSkillLevel: catalogItem?.required_skill_level ?? 0,
    isStackable: catalogItem?.is_stackable ?? false,
    maxStackSize: catalogItem?.max_stack_size ?? 0,
    isCraftable: catalogItem ? catalogItem.is_craftable : null,
    // Prefer catalog data for bonuses — that's the source of truth in
    // necro_content.items, and it matches exactly what the Items table on
    // GamePage shows. The equipment RPC's `ability_bonuses` / `stats`
    // columns can drift (broken older RPC variants, partial joins) so we
    // only fall back to them when the catalog hasn't loaded yet.
    abilityBonuses: catalogItem?.ability_bonuses ?? slot.ability_bonuses,
    stats: catalogItem?.stats ?? slot.stats,
    triggerEffects: catalogItem?.trigger_effects ?? [],
    isConsumable: catalogItem?.is_consumable ?? false,
    consumableCooldown: catalogItem?.consumable_cooldown ?? null,
    consumableEffects: catalogItem?.consumable_effects ?? [],
    consumableBuffs: catalogItem?.consumable_buffs ?? [],
  }
}
