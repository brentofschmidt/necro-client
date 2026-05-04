-- ============================================================
-- 0052_stat_effect_descriptions.sql
--
-- Extends get_public_character_calculated_stats to include the
-- catalog's `affects` and `conversion_per_point` strings, so the
-- character page can render lines like:
--
--   Attack Power    36    +3.6% physical damage
--   Haste           4%    +2% cast & swing speed
--   Armor          15     +1.5% physical damage reduction
--
-- The conversion text is parsed client-side ("+0.1% physical damage
-- per point" × 36 ⇒ "+3.6% physical damage") rather than computed
-- in SQL — keeps the formula text human-editable and the migration
-- thin.
--
-- Idempotent. Drops + recreates because the return type changes.
-- ============================================================

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
              and i.item_type = 'shield'
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
