-- ============================================================
-- 0030_drop_race_resource_bonuses.sql
--
-- Drops necro_content.races.resource_bonuses. Race ability bonuses
-- (added in 0025) already drive resource pools indirectly through
-- ability derived_effects:
--
--   dwarf +10% CON  →  CON gives +10 max HP / +0.5 HP regen / +1 armor
--                      per point  →  more HP, more regen, more armor.
--
-- Keeping resource_bonuses on top of that double-counted the same
-- conceptual buff. Single source of truth: ability_bonuses only.
-- ============================================================

alter table necro_content.races drop column if exists resource_bonuses;
