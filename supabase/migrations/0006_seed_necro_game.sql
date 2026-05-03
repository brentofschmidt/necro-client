-- ============================================================
-- 0006_seed_necro_game.sql
--
-- Fully populates the platform.games row for Necro. Supersedes the
-- minimal seed in 0004 / the canonical schema. Idempotent — re-running
-- updates the row in place.
--
-- Swap cover_url / icon_url when the assets are uploaded to Supabase
-- Storage (or any CDN). Bump status from 'in_development' to 'alpha' /
-- 'beta' to make the row publicly queryable via the games_public_read
-- RLS policy.
-- ============================================================

insert into platform.games (
    id,
    name,
    short_description,
    description,
    cover_url,
    icon_url,
    status,
    released_at,
    sort_order,
    content_schema,
    player_schema,
    created_at,
    updated_at
)
values (
    'necro',
    'Necro',
    'A dark fantasy action RPG.',
    'Necro is a dark fantasy action RPG set in a crumbling world ruled by the dead. Carve your path through cursed catacombs, raise allies from fallen foes, and uncover the truth buried beneath the surface.',
    null,                  -- cover_url: splash art for the launcher (e.g. https://<project>.supabase.co/storage/v1/object/public/games/necro/cover.png)
    null,                  -- icon_url: small square icon (same hosting pattern as cover_url)
    'in_development',      -- in_development | alpha | beta | live | sunset | retired
    null,                  -- released_at: set when status moves to 'live'
    0,                     -- sort_order: lower = earlier in launcher
    'necro_content',
    'necro_player',
    now(),
    now()
)
on conflict (id) do update set
    name              = excluded.name,
    short_description = excluded.short_description,
    description       = excluded.description,
    cover_url         = excluded.cover_url,
    icon_url          = excluded.icon_url,
    status            = excluded.status,
    released_at       = excluded.released_at,
    sort_order        = excluded.sort_order,
    content_schema    = excluded.content_schema,
    player_schema     = excluded.player_schema,
    updated_at        = now();
