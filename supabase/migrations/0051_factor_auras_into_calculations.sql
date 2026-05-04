-- ============================================================
-- 0051_factor_auras_into_calculations.sql
--
-- Threads necro_player.active_auras through every calculation RPC the
-- character page uses, so buffs / debuffs show up in the displayed
-- numbers:
--
--   get_public_character_ability_scores   — splits the bonus column
--       into equipment_bonus_value + aura_bonus_value so the UI can
--       say "16 +2 gear +2 aura = 20".
--
--   get_public_character_calculated_stats — uses the aura-aware
--       effective abilities for the formula-based substats AND adds
--       any direct aura stat_bonuses (Iron Will's +5 armor etc.).
--
--   get_public_character_resources        — adds bonus_max_value from
--       aura resource_bonuses; max_value is now the effective total
--       (base + auras), so the progress-bar percent stays correct.
--
-- All three RPCs sum modifiers as `value * stacks` to honour stacking
-- auras, and only respect `modifier_type = 'Flat'` for now.
-- 'Percent' modifiers can be layered on later without changing call
-- sites.
--
-- Idempotent. Drops + recreates the three RPCs because their return
-- shapes change.
-- ============================================================


-- ── 1. Ability scores: base / equipment / aura / total ────────────────────
drop function if exists necro_content.get_public_character_ability_scores(uuid);

create function necro_content.get_public_character_ability_scores(p_character_id uuid)
returns table (
    ability               text,
    display_name          text,
    base_value            real,
    equipment_bonus_value real,
    aura_bonus_value      real,
    total_value           real
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
    aura_bonuses as (
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
    -- Outer-join everything so abilities that exist in only one source
    -- still appear (e.g. an aura adding strength on a character with no
    -- explicit base STR row).
    combined as (
        select coalesce(b.ability, eb.ability, ab.ability) as ability,
               coalesce(b.base_value,    0::real) as base_value,
               coalesce(eb.bonus_value,  0::real) as equipment_bonus_value,
               coalesce(ab.bonus_value,  0::real) as aura_bonus_value
        from base b
        full outer join equipment_bonuses eb on eb.ability = b.ability
        full outer join aura_bonuses      ab on ab.ability = coalesce(b.ability, eb.ability)
    )
    select
        c.ability,
        a.display_name,
        c.base_value,
        c.equipment_bonus_value,
        c.aura_bonus_value,
        c.base_value + c.equipment_bonus_value + c.aura_bonus_value as total_value
    from combined c
    left join necro_content.abilities a on a.name = c.ability
    order by a.display_name;
$$;

grant execute on function necro_content.get_public_character_ability_scores(uuid)
    to anon, authenticated;


-- ── 2. Calculated stats: formula off effective abilities + direct aura adds ─
create or replace function necro_content.get_public_character_calculated_stats(p_character_id uuid)
returns table (
    id           text,
    display_name text,
    category     text,
    is_percent   boolean,
    value        real,
    sort_order   int
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
    -- Direct aura → substat bonuses, e.g. Iron Will: +5 armor.
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
              and i.item_type = 'shield'
        ) as has_shield
    ),
    formula as (
        select
            s.id,
            s.display_name,
            s.category,
            s.is_percent,
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

                when 'armor'          then eff.con::real
                when 'dodge_chance'   then floor((eff.dex - 10) / 2.0)::real
                when 'parry_chance'   then floor((eff.str - 10) / 2.0)::real
                when 'block_chance'   then case
                                              when gear.has_shield
                                                  then floor((eff.con - 10) / 2.0)::real
                                              else 0::real
                                           end
                when 'magic_resist'   then eff.wis::real

                when 'hit_chance'     then (floor((eff.dex - 10) / 2.0)
                                            + floor((eff.wis - 10) / 2.0))::real
                when 'spell_hit'      then floor((eff.int_ - 10) / 2.0)::real
                when 'expertise'      then floor((eff.cha - 10) / 2.0)::real

                when 'mana_regen'     then floor(eff.wis / 4.0)::real
                when 'health_regen'   then floor(eff.con / 5.0)::real
                when 'life_steal'     then 0::real

                when 'mastery'        then 0::real
                when 'versatility'    then floor(eff.cha / 5.0)::real

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
        f.base_value + coalesce(asb.bonus_value, 0::real) as value,
        f.sort_order
    from formula f
    left join aura_stat_bonuses asb on asb.stat = f.id
    order by f.sort_order, f.id;
$$;

grant execute on function necro_content.get_public_character_calculated_stats(uuid)
    to anon, authenticated;


-- ── 3. Resources: base + aura → effective max ──────────────────────────────
drop function if exists necro_content.get_public_character_resources(uuid);

create function necro_content.get_public_character_resources(p_character_id uuid)
returns table (
    type            text,
    display_name    text,
    display_color   text,
    sort_order      int,
    base_max_value  real,
    bonus_max_value real,
    max_value       real,
    current_value   real,
    regen_rate      real,
    regen_delay     real
)
language sql
stable
security definer
set search_path = ''
as $$
    with aura_resource_bonuses as (
        select
            (b.elem ->> 'resource') as resource,
            sum(((b.elem ->> 'value')::real) * aa.stacks) as bonus_value
        from necro_player.active_auras aa
        join necro_content.auras a on a.id = aa.aura_id
        cross join lateral
            jsonb_array_elements(coalesce(a.resource_bonuses, '[]'::jsonb)) as b(elem)
        where aa.character_id = p_character_id
          and (b.elem ->> 'modifier_type') = 'Flat'
        group by b.elem ->> 'resource'
    )
    select
        cr.type,
        r.display_name,
        r.display_color,
        r.sort_order,
        cr.max_value as base_max_value,
        coalesce(arb.bonus_value, 0::real) as bonus_max_value,
        cr.max_value + coalesce(arb.bonus_value, 0::real) as max_value,
        cr.current_value,
        cr.regen_rate,
        cr.regen_delay
    from necro_player.character_resources cr
    left join necro_content.resources r       on r.id = cr.type
    left join aura_resource_bonuses    arb    on arb.resource = cr.type
    where cr.character_id = p_character_id
    order by coalesce(r.sort_order, 999), r.display_name;
$$;

grant execute on function necro_content.get_public_character_resources(uuid)
    to anon, authenticated;
