-- ============================================================
-- 0007_seed_necro_content.sql
--
-- Placeholder seed data for the Necro content tables. All rows are
-- intentionally minimal — display names and brief descriptions only.
-- Stat bonuses, starting abilities, faction relationships, music keys,
-- etc. stay at their column defaults until real content authoring lands.
--
-- Idempotent: every insert uses ON CONFLICT (id) DO UPDATE so re-running
-- this file is safe and refreshes the rows in place.
-- ============================================================


-- ── Races ────────────────────────────────────────────────────────────────────
insert into necro_content.races (id, display_name, description) values
    ('human', 'Human', 'Adaptable, ambitious, and short-lived. The most numerous race across the realms.'),
    ('dwarf', 'Dwarf',  'Stout mountain-folk, master smiths and stonewrights. Long memories, longer grudges.'),
    ('elf',   'Elf',    'Long-lived and bound to old magic. Quiet in the wood, deadly with a bow.'),
    ('orc',   'Orc',    'Tribal, honor-driven warriors. Outsiders read them as savages; their kin know better.')
on conflict (id) do update set
    display_name = excluded.display_name,
    description  = excluded.description;


-- ── Factions ─────────────────────────────────────────────────────────────────
-- Placeholder good / neutral / evil triad. Replace with the real faction
-- roster once authoring lands; relationships go in necro_content.faction_hostility.
insert into necro_content.factions (id, display_name, description, is_player_faction) values
    ('good',    'Good',    'Defenders of the realm and the common folk.',           true),
    ('neutral', 'Neutral', 'Independents, traders, and those who answer to none.',  true),
    ('evil',    'Evil',    'Forces opposed to the living realms.',                  true)
on conflict (id) do update set
    display_name      = excluded.display_name,
    description       = excluded.description,
    is_player_faction = excluded.is_player_faction;


-- ── Zones ────────────────────────────────────────────────────────────────────
-- Starting zone for new characters. Forested, low-level, aligned with the
-- 'good' faction. is_starting_zone = true so character creation can pick it
-- up automatically.
insert into necro_content.zones (
    id,
    display_name,
    description,
    min_level,
    max_level,
    controlling_faction_id,
    is_starting_zone
) values (
    'hollowmere_wood',
    'Hollowmere Wood',
    'A misted forest of hollow oaks and slow black water. Wandering wolves and old wards keep the worst of the wood at bay — for now. New arrivals begin their journey here.',
    1,
    5,
    'good',
    true
)
on conflict (id) do update set
    display_name           = excluded.display_name,
    description            = excluded.description,
    min_level              = excluded.min_level,
    max_level              = excluded.max_level,
    controlling_faction_id = excluded.controlling_faction_id,
    is_starting_zone       = excluded.is_starting_zone;
