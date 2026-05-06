-- ============================================================
-- 0057_list_public_guilds.sql
--
-- Public guild directory for the Guilds tab on /g/necro. Returns
-- every non-disbanded guild with realm info and a live member count.
-- SECURITY DEFINER because necro_player.guilds and guild_members are
-- owner-restricted; this exposes only the safe directory view.
--
-- Idempotent.
-- ============================================================

drop function if exists necro_content.list_public_guilds();

create function necro_content.list_public_guilds()
returns table (
    guild_id     uuid,
    name         text,
    motd         text,
    info         text,
    level        int,
    realm_id     uuid,
    realm_name   text,
    member_count bigint,
    created_at   timestamptz
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
        g.realm_id,
        r.display_name,
        (select count(*)::bigint
           from necro_player.guild_members gm
          where gm.guild_id = g.id) as member_count,
        g.created_at
    from necro_player.guilds g
    left join necro_content.realms r on r.id = g.realm_id
    where g.disbanded_at is null
    order by g.name;
$$;

grant execute on function necro_content.list_public_guilds()
    to anon, authenticated;
