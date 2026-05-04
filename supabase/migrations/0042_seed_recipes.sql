-- ============================================================
-- 0042_seed_recipes.sql
--
-- One starter recipe per crafting skill. Inputs and outputs reference
-- items seeded in 0034 / 0035 / 0039 / 0041. Stations + skills come
-- from 0041.
--
-- Quantities and craft times are starter values — easy to tune later.
--
--   Smithing  : Bronze Ingot (smelt ore), Bronze Sword, Bronze Axe, Iron Sword
--   Fletching : Wooden Bow
--   Carpentry : Wooden Staff, plus stone tools (haft is the work item)
--   Cooking   : Cooked Trout
--   Alchemy   : Minor Healing Potion
--
-- Idempotent.
-- ============================================================

insert into necro_content.recipes (
    id, display_name, description, skill, required_skill_level,
    xp_reward, craft_time_seconds, station_tag,
    ingredients, outputs
) values

    -- ── Smithing ────────────────────────────────────────────────────────────
    ('recipe_bronze_ingot', 'Smelt Bronze Ingot',
     'Refine raw ore into a workable bronze bar at the forge.',
     'smithing', 1, 5, 3.0, 'anvil',
     '[{"itemId":"ore","quantity":2}]'::jsonb,
     '[{"itemId":"bronze_ingot","quantity":1}]'::jsonb),

    ('recipe_bronze_sword', 'Forge Bronze Sword',
     'Hammer two bronze ingots over an oak haft into a serviceable sword.',
     'smithing', 5, 25, 6.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":2},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"bronze_sword","quantity":1}]'::jsonb),

    ('recipe_bronze_axe', 'Forge Bronze Axe',
     'Heavy bronze head, sturdy haft. Built for chopping more than chasing.',
     'smithing', 5, 25, 6.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":2},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"bronze_axe","quantity":1}]'::jsonb),

    ('recipe_iron_sword', 'Forge Iron Sword',
     'Honest iron, properly tempered. Standard kit for the rank-and-file.',
     'smithing', 15, 60, 8.0, 'anvil',
     '[{"itemId":"ingot","quantity":3},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"iron_sword","quantity":1}]'::jsonb),

    -- ── Fletching ───────────────────────────────────────────────────────────
    ('recipe_wooden_bow', 'String Wooden Bow',
     'Shape a length of seasoned yew, string it, test the draw.',
     'fletching', 1, 15, 4.0, 'workbench',
     '[{"itemId":"oak_log","quantity":2}]'::jsonb,
     '[{"itemId":"wooden_bow","quantity":1}]'::jsonb),

    -- ── Carpentry ───────────────────────────────────────────────────────────
    ('recipe_wooden_staff', 'Carve Wooden Staff',
     'A straight oak shaft, smoothed at both ends and capped with a chip of crystal.',
     'carpentry', 1, 15, 4.0, 'workbench',
     '[{"itemId":"oak_log","quantity":2},{"itemId":"gem","quantity":1}]'::jsonb,
     '[{"itemId":"wooden_staff","quantity":1}]'::jsonb),

    ('recipe_stone_pickaxe', 'Bind Stone Pickaxe',
     'Lash a knapped stone head to an oak handle. Crude, but it digs.',
     'carpentry', 1, 8, 3.0, 'workbench',
     '[{"itemId":"oak_log","quantity":1},{"itemId":"ore","quantity":1}]'::jsonb,
     '[{"itemId":"stone_pickaxe","quantity":1}]'::jsonb),

    ('recipe_stone_woodcutting_axe', 'Bind Stone Woodcutting Axe',
     'A broad stone head, lashed for felling. Slow but functional.',
     'carpentry', 1, 8, 3.0, 'workbench',
     '[{"itemId":"oak_log","quantity":1},{"itemId":"ore","quantity":1}]'::jsonb,
     '[{"itemId":"stone_woodcutting_axe","quantity":1}]'::jsonb),

    ('recipe_stone_skinning_knife', 'Bind Stone Skinning Knife',
     'A short curved flake of flint, set into a wooden grip.',
     'carpentry', 1, 5, 2.0, 'workbench',
     '[{"itemId":"oak_log","quantity":1},{"itemId":"ore","quantity":1}]'::jsonb,
     '[{"itemId":"stone_skinning_knife","quantity":1}]'::jsonb),

    ('recipe_stone_dagger', 'Knap Stone Dagger',
     'Strike a flake of obsidian into a vicious edge, fit it to a grip.',
     'carpentry', 2, 6, 2.0, 'workbench',
     '[{"itemId":"oak_log","quantity":1},{"itemId":"ore","quantity":1}]'::jsonb,
     '[{"itemId":"stone_dagger","quantity":1}]'::jsonb),

    ('recipe_stone_mace', 'Bind Stone Mace',
     'A knob of granite lashed atop a stout oak haft.',
     'carpentry', 2, 8, 3.0, 'workbench',
     '[{"itemId":"oak_log","quantity":1},{"itemId":"ore","quantity":2}]'::jsonb,
     '[{"itemId":"stone_mace","quantity":1}]'::jsonb),

    -- ── Cooking ─────────────────────────────────────────────────────────────
    ('recipe_cooked_trout', 'Grill Trout',
     'Spit a trout over coals until the flesh flakes.',
     'cooking', 1, 10, 3.0, 'cookfire',
     '[{"itemId":"raw_trout","quantity":1}]'::jsonb,
     '[{"itemId":"cooked_trout","quantity":1}]'::jsonb),

    -- ── Alchemy ─────────────────────────────────────────────────────────────
    ('recipe_minor_healing_potion', 'Brew Minor Healing Potion',
     'Steep wildflowers in clean water; bottle while warm. The basics of every alchemist''s training.',
     'alchemy', 1, 12, 4.0, 'alchemy_table',
     '[{"itemId":"basic_herb","quantity":2}]'::jsonb,
     '[{"itemId":"minor_healing_potion","quantity":1}]'::jsonb)

on conflict (id) do update set
    display_name         = excluded.display_name,
    description          = excluded.description,
    skill                = excluded.skill,
    required_skill_level = excluded.required_skill_level,
    xp_reward            = excluded.xp_reward,
    craft_time_seconds   = excluded.craft_time_seconds,
    station_tag          = excluded.station_tag,
    ingredients          = excluded.ingredients,
    outputs              = excluded.outputs;
