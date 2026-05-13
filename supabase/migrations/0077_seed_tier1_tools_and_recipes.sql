-- ============================================================
-- 0077_seed_tier1_tools_and_recipes.sql
--
-- Seeds the tier-1 tool roster and their crafting recipes on top of
-- the materials added in 0076. After this lands:
--
--   - One craftable tool per gathering/crafting activity that needs a
--     gate at level 1, plus the campfire station.
--   - Existing stone_pickaxe / stone_woodcutting_axe recipes are
--     updated from the placeholder ore+oak_log inputs to the tier-1
--     materials (stone + wood_log + twine).
--   - New 'anywhere' crafting_station tag for the campfire recipe
--     (and future place-anywhere recipes like twine / soft_clay when
--     they land).
--
-- Tools added (10):
--
--   flint_skinning_knife   skinning      MainHand
--   flint_shears           gathering     MainHand   (shearing flax / fleece)
--   flint_saw              carpentry     MainHand
--   flint_fletching_knife  fletching     MainHand
--   stone_smithing_hammer  smithing      MainHand
--   stone_mortar           alchemy       InventoryOnly
--   bone_lockpicks         lockpicking   InventoryOnly  (consumable, x3 per craft)
--   wooden_fishing_rod     fishing       MainHand
--   clay_cookpot           cooking       InventoryOnly
--   campfire               cooking       InventoryOnly  (placeable; anywhere recipe)
--
-- New item_subclasses (8): shears, saw, fletching_knife,
-- smithing_hammer, mortar, lockpicks, cookpot, campfire. The four
-- existing subclasses (pickaxe, woodcutting_axe, skinning_knife,
-- fishing_rod) are reused.
--
-- All recipes:
--   - skill = 'carpentry' (general tier-1 shape work), except
--     wooden_fishing_rod which uses fletching (wood-and-line work).
--   - station = 'workbench', except campfire which is 'anywhere'.
--   - required_skill_level = 1.
--
-- Idempotent — every step uses ON CONFLICT DO UPDATE / DO NOTHING.
-- ============================================================


-- ── 1. New 'anywhere' crafting station ─────────────────────────────────────
-- Marker tag for recipes that don't require a station (campfire,
-- twine, soft_clay). The client treats it as "no station required";
-- having a real row in crafting_stations means the recipes table's
-- station_tag FK is still satisfied.
insert into necro_content.crafting_stations (tag) values
    ('anywhere')
on conflict (tag) do nothing;


-- ── 2. New item_subclasses (Tool class + Consumable for lockpicks) ─────────
insert into necro_content.item_subclasses
    (name, item_class, display_name, stackable, inventory_slot) values

    -- Hand tools (held in MainHand while active)
    ('shears',          'tool',       'Shears',          false, 'MainHand'),
    ('saw',             'tool',       'Saw',             false, 'MainHand'),
    ('fletching_knife', 'tool',       'Fletching Knife', false, 'MainHand'),
    ('smithing_hammer', 'tool',       'Smithing Hammer', false, 'MainHand'),

    -- Placed / used-from-inventory tools
    ('mortar',          'tool',       'Mortar',          false, 'InventoryOnly'),
    ('cookpot',         'tool',       'Cookpot',         false, 'InventoryOnly'),
    ('campfire',        'tool',       'Campfire',        false, 'InventoryOnly'),

    -- Consumable per-use lockpicks (stack of single-use picks)
    ('lockpicks',       'consumable', 'Lockpicks',       true,  'InventoryOnly')

on conflict (name) do update set
    item_class     = excluded.item_class,
    display_name   = excluded.display_name,
    stackable      = excluded.stackable,
    inventory_slot = excluded.inventory_slot;


-- ── 3. New tier-1 tool items ───────────────────────────────────────────────
-- Weights are per-unit. Tools weigh more than materials but stay under
-- 2.0 each so a starter character can carry a full set. Lockpicks
-- stack to 100 (consumable per use); other tools are non-stackable
-- one-of-a-kind held items.
insert into necro_content.items (
    id, item_name, description,
    rarity, item_subclass, inventory_slot,
    required_skill_level, is_stackable, max_stack_size, weight,
    is_consumable, consumable_cooldown, consumable_effects,
    is_craftable
) values

    ('flint_skinning_knife', 'Flint Skinning Knife',
     'A curved flint flake hafted in a short oak grip. Sharp enough to part hide from flesh.',
     'common', 'skinning_knife', 'MainHand',
     0, false, 1, 1.2,
     false, null, '[]'::jsonb,
     true),

    ('flint_shears', 'Flint Shears',
     'Two flint blades pinned with twine. Snips flax stalks and rough fleece cleanly enough.',
     'common', 'shears', 'MainHand',
     0, false, 1, 1.0,
     false, null, '[]'::jsonb,
     true),

    ('flint_saw', 'Flint Saw',
     'A toothed flint edge set into a wooden frame. Slow, scratchy, but it cuts.',
     'common', 'saw', 'MainHand',
     0, false, 1, 1.5,
     false, null, '[]'::jsonb,
     true),

    ('flint_fletching_knife', 'Flint Fletching Knife',
     'A precise flint flake on a small handle. For shaping shafts and trimming feathers.',
     'common', 'fletching_knife', 'MainHand',
     0, false, 1, 1.0,
     false, null, '[]'::jsonb,
     true),

    ('stone_smithing_hammer', 'Stone Smithing Hammer',
     'A blunt rock lashed to an oak haft. The poor cousin of an iron hammer; gets a bronze ingot to shape eventually.',
     'common', 'smithing_hammer', 'MainHand',
     0, false, 1, 1.8,
     false, null, '[]'::jsonb,
     true),

    ('stone_mortar', 'Stone Mortar',
     'A hollowed stone bowl with a stout wooden pestle. The alchemist''s first reagent grinder.',
     'common', 'mortar', 'InventoryOnly',
     0, false, 1, 1.5,
     false, null, '[]'::jsonb,
     true),

    ('bone_lockpicks', 'Bone Lockpicks',
     'A small bundle of carved bone picks. Each one snaps after a careful turn or two — keep spares.',
     'common', 'lockpicks', 'InventoryOnly',
     0, true, 100, 0.05,
     true, null, '[]'::jsonb,
     true),

    ('wooden_fishing_rod', 'Wooden Fishing Rod',
     'A length of springy oak with a flax line. Crude tackle, but the fish don''t know that.',
     'common', 'fishing_rod', 'MainHand',
     0, false, 1, 1.2,
     false, null, '[]'::jsonb,
     true),

    ('clay_cookpot', 'Clay Cookpot',
     'A fired clay pot that sits over a campfire. Holds about a meal''s worth of stew.',
     'common', 'cookpot', 'InventoryOnly',
     0, false, 1, 1.5,
     false, null, '[]'::jsonb,
     true),

    ('campfire', 'Campfire',
     'A small ring of stones around a stack of split logs. Place it down to cook over, then take what''s left when you leave.',
     'common', 'campfire', 'InventoryOnly',
     0, false, 1, 2.0,
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


-- ── 4. Update existing stone-tool recipes to tier-1 materials ──────────────
-- 0042 seeded the recipes with placeholder oak_log + ore inputs.
-- Realign them with the tier-1 materials we just added (0076):
-- stone head + wood_log haft + twine lashing.
update necro_content.recipes
   set ingredients = '[{"itemId":"stone","quantity":1},{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
       xp_reward = 8,
       craft_time_seconds = 3.0,
       station_tag = 'workbench'
 where id = 'recipe_stone_pickaxe';

update necro_content.recipes
   set ingredients = '[{"itemId":"stone","quantity":1},{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
       xp_reward = 8,
       craft_time_seconds = 3.0,
       station_tag = 'workbench'
 where id = 'recipe_stone_woodcutting_axe';


-- ── 5. New tier-1 tool recipes ─────────────────────────────────────────────
insert into necro_content.recipes (
    id, display_name, description, skill, required_skill_level,
    xp_reward, craft_time_seconds, station_tag,
    ingredients, outputs
) values

    ('recipe_flint_skinning_knife', 'Knap Flint Skinning Knife',
     'A flint flake, an oak grip, a wrap of twine to keep them together.',
     'carpentry', 1, 8, 3.0, 'workbench',
     '[{"itemId":"flint","quantity":1},{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
     '[{"itemId":"flint_skinning_knife","quantity":1}]'::jsonb),

    ('recipe_flint_shears', 'Pin Flint Shears',
     'Two thin flint blades, pinned with twine so they pivot. Crude but they snip.',
     'carpentry', 1, 8, 3.0, 'workbench',
     '[{"itemId":"flint","quantity":2},{"itemId":"twine","quantity":1}]'::jsonb,
     '[{"itemId":"flint_shears","quantity":1}]'::jsonb),

    ('recipe_flint_saw', 'Frame Flint Saw',
     'A toothed flint edge set into an oak frame, lashed at both ends.',
     'carpentry', 1, 10, 4.0, 'workbench',
     '[{"itemId":"flint","quantity":1},{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
     '[{"itemId":"flint_saw","quantity":1}]'::jsonb),

    ('recipe_flint_fletching_knife', 'Shape Flint Fletching Knife',
     'A small precise blade for shaping arrow shafts and trimming feathers.',
     'carpentry', 1, 8, 3.0, 'workbench',
     '[{"itemId":"flint","quantity":1},{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
     '[{"itemId":"flint_fletching_knife","quantity":1}]'::jsonb),

    ('recipe_stone_smithing_hammer', 'Bind Stone Smithing Hammer',
     'A blunt rock lashed firmly to an oak haft. Gets you to your first iron hammer.',
     'carpentry', 1, 10, 4.0, 'workbench',
     '[{"itemId":"stone","quantity":1},{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
     '[{"itemId":"stone_smithing_hammer","quantity":1}]'::jsonb),

    ('recipe_stone_mortar', 'Carve Stone Mortar',
     'Hollow a hand-sized stone into a bowl, pair it with a stout wooden pestle.',
     'carpentry', 1, 12, 5.0, 'workbench',
     '[{"itemId":"stone","quantity":2},{"itemId":"wood_log","quantity":1}]'::jsonb,
     '[{"itemId":"stone_mortar","quantity":1}]'::jsonb),

    ('recipe_bone_lockpicks', 'Carve Bone Lockpicks',
     'A length of bone whittled into a bundle of thin picks. They snap easily — make a few at a time.',
     'carpentry', 1, 10, 3.0, 'workbench',
     '[{"itemId":"bone","quantity":1},{"itemId":"twine","quantity":1}]'::jsonb,
     '[{"itemId":"bone_lockpicks","quantity":3}]'::jsonb),

    ('recipe_wooden_fishing_rod', 'String Wooden Fishing Rod',
     'A springy length of oak, a wrap of twine at the grip, a flax line on the tip.',
     'fletching', 1, 12, 4.0, 'workbench',
     '[{"itemId":"wood_log","quantity":1},{"itemId":"twine","quantity":1},{"itemId":"flax","quantity":1}]'::jsonb,
     '[{"itemId":"wooden_fishing_rod","quantity":1}]'::jsonb),

    ('recipe_clay_cookpot', 'Throw Clay Cookpot',
     'Shape softened clay into a stout pot, hand-fired enough to hold stew.',
     'carpentry', 1, 12, 5.0, 'workbench',
     '[{"itemId":"soft_clay","quantity":2}]'::jsonb,
     '[{"itemId":"clay_cookpot","quantity":1}]'::jsonb),

    ('recipe_campfire', 'Lay a Campfire',
     'A ring of stones, a stack of split logs. Light it where you stand — no station needed.',
     'carpentry', 1, 6, 3.0, 'anywhere',
     '[{"itemId":"wood_log","quantity":3},{"itemId":"stone","quantity":3}]'::jsonb,
     '[{"itemId":"campfire","quantity":1}]'::jsonb)

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
