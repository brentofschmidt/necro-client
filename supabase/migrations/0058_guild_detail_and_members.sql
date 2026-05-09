-- ============================================================
-- 0058_guild_detail_and_members.sql
--
-- Two RPCs for the guild detail page:
--
--   get_public_guild_detail(uuid)   — single guild + realm display
--                                     name + member count + xp/level
--   list_public_guild_members(uuid) — roster: character + rank info,
--                                     joined date, public note
--
-- Both SECURITY DEFINER because guilds + guild_members + characters
-- live upnder owner-restricted RLS. The functions return only public-
-- safe fields (no officer notes, no save state, no equipment).
--
-- Idempotent.
-- ============================================================


-- ── 1. Guild detail ─────────────────────────────────────────────────────────
drop function if exists necro_content.get_public_guild_detail(uuid);

create function necro_content.get_public_guild_detail(p_guild_id uuid)
returns table (
    guild_id     uuid,
    name         text,
    motd         text,
    info         text,
    level        int,
    xp           bigint,
    member_limit int,
    realm_id     uuid,
    realm_name   text,
    member_count bigint,
    created_at   timestamptz,
    disbanded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        g.id,
        g.name,
        g.motd,
        g.info,
        g.level,
        g.xp,
        g.member_limit,
        g.realm_id,
        r.display_name,
        (select count(*)::bigint
           from necro_player.guild_members gm
          where gm.guild_id = g.id) as member_count,
        g.created_at,
        g.disbanded_at
    from necro_player.guilds g
    left join necro_content.realms r on r.id = g.realm_id
    where g.id = p_guild_id
    limit 1;
$$;

grant execute on function necro_content.get_public_guild_detail(uuid)
    to anon, authenticated;


-- ── 2. Guild members roster ─────────────────────────────────────────────────
-- Returns the public-safe view: character name + race + level, rank
-- info, public note (officer_note deliberately excluded), and the
-- character's id so the UI can deep-link back to /characters/<id>.
drop function if exists necro_content.list_public_guild_members(uuid);

create function necro_content.list_public_guild_members(p_guild_id uuid)
returns table (
    character_id   uuid,
    character_name text,
    race           text,
    level          int,
    rank_index     int,
    rank_name      text,
    note           text,
    joined_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        c.id,
        c.character_name,
        c.race,
        c.level,
        gm.rank_index,
        gm.rank_name,
        gm.note,
        gm.joined_at
    from necro_player.guild_members gm
    join necro_player.characters c on c.id = gm.character_id
    where gm.guild_id = p_guild_id
      and c.deleted_at is null
    order by gm.rank_index asc, c.character_name asc;
$$;

grant execute on function necro_content.list_public_guild_members(uuid)
    to anon, authenticated;
