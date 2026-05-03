-- ============================================================
-- 0008_necro_content_grants.sql
--
-- The canonical schema.sql grants USAGE on necro_content (and reads on
-- its tables) to anon + authenticated, but those grants get dropped
-- whenever the schema is rebuilt and were missing on this database.
-- The RLS policies on necro_content already gate reads with
-- `for select using (true)` so the SELECT grant just opens the door —
-- RLS still decides what comes back.
--
-- Idempotent — safe to re-run.
-- ============================================================

grant usage on schema necro_content to anon, authenticated;

grant select on all tables    in schema necro_content to anon, authenticated;
grant select on all sequences in schema necro_content to anon, authenticated;

-- Future tables added to necro_content inherit the same access.
alter default privileges in schema necro_content
    grant select on tables    to anon, authenticated;
alter default privileges in schema necro_content
    grant select on sequences to anon, authenticated;
