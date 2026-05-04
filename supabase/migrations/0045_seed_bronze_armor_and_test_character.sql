-- ============================================================
-- 0045_seed_bronze_armor_and_test_character.sql
--
-- Two things:
--
-- 1. Bronze ARMOR set + recipes. The starter weapons (bronze_sword,
--    bronze_axe) and their recipes already exist (0034 / 0035 / 0042),
--    but no body-slot armor was seeded. Adds the six bronze pieces
--    needed for a full set — helmet / chest / legs / boots / gloves /
--    shield — plus the smithing recipes that produce them. Item types
--    (helmet, chest, legs, boots, gloves, shield) come from 0034 / 0040,
--    and bronze_ingot + oak_log are the existing crafting materials
--    from 0041.
--
-- 2. A personal test character keyed off an auth.users.email. The 0015
--    demo seed only creates the 10 fake users (mortwell@…, gareth@…
--    etc.); a real signup like brentofschmidt@gmail.com gets an
--    accounts.users row from the on_auth_user_created trigger but no
--    necro_player.game_accounts and no character. This DO-block fills
--    that in: a level-5 Human named Aldric on the mortis realm with
--    D&D ability scores tilted toward STR / CON, smithing experience,
--    the bronze set equipped, and a backpack of crafting materials.
--
--    Idempotent: skips itself if a character with that name already
--    exists for the matching user.
-- ============================================================


-- ── 1. Bronze armor items ───────────────────────────────────────────────────
-- Common rarity, modest +1 ability bonuses (matches the iron_sword / runed_staff
-- pattern from 0039 — ability_bonuses jsonb with {ability, value, modifier_type,
-- description}). Higher tiers add bigger numbers later.

insert into necro_content.items (
    id, item_name, description, rarity, item_type, slot,
    required_skill_level, weight,
    ability_bonuses,
    is_craftable
) values

    ('bronze_helmet', 'Bronze Helmet',
     'A simple cap of beaten bronze. Dents readily, but turns most edges.',
     'common', 'helmet', 'Head', 0, 2.0,
     '[{"ability":"constitution","value":1,"modifier_type":"Flat","description":"+1 Constitution"}]'::jsonb,
     true),

    ('bronze_chest', 'Bronze Chestplate',
     'A solid plate of bronze across chest and back. Heavy, but it stops a sword.',
     'common', 'chest', 'Chest', 0, 8.0,
     '[
       {"ability":"constitution","value":2,"modifier_type":"Flat","description":"+2 Constitution"},
       {"ability":"strength","value":1,"modifier_type":"Flat","description":"+1 Strength"}
     ]'::jsonb,
     true),

    ('bronze_legs', 'Bronze Leggings',
     'Thick bronze leg guards strapped over a quilted underlayer.',
     'common', 'legs', 'Legs', 0, 5.0,
     '[{"ability":"constitution","value":1,"modifier_type":"Flat","description":"+1 Constitution"}]'::jsonb,
     true),

    ('bronze_boots', 'Bronze Boots',
     'Sturdy bronze-shod boots over a leather sole. Cold in winter, hot in summer.',
     'common', 'boots', 'Feet', 0, 3.0,
     '[{"ability":"dexterity","value":1,"modifier_type":"Flat","description":"+1 Dexterity"}]'::jsonb,
     true),

    ('bronze_gloves', 'Bronze Gauntlets',
     'Hammered bronze plates riveted to a leather glove.',
     'common', 'gloves', 'Hands', 0, 2.5,
     '[{"ability":"strength","value":1,"modifier_type":"Flat","description":"+1 Strength"}]'::jsonb,
     true),

    ('bronze_shield', 'Bronze Shield',
     'A round, reinforced bronze shield. The standard offhand for new soldiers.',
     'common', 'shield', 'OffHand', 0, 6.0,
     '[
       {"ability":"constitution","value":2,"modifier_type":"Flat","description":"+2 Constitution"},
       {"ability":"strength","value":1,"modifier_type":"Flat","description":"+1 Strength"}
     ]'::jsonb,
     true)

on conflict (id) do update set
    item_name            = excluded.item_name,
    description          = excluded.description,
    rarity               = excluded.rarity,
    item_type            = excluded.item_type,
    slot                 = excluded.slot,
    required_skill_level = excluded.required_skill_level,
    weight               = excluded.weight,
    ability_bonuses      = excluded.ability_bonuses,
    is_craftable         = excluded.is_craftable;


-- ── 2. Bronze armor recipes ─────────────────────────────────────────────────
-- All smithing on the anvil. Inputs scale with how much metal a piece needs:
-- gauntlets are smallest (1 ingot), chestplate the largest (5 ingots).
-- Skill level requirement goes 3 (gauntlets) → 10 (chestplate).

insert into necro_content.recipes (
    id, display_name, description, skill, required_skill_level,
    xp_reward, craft_time_seconds, station_tag,
    ingredients, outputs
) values

    ('recipe_bronze_helmet', 'Forge Bronze Helmet',
     'Hammer two bronze ingots into a serviceable cap.',
     'smithing', 5, 25, 5.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":2},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"bronze_helmet","quantity":1}]'::jsonb),

    ('recipe_bronze_chest', 'Forge Bronze Chestplate',
     'Beat five bronze ingots over a charred haft into a full chestplate.',
     'smithing', 10, 60, 8.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":5},{"itemId":"oak_log","quantity":2}]'::jsonb,
     '[{"itemId":"bronze_chest","quantity":1}]'::jsonb),

    ('recipe_bronze_legs', 'Forge Bronze Leggings',
     'Shape four bronze ingots into a pair of leg guards.',
     'smithing', 8, 45, 7.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":4},{"itemId":"oak_log","quantity":2}]'::jsonb,
     '[{"itemId":"bronze_legs","quantity":1}]'::jsonb),

    ('recipe_bronze_boots', 'Forge Bronze Boots',
     'Plate two ingots over a sturdy oak last.',
     'smithing', 4, 20, 4.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":2},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"bronze_boots","quantity":1}]'::jsonb),

    ('recipe_bronze_gloves', 'Forge Bronze Gauntlets',
     'Rivet a single ingot of bronze plate to a leather glove.',
     'smithing', 3, 15, 4.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":1},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"bronze_gloves","quantity":1}]'::jsonb),

    ('recipe_bronze_shield', 'Forge Bronze Shield',
     'Cap an oak round with three bronze ingots beaten into a face plate.',
     'smithing', 7, 35, 6.0, 'anvil',
     '[{"itemId":"bronze_ingot","quantity":3},{"itemId":"oak_log","quantity":1}]'::jsonb,
     '[{"itemId":"bronze_shield","quantity":1}]'::jsonb)

on conflict (id) do update set
    display_name         = excluded.display_name,
    description          = excluded.description,
    skill                = excluded.skill,
    required_skill_level = excluded.required_skill_level,
    xp_reward            = excluded.xp_reward,
    craft_time_seconds   = excluded.craft_time_seconds,
    station_tag          = excluded.station_tag,
    ingredients          = excluded.ingredients,
    outputs              = excluded.outputs;


-- ── 3. Test character for the dev / "root" account ──────────────────────────
-- Looks the user up by email so the migration is portable across local /
-- staging / prod databases — change v_email to the auth.users.email of
-- whichever account you want this character attached to.

do $$
declare
    v_email          text := 'brentofschmidt@gmail.com';   -- ← change for other dev accounts
    v_character_name text := 'Aldric';
    v_user_id        uuid;
    v_realm_id       uuid;
    v_character_id   uuid;
begin
    select id into v_user_id
      from auth.users
     where lower(email) = lower(v_email);

    if v_user_id is null then
        raise notice 'No auth.users row for %, skipping test character seed.', v_email;
        return;
    end if;

    -- Make sure both platform-side rows exist. The auth trigger handles
    -- accounts.users for new signups, but a re-seed after a reset can land
    -- here with auth in place and the platform rows missing.
    insert into accounts.users (id) values (v_user_id) on conflict (id) do nothing;
    insert into necro_player.game_accounts (user_id, last_played_at)
    values (v_user_id, now())
    on conflict (user_id) do nothing;

    -- 0015 seeds 'mortis' as the only realm.
    select id into v_realm_id
      from necro_content.realms
     where short_name = 'mortis'
     limit 1;

    if v_realm_id is null then
        raise notice 'Realm "mortis" missing, skipping test character seed.';
        return;
    end if;

    if exists (
        select 1 from necro_player.characters
        where user_id = v_user_id
          and lower(character_name) = lower(v_character_name)
          and deleted_at is null
    ) then
        raise notice 'Character "%" already exists for %, skipping.', v_character_name, v_email;
        return;
    end if;

    insert into necro_player.characters (
        user_id, realm_id,
        character_name, race, alignment_id,
        level,
        experience, experience_to_next_level,
        last_zone, last_played_at
    ) values (
        v_user_id, v_realm_id,
        v_character_name, 'human', 'neutral',
        5,
        250, 1000,
        'hollowmere_wood', now()
    )
    returning id into v_character_id;

    -- D&D ability scores — STR / CON tilted (warrior archetype, classless
    -- system means "fighter" is just a stat distribution + skill picks).
    insert into necro_player.character_ability_scores (character_id, ability, value) values
        (v_character_id, 'strength',     16),
        (v_character_id, 'dexterity',    11),
        (v_character_id, 'constitution', 14),
        (v_character_id, 'intelligence',  8),
        (v_character_id, 'wisdom',       10),
        (v_character_id, 'charisma',      9);

    -- Resource pools. Formula mirrors the level-scaled values from 0020's
    -- backfill so this character matches the demo cohort:
    --   health = 80 + level*4 = 100
    --   mana   = 50 + level*5 = 75
    --   stamina = 100 (flat)
    insert into necro_player.character_resources
        (character_id, type, max_value, current_value, regen_rate, regen_delay) values
        (v_character_id, 'health',  100, 100, 2, 5),
        (v_character_id, 'mana',     75,  75, 1, 5),
        (v_character_id, 'stamina', 100, 100, 5, 1);

    -- Skill rosters — every Activity / Proficiency in the catalog at
    -- level 1 / 0 XP. Gives the character a clean slate the player can
    -- grow from; trained levels are added later by play, not seeded.
    insert into necro_player.character_skills (character_id, skill, level, current_xp)
    select v_character_id, name, 1, 0
      from necro_content.skills
     where category = 'Activity';

    insert into necro_player.character_proficiencies (character_id, skill, level, current_xp)
    select v_character_id, name, 1, 0
      from necro_content.skills
     where category = 'Proficiency';

    -- Equip the bronze set + sword (existing item from 0034 / 0035) + shield.
    insert into necro_player.equipment (character_id, slot, item_name) values
        (v_character_id, 'Head',     'bronze_helmet'),
        (v_character_id, 'Chest',    'bronze_chest'),
        (v_character_id, 'Legs',     'bronze_legs'),
        (v_character_id, 'Feet',     'bronze_boots'),
        (v_character_id, 'Hands',    'bronze_gloves'),
        (v_character_id, 'MainHand', 'bronze_sword'),
        (v_character_id, 'OffHand',  'bronze_shield');

    -- Backpack with crafting materials so the bronze recipes are usable
    -- immediately (bronze_ingot and oak_log are the inputs).
    insert into necro_player.inventory_bags (character_id, bag_index, bag_item_name) values
        (v_character_id, 0, '');
    insert into necro_player.inventory_slots
        (character_id, bag_index, slot_index, item_name, quantity) values
        (v_character_id, 0, 0, 'bronze_ingot', 8),
        (v_character_id, 0, 1, 'oak_log',      6),
        (v_character_id, 0, 2, 'basic_herb',   4),
        (v_character_id, 0, 3, 'raw_trout',    2);

    -- Bank: empty record + a default tab holding 250 gold as an item in
    -- slot 0. 0043 dropped bank.bank_gold so currency lives the same way
    -- every other item does — bank_tabs.slots jsonb {itemName, quantity}.
    insert into necro_player.bank (character_id) values (v_character_id);

    insert into necro_player.bank_tabs
        (character_id, tab_index, display_name, slots) values
        (v_character_id, 0, 'General', '[{"itemName":"gold","quantity":250}]'::jsonb);

    raise notice 'Seeded character "%" (%) for user %.', v_character_name, v_character_id, v_email;
end$$;
