-- ============================================================
-- 0026_skill_per_level_effects.sql
--
-- Adds per_level_effects to necro_content.skills. Each entry says
-- "every level in this skill grants <ratio> of <stat/resource>".
-- Same shape as the abilities.derived_effects column, just keyed off
-- skill level instead of ability score:
--
--   [{type:'Stat'|'Resource', affects:text, ratio:numeric, description:text}]
--
-- Weapon proficiencies get the bulk of the seed; activity skills
-- (mining/gathering/etc.) keep an empty array until their domain stats
-- exist (gather speed, yield, rare-drop chance, etc.).
--
-- Per-weapon flavor:
--   Swords  — balanced (AP + hit + crit)
--   Axes    — heavy (more AP + crit damage)
--   Maces   — crushing (more AP + best hit chance + block)
--   Daggers — fast crit (less AP, big crit + attack speed)
--   Bows    — precise ranged (AP + hit + crit)
--   Staves  — caster (spell power + spell crit + mana regen)
--
-- Idempotent.
-- ============================================================

alter table necro_content.skills
    add column if not exists per_level_effects jsonb not null default '[]'::jsonb;


-- ── Weapon proficiencies ────────────────────────────────────────────────────
update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"attack_power", "ratio":1,    "description":"+1 attack power per level"},
     {"type":"Stat","affects":"hit_chance",   "ratio":0.05, "description":"+0.05% hit chance per level"},
     {"type":"Stat","affects":"crit_chance",  "ratio":0.05, "description":"+0.05% crit chance per level"}
   ]'::jsonb
 where name = 'swords';

update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"attack_power", "ratio":1.5,  "description":"+1.5 attack power per level"},
     {"type":"Stat","affects":"hit_chance",   "ratio":0.05, "description":"+0.05% hit chance per level"},
     {"type":"Stat","affects":"crit_damage",  "ratio":0.1,  "description":"+0.1% crit damage per level"}
   ]'::jsonb
 where name = 'axes';

update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"attack_power", "ratio":1.5,  "description":"+1.5 attack power per level"},
     {"type":"Stat","affects":"hit_chance",   "ratio":0.1,  "description":"+0.1% hit chance per level"},
     {"type":"Stat","affects":"block_chance", "ratio":0.05, "description":"+0.05% block chance per level"}
   ]'::jsonb
 where name = 'maces';

update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"attack_power", "ratio":0.5,  "description":"+0.5 attack power per level"},
     {"type":"Stat","affects":"crit_chance",  "ratio":0.1,  "description":"+0.1% crit chance per level"},
     {"type":"Stat","affects":"attack_speed", "ratio":0.05, "description":"+0.05% attack speed per level"}
   ]'::jsonb
 where name = 'daggers';

update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"attack_power", "ratio":1,    "description":"+1 ranged attack power per level"},
     {"type":"Stat","affects":"hit_chance",   "ratio":0.1,  "description":"+0.1% hit chance per level"},
     {"type":"Stat","affects":"crit_chance",  "ratio":0.05, "description":"+0.05% crit chance per level"}
   ]'::jsonb
 where name = 'bows';

update necro_content.skills
   set per_level_effects = '[
     {"type":"Stat","affects":"spell_power", "ratio":1,    "description":"+1 spell power per level"},
     {"type":"Stat","affects":"spell_crit",  "ratio":0.05, "description":"+0.05% spell crit chance per level"},
     {"type":"Stat","affects":"mana_regen",  "ratio":0.1,  "description":"+0.1 mana regen / sec per level"}
   ]'::jsonb
 where name = 'staves';
