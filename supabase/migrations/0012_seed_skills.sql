-- ============================================================
-- 0012_seed_skills.sql
--
-- Seeds the necro_content.skills catalog with a starter set of weapon
-- proficiencies and gathering/crafting activities. Display names use
-- title case; primary keys use lowercase slugs to match the convention
-- used for races / factions / zones.
--
-- item_types[] references necro_content.item_types.name (text[], not a
-- FK). Listing the obvious weapon item_types here so the link is right
-- once item_types is seeded; activity skills are not weapon-bound.
--
-- Idempotent — every row uses ON CONFLICT (name) DO UPDATE.
-- ============================================================


-- ── Weapon proficiencies ─────────────────────────────────────────────────────
insert into necro_content.skills (name, category, display_name, description, max_level, item_types) values
    ('swords',  'Proficiency', 'Swords',  'Skill with one-handed and two-handed swords. Improves accuracy and damage.', 99, '{sword}'),
    ('axes',    'Proficiency', 'Axes',    'Skill with hand axes, battleaxes, and great axes.',                          99, '{axe}'),
    ('maces',   'Proficiency', 'Maces',   'Skill with maces, hammers, and other blunt weapons.',                        99, '{mace}'),
    ('daggers', 'Proficiency', 'Daggers', 'Skill with daggers and short blades. Favored by rogues and assassins.',      99, '{dagger}'),
    ('bows',    'Proficiency', 'Bows',    'Skill with shortbows and longbows.',                                         99, '{bow}'),
    ('staves',  'Proficiency', 'Staves',  'Skill with quarterstaves and arcane staves.',                                99, '{staff}')
on conflict (name) do update set
    category     = excluded.category,
    display_name = excluded.display_name,
    description  = excluded.description,
    max_level    = excluded.max_level,
    item_types   = excluded.item_types;


-- ── Activity skills (gathering / crafting) ───────────────────────────────────
insert into necro_content.skills (name, category, display_name, description, max_level, item_types) values
    ('mining',      'Activity', 'Mining',      'Extract ore and gemstones from mineral nodes scattered throughout the world.', 99, '{}'),
    ('gathering',   'Activity', 'Gathering',   'Pick herbs, flowers, roots, and reagents used in alchemy and cooking.',        99, '{}'),
    ('woodcutting', 'Activity', 'Woodcutting', 'Fell trees and harvest lumber, bark, and rare woods.',                         99, '{}'),
    ('skinning',    'Activity', 'Skinning',    'Recover hides and pelts from slain beasts.',                                   99, '{}'),
    ('fishing',     'Activity', 'Fishing',     'Catch fish and rare items from rivers, lakes, and the open sea.',              99, '{}'),
    ('cooking',     'Activity', 'Cooking',     'Prepare food that grants temporary bonuses or restores health and stamina.',   99, '{}'),
    ('alchemy',     'Activity', 'Alchemy',     'Brew potions and elixirs from herbs and reagents.',                            99, '{}')
on conflict (name) do update set
    category     = excluded.category,
    display_name = excluded.display_name,
    description  = excluded.description,
    max_level    = excluded.max_level,
    item_types   = excluded.item_types;
