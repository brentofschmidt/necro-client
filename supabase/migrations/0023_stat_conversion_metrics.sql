-- ============================================================
-- 0023_stat_conversion_metrics.sql
--
-- Adds conversion_per_point to necro_content.stats: a one-line metric
-- describing what a single point of the stat does. WoW-style "rating
-- conversion" copy — display-only for now; combat math will derive
-- from a structured table later.
--
-- For percent-typed stats (is_percent = true) most conversions are
-- 1:1 (each point IS one percent). For flat-rating stats the
-- conversion is meaningful — e.g. "+0.1% physical damage per point"
-- of attack power.
--
-- Idempotent — column added with IF NOT EXISTS, every UPDATE is keyed
-- on stat id.
-- ============================================================

alter table necro_content.stats
    add column if not exists conversion_per_point text not null default '';


-- ── Power ────────────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+0.1% physical damage per point' where id = 'attack_power';
update necro_content.stats set conversion_per_point = '+0.1% spell damage per point'    where id = 'spell_power';
update necro_content.stats set conversion_per_point = '+0.1% healing dealt per point'    where id = 'healing_power';
update necro_content.stats set conversion_per_point = '+1% bonus crit damage per point'  where id = 'crit_damage';

-- ── Crit ─────────────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+1% crit chance per point'        where id = 'crit_chance';
update necro_content.stats set conversion_per_point = '+1% spell crit chance per point'  where id = 'spell_crit';
update necro_content.stats set conversion_per_point = '+1% heal crit chance per point'   where id = 'heal_crit';

-- ── Speed ────────────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+0.5% cast & swing speed per point' where id = 'haste';
update necro_content.stats set conversion_per_point = '+0.5% auto-attack speed per point'  where id = 'attack_speed';
update necro_content.stats set conversion_per_point = '+0.5% out-of-combat run speed per point' where id = 'movement_speed';

-- ── Defense ─────────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+0.1% physical damage reduction per point' where id = 'armor';
update necro_content.stats set conversion_per_point = '+1% dodge chance per point'    where id = 'dodge_chance';
update necro_content.stats set conversion_per_point = '+1% parry chance per point'    where id = 'parry_chance';
update necro_content.stats set conversion_per_point = '+1% block chance per point'    where id = 'block_chance';
update necro_content.stats set conversion_per_point = '+0.1% magical damage reduction per point' where id = 'magic_resist';

-- ── Precision ───────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+1% chance to hit per point'   where id = 'hit_chance';
update necro_content.stats set conversion_per_point = '+1% spell hit chance per point' where id = 'spell_hit';
update necro_content.stats set conversion_per_point = '+0.5% reduction to enemy dodge & parry per point' where id = 'expertise';

-- ── Sustain ─────────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+1 mana restored per second per point'   where id = 'mana_regen';
update necro_content.stats set conversion_per_point = '+1 health restored per second per point' where id = 'health_regen';
update necro_content.stats set conversion_per_point = '+1% damage returned as health per point' where id = 'life_steal';

-- ── Mastery ─────────────────────────────────────────────────────────────────
update necro_content.stats set conversion_per_point = '+1% to your class-defining bonus per point' where id = 'mastery';
update necro_content.stats set conversion_per_point = '+0.5% damage dealt and damage reduction per point' where id = 'versatility';
