-- ============================================================
-- 0074_magic_proficiencies.sql
--
-- Adds the magical counterpart to weapon proficiencies. Each of the
-- eight schools of magic seeded in 0073 (Evocation, Restoration,
-- Enchantment, Conjuration, Necromancy, Illusion, Abjuration,
-- Divination) gets its own skill row in necro_content.skills with
-- category='Magic Proficiency'. The existing weapon proficiency
-- category is renamed from 'Proficiency' to 'Weapon Proficiency' so the
-- two families read as parallel.
--
-- Linkage works the same way as weapon profs:
--   weapon prof: `item_types text[]` → '{sword}', '{axe}', …
--                drives lookup at attack time via the wielded weapon's
--                item_type.
--   magic prof:  `magic_schools text[]` → '{evocation}', '{restoration}', …
--                drives lookup at cast time via the spell's magic_school.
-- One column per family keeps the two as orthogonal text[] keys — sparse
-- but explicit, easy to query (`'sword' = any(item_types)`), and a third
-- family later is just another column with no JSONB acrobatics.
--
-- Skill names equal the spell-school ids ('evocation' = 'evocation') so
-- the lookup is direct — no second mapping table. The catalog table they
-- live in is different (necro_content.skills vs necro_content.spell_schools)
-- so PG has no trouble keeping them apart.
--
-- per_level_effects mirrors 0026 — same JSONB shape, same magnitude
-- convention (ratio 1 = "+1 of <stat> per level"). School flavoring:
--   Evocation   — raw damage (spell_power + spell_crit + crit_damage)
--   Restoration — healing     (heal_power  + heal_crit  + mana_regen)
--   Enchantment — buffs       (spell_power + cast_speed + max_mana)
--   Conjuration — summons     (spell_power + cast_speed + max_mana)
--   Necromancy  — drain / DoT (spell_power-heavy + spell_crit + mana_regen)
--   Illusion    — evasion     (spell_evasion + evasion + cast_speed)
--   Abjuration  — wards       (spell_block_chance + magic_resist + mana_regen)
--   Divination  — foresight   (spell_accuracy + spell_crit + mana_regen)
--
-- Backfills magic-prof rows into necro_player.character_proficiencies for
-- any character that already has weapon-prof rows, so existing test
-- characters don't need re-seeding.
--
-- Idempotent — add-column-if-not-exists, on-conflict for inserts,
-- guarded backfill that's safe to re-run.
-- ============================================================


-- ── 1. New text[] column on skills for magic-school linkage ────────────────
alter table necro_content.skills
    add column if not exists magic_schools text[] not null default '{}';


-- ── 2. Rename the existing weapon-prof category ────────────────────────────
-- 0012 seeded weapons with category='Proficiency'. That label becomes
-- ambiguous now that magical proficiencies share the column, so promote
-- to the more specific 'Weapon Proficiency'.
update necro_content.skills
   set category = 'Weapon Proficiency'
 where category = 'Proficiency';


-- ── 3. Seed the 8 magic proficiency rows ───────────────────────────────────
insert into necro_content.skills
    (name, category, display_name, description, max_level, item_types, magic_schools, per_level_effects)
values
    ('evocation',
     'Magic Proficiency',
     'Evocation',
     'Proficiency with Evocation — direct, kinetic magic that calls forth raw energy. Improves spell power and crit.',
     99, '{}', '{evocation}',
     '[
       {"type":"Stat","affects":"spell_power", "ratio":1,    "description":"+1 spell power per level"},
       {"type":"Stat","affects":"spell_crit",  "ratio":0.05, "description":"+0.05% spell crit chance per level"},
       {"type":"Stat","affects":"crit_damage", "ratio":0.1,  "description":"+0.1% crit damage per level"}
     ]'::jsonb),

    ('restoration',
     'Magic Proficiency',
     'Restoration',
     'Proficiency with Restoration — magic that mends, regrows, and re-knits. Improves heal power and mana regen.',
     99, '{}', '{restoration}',
     '[
       {"type":"Stat","affects":"heal_power", "ratio":1,    "description":"+1 heal power per level"},
       {"type":"Stat","affects":"heal_crit",  "ratio":0.05, "description":"+0.05% heal crit chance per level"},
       {"type":"Stat","affects":"mana_regen", "ratio":0.1,  "description":"+0.1 mana regen / sec per level"}
     ]'::jsonb),

    ('enchantment',
     'Magic Proficiency',
     'Enchantment',
     'Proficiency with Enchantment — magic that shapes minds and morale. Improves spell power, cast speed, and mana pool.',
     99, '{}', '{enchantment}',
     '[
       {"type":"Stat","affects":"spell_power",   "ratio":1,    "description":"+1 spell power per level"},
       {"type":"Stat","affects":"cast_speed",    "ratio":0.05, "description":"+0.05% cast speed per level"},
       {"type":"Resource","affects":"max_mana",  "ratio":1,    "description":"+1 max mana per level"}
     ]'::jsonb),

    ('conjuration',
     'Magic Proficiency',
     'Conjuration',
     'Proficiency with Conjuration — magic that calls into being. Improves spell power, cast speed, and mana pool.',
     99, '{}', '{conjuration}',
     '[
       {"type":"Stat","affects":"spell_power",   "ratio":1,    "description":"+1 spell power per level"},
       {"type":"Stat","affects":"cast_speed",    "ratio":0.1,  "description":"+0.1% cast speed per level"},
       {"type":"Resource","affects":"max_mana",  "ratio":1,    "description":"+1 max mana per level"}
     ]'::jsonb),

    ('necromancy',
     'Magic Proficiency',
     'Necromancy',
     'Proficiency with Necromancy — magic of death and drain. Heavier spell power, lighter sustain.',
     99, '{}', '{necromancy}',
     '[
       {"type":"Stat","affects":"spell_power", "ratio":1.5,  "description":"+1.5 spell power per level"},
       {"type":"Stat","affects":"spell_crit",  "ratio":0.05, "description":"+0.05% spell crit chance per level"},
       {"type":"Stat","affects":"mana_regen",  "ratio":0.05, "description":"+0.05 mana regen / sec per level"}
     ]'::jsonb),

    ('illusion',
     'Magic Proficiency',
     'Illusion',
     'Proficiency with Illusion — magic that distorts perception. Improves evasion and cast speed.',
     99, '{}', '{illusion}',
     '[
       {"type":"Stat","affects":"spell_evasion", "ratio":0.05, "description":"+0.05% spell evasion per level"},
       {"type":"Stat","affects":"evasion",       "ratio":0.05, "description":"+0.05% evasion per level"},
       {"type":"Stat","affects":"cast_speed",    "ratio":0.1,  "description":"+0.1% cast speed per level"}
     ]'::jsonb),

    ('abjuration',
     'Magic Proficiency',
     'Abjuration',
     'Proficiency with Abjuration — defensive magic. Improves spell block, magic resist, and mana sustain.',
     99, '{}', '{abjuration}',
     '[
       {"type":"Stat","affects":"spell_block_chance", "ratio":0.05, "description":"+0.05% spell block chance per level"},
       {"type":"Stat","affects":"magic_resist",       "ratio":1,    "description":"+1 magic resist per level"},
       {"type":"Stat","affects":"mana_regen",         "ratio":0.05, "description":"+0.05 mana regen / sec per level"}
     ]'::jsonb),

    ('divination',
     'Magic Proficiency',
     'Divination',
     'Proficiency with Divination — magic of perception and foresight. Improves spell accuracy and crit.',
     99, '{}', '{divination}',
     '[
       {"type":"Stat","affects":"spell_accuracy", "ratio":0.1,  "description":"+0.1% spell accuracy per level"},
       {"type":"Stat","affects":"spell_crit",     "ratio":0.05, "description":"+0.05% spell crit chance per level"},
       {"type":"Stat","affects":"mana_regen",     "ratio":0.05, "description":"+0.05 mana regen / sec per level"}
     ]'::jsonb)

on conflict (name) do update set
    category          = excluded.category,
    display_name      = excluded.display_name,
    description       = excluded.description,
    max_level         = excluded.max_level,
    item_types        = excluded.item_types,
    magic_schools     = excluded.magic_schools,
    per_level_effects = excluded.per_level_effects;


-- ── 4. Backfill magic-prof rows for existing characters ───────────────────
-- Any character that already has weapon-prof rows in
-- character_proficiencies gets level-1 / 0-XP rows for each magic prof
-- too. New characters are seeded through whatever post-0074 onboarding
-- flow already exists (and will pick these up naturally).
do $$ begin
    if to_regclass('necro_player.character_proficiencies') is not null then
        insert into necro_player.character_proficiencies (character_id, skill, level, current_xp)
        select c.character_id, s.name, 1, 0
          from (
            select distinct character_id from necro_player.character_proficiencies
          ) c
          cross join necro_content.skills s
         where s.category = 'Magic Proficiency'
        on conflict (character_id, skill) do nothing;
    end if;
end$$;
