-- ============================================================
-- 0073_schools_of_magic.sql
--
-- Introduces D&D-style schools of magic as a separate dimension from the
-- existing elemental `damage_school` (fire / frost / holy / physical /
-- …). The two are orthogonal: Fireball is the **Evocation** school of
-- magic AND deals **fire** damage; Lesser Heal is **Restoration** with
-- no elemental damage type at all; Inspiring Anthem is **Enchantment**.
--
-- Why a separate axis: damage_school answers "which mitigation stat
-- soaks it" (armor vs. magic_resist via the type); magic_school answers
-- "what kind of magic IS this conceptually" — used for class/spec
-- gating, interrupt/silence/dispel categorisation, and lore filtering
-- on the spells page. WoW conflates the two; D&D keeps them separate
-- and we like the D&D framing better.
--
-- Eight schools seeded:
--   Evocation     — direct damage (Fireball, Lightning Bolt, …)
--   Restoration   — healing and recovery (Lesser Heal, Regenerate, …)
--   Enchantment   — buffs, charms, mind-affecting (Inspiring Anthem, …)
--   Conjuration   — summons and conjured objects
--   Necromancy    — death / undeath / drain magic
--   Illusion      — stealth, perception, false images
--   Abjuration    — wards, barriers, protection
--   Divination    — info gathering, scrying, foresight
--
-- Schema:
--   necro_content.spell_schools — catalog table (RLS-public).
--   necro_content.spells.magic_school text — nullable FK on each spell
--     so legacy / utility / not-yet-tagged spells can sit at NULL.
--
-- Existing seeded spells get a real school via UPDATEs at the bottom.
--
-- Idempotent — `create table if not exists`, `on conflict do update`,
-- `add column if not exists`, `add constraint` guarded by lookup.
-- ============================================================


-- ── 1. Catalog table ────────────────────────────────────────────────────────
create table if not exists necro_content.spell_schools (
    id            text primary key,            -- 'evocation', 'restoration', …
    display_name  text not null,               -- 'Evocation', …
    description   text not null default '',
    -- Hex color used by the spell card / filter chips so each school
    -- has a recognisable accent without a dedicated icon set.
    display_color text not null default '#9ea0a3',
    sort_order    int  not null default 100
);

alter table necro_content.spell_schools enable row level security;
drop policy if exists spell_schools_read on necro_content.spell_schools;
create policy spell_schools_read on necro_content.spell_schools for select using (true);

grant all on necro_content.spell_schools to anon, authenticated, service_role;


-- ── 2. Seed the 8 schools ───────────────────────────────────────────────────
insert into necro_content.spell_schools
    (id, display_name, description, display_color, sort_order) values

    ('evocation',
     'Evocation',
     'Direct, kinetic magic that calls forth raw energy — fire, lightning, force, frost. The school of "things that explode at the target". Most damage-dealing spells live here.',
     '#d65a5a',
     10),

    ('restoration',
     'Restoration',
     'Magic that mends, regrows, and re-knits — healing wounds, curing afflictions, restoring lost resources. The healer''s primary school.',
     '#78dc8c',
     20),

    ('enchantment',
     'Enchantment',
     'Magic that subtly shapes minds and morale — buffs, debuffs, charms, inspirations. The bard and warlock''s favoured craft.',
     '#d4609a',
     30),

    ('conjuration',
     'Conjuration',
     'Magic that calls into being — summoned creatures, conjured objects, teleportation. Brings things from elsewhere to here, or sends them the other way.',
     '#5ab9ce',
     40),

    ('necromancy',
     'Necromancy',
     'Magic of death and unlife — raising undead, draining vitality, communing with the dead. Morally fraught, mechanically potent.',
     '#9b6fcf',
     50),

    ('illusion',
     'Illusion',
     'Magic that distorts perception — invisibility, disguises, false images, sounds and sensations that aren''t there. The rogue-mage''s toolkit.',
     '#c0c0c0',
     60),

    ('abjuration',
     'Abjuration',
     'Defensive magic — wards, barriers, dispels, banishments. Stops harmful magic before it lands, or removes it once it has.',
     '#5b8ad6',
     70),

    ('divination',
     'Divination',
     'Magic of perception and foresight — scrying, detect-magic, true sight, omens. Knowledge as power.',
     '#c8a04a',
     80)

on conflict (id) do update set
    display_name  = excluded.display_name,
    description   = excluded.description,
    display_color = excluded.display_color,
    sort_order    = excluded.sort_order;


-- ── 3. Add magic_school column to spells ───────────────────────────────────
alter table necro_content.spells
    add column if not exists magic_school text;

-- FK with cascade-on-update so renaming a school id propagates; on
-- delete restrict so we can't accidentally orphan spells by deleting a
-- school that's still referenced.
do $$ begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'spells_magic_school_fkey'
    ) then
        alter table necro_content.spells
            add constraint spells_magic_school_fkey
            foreign key (magic_school) references necro_content.spell_schools(id)
            on update cascade
            on delete restrict;
    end if;
end$$;


-- ── 4. Re-tag existing seeded spells ───────────────────────────────────────
update necro_content.spells set magic_school = 'evocation'   where asset_name = 'fireball';
update necro_content.spells set magic_school = 'restoration' where asset_name = 'lesser_heal';
update necro_content.spells set magic_school = 'enchantment' where asset_name = 'inspiring_anthem';
