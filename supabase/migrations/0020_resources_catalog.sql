-- ============================================================
-- 0020_resources_catalog.sql
--
-- Adds necro_content.resources as the catalog of character resource
-- types (Health / Mana / Stamina). Promotes character_resources.type
-- from raw text into a FK-enforced reference, mirroring the pattern
-- used for damage_types, races, alignments, etc.
--
-- Backfills resource pools for every existing character so the demo
-- roster has live numbers to display. HP / mana scale with level;
-- stamina is a flat pool. Regen rates are intentionally generous
-- placeholders — tune when combat math lands.
--
-- Idempotent.
-- ============================================================


-- ── 1. Catalog table + seed ──────────────────────────────────────────────────
create table if not exists necro_content.resources (
    id            text primary key,
    display_name  text not null,
    description   text not null default '',
    display_color text not null default '#FFFFFF',
    sort_order    int  not null default 0
);

insert into necro_content.resources (id, display_name, description, display_color, sort_order) values
    ('health',  'Health',  'Hit points. Drop to zero and your character dies; the higher the pool, the longer you survive.', '#c95a3d', 0),
    ('mana',    'Mana',    'Magical energy spent casting spells and channeling auras. Regenerates slowly out of combat.',    '#5b8ad6', 10),
    ('stamina', 'Stamina', 'Physical endurance spent on sprinting, blocking, and special weapon moves. Regenerates quickly.', '#d4b061', 20)
on conflict (id) do update set
    display_name  = excluded.display_name,
    description   = excluded.description,
    display_color = excluded.display_color,
    sort_order    = excluded.sort_order;


-- ── 2. RLS for the catalog ──────────────────────────────────────────────────
alter table necro_content.resources enable row level security;

drop policy if exists resources_read on necro_content.resources;
create policy resources_read on necro_content.resources for select using (true);


-- ── 3. FK from character_resources.type → resources.id ─────────────────────
do $$ begin
    if not exists (
        select 1 from information_schema.table_constraints
        where table_schema    = 'necro_player'
          and table_name      = 'character_resources'
          and constraint_name = 'character_resources_type_fkey'
    ) then
        alter table necro_player.character_resources
            add constraint character_resources_type_fkey
            foreign key (type) references necro_content.resources(id);
    end if;
end$$;


-- ── 4. Backfill: every character gets the 3 default pools ──────────────────
-- HP and mana scale with level so high-level demo characters look stronger;
-- stamina stays flat. current_value = max_value (everyone full HP at seed).
insert into necro_player.character_resources (
    character_id, type, max_value, current_value, regen_rate, regen_delay
)
select
    c.id,
    r.id,
    case r.id
        when 'health'  then (80  + c.level * 4)::real
        when 'mana'    then (50  + c.level * 5)::real
        when 'stamina' then 100::real
    end as max_value,
    case r.id
        when 'health'  then (80  + c.level * 4)::real
        when 'mana'    then (50  + c.level * 5)::real
        when 'stamina' then 100::real
    end as current_value,
    case r.id
        when 'health'  then 0::real    -- HP doesn't passively regen
        when 'mana'    then 1::real    -- 1 mana / sec
        when 'stamina' then 5::real    -- 5 stamina / sec
    end as regen_rate,
    0::real as regen_delay
from necro_player.characters c
cross join necro_content.resources r
where c.deleted_at is null
on conflict (character_id, type) do nothing;
