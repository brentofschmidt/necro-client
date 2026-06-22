-- =============================================================================
-- game_content_schema.sql
-- Necro — Game Content database (static, designer-authored definitions)
-- Target: PostgreSQL (Supabase)
--
-- SCOPE BOUNDARY
--   This DB holds DEFINITIONS only. Rolled affix values, durability, stacks,
--   ownership, and all per-character state live in the game-player DB on the
--   item INSTANCE. Nothing here is mutated at runtime; the release-snapshot
--   system denormalizes these tables into immutable JSONB for deployment.
--
-- DESIGN SPINE
--   Everything that changes a number — intrinsic item mods, rolled affixes,
--   buffs/dots/auras, proficiency ranks — emits MODIFIERS against the shared
--   stat registry. One pipeline in Game.Core/Calculations resolves them:
--
--       final = (base + Σflat) × (1 + Σincreased) × Π(1 + more_i)
--               then 'override' wins, then clamp to stat bounds
--
--   The combination rule is universal and driven by modifier_type. The stat
--   only carries value_type, default, and clamp bounds.
-- =============================================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(); core in PG13+/Supabase


-- -----------------------------------------------------------------------------
-- Reference / lookup tables (controlled vocabularies as DATA, not enums, so
--   values are added/renamed with plain DML instead of ALTER TYPE migrations).
--   Surrogate id PK (matching the rest of the schema) with a UNIQUE text key.
--   FKs point at id, so renaming a key never breaks a reference; resolve
--   id -> key at snapshot-export time for readable C#/quicktype output.
--   NOTE: modifier_types and stat_value_types are consumed by the calc
--   pipeline; a new row does nothing until Game.Core handles it. They're
--   tables for uniformity, not runtime freedom.
-- -----------------------------------------------------------------------------
-- How a modifier combines with others on the same stat. Every *_modifiers row
-- and attribute_derivations points here; the combination math lives in Game.Core.
CREATE TABLE modifier_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,            -- 'flat','increased','more','override'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO modifier_types (key, name) VALUES
    ('flat','Flat'), ('increased','Increased'), ('more','More'), ('override','Override');

-- The value domain of a stat (int / float / percent); drives how the pipeline
-- rounds and clamps the resolved value.
CREATE TABLE stat_value_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,            -- 'int','float','percent'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO stat_value_types (key, name) VALUES
    ('int','Integer'), ('float','Float'), ('percent','Percent');

-- The kind of an item (items.type). Selects which *_defs extension table applies:
-- weapon/armor/consumable have one; material/misc do not.
CREATE TABLE item_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,            -- 'weapon','armor','consumable','material','misc'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO item_types (key, name) VALUES
    ('weapon','Weapon'), ('armor','Armor'), ('consumable','Consumable'),
    ('material','Material'), ('misc','Misc'), ('container','Container');

-- Whether an affix is a prefix or a suffix. Rarity caps each independently
-- (rarity_definitions.max_prefixes / max_suffixes).
CREATE TABLE affix_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,            -- 'prefix','suffix'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO affix_types (key, name) VALUES
    ('prefix','Prefix'), ('suffix','Suffix');

-- Category of an effect (buff/debuff/dot/hot/aura), used for UI and behavior
-- grouping. The actual payloads live in effect_modifiers and effect_periodics.
CREATE TABLE effect_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,            -- 'buff','debuff','dot','hot','aura'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO effect_types (key, name) VALUES
    ('buff','Buff'), ('debuff','Debuff'), ('dot','Damage over Time'),
    ('hot','Heal over Time'), ('aura','Aura');

-- What a payload does (damage/heal/restore/apply_effect). Shared by
-- ability_effects (per-hit) and effect_periodics (per-tick) so they speak one vocabulary.
CREATE TABLE payload_ops (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,        -- 'damage','heal','restore','apply_effect'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO payload_ops (key, name) VALUES
    ('damage','Damage'), ('heal','Heal'),
    ('restore','Restore Resource'), ('apply_effect','Apply Effect');

-- How re-applying an already-active effect combines: independent (add), highest
-- (keep strongest), refresh (reset duration), extend (add duration).
CREATE TABLE stack_behaviors (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,        -- 'independent','highest','refresh','extend'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO stack_behaviors (key, name) VALUES
    ('independent','Independent (each application is its own instance)'),
    ('highest','Highest (only the strongest applies)'),
    ('refresh','Refresh (re-applying resets duration)'),
    ('extend','Extend (re-applying adds duration)');

-- How a payload's magnitude is sourced: fixed (base + coefficient * caster stat)
-- today; percent_of_hit (PoE ailment) is a reserved seam, not yet implemented.
CREATE TABLE magnitude_sources (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,        -- 'fixed','percent_of_hit'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO magnitude_sources (key, name) VALUES
    ('fixed','Fixed (base + coefficient * caster stat)'),
    ('percent_of_hit','Percent of triggering hit (not yet implemented)');

-- Crowd-control types. Named CC categories (the DR grouping key -- diminishing
-- returns track per type, critical for full-loot PvP) that each bundle the
-- atomic restrictions they impose. The action pipeline ORs these flags across a
-- target's active CC effects and gates the matching action. Suppression only for
-- now; forced-action (fear/charm) is deferred. breaks_on_damage = ends if the
-- target takes damage (setup CC like incapacitate). DR state itself is runtime
-- (player DB), grouped by these rows.
CREATE TABLE control_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,        -- 'stun','root','silence','disarm','incapacitate'
    name text NOT NULL,
    prevent_move     boolean NOT NULL DEFAULT false,  -- can't move (root)
    prevent_cast     boolean NOT NULL DEFAULT false,  -- can't use abilities/spells (silence)
    prevent_attack   boolean NOT NULL DEFAULT false,  -- can't use basic weapon attacks (disarm)
    prevent_turn     boolean NOT NULL DEFAULT false,  -- can't change facing (matters for frontal-arc combat)
    breaks_on_damage boolean NOT NULL DEFAULT false,  -- effect ends when the target takes damage
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Named CCs as presets over the atomic restrictions. stun = total lockdown;
-- root/silence/disarm each block one axis; incapacitate = stun that breaks on hit.
INSERT INTO control_types (key, name, prevent_move, prevent_cast, prevent_attack, prevent_turn, breaks_on_damage) VALUES
    ('stun',         'Stun',         true,  true,  true,  true,  false),
    ('root',         'Root',         true,  false, false, false, false),
    ('silence',      'Silence',      false, true,  false, false, false),
    ('disarm',       'Disarm',       false, false, true,  false, false),
    ('incapacitate', 'Incapacitate', true,  true,  true,  true,  true);

-- Targeting mode of an ability (self/ally/enemy/ground/none).
CREATE TABLE target_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,        -- 'self','ally','enemy','ground','none'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO target_types (key, name) VALUES
    ('self','Self'), ('ally','Ally'), ('enemy','Enemy'),
    ('ground','Ground (placed AoE)'), ('none','None (passive / no target)');


-- -----------------------------------------------------------------------------
-- Stat registry — the vocabulary every modifier targets.
-- Exported through quicktype to a typed Game.Core stat registry/enum.
-- -----------------------------------------------------------------------------
CREATE TABLE stat_definitions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text NOT NULL UNIQUE,          -- e.g. 'health_max', 'fire_damage', 'attack_speed'
    name        text NOT NULL,
    value_type_id  uuid NOT NULL REFERENCES stat_value_types(id),
    default_val numeric NOT NULL DEFAULT 0,
    min_val     numeric,                        -- null = unclamped
    max_val     numeric,

    -- An attribute (Strength, Dexterity, ...) is just a stat the character
    -- allocates a base value in and that DERIVES other stats (see
    -- attribute_derivations). It stays on the spine, so gear/affixes/buffs
    -- raise it with the same modifier machinery as any other stat.
    -- default_val = starting value; min_val/max_val act as the floor/cap.
    is_attribute boolean NOT NULL DEFAULT false,

    description  text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Starter stat registry: three resource pools (max ceiling + per-second regen)
-- and the six primary attributes. Defaults are PoE-flavored placeholders — one
-- shared base for everyone, differentiated by attributes/gear/level. Tune freely.
INSERT INTO stat_definitions (key, name, value_type_id, default_val, min_val, max_val, is_attribute, description) VALUES
    ('health_max',    'Maximum Health',  (SELECT id FROM stat_value_types WHERE key='int'),    50, 1, NULL, false, 'Ceiling of the health resource pool.'),
    ('health_regen',  'Health Regen',    (SELECT id FROM stat_value_types WHERE key='float'),   1, 0, NULL, false, 'Health restored per second.'),
    ('stamina_max',   'Maximum Stamina', (SELECT id FROM stat_value_types WHERE key='int'),   100, 1, NULL, false, 'Ceiling of the shared stamina pool (sprint, attacks, abilities).'),
    ('stamina_regen', 'Stamina Regen',   (SELECT id FROM stat_value_types WHERE key='float'),  10, 0, NULL, false, 'Stamina restored per second.'),
    ('mana_max',      'Maximum Mana',    (SELECT id FROM stat_value_types WHERE key='int'),   100, 0, NULL, false, 'Ceiling of the mana resource pool.'),
    ('mana_regen',    'Mana Regen',      (SELECT id FROM stat_value_types WHERE key='float'),   5, 0, NULL, false, 'Mana restored per second.'),
    ('strength',      'Strength',        (SELECT id FROM stat_value_types WHERE key='int'),    10, 1, NULL, true,  'Primary attribute: physical power.'),
    ('dexterity',     'Dexterity',       (SELECT id FROM stat_value_types WHERE key='int'),    10, 1, NULL, true,  'Primary attribute: agility and precision.'),
    ('constitution',  'Constitution',    (SELECT id FROM stat_value_types WHERE key='int'),    10, 1, NULL, true,  'Primary attribute: toughness and endurance.'),
    ('intelligence',  'Intelligence',    (SELECT id FROM stat_value_types WHERE key='int'),    10, 1, NULL, true,  'Primary attribute: arcane aptitude.'),
    ('wisdom',        'Wisdom',          (SELECT id FROM stat_value_types WHERE key='int'),    10, 1, NULL, true,  'Primary attribute: perception and willpower.'),
    ('charisma',      'Charisma',        (SELECT id FROM stat_value_types WHERE key='int'),    10, 1, NULL, true,  'Primary attribute: force of personality.');

-- Secondary (derived) combat stats. Percent stats store a rate (0.05 = 5%).
-- Split ONLY the power scalars (attack_power vs spell_power): that is the hard
-- mage/melee lock and the source of gear identity. Secondaries (crit chance,
-- crit damage, haste) are SHARED so hybrids are taxed only on splitting power,
-- not on every secondary. Magical mitigation is per-element resistances (wired
-- via damage_types.resist_stat_id), seeded separately.
INSERT INTO stat_definitions (key, name, value_type_id, default_val, min_val, max_val, is_attribute, description) VALUES
    ('attack_power',      'Attack Power',       (SELECT id FROM stat_value_types WHERE key='float'), 0,    0, NULL, false, 'Scales physical / weapon hit damage.'),
    ('spell_power',       'Spell Power',        (SELECT id FROM stat_value_types WHERE key='float'), 0,    0, NULL, false, 'Scales spell hit damage.'),
    ('ranged_power',      'Ranged Power',       (SELECT id FROM stat_value_types WHERE key='float'), 0,    0, NULL, false, 'Scales ranged / projectile hit damage.'),
    ('crit_chance',       'Crit Chance',        (SELECT id FROM stat_value_types WHERE key='percent'), 0.05, 0, 1,    false, 'Chance to critically strike (any attack or spell).'),
    ('crit_damage',       'Crit Damage',        (SELECT id FROM stat_value_types WHERE key='percent'), 0.5,  0, NULL, false, 'Bonus damage on a critical strike (0.5 = +50%); applies to any attack or spell.'),
    ('haste',             'Haste',              (SELECT id FROM stat_value_types WHERE key='percent'), 0,    0, NULL, false, 'Increases attack speed and cast speed.'),
    ('armor',             'Armor',              (SELECT id FROM stat_value_types WHERE key='float'), 0,    0, NULL, false, 'Flat physical damage mitigation.'),
    ('dodge_chance',      'Dodge Chance',       (SELECT id FROM stat_value_types WHERE key='percent'), 0,    0, 1,    false, 'Chance to fully avoid an incoming attack.');

-- Utility stats
INSERT INTO stat_definitions (key, name, value_type_id, default_val, min_val, max_val, is_attribute, description) VALUES
    ('carry_weight', 'Carry Weight', (SELECT id FROM stat_value_types WHERE key='float'), 50, 0, NULL, false, 'Maximum weight carried before encumbrance penalties.');

-- Per-type damage resistances (one per damage_type; percent, 0..0.75 cap). Each
-- damage_type.resist_stat_id is wired to its matching stat below. The combat
-- pipeline reads the resist stat to mitigate incoming damage of that type.
INSERT INTO stat_definitions (key, name, value_type_id, default_val, min_val, max_val, is_attribute, description)
SELECT v.key, v.name, (SELECT id FROM stat_value_types WHERE key='percent'), 0, 0, 0.75, false, v.descr
FROM (VALUES
    ('bludgeoning_resistance', 'Bludgeoning Resistance', 'Reduces incoming bludgeoning damage (0.20 = 20% less).'),
    ('piercing_resistance', 'Piercing Resistance', 'Reduces incoming piercing damage (0.20 = 20% less).'),
    ('slashing_resistance', 'Slashing Resistance', 'Reduces incoming slashing damage (0.20 = 20% less).'),
    ('fire_resistance', 'Fire Resistance', 'Reduces incoming fire damage (0.20 = 20% less).'),
    ('cold_resistance', 'Cold Resistance', 'Reduces incoming cold damage (0.20 = 20% less).'),
    ('lightning_resistance', 'Lightning Resistance', 'Reduces incoming lightning damage (0.20 = 20% less).'),
    ('acid_resistance', 'Acid Resistance', 'Reduces incoming acid damage (0.20 = 20% less).'),
    ('poison_resistance', 'Poison Resistance', 'Reduces incoming poison damage (0.20 = 20% less).'),
    ('thunder_resistance', 'Thunder Resistance', 'Reduces incoming thunder damage (0.20 = 20% less).'),
    ('necrotic_resistance', 'Necrotic Resistance', 'Reduces incoming necrotic damage (0.20 = 20% less).'),
    ('radiant_resistance', 'Radiant Resistance', 'Reduces incoming radiant damage (0.20 = 20% less).'),
    ('force_resistance', 'Force Resistance', 'Reduces incoming force damage (0.20 = 20% less).'),
    ('psychic_resistance', 'Psychic Resistance', 'Reduces incoming psychic damage (0.20 = 20% less).')
) AS v(key, name, descr);

-- Attribute -> stat scaling. Each row says: per `per_points` points of the
-- source attribute, contribute `value_per_point` to the target stat as
-- `modifier_type`. The pipeline resolves attributes FIRST, then emits these as
-- generated modifiers into their targets, then resolves the rest — so the
-- derivation rides the same (base+flat)x(1+inc)x(more) math as everything else.
--   e.g. STR -> melee_damage, flat, value_per_point=2, per_points=1
--        STR -> carry_weight, flat, value_per_point=5, per_points=1
--        STR -> life,         flat, value_per_point=1, per_points=2  ("per 2 STR")
CREATE TABLE attribute_derivations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_stat_id  uuid NOT NULL REFERENCES stat_definitions(id),  -- the attribute
    target_stat_id  uuid NOT NULL REFERENCES stat_definitions(id),  -- the derived stat
    modifier_type_id uuid NOT NULL REFERENCES modifier_types(id),
    value_per_point numeric NOT NULL,
    per_points      int NOT NULL DEFAULT 1,    -- granularity; pipeline floors for int targets
    CHECK (source_stat_id <> target_stat_id),
    CHECK (per_points >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_attr_deriv_source ON attribute_derivations(source_stat_id);

-- Starter attribute -> stat derivations (per point, flat). PLACEHOLDER tuning
-- values -- these define how each attribute feels, so expect to retune. Charisma
-- has no combat derivation yet (social/utility). All resolve as generated
-- modifiers in Game.Core after attributes are computed.
INSERT INTO attribute_derivations (source_stat_id, target_stat_id, modifier_type_id, value_per_point, per_points) VALUES
    ((SELECT id FROM stat_definitions WHERE key='strength'), (SELECT id FROM stat_definitions WHERE key='attack_power'), (SELECT id FROM modifier_types WHERE key='flat'), 2, 1),  -- +2 attack power per STR
    ((SELECT id FROM stat_definitions WHERE key='strength'), (SELECT id FROM stat_definitions WHERE key='carry_weight'), (SELECT id FROM modifier_types WHERE key='flat'), 5, 1),  -- +5 carry weight per STR
    ((SELECT id FROM stat_definitions WHERE key='constitution'), (SELECT id FROM stat_definitions WHERE key='health_max'), (SELECT id FROM modifier_types WHERE key='flat'), 10, 1),  -- +10 health per CON
    ((SELECT id FROM stat_definitions WHERE key='intelligence'), (SELECT id FROM stat_definitions WHERE key='spell_power'), (SELECT id FROM modifier_types WHERE key='flat'), 2, 1),  -- +2 spell power per INT
    ((SELECT id FROM stat_definitions WHERE key='intelligence'), (SELECT id FROM stat_definitions WHERE key='mana_max'), (SELECT id FROM modifier_types WHERE key='flat'), 5, 1),  -- +5 max mana per INT
    ((SELECT id FROM stat_definitions WHERE key='dexterity'), (SELECT id FROM stat_definitions WHERE key='ranged_power'), (SELECT id FROM modifier_types WHERE key='flat'), 2, 1),  -- +2 ranged power per DEX
    ((SELECT id FROM stat_definitions WHERE key='dexterity'), (SELECT id FROM stat_definitions WHERE key='crit_chance'), (SELECT id FROM modifier_types WHERE key='flat'), 0.005, 1),  -- +0.5% crit chance per DEX
    ((SELECT id FROM stat_definitions WHERE key='dexterity'), (SELECT id FROM stat_definitions WHERE key='dodge_chance'), (SELECT id FROM modifier_types WHERE key='flat'), 0.003, 1),  -- +0.3% dodge per DEX
    ((SELECT id FROM stat_definitions WHERE key='wisdom'), (SELECT id FROM stat_definitions WHERE key='mana_regen'), (SELECT id FROM modifier_types WHERE key='flat'), 0.5, 1);  -- +0.5 mana/sec per WIS


-- Resource registry: declares which (max, regen) stat pair forms a depleting
-- pool (health, mana, stamina). The 20Hz tick loop iterates resources from here
-- rather than hardcoding the set, and the authoring tool learns that e.g.
-- health_max and health_regen pair into one pool. Per-resource BEHAVIOR
-- (drain-on-sprint, energy-shield buffers, leech) is code in Game.Core, not data
-- -- this table only catalogs what exists. Current values are runtime/player-DB
-- state (server RAM -> Redis -> player DB), never stored here.
CREATE TABLE resource_definitions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key           text NOT NULL UNIQUE,          -- 'health','mana','stamina'
    name          text NOT NULL,
    max_stat_id   uuid NOT NULL REFERENCES stat_definitions(id),  -- ceiling stat (e.g. health_max)
    regen_stat_id uuid REFERENCES stat_definitions(id),           -- per-second regen stat (null = no passive regen)
    sort_order    int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pair the seeded resource stats into pools (runs after stat_definitions seed).
INSERT INTO resource_definitions (key, name, max_stat_id, regen_stat_id, sort_order) VALUES
    ('health','Health',
        (SELECT id FROM stat_definitions WHERE key='health_max'),
        (SELECT id FROM stat_definitions WHERE key='health_regen'), 1),
    ('mana','Mana',
        (SELECT id FROM stat_definitions WHERE key='mana_max'),
        (SELECT id FROM stat_definitions WHERE key='mana_regen'), 2),
    ('stamina','Stamina',
        (SELECT id FROM stat_definitions WHERE key='stamina_max'),
        (SELECT id FROM stat_definitions WHERE key='stamina_regen'), 3);


-- -----------------------------------------------------------------------------
-- Taxonomy
-- -----------------------------------------------------------------------------

-- Tags are the connective tissue. They drive affix eligibility, frontal-arc
-- targeting filters, and any data-driven rule, all without schema changes.
CREATE TABLE tags (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key   text NOT NULL UNIQUE,                 -- 'weapon', 'sword', 'heavy_armor', 'fire'
    name  text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Starter tag vocabulary. Cross-cutting rule labels (sub-slices the item_type
-- discriminator can't express), NOT type mirrors -- 'weapon'/'armor' would just
-- restate item_type_id. Grow this as affixes, loot tables, and recipes demand.
INSERT INTO tags (key, name) VALUES
    ('melee',       'Melee'),
    ('ranged',      'Ranged'),
    ('caster',      'Caster'),
    ('light_armor', 'Light Armor'),
    ('heavy_armor', 'Heavy Armor');

-- Equip slots a piece can occupy (the normalized slot vocabulary referenced by
-- item_categories.slot_id). sort_order drives paper-doll display. A character
-- may have several of one slot (e.g. two rings) -- that count is equipment-layout
-- config, not modeled here yet.
CREATE TABLE equipment_slots (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key        text NOT NULL UNIQUE,          -- 'head','main_hand','ring', ...
    name       text NOT NULL,
    sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO equipment_slots (key, name, sort_order) VALUES
    ('head','Head',1), ('shoulders','Shoulders',2), ('chest','Chest',3),
    ('hands','Hands',4), ('waist','Waist',5), ('legs','Legs',6),
    ('feet','Feet',7), ('back','Back',8), ('neck','Neck',9),
    ('ring','Ring',10), ('trinket','Trinket',11),
    ('main_hand','Main Hand',12), ('off_hand','Off Hand',13),
    ('bag','Bag',14);

-- UI grouping + equip slot. Distinct from tags (which drive rules).
CREATE TABLE item_categories (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key       text NOT NULL UNIQUE,
    name      text NOT NULL,
    slot_id   uuid REFERENCES equipment_slots(id),  -- equip slot, null for non-equippable
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Starter categories. slot_key = the equip slot the piece occupies (null = not
-- equippable). Multiple categories can share a slot (sword + axe both main_hand;
-- shield + off-hand weapon both off_hand); two_hand occupies main_hand and the
-- engine reserves off_hand. Armor CLASS (cloth/leather/mail/plate) is a separate
-- axis handled by proficiency, not here.
INSERT INTO item_categories (key, name, slot_id)
SELECT v.key, v.name, es.id
FROM (VALUES
    -- armor
    ('helmet','Helmet','head'), ('shoulders','Shoulders','shoulders'),
    ('chest','Chest','chest'), ('gloves','Gloves','hands'),
    ('belt','Belt','waist'), ('legs','Legs','legs'),
    ('boots','Boots','feet'), ('cloak','Cloak','back'),
    -- jewelry
    ('ring','Ring','ring'), ('amulet','Amulet','neck'), ('trinket','Trinket','trinket'),
    -- weapons / held
    ('one_hand','One-Handed Weapon','main_hand'), ('two_hand','Two-Handed Weapon','main_hand'),
    ('off_hand','Off-Hand','off_hand'), ('shield','Shield','off_hand'),
    ('ranged','Ranged Weapon','main_hand'),
    -- non-equippable (slot_key NULL)
    ('potion','Potion',NULL), ('food','Food',NULL), ('reagent','Reagent',NULL),
    ('quest','Quest Item',NULL), ('misc','Miscellaneous',NULL),
    ('bag','Bag','bag')
) AS v(key, name, slot_key)
LEFT JOIN equipment_slots es ON es.key = v.slot_key;

-- Rarity drives affix CAPACITY (PoE model). A fixed-template item can simply
-- never reference an affixable rarity.
CREATE TABLE rarity_definitions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key           text NOT NULL UNIQUE,          -- 'common','uncommon','rare','epic'
    name          text NOT NULL,
    max_prefixes  int NOT NULL DEFAULT 0,
    max_suffixes  int NOT NULL DEFAULT 0,
    sort_order    int NOT NULL DEFAULT 0,
    color_hex     text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Starter rarities. Capacity = max rolled prefixes/suffixes on an affixable item
-- (common = no affixes -> a fixed-template base). Colors are the familiar MMO
-- quality palette. Tune freely; legendary intentionally shares epic's slot count
-- (meant to be set apart by curated/fixed mods later, not raw affix volume).
INSERT INTO rarity_definitions (key, name, max_prefixes, max_suffixes, sort_order, color_hex) VALUES
    ('common',    'Common',    0, 0, 1, '#9d9d9d'),
    ('uncommon',  'Uncommon',  1, 1, 2, '#1eff00'),
    ('rare',      'Rare',      2, 2, 3, '#0070dd'),
    ('epic',      'Epic',      3, 3, 4, '#a335ee'),
    ('legendary', 'Legendary', 3, 3, 5, '#ff8000');

-- Damage type registry (D&D 5e set). category_id groups types for blanket effects
-- (e.g. physical reduction); resist_stat_id links each type to the stat the
-- combat pipeline reads to mitigate incoming damage of that type.
CREATE TABLE damage_types (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key            text NOT NULL UNIQUE,           -- 'fire','slashing', ...
    name           text NOT NULL,
    category_id    uuid,                           -- grouping for blanket effects
                                                   -- ("+10% physical reduction"); FK below

    -- The stat the combat pipeline reads to mitigate incoming damage of this
    -- type. Null until the matching '<type>_resistance' stat exists. WITHOUT
    -- this the table is pure labels (the 'tier' mistake); WITH it, resolution
    -- knows which resistance to pull per damage type — no per-type code.
    resist_stat_id uuid REFERENCES stat_definitions(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- resist_stat_id is left null; wire it once the '<type>_resistance' stats exist:
--   UPDATE damage_types d SET resist_stat_id = s.id
--   FROM stat_definitions s WHERE s.key = d.key || '_resistance';
INSERT INTO damage_types (key, name) VALUES
    ('bludgeoning', 'Bludgeoning'),
    ('piercing',    'Piercing'),
    ('slashing',    'Slashing'),
    ('fire',        'Fire'),
    ('cold',        'Cold'),
    ('lightning',   'Lightning'),
    ('acid',        'Acid'),
    ('poison',      'Poison'),
    ('thunder',     'Thunder'),
    ('necrotic',    'Necrotic'),
    ('radiant',     'Radiant'),
    ('force',       'Force'),
    ('psychic',     'Psychic');


-- Damage category vocabulary (physical / elemental / magical) for blanket effects
-- like "+10% physical reduction". Referenced by damage_types.category_id.
CREATE TABLE damage_categories (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,          -- 'physical','elemental','magical'
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO damage_categories (key, name) VALUES
    ('physical','Physical'), ('elemental','Elemental'), ('magical','Magical');

-- Assign each damage type its category now that both tables exist.
UPDATE damage_types SET category_id = (SELECT id FROM damage_categories WHERE key = 'physical')
    WHERE key IN ('bludgeoning','piercing','slashing');
UPDATE damage_types SET category_id = (SELECT id FROM damage_categories WHERE key = 'elemental')
    WHERE key IN ('fire','cold','lightning','acid','poison','thunder');
UPDATE damage_types SET category_id = (SELECT id FROM damage_categories WHERE key = 'magical')
    WHERE key IN ('necrotic','radiant','force','psychic');

-- Deferred FK (damage_categories is defined after damage_types now).
ALTER TABLE damage_types
    ADD CONSTRAINT fk_damage_type_category
    FOREIGN KEY (category_id) REFERENCES damage_categories(id);

-- Wire each damage type to its resistance stat (now that both exist).
UPDATE damage_types d SET resist_stat_id = s.id
FROM stat_definitions s
WHERE s.key = d.key || '_resistance';


-- -----------------------------------------------------------------------------
-- Items — base table + discriminator + 1:1 typed extension tables.
-- (Cleaner C# subclasses via quicktype than one wide nullable table.)
-- -----------------------------------------------------------------------------
CREATE TABLE items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key             text NOT NULL UNIQUE,
    name            text NOT NULL,
    item_type_id    uuid NOT NULL REFERENCES item_types(id),
    category_id     uuid REFERENCES item_categories(id),
    weight          numeric NOT NULL DEFAULT 0,        -- Tarkov axis / spatial friction
    stack_max       int NOT NULL DEFAULT 1,
    base_value      numeric NOT NULL DEFAULT 0,
    max_durability  int,                              -- null = indestructible

    -- Affix opt-in. false  -> item is a fixed template, stats come purely from
    -- item_modifiers (implicits). true -> eligible to roll affixes up to the
    -- caps on its rarity.
    can_have_affixes boolean NOT NULL DEFAULT false,
    rarity_id        uuid REFERENCES rarity_definitions(id),

    -- full-loot flags
    droppable    boolean NOT NULL DEFAULT true,
    tradeable    boolean NOT NULL DEFAULT true,

    -- Proficiency scaling (Option A): NOT a gate -- anyone can equip anything.
    -- governing_proficiency_id names the proficiency (e.g. Plate, Sword) whose
    -- rank scales EVERYTHING this item contributes -- both intrinsic item_modifiers
    -- AND rolled affix_modifiers -- so the whole piece runs at one effectiveness %.
    -- null = always full effectiveness. Game.Core computes:
    --   effectiveness = clamp(char_rank / proficiency_full_rank, 0..1)
    -- and multiplies the item's contributed modifiers by it. FK added below
    -- (proficiency_definitions is defined later).
    governing_proficiency_id uuid,
    proficiency_full_rank    int,   -- char rank for 100% effectiveness; null when no governing proficiency

    icon_ref   text,
    model_ref  text,
    description text,

    CHECK (NOT can_have_affixes OR rarity_id IS NOT NULL),
    CHECK ((governing_proficiency_id IS NULL) = (proficiency_full_rank IS NULL)),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Weapon-specific data for an item (1:1 with items via a unique item_id). Flat
-- base damage + damage type, speed, range, frontal arc, two-handed, stamina per
-- swing, and the ability auto-cast on attack (granted_primary_ability_id).
CREATE TABLE weapon_defs (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id                   uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
    base_damage               numeric NOT NULL,        -- flat base stat (design pillar)
    damage_type_id            uuid NOT NULL REFERENCES damage_types(id),
    attack_speed              numeric NOT NULL,
    range                     numeric NOT NULL,
    frontal_arc_degrees       numeric NOT NULL DEFAULT 90,
    two_handed                boolean NOT NULL DEFAULT false,
    stamina_per_swing         numeric NOT NULL DEFAULT 0,   -- shared stamina pool
    granted_primary_ability_id uuid,                      -- auto-cast hook (FK added below)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Armor-specific data for an item (1:1 with items via a unique item_id).
-- Holds the base armor value; further stats come from item_modifiers / affixes.
CREATE TABLE armor_defs (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
    armor_value numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Consumable-specific data for an item (1:1 with items via a unique item_id).
-- charges = uses; on_use_ability_id = the ability fired on use (heal/buff/etc.
-- payloads live in that ability's ability_effects).
CREATE TABLE consumable_defs (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id   uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
    charges   int NOT NULL DEFAULT 1,
    on_use_ability_id uuid,                         -- drink = activate this ability (FK below); payloads live in ability_effects
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Bags. Typed extension (like weapon_defs/armor_defs): a bag is an item that
-- grants slot_count inventory slots when equipped in the bag slot. The bag's own
-- weight is items.weight (counts toward carry_weight like any item) -- a light
-- satchel weighs less than a heavy war-bag. No nesting (bags don't go in bags).
-- WHICH instance sits in which slot is player-DB runtime state, not defined here.
CREATE TABLE container_defs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id    uuid NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
    slot_count int NOT NULL,                         -- inventory slots this bag adds
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Item ↔ tag join (eligibility, rules, search)
CREATE TABLE item_tags (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id  uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE (item_id, tag_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Intrinsic / implicit modifiers: always present, not rolled.
-- A fixed-template item gets ALL its stats from here.
CREATE TABLE item_modifiers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id       uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    stat_id       uuid NOT NULL REFERENCES stat_definitions(id),
    modifier_type_id uuid NOT NULL REFERENCES modifier_types(id),
    value         numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_item_modifiers_item ON item_modifiers(item_id);


-- -----------------------------------------------------------------------------
-- Affixes — pre-authored modifier templates that ROLL onto eligible items.
-- The rolled value lands on the item INSTANCE in the player DB; the roll range
-- and rules live here.
-- -----------------------------------------------------------------------------
CREATE TABLE affix_definitions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key           text NOT NULL UNIQUE,
    name          text NOT NULL,                  -- display name fragment, e.g. 'Flaming'
    affix_type_id uuid NOT NULL REFERENCES affix_types(id),

    -- Mutual-exclusion + tiering. Two affixes sharing a group can never roll
    -- on the same item. Tiers of the "same" mod are separate rows in the group
    -- with different value ranges; which one appears is controlled by spawn
    -- weight (and per-tag overrides in affix_tags / loot-table weighting).
    affix_group   text NOT NULL,                  -- 'fire_damage', 'life'
    tier          int NOT NULL DEFAULT 1,         -- display/sort label for the bracket

    spawn_weight  int NOT NULL DEFAULT 100,       -- base weight; see affix_tags for overrides
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_affix_group ON affix_definitions(affix_group);

-- The stat rolls an affix grants. value_min..value_max is rolled at item
-- generation and the result stored on the instance.
CREATE TABLE affix_modifiers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    affix_id      uuid NOT NULL REFERENCES affix_definitions(id) ON DELETE CASCADE,
    stat_id       uuid NOT NULL REFERENCES stat_definitions(id),
    modifier_type_id uuid NOT NULL REFERENCES modifier_types(id),
    value_min     numeric NOT NULL,
    value_max     numeric NOT NULL,
    CHECK (value_max >= value_min),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_affix_modifiers_affix ON affix_modifiers(affix_id);

-- Eligibility + weighting by tag. An affix can roll on an item if the item
-- carries at least one tag listed here. A per-tag weight overrides the affix's
-- base spawn_weight (set 0 to forbid on that tag while allowing on others).
CREATE TABLE affix_tags (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    affix_id      uuid NOT NULL REFERENCES affix_definitions(id) ON DELETE CASCADE,
    tag_id        uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    weight_override int,                          -- null = use affix_definitions.spawn_weight
    UNIQUE (affix_id, tag_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- Effects — buffs / dots / auras are ALSO just modifier lists.
-- -----------------------------------------------------------------------------
CREATE TABLE effect_definitions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key           text NOT NULL UNIQUE,
    name          text NOT NULL,
    effect_type_id uuid NOT NULL REFERENCES effect_types(id),
    duration_secs numeric,                         -- null = permanent until removed
    max_stacks    int NOT NULL DEFAULT 1,
    tick_secs     numeric,                         -- cosmetic tick cadence (see effect_periodics)
    icon_ref      text,
    snapshot          boolean NOT NULL DEFAULT false,  -- freeze caster stats at apply? (instance stores frozen values)
    stack_behavior_id uuid NOT NULL REFERENCES stack_behaviors(id),
    control_type_id   uuid REFERENCES control_types(id),  -- if set, this effect is CC (applies these restrictions while active)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Persistent stat modifiers an effect applies while active (the "sits there"
-- half). Periodic per-tick payloads go in effect_periodics instead.
CREATE TABLE effect_modifiers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    effect_id     uuid NOT NULL REFERENCES effect_definitions(id) ON DELETE CASCADE,
    stat_id       uuid NOT NULL REFERENCES stat_definitions(id),
    modifier_type_id uuid NOT NULL REFERENCES modifier_types(id),
    value         numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_effect_modifiers_effect ON effect_modifiers(effect_id);

-- Periodic payloads — the "fires every tick" half of an effect (DoT/HoT/
-- resource-over-time). Persistent stat changes live in effect_modifiers above;
-- an effect may have rows in BOTH. Magnitude is a PER-SECOND RATE: a tick deals
-- (base_value + scaling_coefficient * caster.stat) * tick_secs, and the total
-- over the effect = rate * duration_secs, so tick_secs is only cosmetic cadence.
-- Same scaling shape as ability_effects -> one resolver in Game.Core for both.
CREATE TABLE effect_periodics (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    effect_id           uuid NOT NULL REFERENCES effect_definitions(id) ON DELETE CASCADE,
    op_id               uuid NOT NULL REFERENCES payload_ops(id),
    damage_type_id      uuid REFERENCES damage_types(id),     -- damage school (for resistances) when op = 'damage'
    resource_id         uuid REFERENCES resource_definitions(id),  -- pool to deplete (damage) or refill (restore); null = health
    base_value          numeric NOT NULL DEFAULT 0,           -- per-second rate (flat base)
    scaling_stat_id     uuid REFERENCES stat_definitions(id),
    scaling_coefficient numeric NOT NULL DEFAULT 0,
    magnitude_source_id uuid NOT NULL REFERENCES magnitude_sources(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Sample effects (templates). Each is a definition + persistent modifiers
-- (effect_modifiers) and/or per-tick payloads (effect_periodics). Periodic
-- base_value is a PER-SECOND rate; tick_secs is only cosmetic cadence.
-- -----------------------------------------------------------------------------
INSERT INTO effect_definitions (key, name, effect_type_id, duration_secs, max_stacks, tick_secs, snapshot, stack_behavior_id) VALUES
    ('might',        'Might',        (SELECT id FROM effect_types WHERE key='buff'),   60, 1, NULL, false, (SELECT id FROM stack_behaviors WHERE key='refresh')),
    ('regeneration', 'Regeneration', (SELECT id FROM effect_types WHERE key='hot'),    15, 1, 1,    false, (SELECT id FROM stack_behaviors WHERE key='refresh')),
    ('poisoned',     'Poisoned',     (SELECT id FROM effect_types WHERE key='dot'),    10, 5, 1,    false, (SELECT id FROM stack_behaviors WHERE key='independent')),
    ('mana_burn',    'Mana Burn',    (SELECT id FROM effect_types WHERE key='dot'),     6, 1, 1,    false, (SELECT id FROM stack_behaviors WHERE key='refresh')),
    ('slowed',       'Slowed',       (SELECT id FROM effect_types WHERE key='debuff'),  8, 1, NULL, false, (SELECT id FROM stack_behaviors WHERE key='highest'));

-- Pure CC effect: no stat modifiers, no periodics -- its whole job is the 'stun'
-- control type (total lockdown for 3s). This is what an Enchantment spell applies.
INSERT INTO effect_definitions (key, name, effect_type_id, duration_secs, stack_behavior_id, control_type_id) VALUES
    ('stunned', 'Stunned', (SELECT id FROM effect_types WHERE key='debuff'), 3,
     (SELECT id FROM stack_behaviors WHERE key='refresh'), (SELECT id FROM control_types WHERE key='stun'));

-- Persistent stat changes (the "sits there while active" half)
INSERT INTO effect_modifiers (effect_id, stat_id, modifier_type_id, value) VALUES
    ((SELECT id FROM effect_definitions WHERE key='might'),  (SELECT id FROM stat_definitions WHERE key='attack_power'), (SELECT id FROM modifier_types WHERE key='increased'),  0.15),   -- +15% attack power
    ((SELECT id FROM effect_definitions WHERE key='slowed'), (SELECT id FROM stat_definitions WHERE key='haste'),        (SELECT id FROM modifier_types WHERE key='increased'), -0.30);   -- -30% haste (negative increased)

-- Per-tick payloads (the "fires every tick" half)
INSERT INTO effect_periodics (effect_id, op_id, damage_type_id, resource_id, base_value, magnitude_source_id) VALUES
    ((SELECT id FROM effect_definitions WHERE key='regeneration'), (SELECT id FROM payload_ops WHERE key='heal'),   NULL,             NULL,         8, (SELECT id FROM magnitude_sources WHERE key='fixed')),  -- +8 health/sec
    ((SELECT id FROM effect_definitions WHERE key='poisoned'),     (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='poison'),   NULL,         5, (SELECT id FROM magnitude_sources WHERE key='fixed')),  -- 5 poison/sec to health
    ((SELECT id FROM effect_definitions WHERE key='mana_burn'),    (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='necrotic'), (SELECT id FROM resource_definitions WHERE key='mana'),4, (SELECT id FROM magnitude_sources WHERE key='fixed')); -- 4 necrotic/sec to mana
CREATE INDEX ix_effect_periodics_effect ON effect_periodics(effect_id);


-- -----------------------------------------------------------------------------
-- Abilities
-- -----------------------------------------------------------------------------
CREATE TABLE abilities (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key           text NOT NULL UNIQUE,
    name          text NOT NULL,
    cast_time     numeric NOT NULL DEFAULT 0,
    cooldown      numeric NOT NULL DEFAULT 0,
    gcd           numeric NOT NULL DEFAULT 0,
    cost_amount      numeric NOT NULL DEFAULT 0,   -- resource cost amount
    cost_resource_id uuid REFERENCES resource_definitions(id),  -- which resource (stamina/mana/health); null = free
    target_type_id uuid NOT NULL REFERENCES target_types(id),  -- self/ally/enemy/ground/none
    range         numeric,
    icon_ref      text,
    description   text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- One ability can do several things in order: deal damage, apply an effect, heal.
CREATE TABLE ability_effects (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ability_id    uuid NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
    sequence      int NOT NULL DEFAULT 0,
    op_id         uuid NOT NULL REFERENCES payload_ops(id),
    damage_type_id uuid REFERENCES damage_types(id),     -- damage school (for resistances) when op = 'damage'
    resource_id   uuid REFERENCES resource_definitions(id),  -- pool to deplete (damage) or refill (restore); null = health
    base_value    numeric,                         -- flat base (magnitude = base + coefficient * caster stat)
    scaling_stat_id     uuid REFERENCES stat_definitions(id),
    scaling_coefficient numeric NOT NULL DEFAULT 0,
    effect_id     uuid REFERENCES effect_definitions(id),  -- for apply_effect
    UNIQUE (ability_id, sequence),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ability_effects_ability ON ability_effects(ability_id);

-- Many-to-many link between abilities and tags (drives tag-based rules/filters).
CREATE TABLE ability_tags (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ability_id uuid NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
    tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE (ability_id, tag_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- Proficiencies — gate abilities AND emit passive modifiers per rank, so
-- progression lives on the same spine as everything else.
-- -----------------------------------------------------------------------------
CREATE TABLE proficiency_definitions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text NOT NULL UNIQUE,             -- 'one_handed','fire_magic'
    name        text NOT NULL,
    max_rank    int NOT NULL DEFAULT 100,
    description text,
    -- Weapon types: the basic attack every item of this type performs (all
    -- swords slash, all daggers stab). Null for armor/magic proficiencies.
    -- FK deferred (abilities defined later). Per-item override lives on
    -- weapon_defs.granted_primary_ability_id.
    basic_ability_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Starter proficiencies (all max_rank 100 by default). Three roles, one table:
-- armor classes drive item effectiveness scaling (items.governing_proficiency_id);
-- weapon types do the same and gate weapon abilities; magic schools gate spells.
INSERT INTO proficiency_definitions (key, name, description) VALUES
    -- armor classes (govern armor effectiveness scaling)
    ('cloth',       'Cloth Armor',   'Skill at wearing cloth; scales cloth armor effectiveness.'),
    ('leather',     'Leather Armor', 'Skill at wearing leather; scales leather armor effectiveness.'),
    ('mail',        'Mail Armor',    'Skill at wearing mail; scales mail armor effectiveness.'),
    ('plate',       'Plate Armor',   'Skill at wearing plate; scales plate armor effectiveness.'),
    -- weapon types (govern weapon effectiveness + gate weapon abilities)
    ('sword',       'Sword',         'Mastery of swords.'),
    ('axe',         'Axe',           'Mastery of axes.'),
    ('mace',        'Mace',          'Mastery of maces.'),
    ('dagger',      'Dagger',        'Mastery of daggers.'),
    ('polearm',     'Polearm',       'Mastery of two-handed polearms.'),
    ('bow',         'Bow',           'Mastery of bows and ranged weapons.'),
    ('staff',       'Staff',         'Mastery of staves and caster weapons.'),
    ('shield',      'Shield',        'Skill with shields; scales block and shield effectiveness.'),
    -- magic schools (the eight D&D schools; gate spell abilities)
    ('abjuration',    'Abjuration',    'Protective and warding magic.'),
    ('conjuration',   'Conjuration',   'Summoning and teleportation magic.'),
    ('divination',    'Divination',    'Knowledge and foresight magic.'),
    ('enchantment',   'Enchantment',   'Mind-affecting and charm magic.'),
    ('evocation',     'Evocation',     'Raw elemental and energy damage.'),
    ('illusion',      'Illusion',      'Deception and illusion magic.'),
    ('necromancy',    'Necromancy',    'Death and undeath magic.'),
    ('transmutation', 'Transmutation', 'Transformation and alteration magic.');

-- -----------------------------------------------------------------------------
-- Weapon basic abilities: one per weapon type, the default attack every item of
-- that type can perform. Plain damage abilities -- NO auto-cast assumptions baked
-- in; how/whether they auto-fire is a later behavior decision. Each weapon
-- proficiency is pointed at its basic ability below; armor/magic stay null.
-- -----------------------------------------------------------------------------
INSERT INTO abilities (key, name, cast_time, cooldown, gcd, cost_amount, cost_resource_id, target_type_id, range, description) VALUES
    ('slash',        'Slash',        0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  2, 'Basic sword attack.'),
    ('chop',         'Chop',         0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  2, 'Basic axe attack.'),
    ('bash',         'Bash',         0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  2, 'Basic mace attack.'),
    ('stab',         'Stab',         0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  2, 'Basic dagger attack.'),
    ('thrust',       'Thrust',       0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  3, 'Basic polearm attack.'),
    ('shoot',        'Shoot',        0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'), 30, 'Basic bow attack.'),
    ('staff_strike', 'Staff Strike', 0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  2, 'Basic staff attack.'),
    ('shield_bash',  'Shield Bash',  0, 0, 0, 5, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'),  2, 'Basic shield attack.');

INSERT INTO ability_effects (ability_id, sequence, op_id, damage_type_id, base_value) VALUES
    ((SELECT id FROM abilities WHERE key='slash'),        0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='slashing'),    5),
    ((SELECT id FROM abilities WHERE key='chop'),         0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='slashing'),    5),
    ((SELECT id FROM abilities WHERE key='bash'),         0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='bludgeoning'), 5),
    ((SELECT id FROM abilities WHERE key='stab'),         0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='piercing'),    5),
    ((SELECT id FROM abilities WHERE key='thrust'),       0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='piercing'),    5),
    ((SELECT id FROM abilities WHERE key='shoot'),        0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='piercing'),    5),
    ((SELECT id FROM abilities WHERE key='staff_strike'), 0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='bludgeoning'), 5),
    ((SELECT id FROM abilities WHERE key='shield_bash'),  0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='bludgeoning'), 5);

-- Point each weapon proficiency at its basic ability (non-weapon profs stay null)
UPDATE proficiency_definitions p SET basic_ability_id = a.id
FROM abilities a
WHERE a.key = CASE p.key
    WHEN 'sword'   THEN 'slash'
    WHEN 'axe'     THEN 'chop'
    WHEN 'mace'    THEN 'bash'
    WHEN 'dagger'  THEN 'stab'
    WHEN 'polearm' THEN 'thrust'
    WHEN 'bow'     THEN 'shoot'
    WHEN 'staff'   THEN 'staff_strike'
    WHEN 'shield'  THEN 'shield_bash'
END;

-- Passive modifiers granted once a character reaches min_rank.
CREATE TABLE proficiency_rank_modifiers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proficiency_id  uuid NOT NULL REFERENCES proficiency_definitions(id) ON DELETE CASCADE,
    min_rank        int NOT NULL,
    stat_id         uuid NOT NULL REFERENCES stat_definitions(id),
    modifier_type_id uuid NOT NULL REFERENCES modifier_types(id),
    value           numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_prof_rank_mods_prof ON proficiency_rank_modifiers(proficiency_id);

-- Ability unlock gate: ability requires min_rank in a proficiency.
CREATE TABLE ability_proficiency_requirements (
    id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ability_id     uuid NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
    proficiency_id uuid NOT NULL REFERENCES proficiency_definitions(id) ON DELETE CASCADE,
    min_rank       int NOT NULL DEFAULT 1,
    UNIQUE (ability_id, proficiency_id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- Races
-- -----------------------------------------------------------------------------

-- Playable races. Each grants small, flavorful stat bonuses (race_modifiers) --
-- distinct but not gamebreaking. Which race a character IS is player-DB state;
-- this only defines what each grants. Bonuses ride the spine like everything else.
CREATE TABLE race_definitions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text NOT NULL UNIQUE,
    name        text NOT NULL,
    sort_order  int NOT NULL DEFAULT 0,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO race_definitions (key, name, sort_order, description) VALUES
    ('human',    'Human',    1, 'Versatile and social; equally at home in any build.'),
    ('dwarf',    'Dwarf',    2, 'Stalwart and sturdy; natural toughness and armor.'),
    ('elf',      'Elf',      3, 'Arcane and graceful; a deeper mana reserve.'),
    ('orc',      'Orc',      4, 'Brutal and hardy; raw strength and vitality.'),
    ('halfling', 'Halfling', 5, 'Small and nimble; harder to pin down.'),
    ('gnome',    'Gnome',    6, 'Insightful tinkerers; superior mana sustain.');

-- Flat stat bonuses a race grants (mirrors proficiency_rank_modifiers). Resolved
-- by Game.Core as generated modifiers alongside gear, buffs, and attributes.
CREATE TABLE race_modifiers (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id          uuid NOT NULL REFERENCES race_definitions(id) ON DELETE CASCADE,
    stat_id          uuid NOT NULL REFERENCES stat_definitions(id),
    modifier_type_id uuid NOT NULL REFERENCES modifier_types(id),
    value            numeric NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_race_modifiers_race ON race_modifiers(race_id);

-- Starter racial bonuses (all flat, deliberately small; each race highlights a
-- different attribute). Tune freely.
INSERT INTO race_modifiers (race_id, stat_id, modifier_type_id, value)
SELECT r.id, st.id, (SELECT id FROM modifier_types WHERE key='flat'), v.value
FROM (VALUES
    ('human',    'charisma',     2),     -- social/versatile
    ('human',    'carry_weight', 5),
    ('dwarf',    'constitution', 2),     -- tough
    ('dwarf',    'armor',        5),
    ('elf',      'intelligence', 2),     -- arcane
    ('elf',      'mana_max',     5),
    ('orc',      'strength',     2),     -- brute
    ('orc',      'health_max',   10),
    ('halfling', 'dexterity',    2),     -- nimble
    ('halfling', 'dodge_chance', 0.02),
    ('gnome',    'wisdom',       2),     -- insightful
    ('gnome',    'mana_regen',   0.5)
) AS v(race_key, stat_key, value)
JOIN race_definitions r  ON r.key  = v.race_key
JOIN stat_definitions st ON st.key = v.stat_key;


-- -----------------------------------------------------------------------------
-- Magic schools (lore / display)
-- -----------------------------------------------------------------------------

-- Content/presentation extension of the eight school proficiencies. The school's
-- MECHANICAL identity (gating, ranking) stays on proficiency_definitions; this
-- 1:1 table hangs player-facing lore and theming off it (no duplicate source of
-- truth -- proficiency_id is the anchor). Generic-friendly columns so this can
-- fold into a broader codex system later if lore for other concepts appears.
CREATE TABLE magic_schools (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proficiency_id uuid NOT NULL UNIQUE REFERENCES proficiency_definitions(id) ON DELETE CASCADE,
    tagline       text,                            -- short flavor line
    lore          text,                            -- long-form codex entry
    color_hex     text,                            -- UI theme color
    icon_ref      text,
    sort_order    int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO magic_schools (proficiency_id, tagline, lore, color_hex, sort_order)
SELECT p.id, v.tagline, v.lore, v.color_hex, v.sort_order
FROM (VALUES
    ('abjuration',    'The art of protection and warding.',        'Abjurers raise barriers, banish hostile magic, and shield allies from harm. Theirs is the discipline of denial.', '#4A90D9', 1),
    ('conjuration',   'Summoning, teleportation, and creation.',   'Conjurers pull creatures and objects from elsewhere and fold space to move in an instant.',                       '#2E9E7B', 2),
    ('divination',    'Knowledge, foresight, and revelation.',     'Diviners pierce secrets, reveal the hidden, and glimpse what is yet to come.',                                     '#E0B84C', 3),
    ('enchantment',   'Domination of mind and will.',              'Enchanters bend thought and emotion, charming the willing and breaking the defiant.',                             '#D06BB0', 4),
    ('evocation',     'Raw elemental and arcane force.',           'Evokers channel pure energy into fire, frost, and lightning, the most direct of the schools.',                    '#E0542E', 5),
    ('illusion',      'Deception, glamour, and the unseen.',       'Illusionists craft false sights and sounds, hiding truth and conjuring what is not there.',                       '#8A5BD0', 6),
    ('necromancy',    'Mastery over death and the unliving.',      'Necromancers command the boundary between life and death, draining the living and raising the dead.',             '#3A5F3A', 7),
    ('transmutation', 'Transformation and the alteration of reality.', 'Transmuters reshape matter and being, turning one thing into another.',                                       '#C08A3E', 8)
) AS v(prof_key, tagline, lore, color_hex, sort_order)
JOIN proficiency_definitions p ON p.key = v.prof_key;


-- -----------------------------------------------------------------------------
-- Loot tables
-- -----------------------------------------------------------------------------

-- A loot table is a weighted list of items a source (mob, chest, node -- defined
-- later) drops when opened. Entries point at base ITEMS (gear, materials,
-- consumables -- all just items), so one structure handles gear-focused or
-- crafting-focused tables; the difference is only which items you list. Affixes
-- roll separately onto the dropped instance (player DB) -- this only picks the
-- base. Two independent levers per entry: weight = relative odds IF the table
-- picks one (weighted-pick); drop_chance = standalone 0..1 odds this entry drops
-- on its own (independent mode, default 1.0 = always). A table can use either or
-- both. A 'rolls' count can be added later for multi-pick without restructuring.
CREATE TABLE loot_tables (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Weighted rows of a loot table. min_qty/max_qty give a stack range (3-7 ore).
CREATE TABLE loot_entries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    loot_table_id uuid NOT NULL REFERENCES loot_tables(id) ON DELETE CASCADE,
    item_id       uuid NOT NULL REFERENCES items(id),
    weight        int NOT NULL DEFAULT 1,           -- relative likelihood IF the table picks by weight
    drop_chance   numeric NOT NULL DEFAULT 1.0,      -- standalone 0..1 chance this entry drops (1.0 = always)
    min_qty       int NOT NULL DEFAULT 1,
    max_qty       int NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_loot_entries_table ON loot_entries(loot_table_id);

-- Sample table mixing a consumable, a weapon, and an armor piece (all weight 1).
INSERT INTO loot_tables (key, name, description) VALUES
    ('common_chest', 'Common Chest', 'A basic loot table for early-game containers.');
INSERT INTO loot_entries (loot_table_id, item_id, weight, min_qty, max_qty) VALUES
    ((SELECT id FROM loot_tables WHERE key='common_chest'), (SELECT id FROM items WHERE key='small_health_potion'), 1, 1, 3),
    ((SELECT id FROM loot_tables WHERE key='common_chest'), (SELECT id FROM items WHERE key='iron_sword'), 1, 1, 1),
    ((SELECT id FROM loot_tables WHERE key='common_chest'), (SELECT id FROM items WHERE key='leather_helmet'), 1, 1, 1);


-- -----------------------------------------------------------------------------
-- Storage types
-- -----------------------------------------------------------------------------

-- The KINDS of storage spaces and their rules -- the content-side of a universal
-- container model. At runtime (player DB) every place an item can live (a worn
-- bag's space, a bank, a stash, a corpse, a world chest) is a container_instance
-- pointing at one of these rows for its behavior; an item instance carries its
-- current container_id + slot. This table just defines how each KIND behaves.
-- Bags add capacity to a 'backpack' space via container_defs; banks/stashes carry
-- their own base_slot_count. Flags are the full-loot rules expressed as data.
CREATE TABLE storage_types (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key  text NOT NULL UNIQUE,        -- 'backpack','bank','stash','guild_bank','corpse','chest'
    name text NOT NULL,
    scope text NOT NULL,              -- 'character' | 'account' | 'guild' | 'world' (who owns/accesses)
    weight_limited     boolean NOT NULL DEFAULT false,  -- does carry_weight apply? (backpack yes, bank no)
    drops_on_death     boolean NOT NULL DEFAULT false,  -- contents lost when owner dies (the full-loot rule)
    lootable_by_others boolean NOT NULL DEFAULT false,  -- non-owners can take from it (corpse/chest yes, bank no)
    persistent         boolean NOT NULL DEFAULT true,   -- permanent vs ephemeral/TTL (bank yes, corpse no)
    base_slot_count    int NOT NULL DEFAULT 0,          -- intrinsic slots (banks have them; backpack 0, bags supply)
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Starter set. Slot counts / flags are tunable. Equipped gear is intentionally
-- NOT here -- it is the typed named-slot case (equipment_slots), the one spot the
-- universal container model needs a special accommodation.
INSERT INTO storage_types (key, name, scope, weight_limited, drops_on_death, lootable_by_others, persistent, base_slot_count, description) VALUES
    ('backpack',   'Backpack',   'character', true,  true,  false, true,   4, 'Carried inventory; weight-limited and dropped on death. Bags add slots.'),
    ('bank',       'Bank',       'character', false, false, false, true,  50, 'Personal safe storage; not looted, not weight-limited.'),
    ('stash',      'Stash',      'account',   false, false, false, true, 100, 'Account-wide safe storage shared across your characters.'),
    ('guild_bank', 'Guild Bank', 'guild',     false, false, true,  true, 200, 'Shared guild storage; accessible by members (with permissions).'),
    ('corpse',     'Corpse',     'world',     false, false, true,  false,  0, 'Ephemeral drop container others can loot; despawns on a TTL.'),
    ('chest',      'Chest',      'world',     false, false, true,  true,   0, 'World container others can open.');


-- -----------------------------------------------------------------------------
-- Deferred FKs (resolve circular weapon<->ability and consumable<->effect refs)
-- -----------------------------------------------------------------------------
ALTER TABLE weapon_defs
    ADD CONSTRAINT fk_weapon_primary_ability
    FOREIGN KEY (granted_primary_ability_id) REFERENCES abilities(id);

ALTER TABLE consumable_defs
    ADD CONSTRAINT fk_consumable_on_use_ability
    FOREIGN KEY (on_use_ability_id) REFERENCES abilities(id);

ALTER TABLE items
    ADD CONSTRAINT fk_item_governing_proficiency
    FOREIGN KEY (governing_proficiency_id) REFERENCES proficiency_definitions(id);

ALTER TABLE proficiency_definitions
    ADD CONSTRAINT fk_proficiency_basic_ability
    FOREIGN KEY (basic_ability_id) REFERENCES abilities(id);



-- =============================================================================
-- updated_at automation
--   created_at + initial updated_at come from the column DEFAULT now().
--   Postgres does NOT advance updated_at on its own, so a BEFORE UPDATE
--   trigger per table keeps it current. moddatetime is a Supabase-native
--   extension; drop the trigger on any append-only/join table you'd rather
--   leave immutable.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS moddatetime;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON modifier_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stat_value_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON affix_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON effect_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stat_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON attribute_derivations
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON resource_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON equipment_slots
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_categories
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON rarity_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON damage_categories
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON damage_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON weapon_defs
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON armor_defs
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON consumable_defs
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON container_defs
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_tags
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_modifiers
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON affix_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON affix_modifiers
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON affix_tags
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON effect_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON effect_modifiers
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON abilities
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ability_effects
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ability_tags
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON proficiency_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON proficiency_rank_modifiers
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON race_definitions
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON race_modifiers
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON magic_schools
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON loot_tables
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON loot_entries
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON storage_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ability_proficiency_requirements
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON target_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payload_ops
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON stack_behaviors
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON magnitude_sources
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON control_types
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON effect_periodics
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);


-- =============================================================================
-- WORKED EXAMPLE — "Immolate": 100 fire dmg/sec for 6s, scaling with spell
-- power, snapshotted, highest-stacks (total ~600 + scaling over 6s).
--
--   INSERT INTO effect_definitions (key, name, effect_type_id, duration_secs,
--       tick_secs, snapshot, stack_behavior_id)
--   VALUES ('immolate','Immolate',
--       (SELECT id FROM effect_types    WHERE key='dot'),
--       6, 1, true,
--       (SELECT id FROM stack_behaviors WHERE key='highest'));
--
--   INSERT INTO effect_periodics (effect_id, op_id, damage_type_id,
--       base_value, scaling_stat_id, scaling_coefficient, magnitude_source_id)
--   VALUES (
--       (SELECT id FROM effect_definitions WHERE key='immolate'),
--       (SELECT id FROM payload_ops        WHERE key='damage'),
--       (SELECT id FROM damage_types       WHERE key='fire'),
--       100,
--       (SELECT id FROM stat_definitions   WHERE key='spell_power'),
--       0.4,
--       (SELECT id FROM magnitude_sources  WHERE key='fixed'));
-- =============================================================================

-- =============================================================================
-- Table documentation (written to the pg catalog; shows in Supabase + introspection)
-- =============================================================================
COMMENT ON TABLE modifier_types IS 'Vocabulary for how a modifier combines with others on the same stat (flat, increased, more, override). Referenced by every *_modifiers table and attribute_derivations; the combination math itself lives in Game.Core.';
COMMENT ON TABLE stat_value_types IS 'Value domain of a stat (int, float, percent). Drives rounding and clamping in the calc pipeline.';
COMMENT ON TABLE item_types IS 'Discriminator for the kind of item (weapon, armor, consumable, material, misc). Selects which *_defs extension table applies to an item.';
COMMENT ON TABLE affix_types IS 'Whether an affix is a prefix or a suffix. Rarity caps each independently.';
COMMENT ON TABLE effect_types IS 'Category of an effect (buff, debuff, dot, hot, aura). Used for UI and behavior grouping.';
COMMENT ON TABLE payload_ops IS 'What a payload does (damage, heal, restore, apply_effect). Shared verb set for ability_effects (per-hit) and effect_periodics (per-tick).';
COMMENT ON TABLE stack_behaviors IS 'How re-applying an active effect combines (independent, highest, refresh, extend).';
COMMENT ON TABLE control_types IS 'Named crowd-control categories (the DR grouping key) that each bundle the atomic restrictions they impose (move/cast/attack/turn) plus break-on-damage. Effects reference one via effect_definitions.control_type_id.';
COMMENT ON TABLE magnitude_sources IS 'How a payload magnitude is sourced. fixed = base + coefficient times caster stat (implemented). percent_of_hit = PoE-style ailment off the triggering hit (seam only, not yet implemented).';
COMMENT ON TABLE target_types IS 'Targeting mode of an ability (self, ally, enemy, ground, none).';
COMMENT ON TABLE stat_definitions IS 'The registry of every number in the game: the vocabulary all modifiers target. Attributes are simply stats flagged is_attribute. Carries value type, default, and clamp bounds.';
COMMENT ON TABLE attribute_derivations IS 'Rules for how a primary attribute feeds other stats (per N points). Resolved as generated modifiers in Game.Core after attributes are computed.';
COMMENT ON TABLE resource_definitions IS 'Registry pairing a max stat and a regen stat into a depleting resource pool (health, mana, stamina) so the tick loop is data-driven. Per-resource behavior lives in Game.Core; current values are runtime/player-DB state, not stored here.';
COMMENT ON TABLE tags IS 'Free-form labels that drive data-driven rules (affix eligibility, targeting filters) without schema changes. Joined to items, abilities, and affixes.';
COMMENT ON TABLE equipment_slots IS 'Normalized equip-slot vocabulary (head, main_hand, ring, ...) referenced by item_categories.slot_id; sort_order drives paper-doll display.';
COMMENT ON TABLE item_categories IS 'UI grouping and equip slot for items. Distinct from tags, which drive rules.';
COMMENT ON TABLE rarity_definitions IS 'Item rarity tiers. Caps how many prefixes and suffixes an affixable item may roll (common = 0, a fixed template). Seeded common through legendary.';
COMMENT ON TABLE damage_categories IS 'Damage category vocabulary (physical, elemental, magical) referenced by damage_types.category_id; groups types for blanket effects.';
COMMENT ON TABLE damage_types IS 'Damage type registry (D&D 5e set). category_id groups types for blanket effects; resist_stat_id links each type to its mitigation stat.';
COMMENT ON TABLE items IS 'Base item definition; every item is one row. type selects the extension table, can_have_affixes plus rarity gate rolled affixes, and intrinsic stats come from item_modifiers.';
COMMENT ON TABLE weapon_defs IS 'Weapon-specific data for an item (flat base damage, speed, range, frontal arc, two-handed, stamina per swing, granted auto-cast ability). One row per weapon item.';
COMMENT ON TABLE armor_defs IS 'Armor-specific data for an item (armor value). One row per armor item.';
COMMENT ON TABLE container_defs IS 'Bag extension of items: grants slot_count inventory slots when equipped. Bag weight is items.weight (counts toward carry_weight). No nesting. Slot contents are player-DB runtime state.';
COMMENT ON TABLE consumable_defs IS 'Consumable-specific data (charges, on_use_ability_id). Using the item activates that ability; the actual payloads live in ability_effects. One row per consumable item.';
COMMENT ON TABLE item_tags IS 'Many-to-many link between items and tags.';
COMMENT ON TABLE item_modifiers IS 'Intrinsic (implicit) stat modifiers always present on an item: the fixed-template, non-rolled half of an item stat block.';
COMMENT ON TABLE affix_definitions IS 'Pre-authored modifier templates that roll onto eligible items. affix_group enforces mutual exclusion and tiering; spawn_weight plus affix_tags control eligibility and weighting.';
COMMENT ON TABLE affix_modifiers IS 'The stat rolls an affix grants (value_min to value_max). The rolled result is stored on the item instance in the player DB, not here.';
COMMENT ON TABLE affix_tags IS 'Which item-tags an affix may roll on, with optional per-tag weight overrides. Eligibility = the item shares at least one listed tag.';
COMMENT ON TABLE effect_definitions IS 'A buff, debuff, dot, hot, or aura template: duration, tick cadence, snapshot flag, and stacking behavior. Persistent payloads go in effect_modifiers, periodic payloads in effect_periodics.';
COMMENT ON TABLE effect_modifiers IS 'Persistent stat modifiers an effect applies while active: the sits-there half of an effect.';
COMMENT ON TABLE effect_periodics IS 'Periodic per-tick payloads an effect fires (DoT, HoT, resource-over-time). Magnitude is a per-second rate; a tick deals rate times tick_secs.';
COMMENT ON TABLE abilities IS 'Activatable ability definition (cast time, cooldown, gcd, stamina cost, target type, range). Used by players, by weapons (granted primary), and by consumables (on use).';
COMMENT ON TABLE ability_effects IS 'Ordered list of payloads an ability performs (damage, heal, apply_effect), each with the shared base plus scaling magnitude shape.';
COMMENT ON TABLE ability_tags IS 'Many-to-many link between abilities and tags.';
COMMENT ON TABLE proficiency_definitions IS 'A trainable proficiency (for example one-handed, fire magic) that gates abilities and grants passive modifiers per rank.';
COMMENT ON TABLE proficiency_rank_modifiers IS 'Passive stat modifiers granted once a character reaches a given rank in a proficiency.';
COMMENT ON TABLE ability_proficiency_requirements IS 'Gate: the minimum proficiency rank required to use an ability.';
COMMENT ON TABLE race_definitions IS 'Playable races. Each grants small flavorful stat bonuses via race_modifiers; which race a character is lives in the player DB.';
COMMENT ON TABLE loot_tables IS 'A weighted list of items a source drops when opened. Entries point at base items; affixes roll separately onto the dropped instance.';
COMMENT ON TABLE loot_entries IS 'Rows of a loot table: which item, relative weight (weighted-pick), standalone drop_chance (independent, default 1.0), and min/max stack quantity.';
COMMENT ON TABLE storage_types IS 'Kinds of storage spaces and their rules (the content side of a universal container model). Runtime container_instances (player DB) point here for behavior; flags encode the full-loot rules (weight_limited, drops_on_death, lootable_by_others, persistent).';
COMMENT ON TABLE magic_schools IS 'Content/lore extension of the eight school proficiencies (1:1 via proficiency_id). Holds player-facing tagline, lore, and theming; the proficiency row remains the mechanical source of truth.';
COMMENT ON TABLE race_modifiers IS 'Flat stat bonuses a race grants (mirrors proficiency_rank_modifiers). Resolved by Game.Core as generated modifiers alongside gear, buffs, and attributes.';

-- Value-level docs for the lookup ("types") tables: what each key means
COMMENT ON COLUMN modifier_types.key IS 'How the modifier combines on a stat: "flat" adds to base; "increased" sums into one additive percent bucket applied once; "more" multiplies independently (stacks multiplicatively); "override" sets the value outright. Combination math is hardcoded in Game.Core.';
COMMENT ON COLUMN stat_value_types.key IS 'Value domain: "int" whole number; "float" decimal; "percent" stored as a rate where 0.2 means 20 percent.';
COMMENT ON COLUMN item_types.key IS 'Item discriminator: "weapon", "armor", and "consumable" each have a 1:1 extension row (weapon_defs / armor_defs / consumable_defs); "material" is a crafting component; "misc" has no extension.';
COMMENT ON COLUMN affix_types.key IS 'Affix slot class: "prefix" or "suffix". Rarity caps each independently via max_prefixes and max_suffixes.';
COMMENT ON COLUMN effect_types.key IS 'Effect category: "buff" and "debuff" are persistent stat effects; "dot" and "hot" are periodic damage/heal over time; "aura" radiates to nearby units.';
COMMENT ON COLUMN payload_ops.key IS 'What a payload does: "damage" depletes a resource (resource_id, null = health) and may carry a damage_type for resistances; "heal" restores health; "restore" refills a resource (resource_id); "apply_effect" applies an effect_definition.';
COMMENT ON COLUMN stack_behaviors.key IS 'Re-application rule: "independent" = each cast is its own instance and magnitudes add (PoE poison); "highest" = only the strongest applies (PoE ignite); "refresh" = re-apply resets duration (WoW); "extend" = re-apply adds duration.';
COMMENT ON COLUMN magnitude_sources.key IS 'How magnitude is sourced: "fixed" = base plus coefficient times caster stat (implemented); "percent_of_hit" = a percent of the triggering hit (PoE ailment, not yet implemented).';
COMMENT ON COLUMN target_types.key IS 'Targeting mode: "self" the caster; "ally" a friendly unit; "enemy" a hostile unit; "ground" a placed or AoE location; "none" passive with no target.';



-- =============================================================================
-- SAMPLE CONTENT (example items; safe to delete for a clean content DB)
-- One weapon, one armor, one consumable. Each item is a base `items` row plus
-- its typed extension row; the potion also needs an on-use ability + payload.
-- Inserted in dependency order (ability -> items -> extensions -> modifiers).
-- =============================================================================

-- Potion's on-use ability + its payload (drink -> heal 50 health)
INSERT INTO abilities (key, name, cast_time, cooldown, gcd, cost_amount, cost_resource_id, target_type_id, description) VALUES
    ('drink_small_health_potion', 'Drink Small Health Potion', 1.0, 5, 0, 0, NULL, (SELECT id FROM target_types WHERE key='self'), 'Drink to restore health.');
INSERT INTO ability_effects (ability_id, sequence, op_id, base_value) VALUES
    ((SELECT id FROM abilities WHERE key='drink_small_health_potion'), 0, (SELECT id FROM payload_ops WHERE key='heal'), 50);

-- Base item rows
INSERT INTO items
    (key, name, item_type_id, category_id, weight, stack_max, base_value, max_durability,
     can_have_affixes, rarity_id, droppable, tradeable, governing_proficiency_id, proficiency_full_rank, description) VALUES
    ('iron_sword', 'Iron Sword', (SELECT id FROM item_types WHERE key='weapon'), (SELECT id FROM item_categories WHERE key='one_hand'), 3.5, 1, 25, 100,
     true,  (SELECT id FROM rarity_definitions WHERE key='uncommon'), true, true, (SELECT id FROM proficiency_definitions WHERE key='sword'),   50, 'A sturdy iron sword.'),
    ('leather_helmet', 'Leather Helmet', (SELECT id FROM item_types WHERE key='armor'), (SELECT id FROM item_categories WHERE key='helmet'), 1.5, 1, 15, 80,
     false, (SELECT id FROM rarity_definitions WHERE key='common'),   true, true, (SELECT id FROM proficiency_definitions WHERE key='leather'), 50, 'A simple leather cap.'),
    ('small_health_potion', 'Small Health Potion', (SELECT id FROM item_types WHERE key='consumable'), (SELECT id FROM item_categories WHERE key='potion'), 0.5, 20, 5, NULL,
     false, (SELECT id FROM rarity_definitions WHERE key='common'),   true, true, NULL, NULL, 'Restores a small amount of health on use.');

-- Typed extension rows
INSERT INTO weapon_defs (item_id, base_damage, damage_type_id, attack_speed, range, frontal_arc_degrees, two_handed, stamina_per_swing) VALUES
    ((SELECT id FROM items WHERE key='iron_sword'), 12, (SELECT id FROM damage_types WHERE key='slashing'), 1.5, 2, 90, false, 8);
INSERT INTO armor_defs (item_id, armor_value) VALUES
    ((SELECT id FROM items WHERE key='leather_helmet'), 8);
INSERT INTO consumable_defs (item_id, charges, on_use_ability_id) VALUES
    ((SELECT id FROM items WHERE key='small_health_potion'), 1, (SELECT id FROM abilities WHERE key='drink_small_health_potion'));

-- Intrinsic (implicit) stat modifiers
INSERT INTO item_modifiers (item_id, stat_id, modifier_type_id, value) VALUES
    ((SELECT id FROM items WHERE key='iron_sword'),     (SELECT id FROM stat_definitions WHERE key='attack_power'),  (SELECT id FROM modifier_types WHERE key='flat'), 5),
    ((SELECT id FROM items WHERE key='leather_helmet'), (SELECT id FROM stat_definitions WHERE key='constitution'),  (SELECT id FROM modifier_types WHERE key='flat'), 2);


-- Example affixes. Eligibility is tag-based, so these roll on ANY item carrying
-- the matching tag (not just the samples here). "Honed" -> melee gear (+% attack
-- power); "of Evasion" -> light armor (+flat dodge, percentage points).
INSERT INTO affix_definitions (key, name, affix_type_id, affix_group, tier, spawn_weight) VALUES
    ('honed',      'Honed',      (SELECT id FROM affix_types WHERE key='prefix'), 'attack_power', 1, 100),
    ('of_evasion', 'of Evasion', (SELECT id FROM affix_types WHERE key='suffix'), 'dodge',        1, 100);

INSERT INTO affix_modifiers (affix_id, stat_id, modifier_type_id, value_min, value_max) VALUES
    ((SELECT id FROM affix_definitions WHERE key='honed'),      (SELECT id FROM stat_definitions WHERE key='attack_power'), (SELECT id FROM modifier_types WHERE key='increased'), 0.08, 0.12),
    ((SELECT id FROM affix_definitions WHERE key='of_evasion'), (SELECT id FROM stat_definitions WHERE key='dodge_chance'), (SELECT id FROM modifier_types WHERE key='flat'),      0.01, 0.02);

-- Affix eligibility (which tags each affix may roll on)
INSERT INTO affix_tags (affix_id, tag_id) VALUES
    ((SELECT id FROM affix_definitions WHERE key='honed'),      (SELECT id FROM tags WHERE key='melee')),
    ((SELECT id FROM affix_definitions WHERE key='of_evasion'), (SELECT id FROM tags WHERE key='light_armor'));

-- Tag the sample items so they qualify for the affixes above
INSERT INTO item_tags (item_id, tag_id) VALUES
    ((SELECT id FROM items WHERE key='iron_sword'),     (SELECT id FROM tags WHERE key='melee')),
    ((SELECT id FROM items WHERE key='leather_helmet'), (SELECT id FROM tags WHERE key='light_armor'));


-- =============================================================================
-- SAMPLE CONTENT: ranged path (bow item, ranged_power affix, gated bow ability)
-- =============================================================================

-- Gated ranged ability: Power Shot, requires Bow proficiency rank 5. Scales off
-- ranged_power (the new third power scalar). Fills ability_proficiency_requirements
-- (the unlock ladder) and ability_tags.
INSERT INTO abilities (key, name, cast_time, cooldown, gcd, cost_amount, cost_resource_id, target_type_id, range, description) VALUES
    ('power_shot', 'Power Shot', 0.5, 6, 0, 12, (SELECT id FROM resource_definitions WHERE key='stamina'), (SELECT id FROM target_types WHERE key='enemy'), 30, 'A heavy aimed shot. Requires Bow proficiency.');
INSERT INTO ability_effects (ability_id, sequence, op_id, damage_type_id, base_value, scaling_stat_id, scaling_coefficient) VALUES
    ((SELECT id FROM abilities WHERE key='power_shot'), 0, (SELECT id FROM payload_ops WHERE key='damage'), (SELECT id FROM damage_types WHERE key='piercing'), 15, (SELECT id FROM stat_definitions WHERE key='ranged_power'), 1.0);
INSERT INTO ability_proficiency_requirements (ability_id, proficiency_id, min_rank) VALUES
    ((SELECT id FROM abilities WHERE key='power_shot'), (SELECT id FROM proficiency_definitions WHERE key='bow'), 5);
INSERT INTO ability_tags (ability_id, tag_id) VALUES
    ((SELECT id FROM abilities WHERE key='power_shot'), (SELECT id FROM tags WHERE key='ranged'));

-- Starter bow (uncommon, affixable). Two-handed, range 30, intrinsic +5 ranged_power.
INSERT INTO items
    (key, name, item_type_id, category_id, weight, stack_max, base_value, max_durability,
     can_have_affixes, rarity_id, droppable, tradeable, governing_proficiency_id, proficiency_full_rank, description) VALUES
    ('oak_shortbow', 'Oak Shortbow', (SELECT id FROM item_types WHERE key='weapon'), (SELECT id FROM item_categories WHERE key='ranged'), 2.0, 1, 25, 100,
     true, (SELECT id FROM rarity_definitions WHERE key='uncommon'), true, true, (SELECT id FROM proficiency_definitions WHERE key='bow'), 50, 'A simple oak shortbow.');
INSERT INTO weapon_defs (item_id, base_damage, damage_type_id, attack_speed, range, frontal_arc_degrees, two_handed, stamina_per_swing) VALUES
    ((SELECT id FROM items WHERE key='oak_shortbow'), 10, (SELECT id FROM damage_types WHERE key='piercing'), 1.2, 30, 90, true, 6);
INSERT INTO item_modifiers (item_id, stat_id, modifier_type_id, value) VALUES
    ((SELECT id FROM items WHERE key='oak_shortbow'), (SELECT id FROM stat_definitions WHERE key='ranged_power'), (SELECT id FROM modifier_types WHERE key='flat'), 5);
INSERT INTO item_tags (item_id, tag_id) VALUES
    ((SELECT id FROM items WHERE key='oak_shortbow'), (SELECT id FROM tags WHERE key='ranged'));

-- ranged_power affix, parallel to Honed (melee). "Keen" -> ranged gear (+% ranged power).
INSERT INTO affix_definitions (key, name, affix_type_id, affix_group, tier, spawn_weight) VALUES
    ('keen', 'Keen', (SELECT id FROM affix_types WHERE key='prefix'), 'ranged_power', 1, 100);
INSERT INTO affix_modifiers (affix_id, stat_id, modifier_type_id, value_min, value_max) VALUES
    ((SELECT id FROM affix_definitions WHERE key='keen'), (SELECT id FROM stat_definitions WHERE key='ranged_power'), (SELECT id FROM modifier_types WHERE key='increased'), 0.08, 0.12);
INSERT INTO affix_tags (affix_id, tag_id) VALUES
    ((SELECT id FROM affix_definitions WHERE key='keen'), (SELECT id FROM tags WHERE key='ranged'));


-- =============================================================================
-- SAMPLE CONTENT: healer path (Restoration HoT, gated at rank 10)
-- Healing rides the shared spell_power pillar -- no heal_power stat. Healer
-- identity = the gated ability kit + proficiency investment, not a separate stat.
-- =============================================================================

-- The HoT effect: heals over time, scaling off spell_power (per-second rate).
INSERT INTO effect_definitions (key, name, effect_type_id, duration_secs, max_stacks, tick_secs, snapshot, stack_behavior_id) VALUES
    ('renew', 'Renew', (SELECT id FROM effect_types WHERE key='hot'), 12, 1, 1, false, (SELECT id FROM stack_behaviors WHERE key='refresh'));
INSERT INTO effect_periodics (effect_id, op_id, damage_type_id, resource_id, base_value, scaling_stat_id, scaling_coefficient, magnitude_source_id) VALUES
    ((SELECT id FROM effect_definitions WHERE key='renew'), (SELECT id FROM payload_ops WHERE key='heal'), NULL, NULL, 5, (SELECT id FROM stat_definitions WHERE key='spell_power'), 0.2, (SELECT id FROM magnitude_sources WHERE key='fixed'));  -- (5 + 0.2*spell_power)/sec

-- The ability that applies it. Targets allies (and self); requires Restoration 10.
INSERT INTO abilities (key, name, cast_time, cooldown, gcd, cost_amount, cost_resource_id, target_type_id, range, description) VALUES
    ('renew', 'Renew', 0, 0, 0, 20, (SELECT id FROM resource_definitions WHERE key='mana'), (SELECT id FROM target_types WHERE key='ally'), 30, 'Heals the target over time. Requires Evocation proficiency.');
INSERT INTO ability_effects (ability_id, sequence, op_id, effect_id) VALUES
    ((SELECT id FROM abilities WHERE key='renew'), 0, (SELECT id FROM payload_ops WHERE key='apply_effect'), (SELECT id FROM effect_definitions WHERE key='renew'));
INSERT INTO ability_proficiency_requirements (ability_id, proficiency_id, min_rank) VALUES
    ((SELECT id FROM abilities WHERE key='renew'), (SELECT id FROM proficiency_definitions WHERE key='evocation'), 10);


-- =============================================================================
-- SAMPLE CONTENT: caster kit (healer vs nuke). Same spell_power base on every
-- piece; the split is SECONDARIES -- healer leans mana sustain, nuke leans crit.
-- Demonstrates the Version-B model: one pillar, role identity via secondaries.
-- =============================================================================
INSERT INTO items
    (key, name, item_type_id, category_id, weight, stack_max, base_value, max_durability,
     can_have_affixes, rarity_id, droppable, tradeable, governing_proficiency_id, proficiency_full_rank, description) VALUES
    ('menders_robe',     'Mender''s Robe',    (SELECT id FROM item_types WHERE key='armor'),  (SELECT id FROM item_categories WHERE key='chest'),    1.0, 1, 15, 80,
     false, (SELECT id FROM rarity_definitions WHERE key='common'),   true, true, (SELECT id FROM proficiency_definitions WHERE key='cloth'), 50, 'A cloth robe favored by healers.'),
    ('pyromancers_robe', 'Pyromancer''s Robe',(SELECT id FROM item_types WHERE key='armor'),  (SELECT id FROM item_categories WHERE key='chest'),    1.0, 1, 15, 80,
     false, (SELECT id FROM rarity_definitions WHERE key='common'),   true, true, (SELECT id FROM proficiency_definitions WHERE key='cloth'), 50, 'A cloth robe favored by battle-mages.'),
    ('staff_of_mending', 'Staff of Mending',  (SELECT id FROM item_types WHERE key='weapon'), (SELECT id FROM item_categories WHERE key='two_hand'), 3.0, 1, 25, 100,
     true,  (SELECT id FROM rarity_definitions WHERE key='uncommon'), true, true, (SELECT id FROM proficiency_definitions WHERE key='staff'), 50, 'A staff that channels restorative magic.'),
    ('staff_of_flames',  'Staff of Flames',   (SELECT id FROM item_types WHERE key='weapon'), (SELECT id FROM item_categories WHERE key='two_hand'), 3.0, 1, 25, 100,
     true,  (SELECT id FROM rarity_definitions WHERE key='uncommon'), true, true, (SELECT id FROM proficiency_definitions WHERE key='staff'), 50, 'A staff that channels destructive magic.');

INSERT INTO armor_defs (item_id, armor_value) VALUES
    ((SELECT id FROM items WHERE key='menders_robe'), 3),
    ((SELECT id FROM items WHERE key='pyromancers_robe'), 3);

INSERT INTO weapon_defs (item_id, base_damage, damage_type_id, attack_speed, range, frontal_arc_degrees, two_handed, stamina_per_swing) VALUES
    ((SELECT id FROM items WHERE key='staff_of_mending'), 6, (SELECT id FROM damage_types WHERE key='bludgeoning'), 1.4, 2, 90, true, 6),
    ((SELECT id FROM items WHERE key='staff_of_flames'),  6, (SELECT id FROM damage_types WHERE key='bludgeoning'), 1.4, 2, 90, true, 6);

-- Intrinsics: shared spell_power, split secondary (mana_regen for healing, crit for nuking)
INSERT INTO item_modifiers (item_id, stat_id, modifier_type_id, value) VALUES
    ((SELECT id FROM items WHERE key='menders_robe'),     (SELECT id FROM stat_definitions WHERE key='spell_power'), (SELECT id FROM modifier_types WHERE key='flat'), 8),
    ((SELECT id FROM items WHERE key='menders_robe'),     (SELECT id FROM stat_definitions WHERE key='mana_regen'),  (SELECT id FROM modifier_types WHERE key='flat'), 1.5),
    ((SELECT id FROM items WHERE key='pyromancers_robe'), (SELECT id FROM stat_definitions WHERE key='spell_power'), (SELECT id FROM modifier_types WHERE key='flat'), 8),
    ((SELECT id FROM items WHERE key='pyromancers_robe'), (SELECT id FROM stat_definitions WHERE key='crit_chance'), (SELECT id FROM modifier_types WHERE key='flat'), 0.02),
    ((SELECT id FROM items WHERE key='staff_of_mending'), (SELECT id FROM stat_definitions WHERE key='spell_power'), (SELECT id FROM modifier_types WHERE key='flat'), 10),
    ((SELECT id FROM items WHERE key='staff_of_mending'), (SELECT id FROM stat_definitions WHERE key='mana_regen'),  (SELECT id FROM modifier_types WHERE key='flat'), 2),
    ((SELECT id FROM items WHERE key='staff_of_flames'),  (SELECT id FROM stat_definitions WHERE key='spell_power'), (SELECT id FROM modifier_types WHERE key='flat'), 10),
    ((SELECT id FROM items WHERE key='staff_of_flames'),  (SELECT id FROM stat_definitions WHERE key='crit_chance'), (SELECT id FROM modifier_types WHERE key='flat'), 0.03);

-- Tag the staves caster so caster-eligible affixes can roll
INSERT INTO item_tags (item_id, tag_id) VALUES
    ((SELECT id FROM items WHERE key='staff_of_mending'), (SELECT id FROM tags WHERE key='caster')),
    ((SELECT id FROM items WHERE key='staff_of_flames'),  (SELECT id FROM tags WHERE key='caster'));


-- Sample bags (light/few-slots vs heavy/many-slots; weight is items.weight)
INSERT INTO items
    (key, name, item_type_id, category_id, weight, stack_max, base_value, max_durability,
     can_have_affixes, rarity_id, droppable, tradeable, description) VALUES
    ('leather_satchel', 'Leather Satchel', (SELECT id FROM item_types WHERE key='container'), (SELECT id FROM item_categories WHERE key='bag'), 0.8, 1, 10, 60,
     false, (SELECT id FROM rarity_definitions WHERE key='common'), true, true, 'A small, light satchel.'),
    ('large_war_bag',   'Large War Bag',   (SELECT id FROM item_types WHERE key='container'), (SELECT id FROM item_categories WHERE key='bag'), 3.5, 1, 40, 120,
     false, (SELECT id FROM rarity_definitions WHERE key='common'), true, true, 'A big, heavy bag with ample storage.');
INSERT INTO container_defs (item_id, slot_count) VALUES
    ((SELECT id FROM items WHERE key='leather_satchel'), 6),
    ((SELECT id FROM items WHERE key='large_war_bag'), 16);