-- ============================================================
-- 0002_public_profile.sql
--
-- Adds a security-definer RPC that returns only the public-safe
-- subset of an accounts.users row, callable by anon + authenticated.
-- Banned users return no row.
--
-- This avoids loosening RLS on accounts.users (which would expose
-- PII columns like first_name, date_of_birth, country, etc.).
--
-- Depends on 0001_articles_and_roles.sql (uses role + is_banned).
-- ============================================================

create or replace function accounts.get_public_profile(target_id uuid)
returns table (
  id           uuid,
  display_name text,
  avatar_url   text,
  bio          text,
  pronouns     text,
  region       text,
  account_tier text,
  role         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.display_name,
    u.avatar_url,
    u.bio,
    u.pronouns,
    u.region::text,
    u.account_tier::text,
    u.role::text,
    u.created_at
  from accounts.users u
  where u.id = target_id
    and not u.is_banned;
$$;

grant execute on function accounts.get_public_profile(uuid) to anon, authenticated;
