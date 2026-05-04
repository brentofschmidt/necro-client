-- ============================================================
-- 0035_rename_items_to_logical_tiers.sql
--
-- Re-tiers the starter items so the materials make in-world sense:
--
--   stone_sword  → bronze_sword   (stone doesn't sharpen into a sword)
--   stone_axe    → bronze_axe     (a combat axe needs a metal edge)
--   stone_bow    → wooden_bow     (bows are wood, end of)
--   stone_staff  → wooden_staff   (same — staves are wood)
--
-- Kept at stone (the "primitive" tier of the tech ladder):
--   stone_dagger  — flint daggers exist in real life
--   stone_mace    — a stone-headed cudgel works
--   stone_pickaxe / stone_woodcutting_axe / stone_skinning_knife
--                 — gathering tools fit the primitive tier
--
-- Existing DBs: deletes the obsolete rows, then upserts the new ones.
-- Fresh installs run the updated 0034 first and 0035's inserts become
-- no-ops (on conflict do update keeps everything in sync).
--
-- Idempotent.
-- ============================================================

delete from necro_content.items
 where id in ('stone_sword', 'stone_axe', 'stone_bow', 'stone_staff');

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
