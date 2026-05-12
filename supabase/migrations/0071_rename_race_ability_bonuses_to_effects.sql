-- ============================================================
-- 0071_rename_race_ability_bonuses_to_effects.sql
--
-- Renames necro_content.races.ability_bonuses → effects. The JSONB
-- shape stays identical for now ({ability, value, modifier_type,
-- description}); only the column name changes. The intent is to widen
-- the column's role in upcoming migrations so a race can declare
-- non-ability effects too (e.g. starting stat buffs, resistances,
-- passive traits) without renaming the column a second time.
--
-- Items and auras keep their own `ability_bonuses` columns untouched —
-- those are specifically ability-score modifiers and the name still
-- fits there.
--
-- Idempotent — guarded by a column-existence check so re-running after
-- the rename is a no-op.
-- ============================================================

do $$ begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'races'
          and column_name  = 'ability_bonuses'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'races'
          and column_name  = 'effects'
    ) then
        alter table necro_content.races rename column ability_bonuses to effects;
    end if;
end$$;
