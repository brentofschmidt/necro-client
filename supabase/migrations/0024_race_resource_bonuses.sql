-- ============================================================
-- 0024_race_resource_bonuses.sql
--
-- Adds per-race modifiers to character resource pools (Health / Mana /
-- Stamina). Stored as a jsonb array on necro_content.races, parallel to
-- the existing stat_bonuses column.
--
-- Each entry shape:
--   {
--     "resource":      <id from necro_content.resources>,
--     "value":         <number; positive = bonus, negative = penalty>,
--     "modifier_type": "Flat" | "Percent",
--     "description":   <display string for the catalog UI>
--   }
--
-- Humans are deliberately baseline (no bonuses) to give players a clear
-- reference point. Dwarves trade mana for HP and stamina; elves trade
-- HP for mana; orcs are the largest pool of HP and stamina at the
-- biggest mana cost.
--
-- Idempotent.
-- ============================================================

alter table necro_content.races
    add column if not exists resource_bonuses jsonb not null default '[]'::jsonb;

-- Humans: baseline. No modifiers — useful as a reference race.
update necro_content.races
   set resource_bonuses = '[]'::jsonb
 where id = 'human';

-- Dwarves: stout, hardy mountain-folk. Tougher and steadier, but the
-- arcane sits poorly on them.
update necro_content.races
   set resource_bonuses = '[
     {"resource":"health",  "value":20,  "modifier_type":"Flat", "description":"+20 max health"},
     {"resource":"stamina", "value":10,  "modifier_type":"Flat", "description":"+10 max stamina"},
     {"resource":"mana",    "value":-10, "modifier_type":"Flat", "description":"-10 max mana"}
   ]'::jsonb
 where id = 'dwarf';

-- Elves: long-lived and bound to old magic. Vulnerable in body but
-- carry a deeper well of spellcraft.
update necro_content.races
   set resource_bonuses = '[
     {"resource":"mana",    "value":20,  "modifier_type":"Flat", "description":"+20 max mana"},
     {"resource":"health",  "value":-10, "modifier_type":"Flat", "description":"-10 max health"},
     {"resource":"stamina", "value":5,   "modifier_type":"Flat", "description":"+5 max stamina"}
   ]'::jsonb
 where id = 'elf';

-- Orcs: hulking and primal. The largest pool of raw vitality and
-- endurance, but the spirit world barely touches them.
update necro_content.races
   set resource_bonuses = '[
     {"resource":"health",  "value":25,  "modifier_type":"Flat", "description":"+25 max health"},
     {"resource":"stamina", "value":15,  "modifier_type":"Flat", "description":"+15 max stamina"},
     {"resource":"mana",    "value":-15, "modifier_type":"Flat", "description":"-15 max mana"}
   ]'::jsonb
 where id = 'orc';
