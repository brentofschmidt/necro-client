-- ============================================================
-- 0037_enrich_rarities.sql
--
-- Fills in description + ground-glow settings on the 5 rarity tiers
-- seeded in 0034. The colors / sort order stay; this just adds the
-- tooltip / VFX columns the table has been carrying empty defaults
-- for.
--
-- Ground glow tiers up with rarity:
--   common / uncommon — no ground glow
--   rare              — subtle glow
--   epic              — brighter, slightly larger
--   legendary         — brightest, biggest
--
-- Idempotent.
-- ============================================================

update necro_content.rarities
   set description           = 'Mass-produced gear and ordinary loot. The bulk of what you''ll see on the ground.',
       show_ground_glow      = false
 where id = 'common';

update necro_content.rarities
   set description           = 'A cut above ordinary. Modest stat bonuses; worth picking up for sale or use.',
       show_ground_glow      = false
 where id = 'uncommon';

update necro_content.rarities
   set description           = 'Notable craftsmanship or mild magic. Sought after by working adventurers.',
       show_ground_glow      = true,
       ground_glow_brightness = 1.0,
       ground_glow_scale      = 1.0
 where id = 'rare';

update necro_content.rarities
   set description           = 'Unmistakably enchanted. Significant power, often with a story attached.',
       show_ground_glow      = true,
       ground_glow_brightness = 1.5,
       ground_glow_scale      = 1.2
 where id = 'epic';

update necro_content.rarities
   set description           = 'One-of-a-kind. The stuff of bards'' tales and rivals'' envy.',
       show_ground_glow      = true,
       ground_glow_brightness = 2.0,
       ground_glow_scale      = 1.5
 where id = 'legendary';
