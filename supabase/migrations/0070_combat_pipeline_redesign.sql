-- ============================================================
-- 0059_combat_pipeline_redesign.sql
--
-- Single consolidated migration that captures the end-state of what was
-- originally split across eleven WIP migrations (0059–0069). Every
-- intermediate step (re-seeding the same RPC three times, adding columns
-- only to drop them later, churning ability_derived_effects three ways)
-- is collapsed into one transactional pass that takes the deployed
-- pre-0059 schema directly to the final combat-pipeline shape.
--
-- ── What this migration does ────────────────────────────────────────────
--
-- 1. Damage-type catalog
--    Adds 'physical' as the umbrella school used by the per-effect
--    pipeline. Slashing / piercing / bludgeoning stay as fine-grained
--    sub-types but routing happens at the school level.
--
-- 2. Stat catalog (necro_content.stats)
--    SHRED stats that didn't earn their keep:
--      versatility, mastery, expertise, life_steal — WoW imports that
--        never wired into the pipeline (versatility was a flat
--        "more of everything" multiplier, mastery had no specs to gate
--        on, expertise overlapped with hit_chance, life_steal fits as
--        an effect type not a stat).
--      dodge_chance, parry_chance — collapsed into a single `evasion`
--        stat. Both fully evaded the same way; the parry-vs-dodge split
--        was flavor rather than mechanics.
--      hit_chance, spell_hit — renamed to accuracy / spell_accuracy.
--    ADD the symmetric defense pair:
--      accuracy / spell_accuracy — driver: DEX_mod / INT_mod.
--      evasion / spell_evasion   — driver: DEX_mod / WIS_mod. WIS now
--        owns the magical defense identity (evasion + magic_resist).
--      spell_block_chance        — driver: CON_mod, shield-gated like
--        physical block. Toughness blocks both schools.
--
-- 3. Ability derived_effects
--    Re-seeds each of the six abilities' "what does this stat give me"
--    descriptions so the public tooltips match the new RPC formulas.
--    STR drops its hit_chance + parry contributions (it's purely a
--    damage stat now). CHA loses its spell_hit role and ends up empty
--    until it gets a new identity (likely aggro / leadership / shop
--    pricing — out of scope here).
--
-- 4. Actions: per-effect damage routing
--    Adds `damage_school` column (FK to damage_types, default 'physical')
--    so actions and spells share routing. Each weapon-class action gets
--    its own explicit Damage effect with a per-ability power_coefficient
--    instead of the old flat `damage` column. Coefficients sized by
--    archetype: fast 1H 0.6, medium 1H 1.0–1.1, medium 2H 1.3, slow 2H
--    2.0, ranged 1.5.
--
-- 5. Spells: per-effect damage routing
--    Drops the parent `damage` column. Each spell's effects array carries
--    its own coefficient + school + target — so Fireball can declare a
--    1.5 direct hit + 0.5 splash, Lesser Heal a single 1.5 heal, and
--    Inspiring Anthem stays a flat StatModifier with no damage scaling.
--
-- 6. Items: weapon damage off, stat bonuses on
--    Drops weapon_min_damage / weapon_max_damage. Damage is now stat-
--    driven (attack_power × ability.coefficient), so the early common-
--    tier weapons (bronze_sword, stone_dagger, etc.) get proportional
--    ability_bonuses (~ avg_weapon_damage / 2 worth of STR / DEX / INT)
--    instead — otherwise they'd become flavor-only.
--
-- 7. RPC: get_public_character_calculated_stats
--    Recreates the function with the final CASE arms. Equipment + aura
--    bonuses logic unchanged; only the formula block changes.
--
-- All steps are idempotent — INSERT … ON CONFLICT, DELETE … WHERE IN,
-- UPDATE-by-id, ADD COLUMN IF NOT EXISTS, DROP COLUMN IF EXISTS, drop+
-- recreate function.
-- ============================================================


-- ── 1. Add the 'physical' umbrella damage type ──────────────────────────────
insert into necro_content.damage_types
    (id, display_name, description, display_color, is_physical)
values
    ('physical',
     'Physical',
     'Generic physical damage. The umbrella school for melee and ranged weapon attacks; routed through armor mitigation. Slashing, piercing, and bludgeoning are tracked granularly as separate types when the weapon distinguishes them.',
     '#A3A3A3',
     true)
on conflict (id) do update set
    display_name  = excluded.display_name,
    description   = excluded.description,
    display_color = excluded.display_color,
    is_physical   = excluded.is_physical;


-- ── 2. Stat catalog: add new + drop superseded ──────────────────────────────
insert into necro_content.stats (id, display_name, description, category, is_percent, affects, sort_order) values
    ('accuracy',           'Accuracy',           'Reliability of melee and ranged attacks landing — opposed by the target''s evasion.', 'Precision', true,  'Melee / ranged',  50),
    ('spell_accuracy',     'Spell Accuracy',     'Reliability of damaging spells landing — opposed by the target''s spell evasion.',    'Precision', true,  'Spells',          51),
    ('evasion',            'Evasion',            'Chance to fully avoid an incoming melee or ranged attack.',                              'Defense',   true,  'Melee / ranged',  41),
    ('spell_evasion',      'Spell Evasion',      'Chance to fully avoid an incoming damaging spell.',                                       'Defense',   true,  'Spells',          42),
    ('spell_block_chance', 'Spell Block Chance', 'Chance to partially block an incoming spell (shield-gated).',                             'Defense',   true,  'With shield',     45)
on conflict (id) do update set
    display_name = excluded.display_name,
    description  = excluded.description,
    category     = excluded.category,
    is_percent   = excluded.is_percent,
    affects      = excluded.affects,
    sort_order   = excluded.sort_order;

delete from necro_content.stats where id in (
    'dodge_chance',
    'parry_chance',
    'hit_chance',
    'spell_hit',
    'versatility',
    'mastery',
    'expertise',
    'life_steal'
);


-- ── 3. Ability derived_effects: re-seed for the new stat surface ────────────
-- STR is purely an offensive damage stat now (accuracy belongs to DEX).
update necro_content.abilities
   set derived_effects = '[
     {"type":"Stat","affects":"attack_power","ratio":2,"description":"+2 attack power per point"}
   ]'::jsonb
 where name = 'strength';

-- DEX drives both accuracy AND evasion (physical agility, both sides).
-- Parry is gone; dodge_chance is renamed evasion.
update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"stamina",       "ratio":5,    "description":"+5 max stamina per point"},
     {"type":"Stat",    "affects":"stamina_regen", "ratio":0.25, "description":"+0.25 stamina regen / sec per point (per 4)"},
     {"type":"Stat",    "affects":"crit_chance",   "ratio":0.5,  "description":"+0.5% crit chance per point (above 10)"},
     {"type":"Stat",    "affects":"evasion",       "ratio":0.5,  "description":"+0.5% evasion per point (above 10)"},
     {"type":"Stat",    "affects":"accuracy",      "ratio":0.5,  "description":"+0.5% accuracy per point (above 10)"},
     {"type":"Stat",    "affects":"attack_speed",  "ratio":0.25, "description":"+0.25 attack speed per point (per 4)"},
     {"type":"Stat",    "affects":"movement_speed","ratio":0.2,  "description":"+0.2 movement speed per point (per 5)"}
   ]'::jsonb
 where name = 'dexterity';

-- CON gains spell_block_chance alongside physical block: toughness blocks
-- both schools when a shield is equipped.
update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"health",             "ratio":10,   "description":"+10 max health per point"},
     {"type":"Stat",    "affects":"health_regen",       "ratio":0.2,  "description":"+0.2 health regen / sec per point (per 5)"},
     {"type":"Stat",    "affects":"block_chance",       "ratio":0.5,  "description":"+0.5% block chance per point (with shield equipped, above 10)"},
     {"type":"Stat",    "affects":"spell_block_chance", "ratio":0.5,  "description":"+0.5% spell block chance per point (with shield equipped, above 10)"}
   ]'::jsonb
 where name = 'constitution';

-- INT remains the canonical caster offense stat (spell_power, spell_crit,
-- spell_accuracy).
update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"mana",          "ratio":10,   "description":"+10 max mana per point"},
     {"type":"Stat",    "affects":"mana_regen",    "ratio":0.25, "description":"+0.25 mana regen / sec per point (per 4)"},
     {"type":"Stat",    "affects":"spell_power",   "ratio":2,    "description":"+2 spell power per point"},
     {"type":"Stat",    "affects":"spell_crit",    "ratio":0.5,  "description":"+0.5% spell crit chance per point (above 10)"},
     {"type":"Stat",    "affects":"spell_accuracy","ratio":0.5,  "description":"+0.5% spell accuracy per point (above 10)"}
   ]'::jsonb
 where name = 'intelligence';

-- WIS becomes the magical defense stat — spell_evasion (avoid) joins
-- magic_resist (mitigation) as the WIS defensive payoff.
update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"mana",          "ratio":5,    "description":"+5 max mana per point"},
     {"type":"Stat",    "affects":"mana_regen",    "ratio":0.25, "description":"+0.25 mana regen / sec per point (per 4)"},
     {"type":"Stat",    "affects":"healing_power", "ratio":2,    "description":"+2 healing power per point"},
     {"type":"Stat",    "affects":"heal_crit",     "ratio":0.5,  "description":"+0.5% heal crit chance per point (above 10)"},
     {"type":"Stat",    "affects":"spell_evasion", "ratio":0.5,  "description":"+0.5% spell evasion per point (above 10)"},
     {"type":"Stat",    "affects":"magic_resist",  "ratio":1,    "description":"+1 magic resist per point"}
   ]'::jsonb
 where name = 'wisdom';

-- CHA: empty until it gets a new role (likely aggro / leadership / shop
-- pricing — out of scope here).
update necro_content.abilities
   set derived_effects = '[]'::jsonb
 where name = 'charisma';


-- ── 4. Actions: damage_school column + per-effect Damage entries ───────────
alter table necro_content.actions
    add column if not exists damage_school text;

update necro_content.actions
   set damage_school = 'physical'
 where damage_school is null;

alter table necro_content.actions
    alter column damage_school set default 'physical',
    alter column damage_school set not null;

do $$ begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'actions_damage_school_fkey'
    ) then
        alter table necro_content.actions
            add constraint actions_damage_school_fkey
            foreign key (damage_school) references necro_content.damage_types(id)
            on update cascade
            on delete restrict;
    end if;
end$$;

-- Each weapon-class action: explicit Damage effect with a per-ability
-- power_coefficient sized by archetype.
update necro_content.actions set effects = '[
  {"type":"Damage","coefficient":1.0,"school":"physical","target":"Primary",
   "description":"Sword strike — 100% attack power"}
]'::jsonb where asset_name = 'slash';

update necro_content.actions set effects = '[
  {"type":"Damage","coefficient":1.3,"school":"physical","target":"Primary",
   "description":"Axe swing — 130% attack power"}
]'::jsonb where asset_name = 'cleave';

update necro_content.actions set effects = '[
  {"type":"Damage","coefficient":2.0,"school":"physical","target":"Primary",
   "description":"Heavy mace blow — 200% attack power"}
]'::jsonb where asset_name = 'smash';

update necro_content.actions set effects = '[
  {"type":"Damage","coefficient":0.6,"school":"physical","target":"Primary",
   "description":"Quick dagger thrust — 60% attack power"}
]'::jsonb where asset_name = 'stab';

update necro_content.actions set effects = '[
  {"type":"Damage","coefficient":1.5,"school":"physical","target":"Primary",
   "description":"Bow shot — 150% attack power"}
]'::jsonb where asset_name = 'shoot';

update necro_content.actions set effects = '[
  {"type":"Damage","coefficient":1.1,"school":"physical","target":"Primary",
   "description":"Staff strike — 110% attack power"}
]'::jsonb where asset_name = 'bash';


-- ── 5. Spells: drop legacy `damage` column + per-effect coefficients ───────
-- Damage is fully effect-driven now; the parent column is redundant.
alter table necro_content.spells drop column if exists damage;

-- Fireball — 1.5 direct + 0.5 splash (totals 2.0 spell-power scaling).
update necro_content.spells set effects = '[
  {"type":"Damage","coefficient":1.5,"school":"fire","target":"Primary",
   "description":"Direct hit — 150% spell power as fire damage"},
  {"type":"Damage","coefficient":0.5,"school":"fire","target":"SplashRadius","radius":5,
   "description":"Splash — 50% spell power to nearby enemies"}
]'::jsonb
 where asset_name = 'fireball';

-- Lesser Heal — single 1.5 healing-power scaling.
update necro_content.spells set effects = '[
  {"type":"Heal","coefficient":1.5,"target":"Primary",
   "description":"Restores HP equal to 150% healing power"}
]'::jsonb
 where asset_name = 'lesser_heal';

-- Inspiring Anthem — flat percentage buff, no damage scaling.
update necro_content.spells set effects = '[
  {"type":"StatModifier","stat":"strength","amount":5,"modifier_type":"Percent",
   "duration":60,"target":"Party","radius":20,
   "description":"+5% Strength to all party members within 20m for 60s"}
]'::jsonb
 where asset_name = 'inspiring_anthem';


-- ── 6. Items: backfill basic weapons + drop weapon damage columns ──────────
-- Conversion: roughly avg_weapon_damage / 2 → primary ability bonus, so
-- the early common-tier weapons keep some mechanical weight after the
-- weapon-damage columns go away.
update necro_content.items set ability_bonuses = '[
  {"ability":"strength","value":3,"modifier_type":"Flat","description":"+3 Strength"}
]'::jsonb where id = 'bronze_sword';

update necro_content.items set ability_bonuses = '[
  {"ability":"strength","value":3,"modifier_type":"Flat","description":"+3 Strength"}
]'::jsonb where id = 'bronze_axe';

update necro_content.items set ability_bonuses = '[
  {"ability":"strength","value":2,"modifier_type":"Flat","description":"+2 Strength"}
]'::jsonb where id = 'stone_mace';

update necro_content.items set ability_bonuses = '[
  {"ability":"dexterity","value":1,"modifier_type":"Flat","description":"+1 Dexterity"}
]'::jsonb where id = 'stone_dagger';

update necro_content.items set ability_bonuses = '[
  {"ability":"dexterity","value":2,"modifier_type":"Flat","description":"+2 Dexterity"}
]'::jsonb where id = 'wooden_bow';

update necro_content.items set ability_bonuses = '[
  {"ability":"intelligence","value":2,"modifier_type":"Flat","description":"+2 Intelligence"}
]'::jsonb where id = 'wooden_staff';

-- Gathering tools (stone_pickaxe / stone_woodcutting_axe / stone_skinning_knife)
-- are profession items, not combat weapons — leaving them with no
-- ability_bonuses. They remain equippable; their gameplay value comes
-- from gathering utility, not combat damage.

-- Higher-tier weapons (rusted_dagger, iron_sword, steel_axe, runed_staff,
-- dawnbringer, worldreaver from migration 0039) already carry significant
-- ability_bonuses; left untouched here for the game designer to rebalance
-- manually once the new model is on a real character.

alter table necro_content.items drop column if exists weapon_min_damage;
alter table necro_content.items drop column if exists weapon_max_damage;


-- ── 7. RPC: get_public_character_calculated_stats ──────────────────────────
-- Final formulas for the symmetric defense model. Stats stay at ability-
-- mod magnitudes (typical −2..+5 range) so the pipeline's linear hit
-- formula `clamp(BASE_HIT + accuracy − evasion, MIN_HIT, MAX_HIT)` reads
-- naturally (every +1 stat moves hit chance by 1%).
drop function if exists necro_content.get_public_character_calculated_stats(uuid);

create function necro_content.get_public_character_calculated_stats(p_character_id uuid)
returns table (
    id                   text,
    display_name         text,
    category             text,
    is_percent           boolean,
    affects              text,
    conversion_per_point text,
    value                real,
    sort_order           int
)
language sql
stable
security definer
set search_path = ''
as $$
    with base as (
        select s.ability, s.value as base_value
        from necro_player.character_ability_scores s
        where s.character_id = p_character_id
    ),
    equipment_bonuses as (
        select
            (b.elem ->> 'ability') as ability,
            sum(((b.elem ->> 'value')::real)) as bonus_value
        from necro_player.equipment e
        join necro_content.items i on i.id = e.item_name
        cross join lateral
            jsonb_array_elements(coalesce(i.ability_bonuses, '[]'::jsonb)) as b(elem)
        where e.character_id = p_character_id
          and e.item_name <> ''
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'ability'
    ),
    aura_ability_bonuses as (
        select
            (b.elem ->> 'ability') as ability,
            sum(((b.elem ->> 'value')::real) * aa.stacks) as bonus_value
        from necro_player.active_auras aa
        join necro_content.auras a on a.id = aa.aura_id
        cross join lateral
            jsonb_array_elements(coalesce(a.ability_bonuses, '[]'::jsonb)) as b(elem)
        where aa.character_id = p_character_id
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'ability'
    ),
    aura_stat_bonuses as (
        select
            (b.elem ->> 'stat') as stat,
            sum(((b.elem ->> 'value')::real) * aa.stacks) as bonus_value
        from necro_player.active_auras aa
        join necro_content.auras a on a.id = aa.aura_id
        cross join lateral
            jsonb_array_elements(coalesce(a.stat_bonuses, '[]'::jsonb)) as b(elem)
        where aa.character_id = p_character_id
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'stat'
    ),
    eff as (
        select
            coalesce(max(case when ab.ability = 'strength'     then ab.value end), 10) as str,
            coalesce(max(case when ab.ability = 'dexterity'    then ab.value end), 10) as dex,
            coalesce(max(case when ab.ability = 'constitution' then ab.value end), 10) as con,
            coalesce(max(case when ab.ability = 'intelligence' then ab.value end), 10) as int_,
            coalesce(max(case when ab.ability = 'wisdom'       then ab.value end), 10) as wis,
            coalesce(max(case when ab.ability = 'charisma'     then ab.value end), 10) as cha
        from (
            select coalesce(b.ability, eb.ability, ab.ability) as ability,
                   coalesce(b.base_value,    0::real)
                   + coalesce(eb.bonus_value, 0::real)
                   + coalesce(ab.bonus_value, 0::real) as value
            from base b
            full outer join equipment_bonuses eb on eb.ability = b.ability
            full outer join aura_ability_bonuses ab on ab.ability = coalesce(b.ability, eb.ability)
        ) ab
    ),
    gear as (
        select exists (
            select 1
            from necro_player.equipment e
            join necro_content.items i on i.id = e.item_name
            where e.character_id = p_character_id
              and i.item_subclass = 'shield'
        ) as has_shield
    ),
    formula as (
        select
            s.id,
            s.display_name,
            s.category,
            s.is_percent,
            s.affects,
            s.conversion_per_point,
            s.sort_order,
            case s.id
                when 'attack_power'   then (eff.str  * 2)::real
                when 'spell_power'    then (eff.int_ * 2)::real
                when 'healing_power'  then (eff.wis  * 2)::real
                when 'crit_damage'    then 50::real

                when 'crit_chance'    then floor((eff.dex  - 10) / 2.0)::real
                when 'spell_crit'     then floor((eff.int_ - 10) / 2.0)::real
                when 'heal_crit'      then floor((eff.wis  - 10) / 2.0)::real

                when 'haste'          then floor(eff.dex / 4.0)::real
                when 'attack_speed'   then floor(eff.dex / 4.0)::real
                when 'movement_speed' then floor(eff.dex / 5.0)::real

                when 'armor'          then 0::real
                when 'evasion'        then floor((eff.dex - 10) / 2.0)::real
                when 'spell_evasion'  then floor((eff.wis - 10) / 2.0)::real
                when 'block_chance'   then case
                                              when gear.has_shield
                                                  then floor((eff.con - 10) / 2.0)::real
                                              else 0::real
                                           end
                when 'spell_block_chance' then case
                                              when gear.has_shield
                                                  then floor((eff.con - 10) / 2.0)::real
                                              else 0::real
                                           end
                when 'magic_resist'   then eff.wis::real

                when 'accuracy'       then floor((eff.dex  - 10) / 2.0)::real
                when 'spell_accuracy' then floor((eff.int_ - 10) / 2.0)::real

                when 'mana_regen'     then floor(eff.wis / 4.0)::real
                when 'health_regen'   then floor(eff.con / 5.0)::real

                else 0::real
            end as base_value
        from necro_content.stats s
        cross join eff
        cross join gear
    )
    select
        f.id,
        f.display_name,
        f.category,
        f.is_percent,
        f.affects,
        f.conversion_per_point,
        f.base_value + coalesce(asb.bonus_value, 0::real) as value,
        f.sort_order
    from formula f
    left join aura_stat_bonuses asb on asb.stat = f.id
    order by f.sort_order, f.id;
$$;

grant execute on function necro_content.get_public_character_calculated_stats(uuid)
    to anon, authenticated;
