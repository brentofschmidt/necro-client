-- ============================================================
-- 0036_item_ability_bonuses.sql
--
-- Adds ability_bonuses to necro_content.items, parallel to the same
-- column on races. Lets equipment grant flat / percent bumps to the
-- 6 D&D-style ability scores (STR/DEX/CON/INT/WIS/CHA), separate
-- from the existing items.stats jsonb (which is for derived/secondary
-- stats like attack_power, crit_chance, etc.).
--
-- Same entry shape as races.ability_bonuses:
--   [{ability:text, value:numeric, modifier_type:'Flat'|'Percent', description:text}]
--
-- Bronze tier gets a small +1 Strength buff to mark it as the first
-- "real" tier above primitive stone gear. Future tiers (iron, steel)
-- can stack larger bonuses.
--
-- Idempotent.
-- ============================================================

alter table necro_content.items
    add column if not exists ability_bonuses jsonb not null default '[]'::jsonb;


-- ── Bronze tier: +1 Strength ────────────────────────────────────────────────
update necro_content.items
   set ability_bonuses = '[
     {"ability":"strength","value":1,"modifier_type":"Flat","description":"+1 Strength"}
   ]'::jsonb
 where id in ('bronze_sword', 'bronze_axe');
