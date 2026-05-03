-- ============================================================
-- 0004_games_and_role_reconciliation.sql
--
-- Reconciles the role/ban work from migration 0001 with the canonical
-- schema, and introduces the platform-level games catalog.
--
--   1. accounts.users.role: convert from enum to text+CHECK to match
--      the canonical "stringly-typed enum" convention.
--   2. Drop the redundant is_banned / banned_until / banned_reason /
--      banned_at / banned_by columns. Use the canonical
--      accounts.users.status / status_reason / suspended_until instead.
--   3. Replace the self-elevate guard with a RESTRICTIVE policy so it
--      composes correctly with the canonical users_owner policy
--      (permissive policies OR together — only restrictive ones force
--      every UPDATE to honor the role/status pin).
--   4. Replace accounts.get_public_profile to (a) include role + status
--      + created_at, (b) honor profile_visibility ('public' / 'friends' /
--      'private'), (c) hide closed accounts, but keep banned/suspended
--      visible so the status pill is meaningful.
--   5. Add accounts.games (platform catalog) and accounts.user_games
--      (entitlements) with RLS, plus seed Necro itself.
-- ============================================================


-- ── 1. role column: enum → text + CHECK ──────────────────────────────────────

drop policy if exists "users: cannot self-elevate" on accounts.users;
drop policy if exists "users: admins can update any" on accounts.users;

do $$
begin
  if exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'user_role' and n.nspname = 'accounts'
  ) then
    alter table accounts.users alter column role drop default;
    alter table accounts.users alter column role type text using role::text;
    drop type accounts.user_role;
  end if;
end$$;

alter table accounts.users alter column role set default 'member';
alter table accounts.users alter column role set not null;

alter table accounts.users drop constraint if exists users_role_check;
alter table accounts.users
  add constraint users_role_check
  check (role in ('member','moderator','admin'));

create index if not exists users_role_staff_idx on accounts.users(role)
  where role in ('admin','moderator');


-- ── 2. Drop the redundant ban columns ────────────────────────────────────────

alter table accounts.users
  drop column if exists is_banned,
  drop column if exists banned_at,
  drop column if exists banned_until,
  drop column if exists banned_reason,
  drop column if exists banned_by;


-- ── 3. is_admin / is_staff are unchanged in signature; recreate to be safe ───

create or replace function accounts.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.role = 'admin' from accounts.users u where u.id = user_id),
    false
  );
$$;

create or replace function accounts.is_staff(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.role in ('admin','moderator') from accounts.users u where u.id = user_id),
    false
  );
$$;

grant execute on function accounts.is_admin(uuid) to anon, authenticated;
grant execute on function accounts.is_staff(uuid) to anon, authenticated;


-- ── 4. accounts.users RLS: admins update any + restrictive self-elevate ─────

create policy "users: admins can update any"
  on accounts.users for update
  using ( accounts.is_admin() )
  with check ( true );

-- RESTRICTIVE: applies in addition to (and ANDs with) the canonical
-- users_owner policy. Forces every UPDATE — including the owner's own —
-- to either be by an admin, or leave role/status/status_reason/
-- suspended_until untouched. Without `as restrictive` this would OR with
-- users_owner (which has WITH CHECK = id = auth.uid()) and the pin would
-- be bypassed.
create policy "users: cannot self-elevate"
  on accounts.users
  as restrictive
  for update
  using ( true )
  with check (
    accounts.is_admin()
    or (
      role            is not distinct from (select u.role            from accounts.users u where u.id = auth.uid())
      and status      is not distinct from (select u.status          from accounts.users u where u.id = auth.uid())
      and status_reason   is not distinct from (select u.status_reason   from accounts.users u where u.id = auth.uid())
      and suspended_until is not distinct from (select u.suspended_until from accounts.users u where u.id = auth.uid())
    )
  );


-- ── 5. Replace get_public_profile (drop+create — return shape changed) ───────

drop function if exists accounts.get_public_profile(uuid);

create function accounts.get_public_profile(target_id uuid)
returns table (
  id              uuid,
  display_name    text,
  avatar_url      text,
  bio             text,
  pronouns        text,
  region          text,
  account_tier    text,
  role            text,
  status          text,
  suspended_until timestamptz,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select u.id, u.display_name, u.avatar_url, u.bio, u.pronouns,
         u.region::text, u.account_tier::text, u.role::text,
         u.status::text, u.suspended_until, u.created_at
  from accounts.users u
  where u.id = target_id
    and u.status <> 'closed'  -- closed accounts disappear from public view
    and (
      u.id = auth.uid()
      or accounts.is_admin()
      or u.profile_visibility = 'public'
      or (u.profile_visibility = 'friends' and exists (
          select 1 from accounts.friends f
          where f.user_id = auth.uid() and f.friend_id = u.id
      ))
    );
end;
$$;

grant execute on function accounts.get_public_profile(uuid) to anon, authenticated;


-- ── 6. accounts.games — platform catalog ─────────────────────────────────────

create table if not exists accounts.games (
  id                 text primary key,                -- short slug: 'necro', 'hearthstone-clone'
  name               text not null,
  short_description  text not null default '',
  description        text not null default '',
  cover_url          text,
  icon_url           text,
  status             text not null default 'in_development'
                     check (status in ('in_development','alpha','beta','live','sunset','retired')),
  released_at        timestamptz,
  sort_order         int  not null default 100,
  -- Pointer to the per-game schemas so platform code doesn't hardcode them.
  content_schema     text,
  player_schema      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists games_visible_idx on accounts.games(sort_order)
  where status in ('alpha','beta','live','sunset');

-- Seed Necro itself.
insert into accounts.games (id, name, short_description, content_schema, player_schema, sort_order, status)
values ('necro', 'Necro', 'A dark fantasy RPG.', 'necro_content', 'necro_player', 0, 'in_development')
on conflict (id) do nothing;


-- ── 7. accounts.user_games — entitlements ───────────────────────────────────
-- One row per (user, game) the user has access to. Distinct from
-- <game>_player.game_accounts which is created lazily on first launch and
-- holds per-game live state. user_games answers "do you OWN this game",
-- game_accounts answers "have you played this game".

create table if not exists accounts.user_games (
  user_id      uuid not null references accounts.users(id) on delete cascade,
  game_id      text not null references accounts.games(id) on delete cascade,
  grant_kind   text not null default 'purchase'
               check (grant_kind in ('purchase','gift','promo','beta','employee')),
  state        text not null default 'active'
               check (state in ('active','revoked','expired')),
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz,                            -- null = perpetual
  granted_by   uuid references accounts.users(id) on delete set null,
  notes        text not null default '',
  primary key (user_id, game_id)
);

create index if not exists user_games_user_active_idx on accounts.user_games(user_id)
  where state = 'active';
create index if not exists user_games_game_active_idx on accounts.user_games(game_id)
  where state = 'active';


-- ── 8. RLS for games / user_games ───────────────────────────────────────────

alter table accounts.games      enable row level security;
alter table accounts.user_games enable row level security;

drop policy if exists "games: public read live" on accounts.games;
create policy "games: public read live"
  on accounts.games for select
  using ( status in ('alpha','beta','live','sunset') );

drop policy if exists "games: admins read all" on accounts.games;
create policy "games: admins read all"
  on accounts.games for select
  using ( accounts.is_admin() );

drop policy if exists "games: admins write" on accounts.games;
create policy "games: admins write"
  on accounts.games for all
  using ( accounts.is_admin() )
  with check ( accounts.is_admin() );

drop policy if exists "user_games: owner read" on accounts.user_games;
create policy "user_games: owner read"
  on accounts.user_games for select
  using ( user_id = auth.uid() or accounts.is_admin() );

drop policy if exists "user_games: admins write" on accounts.user_games;
create policy "user_games: admins write"
  on accounts.user_games for all
  using ( accounts.is_admin() )
  with check ( accounts.is_admin() );


-- ── 9. content.articles RLS — no changes needed ─────────────────────────────
-- The articles policies already key on accounts.is_admin(); the function
-- itself is unchanged so existing policies continue to work.
