-- ============================================================
-- 0041_crafting_foundations.sql
--
-- Foundation for the recipe system. Recipes need:
--   - skills (FK)             — adds smithing / fletching / carpentry
--   - crafting_stations (FK)  — anvil / workbench / cookfire / alchemy_table
--   - input + output items    — materials (logs, ingots, herbs, raw fish)
--                               and crafted outputs (cooked fish, potion)
--
-- Also adds items.is_craftable so the catalog can mark which items
-- come from a recipe vs which are loot-only. Higher tiers
-- (rare / epic / legendary / mythic) start uncraftable to reflect
-- their current state — recipes for them can be added later.
--
-- Idempotent.
-- ============================================================


-- ── 1. New crafting skills ──────────────────────────────────────────────────
-- Activity-category skills, like cooking / alchemy. Per-level effects use
-- the existing Gathering substats (craft_quality, success_chance, etc.).
insert into necro_content.skills (name, category, display_name, description, max_level, item_types, per_level_effects) values
    ('smithing',  'Activity', 'Smithing',
     'Forge metal weapons and armor at an anvil. Higher levels unlock better alloys and reduce wasted materials.',
     99, '{}',
     '[
       {"type":"Stat","affects":"craft_quality",  "ratio":0.15, "description":"+0.15% chance for higher-quality output per level"},
       {"type":"Stat","affects":"success_chance", "ratio":0.1,  "description":"+0.1% chance to avoid ruining the work per level"}
     ]'::jsonb),

    ('fletching', 'Activity', 'Fletching',
     'Shape bows, arrows, and shafts from wood and sinew. Light, focused work suited to careful hands.',
     99, '{}',
     '[
       {"type":"Stat","affects":"craft_quality",     "ratio":0.15, "description":"+0.15% chance for higher-quality output per level"},
       {"type":"Stat","affects":"rare_find_chance",  "ratio":0.05, "description":"+0.05% chance to find a rare wood grain per level"}
     ]'::jsonb),

    ('carpentry', 'Activity', 'Carpentry',
     'Work timber into staves, hafts, tool handles, and structural pieces. The slower cousin of fletching.',
     99, '{}',
     '[
       {"type":"Stat","affects":"craft_quality",  "ratio":0.15, "description":"+0.15% chance for higher-quality output per level"},
       {"type":"Stat","affects":"success_chance", "ratio":0.1,  "description":"+0.1% chance for a clean cut per level"}
     ]'::jsonb)

on conflict (name) do update set
    category          = excluded.category,
    display_name      = excluded.display_name,
    description       = excluded.description,
    max_level         = excluded.max_level,
    item_types        = excluded.item_types,
    per_level_effects = excluded.per_level_effects;


-- ── 1b. Item types this migration depends on ───────────────────────────────
-- 0040 also seeds these (and many more), but defending against
-- apply-order issues — re-asserting just the ones 0041 needs to insert
-- items below.
insert into necro_content.item_types (name, "group", display_name, stackable, equip_slot) values
    ('log',    'Material',   'Log',    true, 'InventoryOnly'),
    ('ingot',  'Material',   'Ingot',  true, 'InventoryOnly'),
    ('herb',   'Material',   'Herb',   true, 'InventoryOnly'),
    ('fish',   'Material',   'Fish',   true, 'InventoryOnly'),
    ('food',   'Consumable', 'Food',   true, 'InventoryOnly'),
    ('potion', 'Consumable', 'Potion', true, 'InventoryOnly')
on conflict (name) do nothing;


-- ── 2. Crafting stations ────────────────────────────────────────────────────
insert into necro_content.crafting_stations (tag) values
    ('anvil'),
    ('workbench'),
    ('cookfire'),
    ('alchemy_table')
on conflict (tag) do nothing;


-- ── 3. New material + output items ──────────────────────────────────────────
insert into necro_content.items (
    id, item_name, description, rarity, item_type, slot,
    required_skill_level, is_stackable, max_stack_size, weight
) values
    -- Materials (gathered, smelted, or shed)
    ('oak_log',        'Oak Log',
     'A length of seasoned oak. Useful for fletching, carpentry, and a hot fire.',
     'common', 'log',  'InventoryOnly', 0, true, 1000, 1.0),

    ('bronze_ingot',   'Bronze Ingot',
     'A bar of dull bronze, ready for the anvil.',
     'common', 'ingot', 'InventoryOnly', 0, true, 1000, 0.5),

    ('basic_herb',     'Wildflower',
     'A common roadside flower. Bitter to chew but the basis for most simple brews.',
     'common', 'herb',  'InventoryOnly', 0, true, 1000, 0.1),

    ('raw_trout',      'Raw Trout',
     'A pale river trout, freshly caught. Goes off quickly without cooking.',
     'common', 'fish',  'InventoryOnly', 0, true, 1000, 0.5),

    -- Crafted outputs
    ('cooked_trout',   'Cooked Trout',
     'A trout grilled over coals. Restores some health when eaten.',
     'common', 'food',  'InventoryOnly', 0, true, 1000, 0.5),

    ('minor_healing_potion', 'Minor Healing Potion',
     'A vial of murky red liquid. Tastes like rust and pine. Restores a small amount of health.',
     'common', 'potion','InventoryOnly', 0, true, 100, 0.3)

on conflict (id) do update set
    item_name      = excluded.item_name,
    description    = excluded.description,
    rarity         = excluded.rarity,
    item_type      = excluded.item_type,
    slot           = excluded.slot,
    is_stackable   = excluded.is_stackable,
    max_stack_size = excluded.max_stack_size,
    weight         = excluded.weight;


-- ── 4. items.is_craftable ───────────────────────────────────────────────────
alter table necro_content.items
    add column if not exists is_craftable boolean not null default false;

-- Common starter gear + crafted outputs are craftable now.
update necro_content.items
   set is_craftable = true
 where id in (
    'bronze_sword', 'bronze_axe',
    'stone_mace', 'stone_dagger',
    'wooden_bow', 'wooden_staff',
    'stone_pickaxe', 'stone_woodcutting_axe', 'stone_skinning_knife',
    'iron_sword',
    'cooked_trout', 'minor_healing_potion',
    'bronze_ingot'  -- smelted from ore at the anvil
 );

-- Materials gathered (not crafted), currency, trash, and high-tier items
-- explicitly remain uncraftable. Their is_craftable stays at the default
-- false, so no UPDATE needed — schema-as-truth. Listed here for clarity:
--
--   gold, oak_log, basic_herb, raw_trout
--   rusted_dagger, steel_axe, runed_staff, dawnbringer, worldreaver
