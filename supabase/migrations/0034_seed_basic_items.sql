-- ============================================================
-- 0034_seed_basic_items.sql
--
-- First content for necro_content.items. Three layers seeded together
-- because items FK into both:
--
--   1. necro_content.rarities    — 5-tier WoW-style ladder
--                                   (common/uncommon/rare/epic/legendary)
--   2. necro_content.item_types  — weapon types + tools + currency
--   3. necro_content.items       — gold + the stone-tier starter set
--
-- Stone is the bottommost tier — weapons here exist so a fresh
-- character has SOMETHING to swing. Future migrations add bronze,
-- iron, steel, …
--
-- Item ids are namespaced by tier when applicable (stone_sword,
-- stone_pickaxe). Currency uses 'gold'.
--
-- Idempotent.
-- ============================================================


-- ── 1. Rarities ─────────────────────────────────────────────────────────────
insert into necro_content.rarities (id, display_name, display_color, sort_order) values
    ('common',    'Common',    '#FFFFFF',  0),
    ('uncommon',  'Uncommon',  '#1eff00', 10),
    ('rare',      'Rare',      '#0070dd', 20),
    ('epic',      'Epic',      '#a335ee', 30),
    ('legendary', 'Legendary', '#ff8000', 40)
on conflict (id) do update set
    display_name  = excluded.display_name,
    display_color = excluded.display_color,
    sort_order    = excluded.sort_order;


-- ── 2. Item types ───────────────────────────────────────────────────────────
insert into necro_content.item_types (name, "group", display_name, stackable, equip_slot) values
    -- Weapons (match the skill ids in the proficiencies seed: swords/axes/etc.)
    ('sword',            'Weapon',   'Sword',            false, 'MainHand'),
    ('axe',              'Weapon',   'Axe',              false, 'MainHand'),
    ('mace',             'Weapon',   'Mace',             false, 'MainHand'),
    ('dagger',           'Weapon',   'Dagger',           false, 'MainHand'),
    ('bow',              'Weapon',   'Bow',              false, 'TwoHand'),
    ('staff',            'Weapon',   'Staff',            false, 'TwoHand'),

    -- Armor
    ('shield',           'Armor',    'Shield',           false, 'OffHand'),

    -- Gathering tools
    ('pickaxe',          'Tool',     'Pickaxe',          false, 'MainHand'),
    ('woodcutting_axe',  'Tool',     'Woodcutting Axe',  false, 'MainHand'),
    ('skinning_knife',   'Tool',     'Skinning Knife',   false, 'MainHand'),

    -- Currency
    ('currency',         'Currency', 'Currency',         true,  'InventoryOnly')

on conflict (name) do update set
    "group"      = excluded."group",
    display_name = excluded.display_name,
    stackable    = excluded.stackable,
    equip_slot   = excluded.equip_slot;


-- ── 3. Items ────────────────────────────────────────────────────────────────

-- Currency
insert into necro_content.items (
    id, item_name, description, rarity, item_type, slot,
    required_skill_level, is_stackable, max_stack_size, weight
) values
    ('gold', 'Gold',
     'The standard coin of the realm. Accepted by every honest merchant — and most dishonest ones too.',
     'common', 'currency', 'InventoryOnly',
     0, true, 1000000, 0.01)
on conflict (id) do update set
    item_name      = excluded.item_name,
    description    = excluded.description,
    rarity         = excluded.rarity,
    item_type      = excluded.item_type,
    slot           = excluded.slot,
    is_stackable   = excluded.is_stackable,
    max_stack_size = excluded.max_stack_size,
    weight         = excluded.weight;


-- Starter weapons. Material per type matches what makes physical sense:
--   bronze for swords / combat axes (need a metal edge)
--   wooden for bows / staves (the weapon IS its haft)
--   stone for maces / daggers (cudgels and flint shivs are real)
insert into necro_content.items (
    id, item_name, description, rarity, item_type, slot,
    required_skill_level, weight,
    weapon_min_damage, weapon_max_damage, weapon_speed
) values
    ('bronze_sword',  'Bronze Sword',
     'A short sword cast in dull bronze. Standard issue for new-blooded warriors.',
     'common', 'sword', 'MainHand', 0, 3.0,
     4, 6, 2.0),

    ('bronze_axe',    'Bronze Axe',
     'A bronze-headed war axe. Heavier than a sword, but no harder to swing.',
     'common', 'axe', 'MainHand', 0, 4.0,
     4, 7, 2.5),

    ('stone_mace',    'Stone Mace',
     'A blunt cudgel topped with a knob of granite. Crushes bone where it cannot cut.',
     'common', 'mace', 'MainHand', 0, 4.0,
     3, 5, 2.7),

    ('stone_dagger',  'Stone Dagger',
     'A small flake of obsidian sharpened to a vicious edge. Quick, quiet, brittle.',
     'common', 'dagger', 'MainHand', 0, 1.0,
     1, 3, 1.5),

    ('wooden_bow',    'Wooden Bow',
     'A simple shortbow of seasoned yew. Light, quick to draw, and quiet in skilled hands.',
     'common', 'bow', 'TwoHand', 0, 2.0,
     3, 5, 2.5),

    ('wooden_staff',  'Wooden Staff',
     'A length of straight oak smoothed by use, capped with a cloudy crystal that hums faintly when held.',
     'common', 'staff', 'TwoHand', 0, 3.0,
     3, 5, 2.0)

on conflict (id) do update set
    item_name         = excluded.item_name,
    description       = excluded.description,
    rarity            = excluded.rarity,
    item_type         = excluded.item_type,
    slot              = excluded.slot,
    weight            = excluded.weight,
    weapon_min_damage = excluded.weapon_min_damage,
    weapon_max_damage = excluded.weapon_max_damage,
    weapon_speed      = excluded.weapon_speed;


-- Stone-tier gathering tools (also usable as makeshift weapons)
insert into necro_content.items (
    id, item_name, description, rarity, item_type, slot,
    required_skill_level, weight,
    weapon_min_damage, weapon_max_damage, weapon_speed
) values
    ('stone_pickaxe', 'Stone Pickaxe',
     'A pointed stone head bound to a sturdy haft. Chips ore from rock, with effort.',
     'common', 'pickaxe', 'MainHand', 0, 3.0,
     1, 2, 2.5),

    ('stone_woodcutting_axe', 'Stone Woodcutting Axe',
     'A broad stone head shaped for felling. Slow work — bring patience and a whetstone.',
     'common', 'woodcutting_axe', 'MainHand', 0, 3.0,
     1, 3, 2.5),

    ('stone_skinning_knife', 'Stone Skinning Knife',
     'A short curved blade of chipped flint. Light, sharp enough for hides and small game.',
     'common', 'skinning_knife', 'MainHand', 0, 1.0,
     1, 2, 1.5)

on conflict (id) do update set
    item_name         = excluded.item_name,
    description       = excluded.description,
    rarity            = excluded.rarity,
    item_type         = excluded.item_type,
    slot              = excluded.slot,
    weight            = excluded.weight,
    weapon_min_damage = excluded.weapon_min_damage,
    weapon_max_damage = excluded.weapon_max_damage,
    weapon_speed      = excluded.weapon_speed;
