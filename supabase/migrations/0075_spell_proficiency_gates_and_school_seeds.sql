-- ============================================================
-- 0075_spell_proficiency_gates_and_school_seeds.sql
--
-- Two related changes:
--
--   1. Adds `required_proficiency_level int` to necro_content.spells.
--      At cast time the engine compares it against the caster's level
--      in the matching Magic Proficiency skill (resolved via the
--      spell's `magic_school`). The level-1 starter spells all sit at 1
--      so the gate is open with the default seeded prof rows; higher-
--      tier spells later will use 5 / 10 / 20 / etc.
--
--      Weapons don't have a parallel column — weapon attacks gate on
--      `required_weapon_types` (must be wielding the matching weapon)
--      and a proficiency level *modulates* the damage roll floor but
--      doesn't bar use. Spells are stricter: you can't fire a Meteor at
--      level 1 Evocation, period.
--
--   2. Seeds one level-1 spell for each of the five schools that don't
--      have a tagged spell yet (Conjuration, Necromancy, Illusion,
--      Abjuration, Divination). Existing tagged spells:
--          fireball         → Evocation
--          lesser_heal      → Restoration
--          inspiring_anthem → Enchantment
--      After this migration every school has at least one spell so the
--      Spells page no longer has empty-school filter chips.
--
-- Idempotent — add-column-if-not-exists, on-conflict-do-update inserts.
-- ============================================================


-- ── 1. Column + tag existing spells with level 1 ──────────────────────────
alter table necro_content.spells
    add column if not exists required_proficiency_level int not null default 1;

-- Existing 3 spells stay at level 1 (already the default; explicit for
-- documentation).
update necro_content.spells
   set required_proficiency_level = 1
 where asset_name in ('fireball', 'lesser_heal', 'inspiring_anthem');


-- ── 2. Seed the 5 missing-school starter spells ───────────────────────────
-- Note: the legacy `damage` column on spells was dropped in 0070 when
-- damage moved to per-effect coefficients; the INSERT column list
-- reflects the post-0070 shape.
insert into necro_content.spells (
    asset_name, ability_name, description,
    type, targeting, resource_type, resource_cost,
    cooldown, cast_time, global_cooldown,
    damage_school, range,
    requires_target, is_heal,
    splash_radius, splash_damage_multiplier,
    magic_school, required_proficiency_level,
    effects
) values

    -- Conjuration: brings a thing into being — a small flame pinned to
    -- the ground that burns whatever lingers in it. DoT, no direct hit.
    ('conjure_flame', 'Conjure Flame',
     'Summon a flickering flame at a target location, scorching anything that lingers within.',
     'Spell', 'GroundTargeted', 'Mana', 15,
     3, 1.5, 1.5,
     'fire', 25,
     true, false,
     null, null,
     'conjuration', 1,
     '[{"type":"DamageOverTime","coefficient":5,"school":"fire","target":"Primary","tick_interval":1,"duration":3,"description":"5 fire damage per second for 3 seconds"}]'::jsonb),

    -- Necromancy: classic life-drain. DoT necrotic; siphon flavor.
    ('drain_life', 'Drain Life',
     'Siphon a thread of vitality from the target, leaving them weaker by the second.',
     'Spell', 'SingleTarget', 'Mana', 20,
     4, 1.5, 1.5,
     'necrotic', 20,
     true, false,
     null, null,
     'necromancy', 1,
     '[{"type":"DamageOverTime","coefficient":8,"school":"necrotic","target":"Primary","tick_interval":1,"duration":3,"description":"8 necrotic damage per second for 3 seconds"}]'::jsonb),

    -- Illusion: self-buff that adds evasion via duplicated images.
    ('mirror_image', 'Mirror Image',
     'Spin out shimmering duplicates of yourself, confusing attackers and making blows harder to land.',
     'Spell', 'Self', 'Mana', 20,
     30, 1.0, 1.5,
     null, 0,
     false, false,
     null, null,
     'illusion', 1,
     '[{"type":"StatModifier","stat":"evasion","amount":10,"modifier_type":"Percent","duration":30,"target":"Self","description":"+10% evasion for 30 seconds"}]'::jsonb),

    -- Abjuration: defensive self-buff, hardens against incoming blows.
    ('ward', 'Ward',
     'Weave a defensive barrier of arcane force, hardening you against incoming blows.',
     'Spell', 'Self', 'Mana', 15,
     60, 0.5, 1.5,
     null, 0,
     false, false,
     null, null,
     'abjuration', 1,
     '[{"type":"StatModifier","stat":"armor","amount":10,"modifier_type":"Flat","duration":60,"target":"Self","description":"+10 armor for 60 seconds"}]'::jsonb),

    -- Divination: foresight as accuracy. Brief glimpse-ahead buff.
    ('foresight', 'Foresight',
     'Glimpse the next few seconds ahead, sharpening your aim against the present.',
     'Spell', 'Self', 'Mana', 15,
     30, 1.0, 1.5,
     null, 0,
     false, false,
     null, null,
     'divination', 1,
     '[{"type":"StatModifier","stat":"accuracy","amount":5,"modifier_type":"Percent","duration":30,"target":"Self","description":"+5% accuracy for 30 seconds"}]'::jsonb)

on conflict (asset_name) do update set
    ability_name              = excluded.ability_name,
    description               = excluded.description,
    type                      = excluded.type,
    targeting                 = excluded.targeting,
    resource_type             = excluded.resource_type,
    resource_cost             = excluded.resource_cost,
    cooldown                  = excluded.cooldown,
    cast_time                 = excluded.cast_time,
    global_cooldown           = excluded.global_cooldown,
    damage_school             = excluded.damage_school,
    range                     = excluded.range,
    requires_target           = excluded.requires_target,
    is_heal                   = excluded.is_heal,
    splash_radius             = excluded.splash_radius,
    splash_damage_multiplier  = excluded.splash_damage_multiplier,
    magic_school              = excluded.magic_school,
    required_proficiency_level = excluded.required_proficiency_level,
    effects                   = excluded.effects;
