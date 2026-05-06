-- ============================================================
-- 0055_equipment_with_bonuses.sql
--
-- Extends get_public_character_equipment so the character page can
-- show what each equipped item actually does, not just its name.
-- The function now returns:
--
--   description           — flavor / tooltip text
--   weapon_min/max/speed  — for weapons in MainHand / OffHand / TwoHand
--   ability_bonuses jsonb — STR/DEX/CON/INT/WIS/CHA bumps from gear
--   stats           jsonb — substat bumps (attack_power, crit, etc.)
--
-- Resource bonuses aren't included because items don't currently have
-- a resource_bonuses column — those come through indirectly via the
-- ability score → resource max chain wired up in 0054.
--
-- Drop + recreate because the return type changes.
-- ============================================================

drop function if exists necro_content.get_public_character_equipment(uuid);

create function necro_content.get_public_character_equipment(p_character_id uuid)
returns table (
    slot              text,
    item_id           text,
    item_name         text,
    item_rarity       text,
    item_type         text,
    description       text,
    weapon_min_damage real,
    weapon_max_damage real,
    weapon_speed      real,
    ability_bonuses   jsonb,
    stats             jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        e.slot,
        e.item_name as item_id,
        i.item_name,
        i.rarity,
        i.item_type,
        i.description,
        i.weapon_min_damage,
        i.weapon_max_damage,
        i.weapon_speed,
        coalesce(i.ability_bonuses, '[]'::jsonb),
        coalesce(i.stats,           '[]'::jsonb)
    from necro_player.equipment e
    left join necro_content.items i on i.id = e.item_name
    where e.character_id = p_character_id
      and e.item_name <> ''
    order by e.slot;
$$;

grant execute on function necro_content.get_public_character_equipment(uuid)
    to anon, authenticated;
