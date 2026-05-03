-- ============================================================
-- 0001_articles_and_roles.sql
--
-- Adds:
--   1. Role + ban columns on accounts.users
--   2. is_admin() / is_staff() helper functions (security definer)
--   3. content.articles table + RLS
--
-- IMPORTANT: review your existing accounts.users RLS before applying.
-- If users currently have a blanket "update own row" policy, they could
-- self-promote via this migration. The "users cannot self-elevate"
-- policy at the bottom of section 1 must coexist with (or replace) any
-- such policy.
--
-- After applying, add `content` to:
--   Supabase Dashboard → Project Settings → API → "Exposed schemas"
-- ============================================================


-- ============================================================
-- 1. Roles + ban columns on accounts.users
-- ============================================================

do $$ begin
  create type accounts.user_role as enum ('member', 'moderator', 'admin');
exception
  when duplicate_object then null;
end $$;

alter table accounts.users
  add column if not exists role          accounts.user_role not null default 'member',
  add column if not exists is_banned     boolean            not null default false,
  add column if not exists banned_at     timestamptz,
  add column if not exists banned_until  timestamptz,
  add column if not exists banned_reason text,
  add column if not exists banned_by     uuid references accounts.users(id);

-- security definer so policies on accounts.users can call this without
-- recursing into RLS on the same table.
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
    (select u.role in ('admin', 'moderator') from accounts.users u where u.id = user_id),
    false
  );
$$;

grant execute on function accounts.is_admin(uuid)  to anon, authenticated;
grant execute on function accounts.is_staff(uuid)  to anon, authenticated;

-- Admins can update any user row (used for ban + role changes).
drop policy if exists "users: admins can update any" on accounts.users;
create policy "users: admins can update any"
  on accounts.users for update
  using ( accounts.is_admin() )
  with check ( true );

-- Block self-elevation: a non-admin updating their own row may not
-- change role/ban columns. Pair this with whatever existing policy
-- allows users to update their own profile.
drop policy if exists "users: cannot self-elevate" on accounts.users;
create policy "users: cannot self-elevate"
  on accounts.users for update
  using ( id = auth.uid() and not accounts.is_admin() )
  with check (
    id = auth.uid()
    and role         is not distinct from (select u.role         from accounts.users u where u.id = auth.uid())
    and is_banned    is not distinct from (select u.is_banned    from accounts.users u where u.id = auth.uid())
    and banned_until is not distinct from (select u.banned_until from accounts.users u where u.id = auth.uid())
    and banned_reason is not distinct from (select u.banned_reason from accounts.users u where u.id = auth.uid())
  );


-- ============================================================
-- 2. content.articles table
-- ============================================================

create schema if not exists content;
grant usage on schema content to anon, authenticated;

create table if not exists content.articles (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  body         text not null,
  excerpt      text,
  cover_url    text,
  author_id    uuid references accounts.users(id) on delete set null,
  status       text not null default 'draft'
                 check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists articles_published_idx
  on content.articles (published_at desc)
  where status = 'published';

create or replace function content.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists articles_set_updated_at on content.articles;
create trigger articles_set_updated_at
  before update on content.articles
  for each row execute function content.set_updated_at();

alter table content.articles enable row level security;

-- Public read for published articles.
drop policy if exists "articles: public read published" on content.articles;
create policy "articles: public read published"
  on content.articles for select
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
  );

-- Admins see everything (drafts, archived, scheduled).
drop policy if exists "articles: admins read all" on content.articles;
create policy "articles: admins read all"
  on content.articles for select
  using ( accounts.is_admin() );

-- Authors see their own drafts.
drop policy if exists "articles: authors read own" on content.articles;
create policy "articles: authors read own"
  on content.articles for select
  using ( author_id = auth.uid() );

-- Only admins write.
drop policy if exists "articles: admins insert" on content.articles;
create policy "articles: admins insert"
  on content.articles for insert
  with check ( accounts.is_admin() );

drop policy if exists "articles: admins update" on content.articles;
create policy "articles: admins update"
  on content.articles for update
  using ( accounts.is_admin() )
  with check ( accounts.is_admin() );

drop policy if exists "articles: admins delete" on content.articles;
create policy "articles: admins delete"
  on content.articles for delete
  using ( accounts.is_admin() );

grant select                        on content.articles to anon, authenticated;
grant insert, update, delete        on content.articles to authenticated;
