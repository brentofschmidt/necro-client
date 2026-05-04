-- ============================================================
-- 0031_spells_table.sql
--
-- Splits actions and spells into separate catalogs (BG3 / D&D style):
--
--   necro_content.actions  — physical things you do with weapons:
--                            Slash, Power Strike, Shove, Block.
--   necro_content.spells   — magical things: Fireball, Heal, Cure,
--                            Magic Missile, Wards, Summons.
--
-- Both tables share the same shape — most columns (cooldown, cast time,
-- damage, targeting, animation/VFX hooks) apply equally to both kinds
-- of activated effect. The split is conceptual: it's about what the
-- character "knows" (a spell list vs a weapon technique list) and how
-- the game UI organizes them, not about runtime behavior.
--
-- Lazy text[] references on races/mobs/characters that today point at
-- actions can hold ids from either table — game code resolves by
-- looking the id up in both catalogs.
--
-- No seed data — neither actions nor spells have content yet.
--
-- Idempotent.
-- ============================================================

create table if not exists necro_content.spells (
    asset_name              text primary key,         -- "Fireball","Heal",…
    ability_name            text not null,
    description             text not null default '',
    icon_path               text,
    type                    text not null,            -- AbilityType enum
    targeting               text not null,            -- TargetingMode enum
    resource_type           text not null,            -- ResourceType enum
    resource_cost           real not null default 0,
    cooldown                real not null default 0,
    cast_time               real not null default 0,
    global_cooldown         real not null default 1.0,
    damage                  real not null default 0,
    damage_school           text,                     -- references necro_content.damage_types.id
    range                   real not null default 0,
    requires_target         boolean not null default false,
    is_heal                 boolean not null default false,
    -- Spells generally don't gate on weapon types, but the column is
    -- here so spell casters that channel through a focus / wand /
    -- staff can require one.
    required_weapon_types   text[] not null default '{}',
    is_toggle               boolean not null default false,
    cancel_cast_on_move     boolean not null default false,

    -- Animation / VFX / SFX (defaults applied by loader)
    anim_trigger            text,
    anim_channel_bool       text,
    animation_delay         real not null default 0,
    anim_trigger_offset     real not null default 0,
    hit_delay               real not null default 0,
    cast_effect_key         text,
    hit_effect_key          text,
    impact_effect_key       text,
    projectile_key          text,
    projectile_speed        real,
    splash_radius           real,
    splash_damage_multiplier real,
    cast_sound_key          text,
    cast_sound_loop         text,
    cast_sound_delay        real not null default -1,
    cast_sound_volume       real not null default 1.0,
    execute_sound_key       text,
    hit_sound_key           text,
    impact_sound_key        text,

    -- Effect list applied when the spell resolves; same shape as actions.
    effects                 jsonb not null default '[]'::jsonb
);

create index if not exists spells_damage_school_idx on necro_content.spells(damage_school);


-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table necro_content.spells enable row level security;

drop policy if exists spells_read on necro_content.spells;
create policy spells_read on necro_content.spells for select using (true);
