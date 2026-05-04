-- ============================================================
-- 0021_substats_catalog.sql
--
-- Adds necro_content.stats as the catalog of WoW-style derived /
-- secondary stats (attack power, crit chance, haste, etc.). Distinct
-- from necro_content.abilities (the 6 D&D primary scores) — abilities
-- are character-defining attributes set at creation; stats are derived
-- numbers driven mostly by gear and buffs.
--
-- An older `necro_content.stats` table existed in early revisions for
-- placeholder MMO primary stats (Strength/Dexterity/Intellect/Spirit/
-- Stamina). That table was renamed to abilities in migration 0019.
-- This re-creates `stats` with a different shape for the derived-stat
-- role — IF NOT EXISTS so re-runs don't blow up.
--
-- Idempotent.
-- ============================================================

create table if not exists necro_content.stats (
    id            text primary key,                  -- 'attack_power','crit_chance',…
    display_name  text not null,
    description   text not null default '',
    -- Power / Crit / Speed / Defense / Precision / Sustain / Mastery.
    -- Drives UI grouping; not enforced.
    category      text not null,
    -- True for stats expressed as percentages (crit chance, haste).
    -- False for flat-value stats (attack power, armor).
    is_percent    boolean not null default false,
    -- Short tag for what the stat affects ('Physical damage', 'All damage',
    -- 'Mana pool'). Display-only — game logic uses category + id.
    affects       text not null default '',
    icon_path     text,
    sort_order    int  not null default 100
);


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table necro_content.stats enable row level security;

drop policy if exists stats_read on necro_content.stats;
create policy stats_read on necro_content.stats for select using (true);


-- ── Seed: ~21 WoW-flavored derived stats ───────────────────────────────────
insert into necro_content.stats (id, display_name, description, category, is_percent, affects, sort_order) values
    -- Power
    ('attack_power',   'Attack Power',   'Flat bonus to melee and ranged weapon damage.',                 'Power',     false, 'Weapon damage',   10),
    ('spell_power',    'Spell Power',    'Flat bonus to magical damage from spells.',                     'Power',     false, 'Spell damage',    11),
    ('healing_power',  'Healing Power',  'Flat bonus to outgoing heals.',                                 'Power',     false, 'Heal amount',     12),
    ('crit_damage',    'Critical Damage','Multiplier on the bonus dealt by critical strikes.',            'Power',     true,  'Crit multiplier', 13),

    -- Crit (chance)
    ('crit_chance',    'Critical Chance','Chance for melee or ranged attacks to crit.',                   'Crit',      true,  'Melee / ranged',  20),
    ('spell_crit',     'Spell Crit',     'Chance for damaging spells to crit.',                           'Crit',      true,  'Spell damage',    21),
    ('heal_crit',      'Heal Crit',      'Chance for outgoing heals to crit.',                            'Crit',      true,  'Heal amount',     22),

    -- Speed
    ('haste',          'Haste',          'Reduces cast times and global cooldowns; speeds attack swings.', 'Speed',     true,  'Cast / swing',   30),
    ('attack_speed',   'Attack Speed',   'Faster auto-attack swing rate.',                                'Speed',     true,  'Auto-attacks',    31),
    ('movement_speed', 'Movement Speed', 'Out-of-combat run speed bonus.',                                'Speed',     true,  'Run speed',       32),

    -- Defense
    ('armor',          'Armor',          'Flat reduction applied to incoming physical damage.',           'Defense',   false, 'Physical damage', 40),
    ('dodge_chance',   'Dodge Chance',   'Chance to fully avoid an incoming melee attack.',               'Defense',   true,  'Melee attacks',   41),
    ('parry_chance',   'Parry Chance',   'Chance to parry a melee attack with your weapon.',              'Defense',   true,  'Melee attacks',   42),
    ('block_chance',   'Block Chance',   'Chance to block an attack while wielding a shield.',            'Defense',   true,  'With shield',     43),
    ('magic_resist',   'Magic Resist',   'Flat reduction applied to incoming magical damage.',            'Defense',   false, 'Magical damage',  44),

    -- Precision
    ('hit_chance',     'Hit Chance',     'Chance for melee and ranged attacks to land instead of missing.','Precision', true,  'Melee / ranged',  50),
    ('spell_hit',      'Spell Hit',      'Chance for damaging spells to land instead of missing.',         'Precision', true,  'Spells',          51),
    ('expertise',      'Expertise',      'Reduces the dodge and parry chance of opponents you attack.',    'Precision', true,  'Vs. dodge/parry', 52),

    -- Sustain
    ('mana_regen',     'Mana Regen',     'Bonus mana restored per second.',                               'Sustain',   false, 'Mana / sec',      60),
    ('health_regen',   'Health Regen',   'Bonus health restored per second outside combat.',              'Sustain',   false, 'Health / sec',    61),
    ('life_steal',     'Life Steal',     'Percent of damage dealt returned to you as health.',            'Sustain',   true,  'On damage',       62),

    -- Mastery (modern WoW)
    ('mastery',        'Mastery',        'Class-specific bonus to your strongest playstyle.',             'Mastery',   true,  'Class-specific',  70),
    ('versatility',    'Versatility',    'Increases damage and healing dealt; reduces damage taken.',     'Mastery',   true,  'All damage',      71)

on conflict (id) do update set
    display_name = excluded.display_name,
    description  = excluded.description,
    category     = excluded.category,
    is_percent   = excluded.is_percent,
    affects      = excluded.affects,
    sort_order   = excluded.sort_order;
