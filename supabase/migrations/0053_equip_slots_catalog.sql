-- ============================================================
-- 0053_equip_slots_catalog.sql
--
-- Adds necro_content.equip_slots — the catalog of every equipment
-- slot the game knows about (Head, MainHand, etc.). Until now slots
-- only existed implicitly as text values on
-- necro_content.item_types.equip_slot and necro_player.equipment.slot.
-- AAA MMOs typically hardcode slots as enums, but since this project
-- already keeps every other catalog (rarities, abilities, resources,
-- damage_types, …) as a content table, slots fit the same pattern:
-- nicer display names ("MainHand" → "Main Hand"), descriptions, and
-- a stable sort order without a client redeploy.
--
-- 13 slots are seeded:
--   Body armor:  Head / Chest / Back / Waist / Legs / Feet / Hands
--   Jewelry:     Neck / Finger
--   Weapons:     MainHand / OffHand / TwoHand
--   Special:     InventoryOnly
--
-- body_region buckets neighbouring slots together so paper-doll-style
-- UIs can lay them out anatomically.
--
-- Idempotent.
-- ============================================================


create table if not exists necro_content.equip_slots (
    id            text primary key,                    -- 'Head', 'MainHand', …
    display_name  text not null,                       -- 'Head', 'Main Hand', …
    description   text not null default '',
    -- Anatomical grouping for paper-doll layout: 'head' (head/neck),
    -- 'torso' (chest/back/waist), 'legs' (legs/feet), 'hands'
    -- (hands/finger), 'weapon' (mainhand/offhand/twohand), 'inventory'
    -- (inventory-only / unequippable).
    body_region   text not null default 'misc',
    sort_order    int  not null default 0
);

alter table necro_content.equip_slots enable row level security;
drop policy if exists equip_slots_read on necro_content.equip_slots;
create policy equip_slots_read on necro_content.equip_slots for select using (true);

grant all on necro_content.equip_slots to anon, authenticated, service_role;


-- ── Seed: anatomical top-down ordering, weapons last, special last-of-all ──
insert into necro_content.equip_slots
    (id, display_name, description, body_region, sort_order) values

    ('Head',          'Head',          'Helmets, hoods, circlets — head armor.',                      'head',     10),
    ('Neck',          'Neck',          'Amulets and pendants worn at the throat.',                    'head',     20),

    ('Chest',         'Chest',         'Chestpieces — breastplates, robes, tunics.',                  'torso',    30),
    ('Back',          'Back',          'Cloaks, mantles, and quivers slung across the shoulders.',    'torso',    40),
    ('Waist',         'Waist',         'Belts and sashes worn around the waist.',                     'torso',    50),

    ('Legs',          'Legs',          'Leg armor — greaves, leggings, robes-of-legs.',               'legs',     60),
    ('Feet',          'Feet',          'Boots, sandals, and other footwear.',                         'legs',     70),

    ('Hands',         'Hands',         'Gauntlets, gloves, and bracers covering the hands.',          'hands',    80),
    ('Finger',        'Finger',        'Rings worn on the fingers.',                                  'hands',    90),

    ('MainHand',      'Main Hand',     'Primary weapon — swords, axes, maces, daggers, wands.',       'weapon',  100),
    ('OffHand',       'Off-Hand',      'Shields, parrying daggers, and other offhand items.',         'weapon',  110),
    ('TwoHand',       'Two-Handed',    'Two-handed weapons — bows, staves, greatswords, polearms.',   'weapon',  120),

    ('InventoryOnly', 'Inventory Only','Items that aren''t equipped — consumables, materials, currency.', 'inventory', 200)

on conflict (id) do update set
    display_name = excluded.display_name,
    description  = excluded.description,
    body_region  = excluded.body_region,
    sort_order   = excluded.sort_order;
