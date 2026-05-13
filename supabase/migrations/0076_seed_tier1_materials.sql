-- ============================================================
-- 0076_seed_tier1_materials.sql
--
-- Seeds the tier-1 crafting material catalog — the foundation stack
-- every other recipe builds on. Everything in here is hand-gatherable
-- (no tool required) or one step of "anywhere" processing on top of
-- hand-gathered inputs.
--
-- Three groups land:
--
--   Raw materials (8) — gathered from world gameobjects with bare hands:
--     stone, flint, wood_log, clay, water, flax, bone, sinew
--
--   Hand-gathered foods (4):
--     raspberries (+5 HP), blueberries (+7 HP), strawberries (+10 HP),
--     mushrooms (+10 stamina)
--
--   Crafted intermediates (2) — recipes are "anywhere", no station:
--     twine     = 1 sinew OR 2 flax → 1 twine
--     soft_clay = 1 clay + 1 water → 1 soft_clay
--
-- The actual recipes land in a separate migration; this one only seeds
-- the items so the recipe rows can FK to them. Tools (stone_pickaxe,
-- etc.) similarly land in their own migration.
--
-- ── New item_subclasses ────────────────────────────────────────────
-- Five new subclasses are added under existing item_classes so the
-- filter UI groups them sensibly. All five are stackable
-- inventory-only entries:
--
--   stone   (Material) — rough rock + flint
--   clay    (Material) — raw clay + soft_clay intermediate
--   liquid  (Material) — water (and future oils/inks/etc.)
--   fibre   (Material) — flax, sinew, twine
--   bone    (Material) — animal bones
--
-- Foods reuse the existing `food` subclass; logs reuse `log`.
--
-- ── Defensive column adds ──────────────────────────────────────────
-- The is_consumable / consumable_cooldown / consumable_effects /
-- consumable_buffs columns are referenced by 0071's admin RPC and by
-- the client's Item type, but no earlier migration in the visible
-- history adds them. Re-asserting with ADD COLUMN IF NOT EXISTS so a
-- clean rebuild doesn't break on the food rows below.
--
-- Idempotent — every step uses IF NOT EXISTS / ON CONFLICT DO UPDATE.
-- ============================================================


-- ── 1. Defensive consumable column adds ────────────────────────────
alter table necro_content.items
    add column if not exists is_consumable boolean not null default false;
alter table necro_content.items
    add column if not exists consumable_cooldown real;
alter table necro_content.items
    add column if not exists consumable_effects jsonb not null default '[]'::jsonb;
alter table necro_content.items
    add column if not exists consumable_buffs jsonb not null default '[]'::jsonb;


-- ── 2. New item_subclasses ─────────────────────────────────────────
insert into necro_content.item_subclasses
    (name, item_class, display_name, stackable, inventory_slot) values
    ('stone',  'material', 'Stone',  true, 'InventoryOnly'),
    ('clay',   'material', 'Clay',   true, 'InventoryOnly'),
    ('liquid', 'material', 'Liquid', true, 'InventoryOnly'),
    ('fibre',  'material', 'Fibre',  true, 'InventoryOnly'),
    ('bone',   'material', 'Bone',   true, 'InventoryOnly')
on conflict (name) do update set
    item_class     = excluded.item_class,
    display_name   = excluded.display_name,
    stackable      = excluded.stackable,
    inventory_slot = excluded.inventory_slot;


-- ── 3. Tier-1 items ────────────────────────────────────────────────
-- Stack size 1000 matches the existing material convention
-- (oak_log, basic_herb, etc. from 0041). Weight is the per-unit value;
-- a stack of 1000 logs would be 1000.0 kg (heavy by design — encourages
-- using up materials rather than hoarding stacks).
insert into necro_content.items (
    id, item_name, description,
    rarity, item_subclass, inventory_slot,
    required_skill_level, is_stackable, max_stack_size, weight,
    is_consumable, consumable_cooldown, consumable_effects,
    is_craftable
) values

    -- ── Raw materials (gathered with bare hands) ──────────────────
    ('stone', 'Stone',
     'A rough rock pried loose from the ground. The starting material for stone-tier tools.',
     'common', 'stone', 'InventoryOnly',
     0, true, 1000, 0.5,
     false, null, '[]'::jsonb,
     false),

    ('flint', 'Flint',
     'A sharper stone with a brittle, chipped edge. Knaps into the cutting surface of basic tools.',
     'common', 'stone', 'InventoryOnly',
     0, true, 1000, 0.3,
     false, null, '[]'::jsonb,
     false),

    ('wood_log', 'Wood Log',
     'A length of unprocessed wood. The base for hafts, shafts, and structural pieces.',
     'common', 'log', 'InventoryOnly',
     0, true, 1000, 1.0,
     false, null, '[]'::jsonb,
     false),

    ('clay', 'Clay',
     'A lump of dry, dense clay dug from a riverbank. Soften it with water before working.',
     'common', 'clay', 'InventoryOnly',
     0, true, 1000, 0.6,
     false, null, '[]'::jsonb,
     false),

    ('water', 'Water',
     'A flask of fresh water. Used in cooking, alchemy, and softening clay.',
     'common', 'liquid', 'InventoryOnly',
     0, true, 1000, 0.5,
     false, null, '[]'::jsonb,
     false),

    ('flax', 'Flax',
     'A bundle of long flax stalks. Spun together they become twine.',
     'common', 'fibre', 'InventoryOnly',
     0, true, 1000, 0.1,
     false, null, '[]'::jsonb,
     false),

    ('bone', 'Bone',
     'A handful of small clean bones. Carved into lockpicks, needles, and small tool parts.',
     'common', 'bone', 'InventoryOnly',
     0, true, 1000, 0.2,
     false, null, '[]'::jsonb,
     false),

    ('sinew', 'Sinew',
     'Stringy connective tissue stripped from a kill. Stronger than flax — one strand makes a length of twine.',
     'common', 'fibre', 'InventoryOnly',
     0, true, 1000, 0.1,
     false, null, '[]'::jsonb,
     false),

    -- ── Hand-gathered foods ──────────────────────────────────────
    -- Stack to 50 (smaller than materials — foods aren't hoarded the
    -- same way). 1-second consumable_cooldown is the standard
    -- "between bites" gate. HP curves by variety: raspberries (5) →
    -- blueberries (7) → strawberries (10), encouraging exploration
    -- of the rarer biomes for the better heal.
    ('raspberries', 'Raspberries',
     'A handful of bright red raspberries from a forest edge. A small wash of vitality.',
     'common', 'food', 'InventoryOnly',
     0, true, 50, 0.1,
     true, 1,
     '[{"resourceType":"health","flatAmount":5}]'::jsonb,
     false),

    ('blueberries', 'Blueberries',
     'A cluster of dusky-blue berries from cooler meadows. Slightly more sustaining than the common forest sort.',
     'common', 'food', 'InventoryOnly',
     0, true, 50, 0.1,
     true, 1,
     '[{"resourceType":"health","flatAmount":7}]'::jsonb,
     false),

    ('strawberries', 'Strawberries',
     'Plump red strawberries from a sunlit glade. The juiciest of the wild berries.',
     'common', 'food', 'InventoryOnly',
     0, true, 50, 0.1,
     true, 1,
     '[{"resourceType":"health","flatAmount":10}]'::jsonb,
     false),

    ('mushrooms', 'Mushrooms',
     'A bunch of speckled forest mushrooms. Restores stamina when eaten raw.',
     'common', 'food', 'InventoryOnly',
     0, true, 50, 0.1,
     true, 1,
     '[{"resourceType":"stamina","flatAmount":10}]'::jsonb,
     false),

    -- ── Crafted intermediates (recipes land separately) ──────────
    ('twine', 'Twine',
     'A short length of corded twine — either flax or sinew, depending on what was at hand. Binds hafts and bowstrings.',
     'common', 'fibre', 'InventoryOnly',
     0, true, 1000, 0.05,
     false, null, '[]'::jsonb,
     true),

    ('soft_clay', 'Soft Clay',
     'Clay that has been kneaded with water until it is workable. Ready to shape into a cookpot or jar.',
     'common', 'clay', 'InventoryOnly',
     0, true, 1000, 0.6,
     false, null, '[]'::jsonb,
     true)

on conflict (id) do update set
    item_name           = excluded.item_name,
    description         = excluded.description,
    rarity              = excluded.rarity,
    item_subclass       = excluded.item_subclass,
    inventory_slot      = excluded.inventory_slot,
    is_stackable        = excluded.is_stackable,
    max_stack_size      = excluded.max_stack_size,
    weight              = excluded.weight,
    is_consumable       = excluded.is_consumable,
    consumable_cooldown = excluded.consumable_cooldown,
    consumable_effects  = excluded.consumable_effects,
    is_craftable        = excluded.is_craftable;
