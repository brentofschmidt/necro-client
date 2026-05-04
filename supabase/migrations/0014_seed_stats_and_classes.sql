-- ============================================================
-- 0014_seed_stats.sql
--
-- Seeds the 5 primary stats. (Earlier revisions of this file also
-- seeded a class catalog; Necro went classless in 0016 and that
-- section was removed.)
--
-- Idempotent via ON CONFLICT.
-- ============================================================

insert into necro_content.stats (name, display_name, category, description) values
    ('strength',  'Strength',  'Primary', 'Raw physical power. Boosts melee damage and carry weight.'),
    ('dexterity', 'Dexterity', 'Primary', 'Speed and precision. Boosts ranged damage, dodge, and crit.'),
    ('intellect', 'Intellect', 'Primary', 'Magical aptitude. Boosts spell damage and mana pool.'),
    ('spirit',    'Spirit',    'Primary', 'Willpower and divine connection. Boosts healing and mana regen.'),
    ('stamina',   'Stamina',   'Primary', 'Toughness and endurance. Boosts max health.')
on conflict (name) do update set
    display_name = excluded.display_name,
    category     = excluded.category,
    description  = excluded.description;
