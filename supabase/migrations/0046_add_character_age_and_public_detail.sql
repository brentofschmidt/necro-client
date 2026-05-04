-- ============================================================
-- 0046_add_character_age_and_public_detail.sql
--
-- "Age" here means how long ago a character was created, formatted
-- client-side as "1w ago" / "3mo ago" / "2y ago" — NOT an in-character
-- integer year field. So we expose necro_player.characters.created_at
-- through the public RPCs and let the front-end render the relative
-- string. No new column needed.
--
-- Also adds the per-tab RPCs the Character page needs for its Equipment,
-- Abilities, and Skills tabs:
--   get_public_character                 — header (replaces single-row reads)
--   get_public_character_equipment       — equipment slots + item display info
--   get_public_character_ability_scores  — D&D STR/DEX/CON/INT/WIS/CHA
--   get_public_character_skills          — activity skills + weapon proficiencies
--
-- Idempotent. Drops a previous integer `age` column if a prior version
-- of this migration created one.
-- ============================================================


-- ── 1. Undo any in-character `age` column from a previous attempt ───────────
alter table necro_player.characters drop column if exists age;


-- ── 2. list_public_characters: return created_at so the card can show
-- "created Xw ago"  (return-type change → drop+create).
drop function if exists necro_content.list_public_characters();

create function necro_content.list_public_characters()
returns table (
    id              uuid,
    character_name  text,
    race            text,
    level           int,
    created_at      timestamptz,
    realm_id        uuid
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.character_name, c.race, c.level, c.created_at, c.realm_id
    from necro_player.characters c
    where c.deleted_at is null
    order by c.level desc, c.character_name;
$$;

grant execute on function necro_content.list_public_characters() to anon, authenticated;


-- ── 3. get_public_character: full safe-to-display character header ──────────
-- Joins the realm so the page can show "On Mortis" without a separate
-- request. Skips owner-only fields (last_played_at, position, save state).
create or replace function necro_content.get_public_character(p_character_id uuid)
returns table (
    id              uuid,
    character_name  text,
    race            text,
    level           int,
    alignment_id    text,
    last_zone       text,
    created_at      timestamptz,
    realm_id        uuid,
    realm_name      text
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.character_name, c.race, c.level, c.alignment_id,
           c.last_zone, c.created_at, c.realm_id, r.display_name as realm_name
    from necro_player.characters c
    left join necro_content.realms r on r.id = c.realm_id
    where c.id = p_character_id
      and c.deleted_at is null;
$$;

grant execute on function necro_content.get_public_character(uuid) to anon, authenticated;


-- ── 4. get_public_character_equipment: equipped items with display fields ──
create or replace function necro_content.get_public_character_equipment(p_character_id uuid)
returns table (
    slot         text,
    item_id      text,
    item_name    text,
    item_rarity  text,
    item_type    text
)
language sql
stable
security definer
set search_path = ''
as $$
    select e.slot,
           e.item_name as item_id,
           i.item_name,
           i.rarity,
           i.item_type
    from necro_player.equipment e
    left join necro_content.items i on i.id = e.item_name
    where e.character_id = p_character_id
      and e.item_name <> ''
    order by e.slot;
$$;

grant execute on function necro_content.get_public_character_equipment(uuid) to anon, authenticated;


-- ── 5. get_public_character_ability_scores: D&D STR/DEX/CON/INT/WIS/CHA ────
create or replace function necro_content.get_public_character_ability_scores(p_character_id uuid)
returns table (
    ability      text,
    display_name text,
    value        real
)
language sql
stable
security definer
set search_path = ''
as $$
    select s.ability,
           a.display_name,
           s.value
    from necro_player.character_ability_scores s
    left join necro_content.abilities a on a.name = s.ability
    where s.character_id = p_character_id
    order by a.display_name;
$$;

grant execute on function necro_content.get_public_character_ability_scores(uuid)
    to anon, authenticated;


-- ── 6. get_public_character_skills: activity skills + weapon proficiencies ─
create or replace function necro_content.get_public_character_skills(p_character_id uuid)
returns table (
    skill        text,
    display_name text,
    category     text,
    level        int,
    current_xp   int
)
language sql
stable
security definer
set search_path = ''
as $$
    select cs.skill, sk.display_name, sk.category, cs.level, cs.current_xp
    from necro_player.character_skills cs
    left join necro_content.skills sk on sk.name = cs.skill
    where cs.character_id = p_character_id
    union all
    select cp.skill, sk.display_name, sk.category, cp.level, cp.current_xp
    from necro_player.character_proficiencies cp
    left join necro_content.skills sk on sk.name = cp.skill
    where cp.character_id = p_character_id
    order by 3, 4 desc, 2;
$$;

grant execute on function necro_content.get_public_character_skills(uuid)
    to anon, authenticated;
