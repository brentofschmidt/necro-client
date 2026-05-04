-- ============================================================
-- 0040_populate_item_types.sql
--
-- Fleshes out necro_content.item_types beyond the 11 types seeded in
-- 0034. The additions span every "group" the client UI groups by:
--
--   Weapon      — extra one-handed and two-handed weapons
--   Armor       — full body slots (helmet/chest/legs/feet/hands/back/waist)
--   Jewelry     — ring + amulet
--   Tool        — fishing rod alongside the existing pickaxe / hatchet / knife
--   Consumable  — food / potion / scroll / bandage
--   Material    — gathering / crafting inputs
--   Container   — bag + quiver
--
-- Equip slots follow a standard MMO layout (Head/Chest/Legs/Feet/Hands/
-- Back/Waist/Neck/Finger). Consumables and materials are stackable and
-- live InventoryOnly.
--
-- Idempotent.
-- ============================================================

insert into necro_content.item_types (name, "group", display_name, stackable, equip_slot) values

    -- ── Weapons (additions) ─────────────────────────────────────────────────
    ('greatsword',     'Weapon',     'Greatsword',     false, 'TwoHand'),
    ('warhammer',      'Weapon',     'Warhammer',      false, 'TwoHand'),
    ('spear',          'Weapon',     'Spear',          false, 'TwoHand'),
    ('crossbow',       'Weapon',     'Crossbow',       false, 'TwoHand'),
    ('wand',           'Weapon',     'Wand',           false, 'MainHand'),
    ('throwing_knife', 'Weapon',     'Throwing Knife', true,  'MainHand'),

    -- ── Armor ───────────────────────────────────────────────────────────────
    ('helmet',         'Armor',      'Helmet',         false, 'Head'),
    ('chest',          'Armor',      'Chest',          false, 'Chest'),
    ('legs',           'Armor',      'Legs',           false, 'Legs'),
    ('boots',          'Armor',      'Boots',          false, 'Feet'),
    ('gloves',         'Armor',      'Gloves',         false, 'Hands'),
    ('cloak',          'Armor',      'Cloak',          false, 'Back'),
    ('belt',           'Armor',      'Belt',           false, 'Waist'),

    -- ── Jewelry ─────────────────────────────────────────────────────────────
    ('ring',           'Jewelry',    'Ring',           false, 'Finger'),
    ('amulet',         'Jewelry',    'Amulet',         false, 'Neck'),

    -- ── Tools (addition) ────────────────────────────────────────────────────
    ('fishing_rod',    'Tool',       'Fishing Rod',    false, 'MainHand'),

    -- ── Consumables ─────────────────────────────────────────────────────────
    ('food',           'Consumable', 'Food',           true,  'InventoryOnly'),
    ('potion',         'Consumable', 'Potion',         true,  'InventoryOnly'),
    ('scroll',         'Consumable', 'Scroll',         true,  'InventoryOnly'),
    ('bandage',        'Consumable', 'Bandage',        true,  'InventoryOnly'),

    -- ── Materials (gathering / crafting inputs) ─────────────────────────────
    ('ore',            'Material',   'Ore',            true,  'InventoryOnly'),
    ('ingot',          'Material',   'Ingot',          true,  'InventoryOnly'),
    ('herb',           'Material',   'Herb',           true,  'InventoryOnly'),
    ('hide',           'Material',   'Hide',           true,  'InventoryOnly'),
    ('log',            'Material',   'Log',            true,  'InventoryOnly'),
    ('fish',           'Material',   'Fish',           true,  'InventoryOnly'),
    ('gem',            'Material',   'Gem',            true,  'InventoryOnly'),
    ('reagent',        'Material',   'Reagent',        true,  'InventoryOnly'),

    -- ── Containers ──────────────────────────────────────────────────────────
    ('bag',            'Container',  'Bag',            false, 'InventoryOnly'),
    ('quiver',         'Container',  'Quiver',         false, 'Back')

on conflict (name) do update set
    "group"      = excluded."group",
    display_name = excluded.display_name,
    stackable    = excluded.stackable,
    equip_slot   = excluded.equip_slot;
