-- ============================================================
-- 0050_aura_system.sql
--
-- Adds the aura (buff / debuff / passive) system that the calculation
-- RPCs in 0051 will read from. Two tables:
--
--   necro_content.auras        — catalog of auras (one row per aura
--                                definition). Modifiers are stored as
--                                three jsonb arrays — same shape pattern
--                                as items.ability_bonuses, just expanded
--                                to also cover substats and resources:
--                                  ability_bonuses  [{ability,value,modifier_type,description}]
--                                  stat_bonuses     [{stat,value,modifier_type,description}]
--                                  resource_bonuses [{resource,value,modifier_type,description}]
--   necro_player.active_auras  — what's currently applied to each
--                                character. instance_id keys per
--                                application so the same aura_id can
--                                stack as multiple instances.
--
-- Also seeds two example auras and applies them to Aldric so the
-- character page has something to render. Idempotent.
-- ============================================================


-- ── 1. Catalog ─────────────────────────────────────────────────────────────
-- Two-step: create-if-not-exists handles a fresh database, alter-table
-- add-column-if-not-exists handles an existing auras table from an
-- older schema.sql apply (which used affects_stat / stat / stat_value /
-- modifier_type columns instead of the jsonb arrays we want here).
-- The legacy columns are left in place — unused by this RPC pipeline,
-- but harmless.

create table if not exists necro_content.auras (
    id               text primary key,
    display_name     text not null,
    description      text not null default '',
    icon_path        text,
    duration         real not null default 0,           -- 0 = permanent / passive
    is_harmful       boolean not null default false,    -- true → debuff
    max_stacks       int  not null default 1,
    -- Modifier lists. Each element: {ability|stat|resource:text, value:real,
    -- modifier_type:'Flat'|'Percent', description:text}. Empty array =
    -- aura doesn't touch that channel.
    ability_bonuses  jsonb not null default '[]'::jsonb,
    stat_bonuses     jsonb not null default '[]'::jsonb,
    resource_bonuses jsonb not null default '[]'::jsonb
);

alter table necro_content.auras
    add column if not exists ability_bonuses  jsonb not null default '[]'::jsonb,
    add column if not exists stat_bonuses     jsonb not null default '[]'::jsonb,
    add column if not exists resource_bonuses jsonb not null default '[]'::jsonb;

alter table necro_content.auras enable row level security;
drop policy if exists auras_read on necro_content.auras;
create policy auras_read on necro_content.auras for select using (true);

grant all on necro_content.auras to anon, authenticated, service_role;


-- ── 2. Active auras (per character) ────────────────────────────────────────
create table if not exists necro_player.active_auras (
    character_id   uuid not null references necro_player.characters(id) on delete cascade,
    instance_id    text not null,                       -- runtime application id
    aura_id        text not null references necro_content.auras(id),
    remaining_time real not null default 0,             -- seconds; 0 with duration=0 → passive
    stacks         int  not null default 1,
    applied_at_utc timestamptz not null default now(),
    caster_name    text not null default '',
    primary key (character_id, instance_id)
);

alter table necro_player.active_auras enable row level security;
drop policy if exists active_auras_owner on necro_player.active_auras;
create policy active_auras_owner
    on necro_player.active_auras
    using (necro_player.is_my_character(character_id))
    with check (necro_player.is_my_character(character_id));

grant all on necro_player.active_auras to anon, authenticated, service_role;


-- ── 3. Public-read helper for the character page ───────────────────────────
-- The owner-only RLS above blocks anonymous reads, but the character page
-- needs to render someone else's auras. Same pattern as the other
-- get_public_character_* RPCs.
create or replace function necro_content.get_public_character_active_auras(p_character_id uuid)
returns table (
    instance_id      text,
    aura_id          text,
    display_name     text,
    description      text,
    icon_path        text,
    is_harmful       boolean,
    duration         real,
    remaining_time   real,
    stacks           int,
    applied_at_utc   timestamptz,
    caster_name      text,
    ability_bonuses  jsonb,
    stat_bonuses     jsonb,
    resource_bonuses jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        aa.instance_id,
        aa.aura_id,
        a.display_name,
        a.description,
        a.icon_path,
        a.is_harmful,
        a.duration,
        aa.remaining_time,
        aa.stacks,
        aa.applied_at_utc,
        aa.caster_name,
        a.ability_bonuses,
        a.stat_bonuses,
        a.resource_bonuses
    from necro_player.active_auras aa
    join necro_content.auras a on a.id = aa.aura_id
    where aa.character_id = p_character_id
    order by a.is_harmful, a.display_name;
$$;

grant execute on function necro_content.get_public_character_active_auras(uuid)
    to anon, authenticated;


-- ── 4. Seed example auras ──────────────────────────────────────────────────
-- Two passive buffs we can show on Aldric so the abilities tab has
-- visible "from auras" deltas. Tune freely later — this is just sample
-- data.
insert into necro_content.auras
    (id, display_name, description, duration, is_harmful, max_stacks,
     ability_bonuses, stat_bonuses, resource_bonuses) values

    ('might_of_the_forge',
     'Might of the Forge',
     'A smith''s blessing earned at the anvil. Lasting strength and grit from steady labor.',
     0, false, 1,
     '[
        {"ability":"strength",     "value": 2, "modifier_type":"Flat", "description":"+2 Strength"},
        {"ability":"constitution", "value": 1, "modifier_type":"Flat", "description":"+1 Constitution"}
      ]'::jsonb,
     '[]'::jsonb,
     '[]'::jsonb),

    ('iron_will',
     'Iron Will',
     'Steeled resolve. Deeper reserves of stamina and a longer fight before you fall.',
     0, false, 1,
     '[]'::jsonb,
     '[
        {"stat":"armor",        "value": 5, "modifier_type":"Flat", "description":"+5 Armor"},
        {"stat":"parry_chance", "value": 2, "modifier_type":"Flat", "description":"+2% Parry"}
      ]'::jsonb,
     '[
        {"resource":"health", "value": 50, "modifier_type":"Flat", "description":"+50 Maximum Health"}
      ]'::jsonb)

on conflict (id) do update set
    display_name     = excluded.display_name,
    description      = excluded.description,
    duration         = excluded.duration,
    is_harmful       = excluded.is_harmful,
    max_stacks       = excluded.max_stacks,
    ability_bonuses  = excluded.ability_bonuses,
    stat_bonuses     = excluded.stat_bonuses,
    resource_bonuses = excluded.resource_bonuses;


-- ── 5. Apply both to Aldric ────────────────────────────────────────────────
do $$
declare
    v_email          text := 'brentofschmidt@gmail.com';
    v_character_name text := 'Aldric';
    v_user_id        uuid;
    v_character_id   uuid;
begin
    select id into v_user_id from auth.users where lower(email) = lower(v_email);
    if v_user_id is null then
        raise notice 'No auth.users row for %, skipping aura seed.', v_email;
        return;
    end if;

    select id into v_character_id from necro_player.characters
     where user_id = v_user_id
       and lower(character_name) = lower(v_character_name)
       and deleted_at is null
     limit 1;

    if v_character_id is null then
        raise notice 'Character "%" not found for %, skipping aura seed.',
            v_character_name, v_email;
        return;
    end if;

    -- Specify applied_at_utc explicitly because the canonical schema's
    -- active_auras table declares it NOT NULL without a default.
    insert into necro_player.active_auras
        (character_id, instance_id, aura_id, remaining_time, stacks,
         applied_at_utc, caster_name) values
        (v_character_id, 'might_of_the_forge_seed', 'might_of_the_forge', 0, 1, now(), 'Self'),
        (v_character_id, 'iron_will_seed',          'iron_will',          0, 1, now(), 'Self')
    on conflict (character_id, instance_id) do update set
        aura_id        = excluded.aura_id,
        remaining_time = excluded.remaining_time,
        stacks         = excluded.stacks,
        applied_at_utc = excluded.applied_at_utc,
        caster_name    = excluded.caster_name;
end$$;
