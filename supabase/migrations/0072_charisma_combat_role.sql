-- ============================================================
-- 0072_charisma_combat_role.sql
--
-- Gives CHA an actual combat identity. The 0070 redesign emptied
-- charisma's derived_effects (its old spell_hit role went away with the
-- migration to spell_accuracy). This migration re-populates CHA with a
-- showmanship + leadership flavour that doesn't overlap any other
-- ability's primary identity:
--
--   crit_damage  — primary CHA stat. Style of the showman: bigger crits.
--                  Currently the ONLY ability driver for crit_damage
--                  (other ability scores leave it at the fixed 50 base).
--                  +0.5% crit damage per CHA point above 10 → CHA 20 =
--                  +5% crit damage (i.e. crits go from 1.5× → 1.55× dmg).
--
--   heal_crit    — secondary. Half-share with WIS as the primary. A
--                  leader's encouraging presence lifts the chance heals
--                  land big. +0.25% heal crit per CHA point above 10 →
--                  CHA 20 = +2.5% heal crit (vs WIS 20's +5%).
--
-- INT, WIS, DEX identities stay untouched: INT still owns spell_power /
-- spell_crit / spell_accuracy; WIS still owns healing_power / magic_resist
-- / spell_evasion (and primary heal_crit); DEX still owns accuracy /
-- evasion / crit_chance. CHA fills the crit-flavour gap that nobody else
-- claimed.
--
-- Steps:
--   1. UPDATE necro_content.abilities.derived_effects on the charisma row
--      with two Stat entries (crit_damage + heal_crit).
--   2. Drop + recreate get_public_character_calculated_stats with the
--      two updated CASE arms. The rest of the function body is unchanged
--      from 0070's final form.
--
-- Idempotent — UPDATE by name + drop+recreate function.
-- ============================================================


-- ── 1. CHA derived_effects ─────────────────────────────────────────────────
update necro_content.abilities
   set derived_effects = '[
     {"type":"Stat","affects":"crit_damage","ratio":0.5, "description":"+0.5% crit damage per point (above 10)"},
     {"type":"Stat","affects":"heal_crit",  "ratio":0.25,"description":"+0.25% heal crit per point (above 10)"}
   ]'::jsonb
 where name = 'charisma';


-- ── 2. Recreate the RPC with CHA wired into crit_damage + heal_crit ────────
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
                -- CHA-driven crit damage: +0.5% per CHA point above 10
                -- on top of the 50% baseline.
                when 'crit_damage'    then (50 + floor((eff.cha - 10) / 2.0))::real

                when 'crit_chance'    then floor((eff.dex  - 10) / 2.0)::real
                when 'spell_crit'     then floor((eff.int_ - 10) / 2.0)::real
                -- WIS is primary, CHA contributes half-share (per 4 points).
                when 'heal_crit'      then (floor((eff.wis - 10) / 2.0)
                                            + floor((eff.cha - 10) / 4.0))::real

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
