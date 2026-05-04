-- ============================================================
-- 0027_gathering_stats_and_activity_effects.sql
--
-- Activity skills (mining / fishing / cooking / etc.) now scale per
-- level the same way weapon profs do. To do that without overloading
-- the existing combat stats, this migration adds a new "Gathering"
-- category to necro_content.stats with 6 generic profession stats:
--
--   gather_speed         — % reduction in gather time
--   gather_yield         — flat extra units per successful gather
--   gather_double_chance — chance to receive an extra item
--   rare_find_chance     — chance to find a rare item
--   success_chance       — chance an attempt succeeds (fishing, lockpicking)
--   craft_quality        — chance crafted items roll higher quality
--
-- Then each activity skill's per_level_effects references the new
-- stats with skill-flavored ratios.
--
-- Idempotent.
-- ============================================================

-- ── New Gathering-category stats ────────────────────────────────────────────
insert into necro_content.stats (id, display_name, description, category, is_percent, affects, conversion_per_point, sort_order) values
    ('gather_speed',         'Gather Speed',         'Faster gather time on resource nodes (ore, herbs, wood).',                  'Gathering', true,  'Gather time',     '+1% faster gather time per point',                  80),
    ('gather_yield',         'Gather Yield',         'Extra units returned per successful gather.',                               'Gathering', false, 'Gather quantity', '+1 extra unit per gather per point',                81),
    ('gather_double_chance', 'Double Gather Chance', 'Chance to receive an extra item on top of the normal yield.',               'Gathering', true,  'Gather quantity', '+1% chance for a bonus item per point',             82),
    ('rare_find_chance',     'Rare Find Chance',     'Chance to find rare items while gathering or fishing.',                     'Gathering', true,  'Loot quality',    '+0.5% chance to find rare items per point',         83),
    ('success_chance',       'Success Chance',       'Chance an attempt resolves successfully (fishing pulls, picks, etc.).',     'Gathering', true,  'Attempt outcome', '+1% chance of success per point',                   84),
    ('craft_quality',        'Craft Quality',        'Chance crafted items roll a higher quality tier than the recipe baseline.', 'Gathering', true,  'Crafted items',   '+0.5% chance for higher-quality output per point',  85)
on conflict (id) do update set
    display_name         = excluded.display_name,
    description          = excluded.description,
    category             = excluded.category,
    is_percent           = excluded.is_percent,
    affects              = excluded.affects,
    sort_order           = excluded.sort_order,
    conversion_per_point = excluded.conversion_per_point;


-- ── Activity skills: per-level effects ──────────────────────────────────────

-- Mining: speed + yield + extra ore + occasional gem
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"gather_speed",         "ratio":0.1,  "description":"+0.1% faster mining per level"},
     {"type":"Stat","affects":"gather_yield",         "ratio":0.05, "description":"+0.05 ore per swing per level"},
     {"type":"Stat","affects":"gather_double_chance", "ratio":0.1,  "description":"+0.1% chance for a bonus ore per level"},
     {"type":"Stat","affects":"rare_find_chance",     "ratio":0.05, "description":"+0.05% chance to uncover a gem per level"}
   ]'::jsonb
 where name = 'mining';

-- Gathering (herbs): speed + double + occasional rare flower
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"gather_speed",         "ratio":0.1,  "description":"+0.1% faster gathering per level"},
     {"type":"Stat","affects":"gather_double_chance", "ratio":0.1,  "description":"+0.1% chance for a bonus herb per level"},
     {"type":"Stat","affects":"rare_find_chance",     "ratio":0.05, "description":"+0.05% chance to find a rare reagent per level"}
   ]'::jsonb
 where name = 'gathering';

-- Woodcutting: speed + bonus log + bonus bark
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"gather_speed",         "ratio":0.1,  "description":"+0.1% faster chopping per level"},
     {"type":"Stat","affects":"gather_yield",         "ratio":0.05, "description":"+0.05 extra log per tree per level"},
     {"type":"Stat","affects":"gather_double_chance", "ratio":0.1,  "description":"+0.1% chance for bonus bark or sap per level"}
   ]'::jsonb
 where name = 'woodcutting';

-- Skinning: faster + rare pelts
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"gather_speed",         "ratio":0.15, "description":"+0.15% faster skinning per level"},
     {"type":"Stat","affects":"rare_find_chance",     "ratio":0.1,  "description":"+0.1% chance to recover rare pelts per level"}
   ]'::jsonb
 where name = 'skinning';

-- Fishing: catch chance + rare fish + occasional double catch
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"success_chance",       "ratio":0.2,  "description":"+0.2% chance to land your catch per level"},
     {"type":"Stat","affects":"rare_find_chance",     "ratio":0.05, "description":"+0.05% chance to hook a rare fish per level"},
     {"type":"Stat","affects":"gather_yield",         "ratio":0.02, "description":"+0.02 extra fish per catch per level"}
   ]'::jsonb
 where name = 'fishing';

-- Cooking: don't burn it + better quality
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"craft_quality",        "ratio":0.15, "description":"+0.15% chance for higher-quality dishes per level"},
     {"type":"Stat","affects":"success_chance",       "ratio":0.1,  "description":"+0.1% chance to avoid burning the meal per level"}
   ]'::jsonb
 where name = 'cooking';

-- Alchemy: better potions + extra potion from same reagents
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"craft_quality",        "ratio":0.15, "description":"+0.15% chance for a stronger brew per level"},
     {"type":"Stat","affects":"gather_double_chance", "ratio":0.1,  "description":"+0.1% chance to brew an extra potion per level"}
   ]'::jsonb
 where name = 'alchemy';
