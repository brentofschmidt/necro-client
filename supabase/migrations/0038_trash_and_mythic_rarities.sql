-- ============================================================
-- 0038_trash_and_mythic_rarities.sql
--
-- Adds two more rungs to the rarity ladder:
--
--   trash   — below common. Vendor scrap, broken bits, junk drops.
--             Gray, no glow, worth a copper at most.
--   mythic  — above legendary. Artifact-grade relics. Bright gold,
--             biggest glow on the ladder so far.
--
-- Sort order leaves room between rungs:
--   trash      -10
--   common      0
--   uncommon   10
--   rare       20
--   epic       30
--   legendary  40
--   mythic     50
--
-- Idempotent.
-- ============================================================

insert into necro_content.rarities (
    id, display_name, description, display_color, sort_order,
    show_ground_glow, ground_glow_brightness, ground_glow_scale
) values
    ('trash',  'Trash',
     'Worthless junk — broken bits, vendor scraps, things that fell off something better. Sells for a copper at most.',
     '#6b6b6b', -10,
     false, 1.0, 1.0),

    ('mythic', 'Mythic',
     'Beyond legendary. Artifact-grade relics that bend the rules of the world they exist in. Almost no one has seen one.',
     '#e6cc80', 50,
     true, 2.5, 1.7)

on conflict (id) do update set
    display_name           = excluded.display_name,
    description            = excluded.description,
    display_color          = excluded.display_color,
    sort_order             = excluded.sort_order,
    show_ground_glow       = excluded.show_ground_glow,
    ground_glow_brightness = excluded.ground_glow_brightness,
    ground_glow_scale      = excluded.ground_glow_scale;
