-- ============================================================
-- 0011_realm_stats_function.sql
--
-- Per-realm character counts for the realm picker UI.
--
-- A SECURITY DEFINER function rather than denormalized columns on
-- necro_content.realms — counts derived on read avoid the write-time
-- coordination (insert / update / delete / soft-delete triggers) that
-- denormalized counters require, and the existing characters_realm_idx
-- partial index on (realm_id) where deleted_at is null already makes
-- the per-realm count cheap.
--
-- "online" = last_played_at within `online_window` (default 5 minutes).
-- last_played_at is updated by every save (zone change, level-up, save
-- timer), so a short window approximates "actively playing".
--
-- security definer because necro_player.characters has owner-only RLS;
-- this function only exposes aggregate counts per realm — no individual
-- character info leaks.
-- ============================================================

create or replace function necro_content.get_realm_stats(
    online_window interval default interval '5 minutes'
)
returns table (
    realm_id          uuid,
    total_characters  bigint,
    online_characters bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        c.realm_id,
        count(*)                                                                  as total_characters,
        count(*) filter (where c.last_played_at > now() - online_window)          as online_characters
    from necro_player.characters c
    where c.deleted_at is null
    group by c.realm_id;
$$;

grant execute on function necro_content.get_realm_stats(interval) to anon, authenticated;
