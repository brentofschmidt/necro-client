-- ============================================================
-- 0071_admin_update_item.sql
--
-- Adds the first admin-mutation RPC for the content tables. The
-- function `update_item_by_admin` takes an item id + jsonb patch
-- and applies only the fields present in the patch (coalesce-style
-- merge). Server-side role check looks at accounts.users.role —
-- the same column the client's `isAdmin()` helper inspects.
--
-- The function is granted to `authenticated` (not `anon`); the
-- internal role check rejects non-admins with a `forbidden` error
-- before any UPDATE happens.
--
-- jsonb `?` operator is used to distinguish "key missing from
-- patch" from "key present with null/empty", so admins can
-- explicitly clear nullable columns (weapon_speed, consumable_cooldown).
--
-- Idempotent.
-- ============================================================

drop function if exists necro_content.update_item_by_admin(text, jsonb);

create function necro_content.update_item_by_admin(
    p_id     text,
    p_patch  jsonb
)
returns necro_content.items
language plpgsql
security definer
set search_path = ''
as $body$
declare
    v_role text;
    v_row  necro_content.items;
begin
    -- Caller must be an admin per accounts.users.role.
    select u.role into v_role
    from accounts.users u
    where u.id = auth.uid();

    if v_role is distinct from 'admin' then
        raise exception 'forbidden: admin role required';
    end if;

    update necro_content.items
    set item_name           = coalesce(p_patch->>'item_name', item_name),
        description         = coalesce(p_patch->>'description', description),
        rarity              = coalesce(p_patch->>'rarity', rarity),
        item_subclass       = coalesce(p_patch->>'item_subclass', item_subclass),
        inventory_slot      = coalesce(p_patch->>'inventory_slot', inventory_slot),
        required_skill_level = coalesce(
                                (p_patch->>'required_skill_level')::int,
                                required_skill_level),
        is_stackable        = coalesce(
                                (p_patch->>'is_stackable')::bool,
                                is_stackable),
        max_stack_size      = coalesce(
                                (p_patch->>'max_stack_size')::int,
                                max_stack_size),
        weight              = coalesce(
                                (p_patch->>'weight')::real,
                                weight),
        weapon_speed        = case
                                when p_patch ? 'weapon_speed' then
                                    nullif(p_patch->>'weapon_speed', '')::real
                                else weapon_speed
                              end,
        ability_bonuses     = coalesce(
                                p_patch->'ability_bonuses',
                                ability_bonuses),
        stats               = coalesce(
                                p_patch->'stats',
                                stats),
        trigger_effects     = coalesce(
                                p_patch->'trigger_effects',
                                trigger_effects),
        is_consumable       = coalesce(
                                (p_patch->>'is_consumable')::bool,
                                is_consumable),
        consumable_cooldown = case
                                when p_patch ? 'consumable_cooldown' then
                                    nullif(p_patch->>'consumable_cooldown', '')::real
                                else consumable_cooldown
                              end,
        consumable_effects  = coalesce(
                                p_patch->'consumable_effects',
                                consumable_effects),
        consumable_buffs    = coalesce(
                                p_patch->'consumable_buffs',
                                consumable_buffs),
        is_craftable        = coalesce(
                                (p_patch->>'is_craftable')::bool,
                                is_craftable)
    where id = p_id
    returning * into v_row;

    if not found then
        raise exception 'item not found: %', p_id;
    end if;

    return v_row;
end;
$body$;

grant execute on function necro_content.update_item_by_admin(text, jsonb)
    to authenticated;
