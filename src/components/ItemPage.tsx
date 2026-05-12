import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { AuthOutletContext } from './AuthGate'
import { isAdmin } from '../lib/profile'
import {
  Item,
  ItemClass,
  ItemSubclass,
  InventorySlot,
  Rarity,
  getItem,
  listInventorySlots,
  listItemClasses,
  listItemSubclasses,
  listRarities,
  updateItem,
} from '../lib/necroContent'
import { ItemDetails, RARITY_COLORS, itemToDetailsData } from './ItemDetails'
import { ItemIcon } from './ItemIcon'

// ─────────────────────────────────────────────────────────────────────────────
// ItemPage — dedicated page per item at /g/:gameId/items/:itemId.
// Mirrors CharacterPage layout (back link → hero header → settings sections).
// Admins get an inline edit form; everyone else sees the read-only details.
// ─────────────────────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'found' | 'not-found'

// JSONB fields we surface as JSON textareas in the edit form. Keep this
// list aligned with the matching keys on the Item type.
const JSONB_FIELDS = [
  'ability_bonuses',
  'stats',
  'trigger_effects',
  'consumable_effects',
  'consumable_buffs',
] as const

type JsonbFieldKey = (typeof JSONB_FIELDS)[number]

export function ItemPage() {
  const params = useParams<{ gameId: string; itemId: string }>()
  const { gameId, itemId } = params
  const ctx = useOutletContext<AuthOutletContext>()
  const admin = isAdmin(ctx.profile)

  const [item, setItem] = useState<Item | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [rarities, setRarities] = useState<Rarity[]>([])
  const [subclasses, setSubclasses] = useState<ItemSubclass[]>([])
  const [classes, setClasses] = useState<ItemClass[]>([])
  const [slots, setSlots] = useState<InventorySlot[]>([])
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setLoadState('loading')
    Promise.all([
      getItem(itemId),
      listRarities(),
      listItemSubclasses(),
      listItemClasses(),
      listInventorySlots(),
    ]).then(([it, ra, sc, cl, sl]) => {
      if (cancelled) return
      setItem(it)
      setRarities(ra)
      setSubclasses(sc)
      setClasses(cl)
      setSlots(sl)
      setLoadState(it ? 'found' : 'not-found')
    })
    return () => {
      cancelled = true
    }
  }, [itemId])

  if (loadState === 'loading') {
    return (
      <div className="settings-page settings-page-flow">
        <p className="text-dim">Loading…</p>
      </div>
    )
  }

  if (loadState === 'not-found' || !item) {
    return (
      <div className="settings-page settings-page-flow">
        <h1 className="settings-title">Item not found</h1>
        <p className="text-dim">No item exists with that id.</p>
        {gameId && (
          <Link
            to={`/g/${gameId}/database/items`}
            className="character-back-link"
          >
            ← Back to Items
          </Link>
        )}
      </div>
    )
  }

  const rarity = rarities.find((r) => r.id === item.rarity)
  const subclass = subclasses.find((sc) => sc.name === item.item_subclass)
  const itemClass = subclass
    ? classes.find((c) => c.id === subclass.item_class)
    : undefined
  const rarityColor =
    rarity?.display_color ?? RARITY_COLORS[item.rarity] ?? undefined

  return (
    <div className="settings-page settings-page-flow">
      <div className="character-page-header">
        {gameId && (
          <Link
            to={`/g/${gameId}/database/items`}
            className="character-back-link"
          >
            ← Items
          </Link>
        )}
        <div className="item-page-title-row">
          <ItemIcon id={item.id} rarity={item.rarity} size="lg" />
          <h1
            className="settings-title item-page-title"
            style={{ color: rarityColor }}
          >
            {item.item_name}
          </h1>
          {admin && !editing && (
            <button
              type="button"
              className="item-page-edit-btn"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
        </div>
        <div className="character-page-subtitle">
          {rarity?.display_name ?? item.rarity}
          {subclass?.display_name && <> · {subclass.display_name}</>}
          {itemClass?.display_name && <> · {itemClass.display_name}</>}
          {item.inventory_slot && <> · {item.inventory_slot}</>}
        </div>
      </div>

      <section className="settings-section">
        {editing ? (
          <ItemEditForm
            item={item}
            rarities={rarities}
            subclasses={subclasses}
            slots={slots}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setItem(updated)
              setEditing(false)
            }}
          />
        ) : (
          <ItemDetails
            data={itemToDetailsData({ item, rarity, subclass, itemClass })}
          />
        )}
      </section>
    </div>
  )
}

// ─── Edit form ───────────────────────────────────────────────────────────────

type Draft = {
  item_name: string
  description: string
  rarity: string
  item_subclass: string
  inventory_slot: string
  required_skill_level: string
  is_stackable: boolean
  max_stack_size: string
  weight: string
  weapon_speed: string
  is_consumable: boolean
  consumable_cooldown: string
  is_craftable: boolean
} & Record<JsonbFieldKey, string>

function buildDraft(item: Item): Draft {
  return {
    item_name: item.item_name,
    description: item.description,
    rarity: item.rarity,
    item_subclass: item.item_subclass,
    inventory_slot: item.inventory_slot,
    required_skill_level: String(item.required_skill_level),
    is_stackable: item.is_stackable,
    max_stack_size: String(item.max_stack_size),
    weight: String(item.weight),
    weapon_speed: item.weapon_speed == null ? '' : String(item.weapon_speed),
    is_consumable: item.is_consumable,
    consumable_cooldown:
      item.consumable_cooldown == null ? '' : String(item.consumable_cooldown),
    is_craftable: item.is_craftable,
    ability_bonuses: JSON.stringify(item.ability_bonuses, null, 2),
    stats: JSON.stringify(item.stats, null, 2),
    trigger_effects: JSON.stringify(item.trigger_effects, null, 2),
    consumable_effects: JSON.stringify(item.consumable_effects, null, 2),
    consumable_buffs: JSON.stringify(item.consumable_buffs, null, 2),
  }
}

function ItemEditForm({
  item,
  rarities,
  subclasses,
  slots,
  onCancel,
  onSaved,
}: {
  item: Item
  rarities: Rarity[]
  subclasses: ItemSubclass[]
  slots: InventorySlot[]
  onCancel: () => void
  onSaved: (updated: Item) => void
}) {
  const [draft, setDraft] = useState<Draft>(() => buildDraft(item))
  const [jsonErrors, setJsonErrors] = useState<Partial<Record<JsonbFieldKey, string>>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'success' | 'error'
    text: string
  } | null>(null)

  // Compare draft (parsed) against the original item and produce a Partial<Item>
  // containing only the fields that actually changed. Returns null if any JSONB
  // field fails to parse — the Save button gets disabled in that case.
  function buildPatch(): Partial<Item> | null {
    const errors: Partial<Record<JsonbFieldKey, string>> = {}
    const parsedJsonb: Partial<Record<JsonbFieldKey, unknown>> = {}
    for (const key of JSONB_FIELDS) {
      const raw = draft[key]
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
          errors[key] = 'Must be a JSON array'
          continue
        }
        parsedJsonb[key] = parsed
      } catch (err) {
        errors[key] = (err as Error).message
      }
    }
    setJsonErrors(errors)
    if (Object.keys(errors).length > 0) return null

    const patch: Partial<Item> = {}
    if (draft.item_name !== item.item_name) patch.item_name = draft.item_name
    if (draft.description !== item.description) patch.description = draft.description
    if (draft.rarity !== item.rarity) patch.rarity = draft.rarity
    if (draft.item_subclass !== item.item_subclass)
      patch.item_subclass = draft.item_subclass
    if (draft.inventory_slot !== item.inventory_slot)
      patch.inventory_slot = draft.inventory_slot
    const rsl = Number(draft.required_skill_level) || 0
    if (rsl !== item.required_skill_level) patch.required_skill_level = rsl
    if (draft.is_stackable !== item.is_stackable)
      patch.is_stackable = draft.is_stackable
    const mss = Number(draft.max_stack_size) || 0
    if (mss !== item.max_stack_size) patch.max_stack_size = mss
    const wt = Number(draft.weight) || 0
    if (wt !== item.weight) patch.weight = wt
    const ws = draft.weapon_speed === '' ? null : Number(draft.weapon_speed)
    if (ws !== item.weapon_speed) patch.weapon_speed = ws
    if (draft.is_consumable !== item.is_consumable)
      patch.is_consumable = draft.is_consumable
    const cd =
      draft.consumable_cooldown === '' ? null : Number(draft.consumable_cooldown)
    if (cd !== item.consumable_cooldown) patch.consumable_cooldown = cd
    if (draft.is_craftable !== item.is_craftable)
      patch.is_craftable = draft.is_craftable

    for (const key of JSONB_FIELDS) {
      const newVal = parsedJsonb[key]
      const oldVal = item[key]
      if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(patch as any)[key] = newVal
      }
    }

    return patch
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const patch = buildPatch()
    if (!patch) {
      setMessage({ kind: 'error', text: 'Fix the JSON errors above and try again.' })
      return
    }
    if (Object.keys(patch).length === 0) {
      setMessage({ kind: 'error', text: 'No changes to save.' })
      return
    }
    setSaving(true)
    setMessage(null)
    updateItem(item.id, patch)
      .then((updated) => {
        if (updated) {
          setMessage({ kind: 'success', text: 'Saved.' })
          onSaved(updated)
        } else {
          setMessage({
            kind: 'error',
            text: 'Save failed. Check the console for details.',
          })
        }
      })
      .finally(() => setSaving(false))
  }

  function formatJson(key: JsonbFieldKey) {
    try {
      const parsed = JSON.parse(draft[key])
      setDraft({ ...draft, [key]: JSON.stringify(parsed, null, 2) })
      setJsonErrors({ ...jsonErrors, [key]: undefined })
    } catch (err) {
      setJsonErrors({ ...jsonErrors, [key]: (err as Error).message })
    }
  }

  const hasJsonErrors = Object.values(jsonErrors).some((v) => !!v)

  return (
    <form className="item-edit-form" onSubmit={handleSubmit}>
      <div className="item-edit-grid">
        <div className="item-edit-col">
          <Field label="Name">
            <input
              type="text"
              className="item-edit-input"
              value={draft.item_name}
              onChange={(e) => setDraft({ ...draft, item_name: e.target.value })}
            />
          </Field>

          <Field label="Description">
            <textarea
              className="item-edit-textarea"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </Field>

          <Field label="Rarity">
            <select
              className="item-edit-input"
              value={draft.rarity}
              onChange={(e) => setDraft({ ...draft, rarity: e.target.value })}
            >
              {rarities.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subclass">
            <select
              className="item-edit-input"
              value={draft.item_subclass}
              onChange={(e) =>
                setDraft({ ...draft, item_subclass: e.target.value })
              }
            >
              {subclasses.map((sc) => (
                <option key={sc.name} value={sc.name}>
                  {sc.display_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Inventory Slot">
            <select
              className="item-edit-input"
              value={draft.inventory_slot}
              onChange={(e) =>
                setDraft({ ...draft, inventory_slot: e.target.value })
              }
            >
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Required Level">
            <input
              type="number"
              min={0}
              className="item-edit-input"
              value={draft.required_skill_level}
              onChange={(e) =>
                setDraft({ ...draft, required_skill_level: e.target.value })
              }
            />
          </Field>

          <Field label="Weight">
            <input
              type="number"
              step="0.1"
              min={0}
              className="item-edit-input"
              value={draft.weight}
              onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
            />
          </Field>

          <Field label="Weapon Speed (s, blank = none)">
            <input
              type="number"
              step="0.1"
              min={0}
              className="item-edit-input"
              value={draft.weapon_speed}
              onChange={(e) =>
                setDraft({ ...draft, weapon_speed: e.target.value })
              }
            />
          </Field>

          <Field label="Stackable">
            <label className="item-edit-checkbox">
              <input
                type="checkbox"
                checked={draft.is_stackable}
                onChange={(e) =>
                  setDraft({ ...draft, is_stackable: e.target.checked })
                }
              />
              <span>Stackable in inventory</span>
            </label>
          </Field>

          {draft.is_stackable && (
            <Field label="Max Stack Size">
              <input
                type="number"
                min={1}
                className="item-edit-input"
                value={draft.max_stack_size}
                onChange={(e) =>
                  setDraft({ ...draft, max_stack_size: e.target.value })
                }
              />
            </Field>
          )}

          <Field label="Consumable">
            <label className="item-edit-checkbox">
              <input
                type="checkbox"
                checked={draft.is_consumable}
                onChange={(e) =>
                  setDraft({ ...draft, is_consumable: e.target.checked })
                }
              />
              <span>Consumed on use</span>
            </label>
          </Field>

          {draft.is_consumable && (
            <Field label="Consumable Cooldown (s, blank = none)">
              <input
                type="number"
                step="0.1"
                min={0}
                className="item-edit-input"
                value={draft.consumable_cooldown}
                onChange={(e) =>
                  setDraft({ ...draft, consumable_cooldown: e.target.value })
                }
              />
            </Field>
          )}

          <Field label="Craftable">
            <label className="item-edit-checkbox">
              <input
                type="checkbox"
                checked={draft.is_craftable}
                onChange={(e) =>
                  setDraft({ ...draft, is_craftable: e.target.checked })
                }
              />
              <span>Producible by a recipe</span>
            </label>
          </Field>
        </div>

        <div className="item-edit-col">
          {JSONB_FIELDS.map((key) => (
            <JsonField
              key={key}
              label={prettyLabel(key)}
              value={draft[key]}
              onChange={(v) => {
                setDraft({ ...draft, [key]: v })
                // Clear stale error when user types.
                if (jsonErrors[key]) {
                  setJsonErrors({ ...jsonErrors, [key]: undefined })
                }
              }}
              onFormat={() => formatJson(key)}
              error={jsonErrors[key]}
            />
          ))}
        </div>
      </div>

      <div className="item-edit-actions">
        <button
          type="button"
          className="item-edit-cancel"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="item-edit-save"
          disabled={saving || hasJsonErrors}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {message && (
        <div
          className={
            message.kind === 'success'
              ? 'item-edit-message item-edit-message-success'
              : 'item-edit-message item-edit-message-error'
          }
        >
          {message.text}
        </div>
      )}
    </form>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="item-edit-field">
      <span className="item-edit-label">{label}</span>
      {children}
    </label>
  )
}

function JsonField({
  label,
  value,
  onChange,
  onFormat,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onFormat: () => void
  error: string | undefined
}) {
  return (
    <div className="item-edit-field">
      <div className="item-edit-jsonhead">
        <span className="item-edit-label">{label}</span>
        <button
          type="button"
          className="item-edit-format"
          onClick={onFormat}
        >
          Format
        </button>
      </div>
      <textarea
        className={`item-edit-textarea item-edit-json${
          error ? ' item-edit-json-error' : ''
        }`}
        rows={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {error && <div className="item-edit-json-msg">{error}</div>}
    </div>
  )
}

function prettyLabel(key: JsonbFieldKey): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

