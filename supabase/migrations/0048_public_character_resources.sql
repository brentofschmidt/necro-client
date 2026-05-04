-- ============================================================
-- 0048_public_character_resources.sql
--
-- Adds get_public_character_resources(uuid) so the Abilities tab on
-- /g/necro/characters/<id>/abilities can render the character's
-- resource pools (Health / Mana / Stamina) alongside the ability
-- scores. Joins necro_content.resources for display_name +
-- display_color so the front-end can colour the bars without a
-- second round-trip.
--
-- Idempotent.
-- ============================================================

create or replace function necro_content.get_public_character_resources(p_character_id uuid)
returns table (
    type          text,
    display_name  text,
    display_color text,
    sort_order    int,
    max_value     real,
    current_value real,
    regen_rate    real,
    regen_delay   real
)
language sql
stable
security definer
set search_path = ''
as $$
    select cr.type,
           r.display_name,
           r.display_color,
           r.sort_order,
           cr.max_value,
           cr.current_value,
           cr.regen_rate,
           cr.regen_delay
    from necro_player.character_resources cr
    left join necro_content.resources r on r.id = cr.type
    where cr.character_id = p_character_id
    order by coalesce(r.sort_order, 999), r.display_name;
$$;

grant execute on function necro_content.get_public_character_resources(uuid)
    to anon, authenticated;
