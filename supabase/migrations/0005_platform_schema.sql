-- ============================================================
-- 0005_platform_schema.sql
--
-- Moves the platform-level games catalog and entitlements out of
-- accounts.* into a dedicated platform.* schema. accounts.* now stays
-- focused on user identity (profile, friends, blocks, linked accounts);
-- platform.* holds the cross-game catalog and anything else
-- platform-shaped that lands later (store products, announcements, etc.).
--
-- ALTER TABLE ... SET SCHEMA preserves columns, indexes, constraints,
-- triggers, AND attached RLS policies. The policies still reference
-- accounts.is_admin() — that function is unchanged, so the references
-- remain valid after the move.
--
-- After applying, add `platform` to:
--   Supabase Dashboard → Project Settings → API → "Exposed schemas"
-- ============================================================

create schema if not exists platform;

grant usage on schema platform to anon, authenticated, service_role;

alter default privileges in schema platform grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema platform grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema platform grant all on routines  to anon, authenticated, service_role;

-- Move the tables. Order doesn't matter — Postgres updates FKs by OID.
alter table if exists accounts.games      set schema platform;
alter table if exists accounts.user_games set schema platform;

-- Catch up grants on the now-relocated tables (default privileges only
-- apply to objects created AFTER the alter default privileges command).
grant all on all tables    in schema platform to anon, authenticated, service_role;
grant all on all sequences in schema platform to anon, authenticated, service_role;
grant all on all routines  in schema platform to anon, authenticated, service_role;
