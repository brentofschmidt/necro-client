-- ============================================================
-- 0039_seed_one_item_per_rarity.sql
--
-- One item per rarity tier that doesn't have one yet, picked from
-- different weapon types so the rarities tab visually shows the full
-- ladder side-by-side.
--
--   trash      Rusted Dagger        -1 Strength    (so worn it hurts)
--   uncommon   Iron Sword           +2 Strength
--   rare       Steel Axe            +3 Strength
--   epic       Runed Staff          +5 INT, +2 WIS
--   legendary  Dawnbringer (sword)  +8 STR, +3 CHA
--   mythic     Worldreaver (sword)  +25 to ALL abilities
--
-- Required skill levels scale up: 0 / 5 / 15 / 30 / 50 / 75. Mythic
-- gear is intentionally absurd — bending the rules is the whole point.
--
-- (Common rarity already has the bronze/wooden/stone starter set
-- seeded in 0034 / 0035; no need to add another there.)
--
-- Idempotent.
-- ============================================================

insert into necro_content.items (
    id, item_name, description, rarity, item_type, slot,
    required_skill_level, weight,
    weapon_min_damage, weapon_max_damage, weapon_speed,
    ability_bonuses
) values

    -- ── Trash ───────────────────────────────────────────────────────────────
    ('rusted_dagger', 'Rusted Dagger',
     'A flaking iron blade more rust than steel. Holds an edge for about three swings before something snaps.',
     'trash', 'dagger', 'MainHand', 0, 0.8,
     1, 2, 2.0,
     '[{"ability":"strength","value":-1,"modifier_type":"Flat","description":"-1 Strength"}]'::jsonb),

    -- ── Uncommon ────────────────────────────────────────────────────────────
    ('iron_sword', 'Iron Sword',
     'Forged iron with a clean, honest edge. Standard issue for proper soldiers.',
     'uncommon', 'sword', 'MainHand', 5, 3.5,
     7, 10, 2.0,
     '[{"ability":"strength","value":2,"modifier_type":"Flat","description":"+2 Strength"}]'::jsonb),

    -- ── Rare ────────────────────────────────────────────────────────────────
    ('steel_axe', 'Steel Axe',
     'Cold steel, balanced and tempered. The mark of a master smith.',
     'rare', 'axe', 'MainHand', 15, 4.5,
     12, 16, 2.4,
     '[{"ability":"strength","value":3,"modifier_type":"Flat","description":"+3 Strength"}]'::jsonb),

    -- ── Epic ────────────────────────────────────────────────────────────────
    ('runed_staff', 'Runed Staff',
     'Carved with runes that pulse softly with arcane energy. Hums in the presence of magic.',
     'epic', 'staff', 'TwoHand', 30, 3.5,
     14, 20, 1.9,
     '[
       {"ability":"intelligence","value":5,"modifier_type":"Flat","description":"+5 Intelligence"},
       {"ability":"wisdom","value":2,"modifier_type":"Flat","description":"+2 Wisdom"}
     ]'::jsonb),

    -- ── Legendary ───────────────────────────────────────────────────────────
    ('dawnbringer', 'Dawnbringer',
     'A blade said to have been forged in the first dawn. The hilt grows warm in your hand and the steel glows like the morning sun.',
     'legendary', 'sword', 'MainHand', 50, 3.0,
     22, 30, 1.8,
     '[
       {"ability":"strength","value":8,"modifier_type":"Flat","description":"+8 Strength"},
       {"ability":"charisma","value":3,"modifier_type":"Flat","description":"+3 Charisma"}
     ]'::jsonb),

    -- ── Mythic ──────────────────────────────────────────────────────────────
    ('worldreaver', 'Worldreaver',
     'A blade so ancient it predates language. The world flinches around it. Few who hold it remember who they were before.',
     'mythic', 'sword', 'MainHand', 75, 5.0,
     100, 150, 1.5,
     '[
       {"ability":"strength","value":25,"modifier_type":"Flat","description":"+25 Strength"},
       {"ability":"constitution","value":25,"modifier_type":"Flat","description":"+25 Constitution"},
       {"ability":"dexterity","value":25,"modifier_type":"Flat","description":"+25 Dexterity"},
       {"ability":"intelligence","value":25,"modifier_type":"Flat","description":"+25 Intelligence"},
       {"ability":"wisdom","value":25,"modifier_type":"Flat","description":"+25 Wisdom"},
       {"ability":"charisma","value":25,"modifier_type":"Flat","description":"+25 Charisma"}
     ]'::jsonb)

on conflict (id) do update set
    item_name            = excluded.item_name,
    description          = excluded.description,
    rarity               = excluded.rarity,
    item_type            = excluded.item_type,
    slot                 = excluded.slot,
    required_skill_level = excluded.required_skill_level,
    weight               = excluded.weight,
    weapon_min_damage    = excluded.weapon_min_damage,
    weapon_max_damage    = excluded.weapon_max_damage,
    weapon_speed         = excluded.weapon_speed,
    ability_bonuses      = excluded.ability_bonuses;
