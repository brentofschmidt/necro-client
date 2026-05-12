-- ============================================================
-- 0072_seed_rend_dot.sql
--
-- First action with a DamageOverTime effect — a sword finisher
-- called "Rend" that lands an initial hit and applies a 10-second
-- bleed. DOTs are modelled as a new effect type inside
-- `necro_content.actions.effects`:
--
--   { "type":"DamageOverTime",
--     "coefficient":0.2,
--     "school":"physical",
--     "target":"Primary",
--     "tick_interval":1,
--     "duration":10,
--     "description":"Bleeds for 20% AP per second over 10s" }
--
-- Total damage over the duration =
--   floor(duration / tick_interval) ticks × coefficient × power
-- so Rend's bleed = 10 × 0.2 × attack_power = 200% AP over 10s,
-- on top of the initial 80% AP direct hit. The damage calculator
-- iterates the effects array and renders per-tick + total stats.
--
-- Idempotent.
-- ============================================================

insert into necro_content.actions (
    asset_name, ability_name, description,
    type, targeting, resource_type, resource_cost,
    cooldown, cast_time, global_cooldown,
    range, requires_target, required_weapon_types,
    damage_school, effects
) values
    ('rend', 'Rend',
     'A vicious cleaving strike that opens a bleeding wound. Deals immediate damage and causes the target to bleed over time.',
     'WeaponAttack', 'SingleTarget', 'Stamina', 10,
     6, 0, 1.5,
     2, true, '{sword}',
     'physical',
     '[
       {"type":"Damage","coefficient":0.8,"school":"physical","target":"Primary",
        "description":"Opening strike — 80% attack power"},
       {"type":"DamageOverTime","coefficient":0.2,"school":"physical","target":"Primary",
        "tick_interval":1,"duration":10,
        "description":"Bleeds for 20% AP every second for 10 seconds"}
     ]'::jsonb)
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
    required_weapon_types = excluded.required_weapon_types,
    damage_school         = excluded.damage_school,
    effects               = excluded.effects;
