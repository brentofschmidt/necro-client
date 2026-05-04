-- ============================================================
-- 0044_create_player_detail_tables.sql
--
-- Creates the per-character detail tables that the original Necro
-- schema describes but that this Supabase project's migration history
-- never applied. 0019's rename of character_stats →
-- character_ability_scores was wrapped in `if exists (character_stats)`
-- and silently no-op'd because character_stats was never created here,
-- so the renamed target was never produced either. Same story for the
-- other detail tables — defined in the canonical schema.sql, but never
-- migrated into this database.
--
-- All tables use `create table if not exists`, so this migration is a
-- no-op on environments where they're already present (e.g. anyone
-- who applied schema.sql by hand earlier). RLS is enabled with an
-- owner-only policy that traverses through necro_player.characters.user_id.
--
-- Tables created:
--   character_ability_scores  — D&D STR/DEX/CON/INT/WIS/CHA per character
--   character_skills          — activity-skill ranks (mining/cooking/...)
--   character_proficiencies   — weapon-skill ranks (swords/axes/...)
--   equipment                 — currently-equipped item per slot
--   inventory_bags            — bag slots (bag_index 0 = backpack)
--   inventory_slots           — items inside each bag
--   bank_tabs                 — tabbed bank storage (slots: jsonb of {itemName,quantity})
--
-- Idempotent.
-- ============================================================


-- ── Helper: does this character belong to the current auth.uid()? ──────────
create or replace function necro_player.is_my_character(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from necro_player.characters c
        where c.id = cid and c.user_id = auth.uid()
    );
$$;

grant execute on function necro_player.is_my_character(uuid) to anon, authenticated;


-- ── 1. character_ability_scores (D&D ability score allocations) ────────────
create table if not exists necro_player.character_ability_scores (
    character_id uuid not null references necro_player.characters(id) on delete cascade,
    ability      text not null references necro_content.abilities(name),
    value        real not null default 0,
    primary key (character_id, ability)
);

alter table necro_player.character_ability_scores enable row level security;
drop policy if exists character_ability_scores_owner
    on necro_player.character_ability_scores;
create policy character_ability_scores_owner
    on necro_player.character_ability_scores
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));


-- ── 2. character_skills (activity skills) ──────────────────────────────────
create table if not exists necro_player.character_skills (
    character_id uuid not null references necro_player.characters(id) on delete cascade,
    skill        text not null references necro_content.skills(name),
    level        int  not null default 1,
    current_xp   int  not null default 0,
    primary key (character_id, skill)
);

alter table necro_player.character_skills enable row level security;
drop policy if exists character_skills_owner on necro_player.character_skills;
create policy character_skills_owner
    on necro_player.character_skills
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));


-- ── 3. character_proficiencies (weapon skills) ─────────────────────────────
-- Same shape as character_skills; separate table because the C# save model
-- treats activity skills and weapon proficiencies as distinct collections.
create table if not exists necro_player.character_proficiencies (
    character_id uuid not null references necro_player.characters(id) on delete cascade,
    skill        text not null references necro_content.skills(name),
    level        int  not null default 1,
    current_xp   int  not null default 0,
    primary key (character_id, skill)
);

alter table necro_player.character_proficiencies enable row level security;
drop policy if exists character_proficiencies_owner
    on necro_player.character_proficiencies;
create policy character_proficiencies_owner
    on necro_player.character_proficiencies
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));


-- ── 4. equipment (one item per equip slot) ─────────────────────────────────
create table if not exists necro_player.equipment (
    character_id uuid not null references necro_player.characters(id) on delete cascade,
    slot         text not null,
    item_name    text not null default '',
    primary key (character_id, slot)
);

alter table necro_player.equipment enable row level security;
drop policy if exists equipment_owner on necro_player.equipment;
create policy equipment_owner
    on necro_player.equipment
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));


-- ── 5. inventory_bags + inventory_slots (multi-bag inventory) ──────────────
create table if not exists necro_player.inventory_bags (
    character_id  uuid not null references necro_player.characters(id) on delete cascade,
    bag_index     int  not null,
    bag_item_name text not null default '',     -- '' for the backpack itself
    primary key (character_id, bag_index)
);

alter table necro_player.inventory_bags enable row level security;
drop policy if exists inventory_bags_owner on necro_player.inventory_bags;
create policy inventory_bags_owner
    on necro_player.inventory_bags
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));

create table if not exists necro_player.inventory_slots (
    character_id uuid not null references necro_player.characters(id) on delete cascade,
    bag_index    int  not null,
    slot_index   int  not null,
    item_name    text not null default '',     -- '' = empty slot; references items.id
    quantity     int  not null default 0,
    primary key (character_id, bag_index, slot_index),
    foreign key (character_id, bag_index)
        references necro_player.inventory_bags(character_id, bag_index) on delete cascade
);

alter table necro_player.inventory_slots enable row level security;
drop policy if exists inventory_slots_owner on necro_player.inventory_slots;
create policy inventory_slots_owner
    on necro_player.inventory_slots
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));


-- ── 6. bank_tabs (tabbed bank, items as jsonb {itemName,quantity}) ─────────
-- Depends on the existing bank table (one row per character).
create table if not exists necro_player.bank_tabs (
    character_id uuid not null references necro_player.characters(id) on delete cascade,
    tab_index    int  not null,
    display_name text not null default '',
    icon_path    text,
    slots        jsonb not null default '[]'::jsonb,
    primary key (character_id, tab_index),
    foreign key (character_id)
        references necro_player.bank(character_id) on delete cascade
);

alter table necro_player.bank_tabs enable row level security;
drop policy if exists bank_tabs_owner on necro_player.bank_tabs;
create policy bank_tabs_owner
    on necro_player.bank_tabs
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));


-- ── Grants for the new tables ──────────────────────────────────────────────
-- The blanket schema-level grants from earlier migrations already cover
-- the necro_player schema, but new tables don't inherit until ALTER
-- DEFAULT PRIVILEGES has fired — re-asserting explicitly here so this
-- migration is self-sufficient.
grant all on necro_player.character_ability_scores  to anon, authenticated, service_role;
grant all on necro_player.character_skills          to anon, authenticated, service_role;
grant all on necro_player.character_proficiencies   to anon, authenticated, service_role;
grant all on necro_player.equipment                 to anon, authenticated, service_role;
grant all on necro_player.inventory_bags            to anon, authenticated, service_role;
grant all on necro_player.inventory_slots           to anon, authenticated, service_role;
grant all on necro_player.bank_tabs                 to anon, authenticated, service_role;
