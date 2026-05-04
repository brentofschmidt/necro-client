-- ============================================================
-- 0019_rename_and_seed_dnd_abilities.sql
--
-- Reframes "abilities" to mean the D&D ability scores (STR/DEX/CON/
-- INT/WIS/CHA). The old `abilities` table (which held active things
-- like Fireball / Slash) is renamed to `actions`.
--
-- Net result:
--   necro_content.abilities  → 6 D&D ability scores (STR/DEX/CON/INT/WIS/CHA)
--   necro_content.actions    → active things characters do (Fireball, Slash, ...)
--   necro_content.stats      → gone (renamed; the placeholder MMO stats
--                              seed from 0014 is dropped along the way)
--
-- The text[] columns that lazily reference ability asset_names
--   - necro_content.races.starting_abilities
--   - necro_content.mobs.abilities
--   - necro_player.characters.known_abilities
-- now point to actions.asset_name instead. None are FK-enforced, so
-- no constraint changes are needed.
--
-- Idempotent via existence checks on the schema/column shape so the
-- migration is safe to re-run.
-- ============================================================

do $$
begin
    -- ── 1. Rename old abilities → actions ────────────────────────────────────
    -- Distinguish the OLD abilities table (asset_name pk, AbilityType enum)
    -- from a re-run state where abilities has already been replaced by the
    -- renamed stats table (which has a `name` pk).
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'necro_content'
          and table_name   = 'abilities'
          and column_name  = 'asset_name'
    ) then
        alter table necro_content.abilities rename to actions;

        -- Policy carries to the renamed table but keeps its old name.
        drop policy if exists abilities_read on necro_content.actions;
        create policy actions_read on necro_content.actions for select using (true);
    end if;

    -- ── 2. Rename stats → abilities (D&D scores) ─────────────────────────────
    -- Drop the placeholder MMO stats seed first so the renamed table starts
    -- from a clean slate before the D&D seed below.
    if exists (
        select 1 from pg_tables
        where schemaname = 'necro_content' and tablename = 'stats'
    ) then
        delete from necro_content.stats
         where name in ('strength','dexterity','intellect','spirit','stamina');

        alter table necro_content.stats rename to abilities;

        drop policy if exists stats_read on necro_content.abilities;
        create policy abilities_read on necro_content.abilities for select using (true);
    end if;

    -- ── 3. Rename character_stats → character_ability_scores ────────────────
    -- Same conceptual shift on the player side: the table holds D&D ability
    -- score allocations per character, not generic "stats". The FK on the
    -- renamed column auto-follows the renamed parent table.
    if exists (
        select 1 from pg_tables
        where schemaname = 'necro_player' and tablename = 'character_stats'
    ) then
        alter table necro_player.character_stats rename column stat to ability;
        alter table necro_player.character_stats rename to character_ability_scores;
    end if;
end$$;


-- ── 4. Seed the 6 D&D ability scores ────────────────────────────────────────
insert into necro_content.abilities (name, display_name, category, description) values
    ('strength',     'Strength',     'Primary',
     'Bodily power, athletic training. Sets melee attack and damage rolls, carry capacity, and Athletics checks.'),
    ('dexterity',    'Dexterity',    'Primary',
     'Agility, reflexes, balance. Sets ranged attack rolls, armor class, initiative, and Stealth / Acrobatics checks.'),
    ('constitution', 'Constitution', 'Primary',
     'Health, stamina, vital force. Sets hit-point gain per level and concentration checks against poison or disease.'),
    ('intelligence', 'Intelligence', 'Primary',
     'Mental acuity, recall, analysis. Sets spell power for arcane casters and Investigation / Arcana / History checks.'),
    ('wisdom',       'Wisdom',       'Primary',
     'Awareness, insight, attunement. Sets spell power for divine and primal casters, plus Perception and willpower saves.'),
    ('charisma',     'Charisma',     'Primary',
     'Force of personality, persuasion, leadership. Sets spell power for sorcerers / warlocks / bards and all social rolls.')
on conflict (name) do update set
    display_name = excluded.display_name,
    category     = excluded.category,
    description  = excluded.description;
