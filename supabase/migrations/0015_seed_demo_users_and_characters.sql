-- ============================================================
-- 0015_seed_demo_users_and_characters.sql
--
-- Seeds 10 demo users with one character each so the Characters tab
-- on /g/necro has data to render. Also adds a SECURITY DEFINER list
-- function so the public Characters tab can read past
-- necro_player.characters' owner-only RLS without exposing PII or
-- save-state data.
--
-- ⚠ This inserts directly into auth.users — not best practice for
-- production, but it's the standard pattern for seed/demo data in
-- Supabase dev / staging environments. The on_auth_user_created
-- trigger creates the matching accounts.users rows automatically;
-- we then update profile fields and attach game accounts + characters.
--
-- Idempotent: ON CONFLICT (email) DO NOTHING on auth.users skips
-- already-seeded users; the per-user loop below uses the existing id
-- when an email is already present.
-- ============================================================

do $$
declare
    -- Each entry: email, display_name, race, level, last_zone, bio
    demo_users jsonb := '[
        {"email": "mortwell@necronet.local",   "display_name": "Mortwell",   "race": "human", "level": 23, "last_zone": "hollowmere_wood", "bio": "Sword for hire. Asks no questions."},
        {"email": "gareth@necronet.local",     "display_name": "Gareth",     "race": "human", "level": 18, "last_zone": "hollowmere_wood", "bio": "Wandering priest. Carries a heavy mace and a heavier conscience."},
        {"email": "sera@necronet.local",       "display_name": "Sera",       "race": "human", "level": 12, "last_zone": "hollowmere_wood", "bio": "Apprentice of the burnt tower. Still learning."},
        {"email": "hollis@necronet.local",     "display_name": "Hollis",     "race": "human", "level": 27, "last_zone": "hollowmere_wood", "bio": "Pickpocket turned blade for the highest bidder."},
        {"email": "brokk@necronet.local",      "display_name": "Brokk",      "race": "dwarf", "level": 15, "last_zone": "hollowmere_wood", "bio": "Smith first, soldier second."},
        {"email": "dorin@necronet.local",      "display_name": "Dorin",      "race": "dwarf", "level": 9,  "last_zone": "hollowmere_wood", "bio": "Keeper of the deep shrines."},
        {"email": "thessalis@necronet.local",  "display_name": "Thessalis",  "race": "elf",   "level": 31, "last_zone": "hollowmere_wood", "bio": "Three centuries of study. Still curious."},
        {"email": "aelyn@necronet.local",      "display_name": "Aelyn",      "race": "elf",   "level": 22, "last_zone": "hollowmere_wood", "bio": "Walks where the wood sleeps."},
        {"email": "grosh@necronet.local",      "display_name": "Grosh",      "race": "orc",   "level": 19, "last_zone": "hollowmere_wood", "bio": "First blood, then conversation."},
        {"email": "brakka@necronet.local",     "display_name": "Brakka",     "race": "orc",   "level": 14, "last_zone": "hollowmere_wood", "bio": "Quiet as the wind. Twice as cold."}
    ]'::jsonb;

    u           jsonb;
    auth_id     uuid;
    realm_uuid  uuid;
    char_offset int := 0;
begin
    -- Locate the single seeded realm.
    select id into realm_uuid from necro_content.realms where short_name = 'mortis';
    if realm_uuid is null then
        raise exception 'realm "mortis" not found — run 0009_seed_necro_realm.sql first';
    end if;

    for u in select * from jsonb_array_elements(demo_users) loop
        char_offset := char_offset + 1;

        -- ── auth.users ──────────────────────────────────────────────────
        -- raw_user_meta_data carries display_name through to the
        -- on_auth_user_created trigger which populates accounts.users.
        insert into auth.users (
            id,
            instance_id,
            aud, role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at, updated_at,
            confirmation_token, recovery_token,
            email_change_token_new, email_change
        )
        values (
            gen_random_uuid(),
            '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            u->>'email',
            crypt('demo-password-' || (u->>'display_name'), gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object('display_name', u->>'display_name'),
            now(), now(),
            '', '', '', ''
        )
        on conflict (email) do nothing;

        -- Get the auth.users.id whether we inserted or hit the conflict.
        select id into auth_id from auth.users where email = u->>'email';

        -- ── accounts.users ──────────────────────────────────────────────
        -- Trigger created the row; fill in the profile bits we want
        -- visible on /u/<id>. profile_visibility = 'public' so the
        -- public profile RPC will return the row to anyone.
        update accounts.users
           set display_name       = u->>'display_name',
               bio                = u->>'bio',
               region             = 'NA',
               profile_visibility = 'public'
         where id = auth_id;

        -- ── necro_player.game_accounts ──────────────────────────────────
        insert into necro_player.game_accounts (user_id, last_played_at)
        values (auth_id, now() - (char_offset || ' minutes')::interval)
        on conflict (user_id) do nothing;

        -- ── necro_player.characters ─────────────────────────────────────
        -- One character per user. Skip if the user already has any
        -- character (cheap idempotency without tracking ids per row).
        if not exists (
            select 1 from necro_player.characters
             where user_id = auth_id and deleted_at is null
        ) then
            insert into necro_player.characters (
                user_id, realm_id,
                character_name, race,
                level,
                experience, experience_to_next_level,
                last_zone, last_played_at
            )
            values (
                auth_id, realm_uuid,
                u->>'display_name', u->>'race',
                (u->>'level')::int,
                0, 1000,
                u->>'last_zone',
                -- Stagger last_played_at so the first ~3 land inside the
                -- 5-minute "online" window for get_realm_stats(); the
                -- rest are increasingly stale.
                now() - (char_offset || ' minutes')::interval
            );
        end if;
    end loop;
end$$;


-- ── necro_content.list_public_characters() ───────────────────────────────────
-- Public character roster for the Characters tab on /g/necro. Returns
-- only safe-to-display fields (name, class, race, level, realm).
-- Skips position data, save state, known abilities, last_played_at,
-- and user_id — the last to avoid linking a character to an account
-- without going through the public-profile RPC.
--
-- security definer because necro_player.characters has owner-only RLS.
create or replace function necro_content.list_public_characters()
returns table (
    id              uuid,
    character_name  text,
    character_class text,
    race            text,
    level           int,
    realm_id        uuid
)
language sql
stable
security definer
set search_path = ''
as $$
    select c.id, c.character_name, c.character_class, c.race, c.level, c.realm_id
    from necro_player.characters c
    where c.deleted_at is null
    order by c.level desc, c.character_name;
$$;

grant execute on function necro_content.list_public_characters() to anon, authenticated;
