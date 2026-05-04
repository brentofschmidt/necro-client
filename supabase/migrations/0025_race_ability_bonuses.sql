-- ============================================================
-- 0025_race_ability_bonuses.sql
--
-- Adds ability_bonuses (D&D ability scores) to races and converts
-- resource_bonuses from Flat to Percent so the modifiers scale with
-- character growth instead of becoming irrelevant at higher levels.
--
-- Each entry shape (same convention as resource_bonuses):
--   {
--     "ability":       <id from necro_content.abilities>,
--     "value":         <number; positive = bonus, negative = penalty>,
--     "modifier_type": "Flat" | "Percent",
--     "description":   <display string>
--   }
--
-- Tuning leans on the classic D&D race archetypes:
--   - Dwarf:  +CON, +STR, -DEX  (slow but unshakeable)
--   - Elf:    +DEX, +INT, -CON  (graceful, scholarly, frail)
--   - Orc:    +STR, +CON, -INT  (strong, hardy, blunt)
--   - Human:  baseline          (no bonus — clean reference race)
--
-- Idempotent.
-- ============================================================

alter table necro_content.races
    add column if not exists ability_bonuses jsonb not null default '[]'::jsonb;


-- ── Resource bonuses: re-seed as Percent ────────────────────────────────────

update necro_content.races
   set resource_bonuses = '[]'::jsonb
 where id = 'human';

update necro_content.races
   set resource_bonuses = '[
     {"resource":"health",  "value":10,  "modifier_type":"Percent", "description":"+10% max health"},
     {"resource":"stamina", "value":10,  "modifier_type":"Percent", "description":"+10% max stamina"},
     {"resource":"mana",    "value":-10, "modifier_type":"Percent", "description":"-10% max mana"}
   ]'::jsonb
 where id = 'dwarf';

update necro_content.races
   set resource_bonuses = '[
     {"resource":"mana",    "value":20,  "modifier_type":"Percent", "description":"+20% max mana"},
     {"resource":"health",  "value":-10, "modifier_type":"Percent", "description":"-10% max health"},
     {"resource":"stamina", "value":5,   "modifier_type":"Percent", "description":"+5% max stamina"}
   ]'::jsonb
 where id = 'elf';

update necro_content.races
   set resource_bonuses = '[
     {"resource":"health",  "value":15,  "modifier_type":"Percent", "description":"+15% max health"},
     {"resource":"stamina", "value":15,  "modifier_type":"Percent", "description":"+15% max stamina"},
     {"resource":"mana",    "value":-15, "modifier_type":"Percent", "description":"-15% max mana"}
   ]'::jsonb
 where id = 'orc';


-- ── Ability bonuses (D&D scores) ────────────────────────────────────────────

update necro_content.races
   set ability_bonuses = '[]'::jsonb
 where id = 'human';

update necro_content.races
   set ability_bonuses = '[
     {"ability":"constitution", "value":10, "modifier_type":"Percent", "description":"+10% Constitution"},
     {"ability":"strength",     "value":5,  "modifier_type":"Percent", "description":"+5% Strength"},
     {"ability":"dexterity",    "value":-5, "modifier_type":"Percent", "description":"-5% Dexterity"}
   ]'::jsonb
 where id = 'dwarf';

update necro_content.races
   set ability_bonuses = '[
     {"ability":"dexterity",    "value":10, "modifier_type":"Percent", "description":"+10% Dexterity"},
     {"ability":"intelligence", "value":5,  "modifier_type":"Percent", "description":"+5% Intelligence"},
     {"ability":"constitution", "value":-5, "modifier_type":"Percent", "description":"-5% Constitution"}
   ]'::jsonb
 where id = 'elf';

update necro_content.races
   set ability_bonuses = '[
     {"ability":"strength",     "value":10, "modifier_type":"Percent", "description":"+10% Strength"},
     {"ability":"constitution", "value":5,  "modifier_type":"Percent", "description":"+5% Constitution"},
     {"ability":"intelligence", "value":-5, "modifier_type":"Percent", "description":"-5% Intelligence"}
   ]'::jsonb
 where id = 'orc';
