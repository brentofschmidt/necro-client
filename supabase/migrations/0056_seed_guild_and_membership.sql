-- ============================================================
-- 0056_seed_guild_and_membership.sql
--
-- Seeds the first guild — "The Hollow Vow" on the Mortis realm — and
-- inducts Aldric (the demo character from 0045) as Leader. Also adds
-- the SECURITY DEFINER get_public_character_guild RPC the client uses
-- to render guild info on the character page (necro_player.guilds and
-- guild_members are owner-restricted by default).
--
-- Idempotent: do$$ block guards on existence so re-runs are safe.
-- ============================================================

do $body$
declare
    v_guild_name      text  := 'The Hollow Vow';
    v_guild_motd      text  := 'Walk light. Strike hard. Never alone.';
    v_guild_info      text  := 'A small fellowship of wanderers who keep the old wards lit. Recruits the cautious, buries the careless, and asks no questions about the past.';
    v_realm_id        uuid;
    v_guild_id        uuid;
    v_character_id    uuid;
begin
    -- ── Look up the realm + character ────────────────────────────────────
    select id into v_realm_id
      from necro_content.realms
     where short_name = 'mortis'
     limit 1;

    if v_realm_id is null then
        raise exception 'realm "mortis" not found — apply 0009/0010 first';
    end if;

    select c.id into v_character_id
      from necro_player.characters c
     where lower(c.character_name) = 'aldric'
       and c.realm_id = v_realm_id
       and c.deleted_at is null
     limit 1;

    if v_character_id is null then
        raise notice 'Character "Aldric" not found on Mortis — skipping guild membership';
    end if;

    -- ── Guild ────────────────────────────────────────────────────────────
    select id into v_guild_id
      from necro_player.guilds
     where realm_id = v_realm_id
       and lower(name) = lower(v_guild_name)
       and disbanded_at is null
     limit 1;

    if v_guild_id is null then
        insert into necro_player.guilds (realm_id, name, motd, info, level, member_limit)
        values (v_realm_id, v_guild_name, v_guild_motd, v_guild_info, 1, 100)
        returning id into v_guild_id;
        raise notice 'Created guild "%": %', v_guild_name, v_guild_id;
    else
        update necro_player.guilds
           set motd = v_guild_motd, info = v_guild_info
         where id = v_guild_id;
        raise notice 'Refreshed existing guild "%": %', v_guild_name, v_guild_id;
    end if;

    -- ── Ranks (0 Leader → 9 Initiate) ────────────────────────────────────
    insert into necro_player.guild_ranks (guild_id, rank_index, rank_name) values
        (v_guild_id, 0, 'Leader'),
        (v_guild_id, 1, 'Officer'),
        (v_guild_id, 2, 'Veteran'),
        (v_guild_id, 3, 'Sworn'),
        (v_guild_id, 4, 'Member'),
        (v_guild_id, 5, 'Initiate')
    on conflict (guild_id, rank_index) do update set
        rank_name = excluded.rank_name;

    -- ── Membership: Aldric as Leader ─────────────────────────────────────
    if v_character_id is not null then
        insert into necro_player.guild_members (
            guild_id, character_id, rank_index, rank_name
        )
        values (v_guild_id, v_character_id, 0, 'Leader')
        on conflict (guild_id, character_id) do update set
            rank_index = excluded.rank_index,
            rank_name  = excluded.rank_name;
    end if;
end
$body$ language plpgsql;


-- ── RPC ──────────────────────────────────────────────────────────────────
-- Returns the guild row a character belongs to, plus rank info and a
-- count of fellow members. SECURITY DEFINER because guild_members and
-- guilds are RLS-restricted; this exposes only the public-safe view of
-- "who's in what guild."
drop function if exists necro_content.get_public_character_guild(uuid);

create function necro_content.get_public_character_guild(p_character_id uuid)
returns table (
    guild_id     uuid,
    guild_name   text,
    motd         text,
    rank_index   int,
    rank_name    text,
    joined_at    timestamptz,
    member_count bigint
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
        gm.rank_index,
        gm.rank_name,
        gm.joined_at,
        (select count(*)::bigint
           from necro_player.guild_members gm2
          where gm2.guild_id = g.id) as member_count
    from necro_player.guild_members gm
    join necro_player.guilds g on g.id = gm.guild_id
    where gm.character_id = p_character_id
      and g.disbanded_at is null
    limit 1;
$$;

grant execute on function necro_content.get_public_character_guild(uuid)
    to anon, authenticated;
