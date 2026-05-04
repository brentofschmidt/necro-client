-- ============================================================
-- 0009_seed_necro_realm.sql
--
-- Seeds the first Necro realm. necro_player.realms already exists in
-- the canonical schema with WoW-style metadata (region, realm_type,
-- locale, timezone, population, is_online, connected_to_id).
--
-- Idempotent via ON CONFLICT on the short_name unique key — the id
-- (gen_random_uuid()) is preserved across re-runs.
-- ============================================================

insert into necro_player.realms (
    short_name,
    display_name,
    region,
    locale,
    realm_type,
    timezone,
    is_online,
    population,
    connected_to_id
)
values (
    'mortis',
    'Mortis',
    'NA',                              -- 'NA','EU','KR','CN','OCE','TW'
    'en-US',
    'PvE',                             -- 'PvE','PvP','RP','RP-PvP'
    'America/Los_Angeles',
    true,
    'Medium',                          -- 'Low','Medium','High','Full','Locked'
    null                               -- not part of a connected-realm pool yet
)
on conflict (short_name) do update set
    display_name = excluded.display_name,
    region       = excluded.region,
    locale       = excluded.locale,
    realm_type   = excluded.realm_type,
    timezone     = excluded.timezone,
    is_online    = excluded.is_online,
    population   = excluded.population;
