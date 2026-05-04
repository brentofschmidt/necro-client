-- ============================================================
-- 0022_ability_derived_effects.sql
--
-- Populates necro_content.abilities.derived_effects with per-ability
-- bonuses to resources and stats. The column already exists on the
-- abilities table — its shape (per the canonical schema comment) is:
--   [{type:text, affects:text, ratio:numeric, description:text}]
--
-- Conventions:
--   type     'Resource' | 'Stat'
--   affects  the id of necro_content.resources or necro_content.stats
--   ratio    bonus per point of the ability score
--   description display string for tooltips / the public Abilities tab
--
-- Numbers are deliberate placeholders biased toward "feels right" rather
-- than balanced — easy to tune from this single source of truth once
-- combat math lands.
--
-- Idempotent — UPDATEs by id and overwrites the array each run.
-- ============================================================

update necro_content.abilities
   set derived_effects = '[
     {"type":"Stat","affects":"attack_power","ratio":2,    "description":"+2 attack power per point"},
     {"type":"Stat","affects":"block_chance","ratio":0.1,  "description":"+0.1% block chance per point"}
   ]'::jsonb
 where name = 'strength';

update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"stamina",       "ratio":5,    "description":"+5 max stamina per point"},
     {"type":"Stat",    "affects":"stamina_regen", "ratio":0.2,  "description":"+0.2 stamina regen / sec per point"},
     {"type":"Stat",    "affects":"attack_power",  "ratio":1,    "description":"+1 ranged attack power per point"},
     {"type":"Stat",    "affects":"crit_chance",   "ratio":0.1,  "description":"+0.1% crit chance per point"},
     {"type":"Stat",    "affects":"dodge_chance",  "ratio":0.1,  "description":"+0.1% dodge chance per point"}
   ]'::jsonb
 where name = 'dexterity';

update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"health",        "ratio":10,   "description":"+10 max health per point"},
     {"type":"Stat",    "affects":"health_regen",  "ratio":0.5,  "description":"+0.5 health regen / sec per point"},
     {"type":"Stat",    "affects":"armor",         "ratio":1,    "description":"+1 armor per point"}
   ]'::jsonb
 where name = 'constitution';

update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"mana",          "ratio":10,   "description":"+10 max mana per point"},
     {"type":"Stat",    "affects":"mana_regen",    "ratio":0.5,  "description":"+0.5 mana regen / sec per point"},
     {"type":"Stat",    "affects":"spell_power",   "ratio":2,    "description":"+2 arcane spell power per point"},
     {"type":"Stat",    "affects":"spell_crit",    "ratio":0.1,  "description":"+0.1% spell crit chance per point"}
   ]'::jsonb
 where name = 'intelligence';

update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"mana",          "ratio":5,    "description":"+5 max mana per point"},
     {"type":"Stat",    "affects":"mana_regen",    "ratio":0.3,  "description":"+0.3 mana regen / sec per point"},
     {"type":"Stat",    "affects":"healing_power", "ratio":2,    "description":"+2 healing power per point"},
     {"type":"Stat",    "affects":"spell_power",   "ratio":1,    "description":"+1 divine spell power per point"},
     {"type":"Stat",    "affects":"heal_crit",     "ratio":0.1,  "description":"+0.1% heal crit chance per point"}
   ]'::jsonb
 where name = 'wisdom';

update necro_content.abilities
   set derived_effects = '[
     {"type":"Resource","affects":"mana",          "ratio":5,    "description":"+5 max mana per point"},
     {"type":"Stat",    "affects":"spell_power",   "ratio":2,    "description":"+2 innate spell power per point"},
     {"type":"Stat",    "affects":"heal_crit",     "ratio":0.1,  "description":"+0.1% heal crit chance per point"},
     {"type":"Stat",    "affects":"versatility",   "ratio":0.1,  "description":"+0.1% versatility per point"}
   ]'::jsonb
 where name = 'charisma';
