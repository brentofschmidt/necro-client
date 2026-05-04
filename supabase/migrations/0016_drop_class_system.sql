-- ============================================================
-- 0016_drop_class_system.sql
--
-- Strips Necro of its class / spec / talent infrastructure. Going
-- classless: character power comes from skills + abilities, not from
-- class trees (closer to RuneScape than WoW).
--
-- Removed:
--   necro_player.character_talent_allocations
--   necro_player.character_talents
--   necro_content.talents
--   necro_content.specs
--   necro_content.classes
--   necro_player.characters.character_class column
--   necro_content.trainers.class_id column
--   'Class' value from trainers.trainer_type CHECK
--
-- Also recreates necro_content.list_public_characters() without the
-- character_class column.
--
-- ⚠ Destructive — drops tables and columns. Any seeded class / spec /
-- talent rows (e.g. from 0014's class seed) are lost. Idempotent via
-- IF EXISTS guards.
-- ============================================================

-- ── Drop child tables before parents ────────────────────────────────────────

drop table if exists necro_player.character_talent_allocations;
drop table if exists necro_player.character_talents;
drop table if exists necro_content.talents;
drop table if exists necro_content.specs;

-- ── characters.character_class ──────────────────────────────────────────────

alter table necro_player.characters drop column if exists character_class;

-- ── trainers.class_id + CHECK ───────────────────────────────────────────────

alter table necro_content.trainers drop column if exists class_id;

-- 'Class' is no longer a valid trainer_type. Drop and re-add the CHECK so
-- only 'Profession' (or future skill-shaped) trainers remain.
alter table necro_content.trainers drop constraint if exists trainers_trainer_type_check;
alter table necro_content.trainers
    add constraint trainers_trainer_type_check
    check (trainer_type in ('Profession'));

-- ── Drop the classes table itself ───────────────────────────────────────────

drop table if exists necro_content.classes;


-- ── Recreate list_public_characters without character_class ─────────────────
-- A return-type change requires drop+create.

drop function if exists necro_content.list_public_characters();

create function necro_content.list_public_characters()
returns table (
    id              uuid,
    character_name  text,
    race            text,
    level           int,
    realm_id        uuid
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.character_name, c.race, c.level, c.realm_id
    from necro_player.characters c
    where c.deleted_at is null
    order by c.level desc, c.character_name;
$$;

grant execute on function necro_content.list_public_characters() to anon, authenticated;
