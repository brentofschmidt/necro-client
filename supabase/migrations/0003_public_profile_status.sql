-- ============================================================
-- 0003_public_profile_status.sql
--
-- Replaces accounts.get_public_profile to also return is_banned
-- and banned_until, and to no longer filter banned users out.
-- The client renders a status pill (Active / Banned).
--
-- A return-type change requires drop+create.
-- ============================================================

drop function if exists accounts.get_public_profile(uuid);

create function accounts.get_public_profile(target_id uuid)
returns table (
  id            uuid,
  display_name  text,
  avatar_url    text,
  bio           text,
  pronouns      text,
  region        text,
  account_tier  text,
  role          text,
  is_banned     boolean,
  banned_until  timestamptz,
  created_at    timestamptz
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
    u.is_banned,
    u.banned_until,
    u.created_at
  from accounts.users u
  where u.id = target_id;
$$;

grant execute on function accounts.get_public_profile(uuid) to anon, authenticated;
