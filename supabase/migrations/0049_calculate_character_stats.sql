-- ============================================================
-- 0049_calculate_character_stats.sql
--
-- Two related calculations for the Abilities tab on the Character page:
--
-- 1. Effective ability scores. Replaces the previous flat
--    get_public_character_ability_scores with one that returns
--    base / bonus / total — base from character_ability_scores,
--    bonus from summing the `ability_bonuses` jsonb on currently
--    equipped items, total = base + bonus.
--
-- 2. Derived substats (Power / Crit / Speed / Defense / etc.).
--    Adds get_public_character_calculated_stats — runs through
--    necro_content.stats and computes a value for each catalog
--    substat from the character's effective abilities, with a few
--    gear-aware bumps (block_chance only when a shield is equipped).
--
-- The substat formulas here are intentionally simple D&D-ish defaults
-- — STR drives attack_power, DEX drives crit/dodge/haste, INT drives
-- spell_power/spell_crit, etc. They are meant as a baseline that's
-- easy to tune; combat-balance numbers belong in a separate migration
-- once the math is finalised.
--
-- Idempotent.
-- ============================================================


-- ── 1. Effective ability scores (base + equipment bonus) ───────────────────
drop function if exists necro_content.get_public_character_ability_scores(uuid);

create function necro_content.get_public_character_ability_scores(p_character_id uuid)
returns table (
    ability      text,
    display_name text,
    base_value   real,
    bonus_value  real,
    total_value  real
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
    )
    select
        coalesce(b.ability, eb.ability)                          as ability,
        a.display_name                                            as display_name,
        coalesce(b.base_value,  0::real)                          as base_value,
        coalesce(eb.bonus_value, 0::real)                         as bonus_value,
        coalesce(b.base_value, 0::real)
            + coalesce(eb.bonus_value, 0::real)                   as total_value
    from base b
    full outer join equipment_bonuses eb on eb.ability = b.ability
    left join necro_content.abilities a on a.name = coalesce(b.ability, eb.ability)
    order by a.display_name;
$$;

grant execute on function necro_content.get_public_character_ability_scores(uuid)
    to anon, authenticated;


-- ── 2. Derived substats from effective abilities + gear flags ──────────────
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
    -- Effective scores keyed by ability id; default 10 (D&D baseline) when
    -- the character has no row for an ability.
    eff as (
        select
            coalesce(max(case when ab.ability = 'strength'     then ab.value end), 10) as str,
            coalesce(max(case when ab.ability = 'dexterity'    then ab.value end), 10) as dex,
            coalesce(max(case when ab.ability = 'constitution' then ab.value end), 10) as con,
            coalesce(max(case when ab.ability = 'intelligence' then ab.value end), 10) as int_,
            coalesce(max(case when ab.ability = 'wisdom'       then ab.value end), 10) as wis,
            coalesce(max(case when ab.ability = 'charisma'     then ab.value end), 10) as cha
        from (
            select coalesce(b.ability, eb.ability) as ability,
                   coalesce(b.base_value, 0::real) + coalesce(eb.bonus_value, 0::real) as value
            from base b
            full outer join equipment_bonuses eb on eb.ability = b.ability
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
    )
    select
        s.id,
        s.display_name,
        s.category,
        s.is_percent,
        case s.id
            -- Power: ability score * 2 (a STR 16 fighter ⇒ 32 attack power)
            when 'attack_power'   then (eff.str  * 2)::real
            when 'spell_power'    then (eff.int_ * 2)::real
            when 'healing_power'  then (eff.wis  * 2)::real
            when 'crit_damage'    then 50::real

            -- Crit: D&D-style modifier (= floor((score - 10) / 2)) as percent
            when 'crit_chance'    then floor((eff.dex  - 10) / 2.0)::real
            when 'spell_crit'     then floor((eff.int_ - 10) / 2.0)::real
            when 'heal_crit'      then floor((eff.wis  - 10) / 2.0)::real

            -- Speed: scales lightly off DEX
            when 'haste'          then floor(eff.dex / 4.0)::real
            when 'attack_speed'   then floor(eff.dex / 4.0)::real
            when 'movement_speed' then floor(eff.dex / 5.0)::real

            -- Defense
            when 'armor'          then eff.con::real
            when 'dodge_chance'   then floor((eff.dex - 10) / 2.0)::real
            when 'parry_chance'   then floor((eff.str - 10) / 2.0)::real
            when 'block_chance'   then case
                                          when gear.has_shield
                                              then floor((eff.con - 10) / 2.0)::real
                                          else 0::real
                                       end
            when 'magic_resist'   then eff.wis::real

            -- Precision
            when 'hit_chance'     then (floor((eff.dex - 10) / 2.0)
                                        + floor((eff.wis - 10) / 2.0))::real
            when 'spell_hit'      then floor((eff.int_ - 10) / 2.0)::real
            when 'expertise'      then floor((eff.cha - 10) / 2.0)::real

            -- Sustain
            when 'mana_regen'     then floor(eff.wis / 4.0)::real
            when 'health_regen'   then floor(eff.con / 5.0)::real
            when 'life_steal'     then 0::real

            -- Mastery (placeholder until class-equivalent system lands)
            when 'mastery'        then 0::real
            when 'versatility'    then floor(eff.cha / 5.0)::real

            else 0::real
        end as value,
        s.sort_order
    from necro_content.stats s
    cross join eff
    cross join gear
    order by s.sort_order, s.id;
$$;

grant execute on function necro_content.get_public_character_calculated_stats(uuid)
    to anon, authenticated;
