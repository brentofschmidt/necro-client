-- ============================================================
-- 0010_move_realms_to_content.sql
--
-- Realms are operational shard topology, not per-character save data —
-- they fit better alongside necro_content's other world-shaped tables
-- (npcs, vendors, spawn_points, zones) than under necro_player's
-- per-player save state.
--
-- Postgres preserves FKs across ALTER TABLE ... SET SCHEMA — they're
-- stored by OID, not by qualified name — so the FKs from
-- necro_player.characters.realm_id and necro_player.guilds.realm_id
-- continue to work after the move (the constraint definition just
-- updates to show the new schema). The self-FK on connected_to_id
-- moves with the table since both ends are the same row.
--
-- The auth-gated realms_read policy is dropped and replaced with the
-- public-read pattern used by every other necro_content.* table — the
-- realm picker is rendered for logged-out users too.
-- ============================================================

drop policy if exists realms_read on necro_player.realms;

alter table if exists necro_player.realms set schema necro_content;

-- Re-enable RLS (carries over from the move, but explicit is better).
alter table necro_content.realms enable row level security;

drop policy if exists realms_read on necro_content.realms;
create policy realms_read on necro_content.realms
    for select using (true);
