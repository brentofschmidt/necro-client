-- ============================================================
-- 0029_stamina_regen_stat.sql
--
-- Adds the missing stamina_regen Sustain stat. Dexterity's derived
-- effects (seeded in 0022) already reference 'stamina_regen' — this
-- backfills the catalog row so the reference resolves.
--
-- Re-orders life_steal to 63 so stamina_regen can sit at 62 next to
-- the other regen stats.
--
-- Idempotent.
-- ============================================================

insert into necro_content.stats (id, display_name, description, category, is_percent, affects, conversion_per_point, sort_order) values
    ('stamina_regen', 'Stamina Regen', 'Bonus stamina restored per second.', 'Sustain', false, 'Stamina / sec', '+1 stamina restored per second per point', 62)
on conflict (id) do update set
    display_name         = excluded.display_name,
    description          = excluded.description,
    category             = excluded.category,
    is_percent           = excluded.is_percent,
    affects              = excluded.affects,
    sort_order           = excluded.sort_order,
    conversion_per_point = excluded.conversion_per_point;

update necro_content.stats set sort_order = 63 where id = 'life_steal';
