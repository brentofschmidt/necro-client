-- =============================================================================
-- game_player_schema.sql
-- Necro — Game Player database (runtime / per-character INSTANCE state)
-- Target: PostgreSQL (Supabase) — schema necro_player, same DB as necro_content
--
-- SCOPE BOUNDARY
--   This schema holds the INSTANCE half of the game: the actual things that
--   exist at runtime and survive restarts. It is the mirror of necro_content:
--
--       necro_content (definition)      necro_player (instance)
--       -----------------------------   ----------------------------------
--       items                           item_instances (durability, stacks,
--                                          rolled affixes, ownership)
--       affix_definitions               item_instance_affixes (rolled values)
--       storage_types                   container_instances + slot contents
--       proficiency_definitions         character_proficiencies (rank + xp)
--       resource_nodes / npc_definitions  world instance state (mostly Redis)
--
--   PERSISTENCE TIERS (server-authoritative; client never writes):
--     - ephemeral combat state (positions, cooldowns, buffs, threat) -> Redis,
--       never here.
--     - periodic-snapshot state (last-known position, current resources) ->
--       written here on a dirty-flag batch, off the game thread.
--     - durable-immediate transactional state (inventory moves, trades, item
--       create/destroy, currency) -> atomic Postgres txns here. Full-loot makes
--       this path correctness-critical: an item must never dupe or vanish.
--
--   CROSS-SCHEMA REFERENCES
--     Instances reference definitions with real FKs into necro_content (same DB,
--     different schema). Definitions are stable; the content release-snapshot
--     system means a given content uuid keeps meaning across deploys.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS necro_player;

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS moddatetime;  -- updated_at triggers

-- Unqualified objects below are created in necro_player; necro_content is on the
-- path for cross-schema FK targets, public for extension functions.
SET search_path TO necro_player, necro_content, public;


-- -----------------------------------------------------------------------------
-- Characters
-- -----------------------------------------------------------------------------

-- A player's character: the durable identity + slow-changing state row. Fast
-- state (live position, current HP, active buffs, cooldowns) is Redis/ephemeral;
-- only periodic snapshots of position/resources land here. account_id references
-- the ACCOUNT schema/db (identity) -- left as a plain uuid here so the player
-- schema doesn't hard-couple to account internals (logical reference).
CREATE TABLE characters (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  uuid NOT NULL,                 -- logical ref to the account tier
    name        text NOT NULL UNIQUE,
    race_id     uuid NOT NULL REFERENCES necro_content.races(id),

    -- periodic-snapshot fields (authoritative live values live in Redis between
    -- snapshots; these are the last persisted checkpoint).
    last_zone_id uuid REFERENCES necro_content.zones(id),  -- last-known zone (coords are Redis)
    playtime_secs bigint NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_characters_account ON characters(account_id);


-- -----------------------------------------------------------------------------
-- Containers
-- -----------------------------------------------------------------------------

-- An actual container a character (or the world) holds: the instance of a
-- necro_content.storage_types KIND (backpack/bank/stash/corpse/chest). Carries
-- the resolved slot_count for THIS container (a backpack's capacity comes from
-- the equipped bag's container_defs.slot_count; a bank's from base_slot_count) --
-- stored because it is mutable instance state (swap a bigger bag, capacity grows).
-- owner is nullable: world chests and post-owner corpses have no living owner.
-- Corpses are just a container with the storage_type full-loot flags
-- (lootable_by_others, drops_on_death, non-persistent) -- no special table.
CREATE TABLE container_instances (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_character_id uuid REFERENCES characters(id) ON DELETE CASCADE,  -- null = world/unowned
    storage_type_id    uuid NOT NULL REFERENCES necro_content.storage_types(id),
    slot_count int NOT NULL DEFAULT 0,   -- resolved capacity of this container
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_container_instances_owner ON container_instances(owner_character_id);


-- -----------------------------------------------------------------------------
-- Item instances
-- -----------------------------------------------------------------------------

-- THE actual item that exists in the world: this specific sword. References its
-- definition in necro_content.items for everything static (name, weight, slot,
-- intrinsic modifiers); stores only the per-instance state the definition
-- deliberately omitted. Location is resolved separately (container slot or
-- equipment slot) so an instance can move between bag, bank, corpse, and ground
-- without changing identity -- the durability/affixes travel with it (full-loot
-- trade history durability). A bound instance (full-loot: rare) would add flags
-- later; default is fully lootable per the item's droppable flag.
CREATE TABLE item_instances (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id   uuid NOT NULL REFERENCES necro_content.items(id),  -- the definition

    -- per-instance mutable state (the half necro_content does not hold):
    durability_current int,            -- null when the item's max_durability is null (indestructible)
    stack_qty          int NOT NULL DEFAULT 1,  -- 1..items.stack_max (enforced in app/txn)

    -- Location: an item is in a container at a slot, OR equipped (a row in
    -- character_equipment points at it, container_id null), OR on the ground
    -- (both null). Container location lives here because an item is in exactly
    -- one place; equipment uses typed named slots, so it gets its own table.
    -- Keeping location mutable (not part of identity) lets an item move between
    -- bag/bank/corpse/ground while its durability + rolled affixes travel with it.
    container_id   uuid REFERENCES container_instances(id) ON DELETE SET NULL,
    container_slot int,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CHECK (stack_qty >= 1),
    CHECK ((container_id IS NULL) = (container_slot IS NULL))   -- both set or both null
);
CREATE INDEX ix_item_instances_item ON item_instances(item_id);
CREATE INDEX ix_item_instances_container ON item_instances(container_id);
-- One item per occupied container slot.
CREATE UNIQUE INDEX uq_item_instances_slot ON item_instances(container_id, container_slot)
    WHERE container_id IS NOT NULL;

-- The affixes actually ROLLED onto an instance. affix_definitions in content
-- describe what CAN roll and the value range; this stores the value that DID
-- roll on this specific item (PoE-style: same base, different rolls per drop).
-- The modifier the affix emits is resolved through the same spine as everything
-- else; rolled_value is the magnitude picked at drop/craft time.
CREATE TABLE item_instance_affixes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id uuid NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
    affix_id    uuid NOT NULL REFERENCES necro_content.affix_definitions(id),
    rolled_value numeric NOT NULL,     -- the magnitude rolled within the affix's range
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_item_instance_affixes_instance ON item_instance_affixes(instance_id);


-- -----------------------------------------------------------------------------
-- Equipment (typed named slots)
-- -----------------------------------------------------------------------------

-- What a character has equipped, one row per occupied slot. Unlike a container
-- (indexed, interchangeable slots), equipment slots are NAMED and TYPED: the slot
-- references the necro_content.equipment_slots vocabulary (head/main_hand/...),
-- and an item only fits if its category's slot_id matches (enforced in the equip
-- transaction). An equipped item's container_id is null -- it lives here, not in
-- a bag. UNIQUE(character, slot) = one item per slot; UNIQUE(item_instance) = an
-- item can't be equipped in two places.
CREATE TABLE character_equipment (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot_id      uuid NOT NULL REFERENCES necro_content.equipment_slots(id),
    item_instance_id uuid NOT NULL UNIQUE REFERENCES item_instances(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (character_id, slot_id)
);
CREATE INDEX ix_character_equipment_character ON character_equipment(character_id);


-- -----------------------------------------------------------------------------
-- Character proficiencies (rank + XP)
-- -----------------------------------------------------------------------------

-- The player half of necro_content.proficiency_definitions: a character's
-- accumulated XP and current rank in each proficiency they've trained. This is
-- where every XP event lands -- gather_xp from nodes, craft_xp from recipes, and
-- combat XP (damage dealt x ability xp_multiplier) all add to current_xp on the
-- governing proficiency's row. One row per (character, proficiency); rows are
-- created lazily the first time a proficiency is trained.
--
-- rank is DENORMALIZED from current_xp via the XP curve (a Game.Core function).
-- It is stored because rank is read constantly (ability gates, item effectiveness
-- scaling) and recomputing the curve on every read is wasteful. The award-XP
-- transaction recomputes rank and writes both atomically, so they never desync.
-- rank is capped at the proficiency's max_rank (enforced in the award path).
CREATE TABLE character_proficiencies (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id   uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    proficiency_id uuid NOT NULL REFERENCES necro_content.proficiency_definitions(id),
    current_xp     bigint NOT NULL DEFAULT 0,   -- total accumulated XP in this proficiency
    rank           int NOT NULL DEFAULT 1,      -- denormalized from current_xp via the curve
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (character_id, proficiency_id),
    CHECK (current_xp >= 0),
    CHECK (rank >= 1)
);
CREATE INDEX ix_character_proficiencies_character ON character_proficiencies(character_id);


-- -----------------------------------------------------------------------------
-- Triggers (updated_at)
-- -----------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON container_instances
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_instances
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON item_instance_affixes
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON character_equipment
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON character_proficiencies
    FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);


-- -----------------------------------------------------------------------------
-- Equip-slot validation
-- -----------------------------------------------------------------------------
-- An item's allowed equip slot is determined by its definition
-- (items.category_id -> item_categories.slot_id). This trigger rejects any equip
-- whose target slot doesn't match the item's allowed slot, and rejects equipping
-- a non-equippable item (category slot null) -- so a helmet can never occupy
-- main_hand, regardless of app code. (When multi-slot items arrive -- one-handers
-- in main OR off hand, dual ring slots -- widen this from '=' to a membership
-- check against the allowed set.)
CREATE OR REPLACE FUNCTION necro_player.enforce_equip_slot()
RETURNS trigger AS $$
DECLARE
    allowed_slot uuid;
BEGIN
    SELECT ic.slot_id
      INTO allowed_slot
      FROM necro_player.item_instances ii
      JOIN necro_content.items i ON i.id = ii.item_id
      LEFT JOIN necro_content.item_categories ic ON ic.id = i.category_id
     WHERE ii.id = NEW.item_instance_id;

    IF allowed_slot IS NULL THEN
        RAISE EXCEPTION 'item instance % is not equippable (its category has no slot)', NEW.item_instance_id;
    END IF;

    IF allowed_slot <> NEW.slot_id THEN
        RAISE EXCEPTION 'item instance % cannot be equipped in that slot (allowed slot %)', NEW.item_instance_id, allowed_slot;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_equip_slot
    BEFORE INSERT OR UPDATE ON necro_player.character_equipment
    FOR EACH ROW EXECUTE FUNCTION necro_player.enforce_equip_slot();


-- -----------------------------------------------------------------------------
-- Table comments
-- -----------------------------------------------------------------------------
COMMENT ON SCHEMA necro_player IS 'Runtime per-character INSTANCE state (mirror of necro_content definitions). Hot/ephemeral state lives in Redis; this is the durable tier.';
COMMENT ON TABLE container_instances IS 'A character/world container instance of a necro_content.storage_types kind (backpack/bank/corpse). Holds resolved slot_count; corpses are just a container with the full-loot flags.';
COMMENT ON TABLE characters IS 'Durable character identity + periodic-snapshot state. Live position/HP/buffs are Redis; account_id is a logical ref to the account tier.';
COMMENT ON TABLE item_instances IS 'A specific item that exists in the world: references its necro_content.items definition + stores per-instance durability, stack, and location (container+slot, null when equipped or on the ground). Moves between containers without losing identity; durability/affixes travel with it.';
COMMENT ON TABLE character_equipment IS 'What a character has equipped, one row per typed named slot (references necro_content.equipment_slots). One item per slot; an item can be equipped in only one place.';
COMMENT ON TABLE character_proficiencies IS 'Per-character rank + accumulated XP in each trained proficiency (the player half of proficiency_definitions). Every XP event (gather/craft/combat) lands here; rank is denormalized from current_xp via the curve.';
COMMENT ON TABLE item_instance_affixes IS 'Affixes actually rolled onto an instance (rolled_value within the affix definition''s range). Same base item, different rolls per drop.';


-- -----------------------------------------------------------------------------
-- Sample data (development / illustration -- NOT designer content)
-- -----------------------------------------------------------------------------
-- Unlike necro_content seeds (authored game data), these are example RUNTIME rows
-- showing the instance shape: one character with a backpack, a few item instances
-- (one in the bag, one equipped, one stacked), a rolled affix, and trained
-- proficiencies.

-- A character (account_id is a placeholder logical ref to the account tier).
INSERT INTO characters (id, account_id, name, race_id, last_zone_id, playtime_secs) VALUES
    ('11111111-1111-1111-1111-111111111111',
     '00000000-0000-0000-0000-0000000000a1',
     'Bremmar',
     (SELECT id FROM necro_content.races WHERE key='human'),
     (SELECT id FROM necro_content.zones WHERE key='elderholt'),
     7200);

-- Bremmar's backpack (a 16-slot character-scoped container).
INSERT INTO container_instances (id, owner_character_id, storage_type_id, slot_count) VALUES
    ('33333333-3333-3333-3333-333333333331',
     '11111111-1111-1111-1111-111111111111',
     (SELECT id FROM necro_content.storage_types WHERE key='backpack'), 16);

-- Three item instances, now LOCATED:
--   1. a plain iron sword -- in the backpack, slot 0
--   2. a SECOND iron sword that rolled "Honed" -- EQUIPPED (container null)
--   3. a stack of 3 small health potions -- in the backpack, slot 1
INSERT INTO item_instances (id, item_id, durability_current, stack_qty, container_id, container_slot) VALUES
    ('22222222-2222-2222-2222-222222222221',
     (SELECT id FROM necro_content.items WHERE key='iron_sword'),
     (SELECT max_durability FROM necro_content.items WHERE key='iron_sword'), 1,
     '33333333-3333-3333-3333-333333333331', 0),
    ('22222222-2222-2222-2222-222222222222',
     (SELECT id FROM necro_content.items WHERE key='iron_sword'),
     (SELECT max_durability FROM necro_content.items WHERE key='iron_sword'), 1,
     NULL, NULL),
    ('22222222-2222-2222-2222-222222222223',
     (SELECT id FROM necro_content.items WHERE key='small_health_potion'),
     NULL, 3,
     '33333333-3333-3333-3333-333333333331', 1);

-- The second sword's rolled affix: "Honed" rolled at +18% attack_power.
INSERT INTO item_instance_affixes (instance_id, affix_id, rolled_value) VALUES
    ('22222222-2222-2222-2222-222222222222',
     (SELECT id FROM necro_content.affix_definitions WHERE key='honed'),
     0.18);

-- Bremmar equips the Honed sword in his main hand.
INSERT INTO character_equipment (character_id, slot_id, item_instance_id) VALUES
    ('11111111-1111-1111-1111-111111111111',
     (SELECT id FROM necro_content.equipment_slots WHERE key='main_hand'),
     '22222222-2222-2222-2222-222222222222');

-- Trained proficiencies: some Sword (from combat) and Mining (from gathering).
INSERT INTO character_proficiencies (character_id, proficiency_id, current_xp, rank) VALUES
    ('11111111-1111-1111-1111-111111111111',
     (SELECT id FROM necro_content.proficiency_definitions WHERE key='sword'), 4200, 14),
    ('11111111-1111-1111-1111-111111111111',
     (SELECT id FROM necro_content.proficiency_definitions WHERE key='mining'), 980, 7);
