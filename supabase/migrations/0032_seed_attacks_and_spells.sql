-- ============================================================
-- 0032_seed_attacks_and_spells.sql
--
-- First content for the actions and spells catalogs:
--   actions: one primary attack per weapon proficiency (Slash, Cleave,
--            Smash, Stab, Shoot, Bash) — each gates on the matching
--            weapon type via required_weapon_types and uses the
--            appropriate damage school from necro_content.damage_types.
--   spells:  Fireball (AoE damage), Lesser Heal (single-target heal),
--            Inspiring Anthem (party-wide +5% Strength for 60s).
--
-- Damage / cooldown / cost numbers are placeholders, biased toward
-- "primary attacks feel snappy" and "spells cost meaningful mana".
-- Tune from this file once combat math lands.
--
-- Idempotent.
-- ============================================================


-- ── Primary weapon attacks ──────────────────────────────────────────────────
-- Actions intentionally have no intrinsic damage / damage_school —
-- both are determined by the equipped weapon at runtime (see 0033).
insert into necro_content.actions (
    asset_name, ability_name, description,
    type, targeting, resource_type, resource_cost,
    cooldown, cast_time, global_cooldown,
    range, requires_target, required_weapon_types
) values
    ('slash',  'Slash',
     'A clean cut with your sword. Fast, reliable, no frills.',
     'WeaponAttack', 'SingleTarget', 'None', 0,
     0, 0, 1.5,
     2, true, '{sword}'),

    ('cleave', 'Cleave',
     'A wide arcing chop with your axe.',
     'WeaponAttack', 'SingleTarget', 'None', 0,
     0, 0, 1.5,
     2, true, '{axe}'),

    ('smash',  'Smash',
     'A heavy overhead swing with your mace, crushing armor and bone alike.',
     'WeaponAttack', 'SingleTarget', 'None', 0,
     0, 0, 1.7,
     2, true, '{mace}'),

    ('stab',   'Stab',
     'A quick thrust with your dagger to a vital point.',
     'WeaponAttack', 'SingleTarget', 'None', 0,
     0, 0, 1.2,
     2, true, '{dagger}'),

    ('shoot',  'Shoot',
     'Loose an arrow at the target.',
     'WeaponAttack', 'SingleTarget', 'None', 0,
     0, 0, 1.5,
     30, true, '{bow}'),

    ('bash',   'Bash',
     'A sharp strike with your staff.',
     'WeaponAttack', 'SingleTarget', 'None', 0,
     0, 0, 1.5,
     2, true, '{staff}')

on conflict (asset_name) do update set
    ability_name          = excluded.ability_name,
    description           = excluded.description,
    type                  = excluded.type,
    targeting             = excluded.targeting,
    resource_type         = excluded.resource_type,
    resource_cost         = excluded.resource_cost,
    cooldown              = excluded.cooldown,
    cast_time             = excluded.cast_time,
    global_cooldown       = excluded.global_cooldown,
    range                 = excluded.range,
    requires_target       = excluded.requires_target,
    required_weapon_types = excluded.required_weapon_types;


-- ── Spells ──────────────────────────────────────────────────────────────────
insert into necro_content.spells (
    asset_name, ability_name, description,
    type, targeting, resource_type, resource_cost,
    cooldown, cast_time, global_cooldown,
    damage, damage_school, range,
    requires_target, is_heal,
    splash_radius, splash_damage_multiplier,
    effects
) values
    ('fireball', 'Fireball',
     'Hurl a roaring sphere of flame that explodes on impact, scorching the target and everything nearby.',
     'Spell', 'GroundTargeted', 'Mana', 30,
     6, 2.0, 1.5,
     50, 'fire', 30,
     true, false,
     5, 0.7,
     '[{"type":"Damage","amount":50,"school":"fire","target":"Primary","description":"Direct hit damage"},
       {"type":"Damage","amount":35,"school":"fire","target":"SplashRadius","radius":5,"description":"Splash damage to nearby enemies"}]'::jsonb),

    ('lesser_heal', 'Lesser Heal',
     'A gentle wash of restorative light. Mends a small amount of an ally''s wounds.',
     'Spell', 'FriendlyTarget', 'Mana', 20,
     0, 1.5, 1.5,
     30, null, 20,
     true, true,
     null, null,
     '[{"type":"Heal","amount":30,"target":"Primary","description":"Restores 30 health to the target"}]'::jsonb),

    ('inspiring_anthem', 'Inspiring Anthem',
     'Strike up a stirring tune that bolsters your party. All allies within earshot grow stronger for a short time.',
     'Spell', 'SelfAndAllies', 'Mana', 25,
     30, 1.0, 1.5,
     0, null, 0,
     false, false,
     20, null,
     '[{"type":"StatModifier","stat":"strength","amount":5,"modifier_type":"Percent","duration":60,"target":"Party","radius":20,"description":"+5% Strength to all party members within 20m for 60 seconds"}]'::jsonb)

on conflict (asset_name) do update set
    ability_name             = excluded.ability_name,
    description              = excluded.description,
    type                     = excluded.type,
    targeting                = excluded.targeting,
    resource_type            = excluded.resource_type,
    resource_cost            = excluded.resource_cost,
    cooldown                 = excluded.cooldown,
    cast_time                = excluded.cast_time,
    global_cooldown          = excluded.global_cooldown,
    damage                   = excluded.damage,
    damage_school            = excluded.damage_school,
    range                    = excluded.range,
    requires_target          = excluded.requires_target,
    is_heal                  = excluded.is_heal,
    splash_radius            = excluded.splash_radius,
    splash_damage_multiplier = excluded.splash_damage_multiplier,
    effects                  = excluded.effects;
