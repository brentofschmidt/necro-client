-- ============================================================
-- 0054_resources_from_abilities.sql
--
-- Wires ability scores into the resource pool calculation. Until now
-- get_public_character_resources only stacked aura resource_bonuses on
-- top of the stored character_resources.max_value — Constitution,
-- Intelligence, etc. were computed elsewhere but never reached the
-- player-visible HP / Mana / Stamina pools.
--
-- Per-point contributions match the abilities.derived_effects seed
-- from migration 0022:
--
--   Health   max  : effective CON × 10
--   Health   regen: floor(CON / 5)
--   Mana     max  : effective INT × 10  +  effective WIS × 5
--   Mana     regen: floor(INT / 4)  +  floor(WIS / 4)   (matches 0053)
--   Stamina  max  : effective DEX × 5
--   Stamina  regen: floor(DEX / 4)                       (matches 0053)
--
-- The function now returns a new ability_bonus_max_value column so the
-- character UI can break down "Base 80 · +260 abilities · +X aura"
-- instead of folding everything into one number.
--
-- regen_rate stays a single value (base regen + ability-driven regen);
-- a separate breakdown column for regen would clutter the row without
-- buying much. Aura resource_bonuses still target max only.
--
-- Idempotent.
-- ============================================================

drop function if exists necro_content.get_public_character_resources(uuid);

create function necro_content.get_public_character_resources(p_character_id uuid)
returns table (
    type                    text,
    display_name            text,
    display_color           text,
    sort_order              int,
    base_max_value          real,
    ability_bonus_max_value real,
    bonus_max_value         real,
    max_value               real,
    current_value           real,
    regen_rate              real,
    regen_delay             real
)
language sql
stable
security definer
set search_path = ''
as $$
    -- Effective ability scores (base + flat equipment + flat aura).
    -- Mirrors the eff CTE in get_public_character_calculated_stats —
    -- kept inline rather than factored out so this function stays a
    -- single self-contained query.
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
    aura_resource_bonuses as (
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
    )
    select
        cr.type,
        r.display_name,
        r.display_color,
        r.sort_order,
        cr.max_value as base_max_value,
        case cr.type
            when 'health'  then (eff.con  * 10)::real
            when 'mana'    then (eff.int_ * 10 + eff.wis * 5)::real
            when 'stamina' then (eff.dex  * 5)::real
            else 0::real
        end as ability_bonus_max_value,
        coalesce(arb.bonus_value, 0::real) as bonus_max_value,
        cr.max_value
            + case cr.type
                when 'health'  then (eff.con  * 10)::real
                when 'mana'    then (eff.int_ * 10 + eff.wis * 5)::real
                when 'stamina' then (eff.dex  * 5)::real
                else 0::real
              end
            + coalesce(arb.bonus_value, 0::real) as max_value,
        cr.current_value,
        cr.regen_rate
            + case cr.type
                when 'health'  then floor(eff.con / 5.0)::real
                when 'mana'    then (floor(eff.int_ / 4.0) + floor(eff.wis / 4.0))::real
                when 'stamina' then floor(eff.dex / 4.0)::real
                else 0::real
              end as regen_rate,
        cr.regen_delay
    from necro_player.character_resources cr
    cross join eff
    left join necro_content.resources r       on r.id = cr.type
    left join aura_resource_bonuses    arb    on arb.resource = cr.type
    where cr.character_id = p_character_id
    order by coalesce(r.sort_order, 999), r.display_name;
$$;

grant execute on function necro_content.get_public_character_resources(uuid)
    to anon, authenticated;
