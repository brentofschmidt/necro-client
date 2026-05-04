-- ============================================================
-- 0033_actions_no_intrinsic_damage.sql
--
-- Drops damage and damage_school from necro_content.actions. Action
-- damage is fully driven by the equipped weapon at runtime — a sword
-- "Slash" deals what the sword deals; a legendary sword's "Slash"
-- hits much harder than a rusty one's. Storing intrinsic damage on
-- the action mis-modeled the relationship.
--
-- Spells keep damage / damage_school because spell power is intrinsic
-- (Fireball is 50 fire damage regardless of the staff held — gear may
-- scale it, but it's not weapon-driven).
--
-- If actions ever need bonus / elemental damage layered on top of the
-- weapon (e.g. Frostbite Strike adds cold damage), add a separate
-- bonus_damage / bonus_damage_school column at that point.
--
-- Also drops the now-orphaned actions_damage_school_idx.
-- ============================================================

drop index if exists necro_content.actions_damage_school_idx;

alter table necro_content.actions
    drop column if exists damage,
    drop column if exists damage_school;
