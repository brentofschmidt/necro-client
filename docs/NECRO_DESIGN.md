# Necro — Design & Architecture (Living Document)

> A running record of design decisions and their *rationale* for the Necro MMORPG.
> The SQL files capture **what** the schema is; this captures **why**. Append to it
> as decisions are made. When a decision changes, update the entry and note what
> changed, so the reasoning never has to be reconstructed from memory.

Last updated: 2026-06 · Status: pre–vertical-slice (schemas complete, integration not started)

---

## 0. What Necro Is

A hardcore, full-loot PvP MMORPG. Solo indie project. The full-loot economy is the
core: items are the economy, the economy is what cheaters attack, and item identity
must be dupe-resistant. Design pillars (from GAME_DESIGN.md): WoW-style tab-target
combat, Tarkov gear loops, RuneScape skill progression, gear-primary progression
(Valheim-inspired), proficiencies as ability-unlock gates, shared stamina pool, an
asymmetric combat tag system, and a tiered drop/craft split (tiers 1–3 drop as
finished gear, tiers 4–6 drop as crafting components).

---

## 1. Architecture Overview

### 1.1 The four-database split
- **accounts** — identity/auth tier.
- **game content** (`necro_content` schema) — static, designer-authored DEFINITIONS.
- **game player** (`necro_player` schema) — runtime, per-character INSTANCE state.
- **messages/social** — cross-game social tier.
- Separate **market/order-book DB** for the economy (append-only events + double-entry ledger).

`necro_content` and `necro_player` are **schemas in the same Postgres database**, so
cross-schema FKs are real and enforced (`necro_player.item_instances.item_id
REFERENCES necro_content.items(id)`).

### 1.2 The content/state line (the guiding principle)
The single most-applied rule in the whole design:

> **Definitions live in content; instances/runtime state live in player (or Redis).**

A definition says what a *kind* of thing is; an instance is a *specific* one that
exists at runtime. This mirror is exact:

| content (definition)            | player (instance)                                  |
|---------------------------------|----------------------------------------------------|
| `items`                         | `item_instances` (durability, stacks, rolled affixes, location) |
| `affix_definitions`             | `item_instance_affixes` (the value that *did* roll) |
| `storage_types`                 | `container_instances` + slot contents              |
| `proficiency_definitions`       | `character_proficiencies` (rank + xp)              |
| `resource_nodes`                | node depletion state (mostly Redis)               |
| `npc_definitions`               | live NPC instances (mostly Redis)                 |
| `zones`                         | live positions / populations (Redis)              |

World **geometry** is the engine (Unity), not SQL. SQL names zones by identity; the
engine owns terrain/collision/coordinates.

### 1.3 Persistence tiers (server-authoritative; client never writes directly)
- **Ephemeral** — live positions, current HP, buffs, cooldowns, threat, combat state,
  live node/NPC instances. **Redis / RAM.** Regenerated or reset on restart; never durable.
- **Periodic-snapshot** — last-known position/facing/camera, current resources. Written
  on logout / dirty-flag batch, read on login. Survives restart but may lose the last
  few seconds on a hard crash (acceptable for non-dupe-sensitive state).
- **Durable-immediate (transactional)** — inventory moves, trades, item create/destroy,
  currency. Atomic Postgres txns. Full-loot makes this correctness-critical: an item
  must never dupe or vanish. (Escrow → commit → reflect pattern for trades/custody.)

### 1.4 Client/server stack
- **Game.Core** — shared C# library (netstandard2.1), used by BOTH the Unity client and
  the authoritative server. Rejected C++/UE5 specifically to preserve this shared-language
  advantage.
- **Unity client**, URP (not HDRP/Built-in); leans on Unity 6 GPU Resident Drawer +
  GPU Occlusion Culling for MMO render demands.
- **Fish-Net** networking; fixed **20 Hz** tick loop, seven ordered phases; component
  composition over inheritance.
- **quicktype pipeline** generates C#/TS types from a game-facing JSON shape (see §6).

---

## 2. The Stat Spine (core of content)

Everything that changes a number emits **modifiers** against a shared
`stat_definitions` registry. One resolver in Game.Core applies PoE-style math:

```
final = (base + Σflat) × (1 + Σincreased) × Π(1 + more_i)  → override → clamp
```

- The **combination rule** is driven by `modifier_type` (flat / increased / more / override).
- "percent vs flat" is TWO separate things: `modifier_type` (add-vs-scale) on the
  modifier, and `value_type` on the TARGET stat (percent stored as a rate; 0.005 = 0.5%).
- Every source — race, attribute derivation, gear, rolled affixes, buffs, proficiency
  effectiveness — feeds the same pipeline. No special-cased math anywhere.

**Stats are derived, not stored.** A character's final attack_power/health/resistances
are *computed* by the resolver from their sources. There is no `character_stats` table;
storing computed stats would let them desync from the gear that produces them. (Current
*resource pools* — current HP/mana — are the one mutable exception, and they're Redis.)

### 2.1 Attributes → stats
- **STR/DEX/INT → melee/ranged/magic power** (the power trio — each its own gear pool, no contention).
- **CON → health_max**, **WIS → mana_regen**, **CHA → willpower** (CC resistance — see §3.3).
- Secondaries (crit_chance, crit_damage, haste, armor, dodge_chance) are SHARED so hybrids
  are taxed only on power.

### 2.2 Power trio
Three power scalars — `attack_power` (STR/melee), `ranged_power` (DEX/ranged),
`spell_power` (INT/magic) — so each combat style has its own gear pool and they don't
compete for loot.

### 2.3 Healing rides spell_power — NO heal_power stat
Decided after long debate. WoW-now and D&D-5e both use a shared casting stat;
WoW-classic's separate +Healing stat was abandoned for good reasons. Healer identity =
gated ability kit + proficiency investment, NOT a stat. Sharing spell_power means healers
are never loot-starved, and the crafting-primary economy further dissolves contention.
(A "+% healing done" *secondary* remains available later if wanted — never a 4th pillar.)

### 2.4 Damage types & resistances
13 damage types (D&D-granular: bludgeoning/piercing/slashing/fire/cold/lightning/acid/
poison/thunder/necrotic/radiant/force/psychic). Each has a `resist_stat_id` → a matching
`<type>_resistance` stat (percent, capped at 0.75). Per-type because resist lives on
`damage_types`, not categories. Combat reads the resist stat to mitigate that damage type.

---

## 3. Notable Design Decisions (with rationale)

### 3.1 Proficiencies do exactly TWO things
1. **Scale item utilization** — `items.governing_proficiency_id` + effectiveness scaling
   (`clamp(rank / proficiency_full_rank)`), conditional on wielding the item.
2. **Gate abilities** — `ability_proficiency_requirements` (min_rank).

We explicitly **removed `proficiency_rank_modifiers`** (passive unconditional stat bonuses
per rank). Reason: "Sword rank → +attack power" is incoherent — being good at swords
shouldn't buff your bare fists. "Use the item better" is already covered by effectiveness
scaling; "unlock moves" by the gate. A third unconditional-bonus mechanism only produced
the incoherent case, so it was cut. This sharpened the model: *scale item use + gate
abilities*, full stop.

32 proficiencies total: 4 armor + 8 weapon + 8 magic schools + 5 gathering + 7 production.

### 3.2 Magic schools = the 8 D&D schools
Abjuration/conjuration/divination/enchantment/evocation/illusion/necromancy/transmutation,
seeded as proficiency rows. Healing gates on **Evocation** (D&D-accurate). `magic_schools`
table is an informational/lore EXTENSION (1:1 with the school proficiency), not a duplicate.

### 3.3 Charisma = willpower (CC resistance)
CHA was a dead attribute. Made it the **crowd-control resistance** stat: `willpower`
(percent, 0.75 cap), `CHA → willpower`. Rationale: Enchantment is literally "domination
of will," CC is the scariest thing in full-loot PvP (chain-stunned = dead = lose
everything), so a stat that resists CC is genuinely build-defining — the bar a non-dead
attribute must clear. Parallels the resistance stats; combat reads `willpower` to shorten
incoming CC duration. Doesn't touch the power pillars (so CHA isn't a 2nd caster stat).

### 3.4 Tags vs categories
- `item_categories` = ONE per item, carries `slot_id` (the equip slot).
- **Tags** = open-ended, many-per-item; the rules/eligibility layer (melee/caster/ranged,
  schools, behavioral flags). Tag what the *type* can't say; never mirror item_type.
- Affix eligibility keys off tags (`affix_tags` + `item_tags`).

### 3.5 Items are items
Gear, materials, consumables, bags — all rows in `items`. This collapses huge amounts of
would-be special-casing:
- **Loot tables** just point at items → one structure handles gear-focused or
  crafting-focused tables; the difference is only *which* items you list.
- **Recipes** consume items and output an item → smelting (ore→ingot) is "just a recipe,"
  same table as crafting and cooking.
- **Resource nodes** yield items via a loot table → "ore, sometimes a gem" is a weighted
  item list, reusing loot.

### 3.6 Loot tables
`loot_tables` + `loot_entries`. An entry points at a **base item** (affixes roll
separately onto the dropped instance — loot decides *what base*, affixes decide *what's
on it*; two orthogonal layers). Entries carry both:
- `weight` — relative odds *if* the table picks one (weighted-pick mode).
- `drop_chance` (default 1.0) — standalone odds this entry drops (independent mode).
Either or both, decided by how you populate it. A `rolls` count can be added later.

### 3.7 Crafting
`recipes` (output item + qty, optional crafting-proficiency gate, `success_chance`
default 1.0, `craft_xp`) + `recipe_ingredients`. **Fixed output** (deterministic craft =
reliable economy baseline; raids are a thin +1–5% prestige edge). Forward-compatible to
affix/quality-tier crafted output later (a crafted item is just an instance, so the affix
roller can apply to it) without restructuring.

### 3.8 Inventory = hybrid slots + weight (Tarkov-style)
- Bags grant indexed slots (`container_defs.slot_count`); weight cap = `carry_weight` stat
  (STR-derived). Items have their own `weight`; bag weight counts toward carry.
- `storage_types` (backpack/bank/stash/guild_bank/corpse/chest) = rules-as-data: scope,
  weight_limited, drops_on_death, lootable_by_others, persistent, base_slot_count.
- **Corpse is just a container** with the full-loot flags (lootable_by_others,
  drops_on_death=false [the corpse *is* the drop], non-persistent). No special table —
  full-loot death = create a corpse container, move droppable instances into it.
- **Equipped gear is the typed-named-slot exception**, NOT a storage_type (see §4.3).

---

## 4. Player DB (runtime instances)

### 4.1 Characters
Durable identity + **periodic-snapshot scene-resume** fields: `last_pos_x/y/z`,
`last_facing` (yaw), `cam_yaw/cam_pitch/cam_zoom` (free-orbit camera, WoW-style).
- `pos` + `facing` are **authoritative** (facing drives combat arcs / prevent_turn CC).
- `cam_*` are **client view state** that merely resumes with the character (no other
  player sees your camera; the server doesn't simulate it). Stored on the character
  because the user wants per-character scene resume; same write cadence as position.
- Camera is **yaw/pitch/zoom** (orbit model), not full (x,y,z) rotation. Free camera
  (orbits independently of facing) is why camera orientation is stored, not derived.
- `real` type to match Unity / Game.Core float `Vector3` (clean quicktype round-trip).
- `account_id` is a **logical uuid ref** (no FK) so the player schema doesn't hard-couple
  to account internals. Cross-*schema* refs (into `necro_content`) ARE real FKs.

### 4.2 Item instances
`item_instances` references `necro_content.items` for everything static; stores only
per-instance state: `durability_current`, `stack_qty`, and **location** (`container_id` +
`container_slot`, nullable). Rolled affixes in `item_instance_affixes` (affix_id +
`rolled_value`). Location is mutable, NOT identity — an item moves bag→bank→corpse→ground
via UPDATE while its durability + affixes travel with it (full-loot trade-history durability).

### 4.3 Containers vs equipment (two different models)
- **`container_instances`** — indexed, interchangeable slots; instance of a `storage_type`.
  Holds resolved `slot_count`. Item location for containers lives on `item_instances`.
- **`character_equipment`** — NAMED, TYPED slots (head/main_hand/…), referencing the
  content `equipment_slots` vocabulary. One row per worn item. UNIQUE(character, slot) +
  UNIQUE(item_instance). An equipped item's `container_id` is null.
- **Equip-slot validation trigger** (`enforce_equip_slot`): rejects equipping an item
  whose category slot doesn't match the target slot (helmet can't go in main_hand) and
  rejects non-equippable items. DB-enforced, not just app-enforced — right strictness for
  full-loot. When multi-slot items arrive (one-handers main/off, dual rings), widen the
  `=` check to set membership.

### 4.4 Character proficiencies (rank + XP)
`character_proficiencies` (character_id, proficiency_id, current_xp, rank). The destination
for ALL xp events. **rank is denormalized from current_xp** via the curve (read constantly
for gates/scaling; the award-XP txn recomputes and writes both atomically). **Lazy
creation**: a row exists only once a proficiency is trained; absent = rank 1. The
RuneScape-style "journal" (all skills shown, untrained at 1) is a **left-join against the
32 content definitions** defaulting misses to 1 — NOT 32 stored placeholder rows. Lazy
also survives adding new proficiencies without a per-character backfill.

---

## 5. Progression (RuneScape model)

Every action trains its governing proficiency. The unified `proficiency_definitions` table
(combat/magic/gathering/crafting all one rank scale) is shaped for exactly this.

- **Gathering** → explicit `gather_xp` on `resource_nodes` (RS authors per-resource XP).
- **Crafting** → explicit `craft_xp` on `recipes`.
- **Combat** → **derived, 1:1 with damage dealt** (no per-action value needed). *Which*
  proficiency trains = the weapon's `governing_proficiency_id`; *how much* = damage. A
  fixed 1:1 ratio (chosen over RS's 4:1 for directness).
- **`abilities.xp_multiplier`** (default 1.0) — the one per-ability tuning knob, so a
  signature/finisher can train faster. 1.0 everywhere = pure 1:1, no behavior change.
- XP **award multipliers** (double-XP weekend, player 2x perk) are runtime, NOT content:
  a global/event modifier + player-state buff applied in the award path. Pipeline:
  `base_xp × ability.xp_multiplier × player bonuses × event multipliers`. Only the first
  factor is content.

Proficiency `max_rank` (default 100) is content. Current rank + accumulated XP is
player-state. The XP curve is a Game.Core function (a `proficiency_xp_curve` table only if
per-skill curves are ever wanted).

---

## 6. World & Spawning

### 6.1 Zones (seamless, WoW-style)
`zone_types` (continent/region/subregion — explicit tier, queryable, not inferred from
nesting depth) + `zones` (nested via `parent_zone_id`, `biome_id`, level hints). Geometry
is the engine; SQL names regions by identity.

Sample world: **Corremyr** (continent) → **The Elderholt** (region, ancient forest) →
**Emberpeak Slopes** (mountain subregion), **Old Hollow** (forest subregion), **Goblin
Caves** (cavern subregion). (Names verified original vs. existing franchises.)

### 6.2 Biomes — orthogonal to roster
`biomes` lookup (forest/mountain/cavern/…) + `zones.biome_id`. Biome describes *what kind
of place* an area is; it does **NOT** constrain what spawns there. The per-area resource
**roster** is set entirely by `spawn_definitions` rows. So two mountains (same biome) can
have totally different ore (one gold/silver, one copper/iron) — the roster is developer-set
spawn rules, not a biome property.

### 6.3 Spawning — per-resource, per-subregion
`spawn_definitions` (zone + EXACTLY-ONE-OF npc_definition / resource_node, via CHECK +
`max_count` + `respawn_secs`). Decision: **per-node control** — one spawn rule per resource
per subregion, each independently capped (rejected shared-weighted-pool and
category-pool models in favor of individual control). The "pool unit" = (subregion +
resource). Node positions are **engine-generated within the subregion's valid terrain** (no
authored node map — WoW-style roaming spawns, "random within the area"). The DB holds the
*budget + cadence*, not coordinates.

### 6.4 Node depletion persistence (runtime — NOT YET BUILT)
Persistent depletion across restarts is wanted. Model: a thin **pool ledger** keyed by
`spawn_definition_id` — `active_count` + `next_spawn_at` per (subregion, resource) — NOT
per-node rows. **Snapshot tier** (Redis-hot during play, batched to Postgres, survives
restart; a hard crash losing a few seconds of depletion is harmless — not dupe-sensitive).
Live node positions stay ephemeral/Redis and roam. A farmed-out pool comes back still
partially depleted because the *count* persisted, even though positions changed.

---

## 7. NPCs (content-only, instances later)

`creature_types` lookup + `npc_definitions` (identity, level, disposition, loot_table) +
`npc_stats` (base statline as (stat,value) on the shared registry) + `npc_abilities`
(reuses player ability defs). An NPC reuses stats + abilities + loot — nothing new
invented. This also unblocks **Conjuration summons** (a summon = "spawn an npc_definition
you own"). Live NPC instances (position, current HP, AI, spawning, threat) are game-state —
mostly Redis, the sibling of node instances. Definition here; live combatant later.

---

## 8. Identity: uuid vs key vs handle (the ID model)

Three representations, each where its strength matters:

- **uuid** — DATABASE identity (PKs, FK joins). Good for storage, distributed inserts,
  global uniqueness. Environment-local (different per DB). Never appears in game logic.
- **key** (string, e.g. `"iron_sword"`) — AUTHORING/CODE/TRANSPORT identity for *content
  definitions*. Readable, **stable across all environments and rebuilds**, refactor- and
  merge-safe. This — not speed — is the real reason for keys. The `key↔uuid` mapping is
  just a dictionary built once at content load (both columns are in the same row); it's
  consulted ONLY at the DB load/save boundary, never in the tick loop.
- **int handle** (array index, assigned at load) — RUNTIME identity for the hot path /
  network wire. Cheap to compare/sync. **Ephemeral** (regenerated each load — never
  authored or persisted). Optional optimization; an object reference resolved at load
  often suffices for in-memory gameplay. Mainly earns its place in the network format.

Key insight: keys are for *legibility and stability*, not performance. The performance axis
is uuid-vs-**int** (16 bytes vs 4) and it matters for **memory/network at scale** (thousands
of entities × 20 Hz), NOT for per-lookup speed (content refs resolve once at load).

WoW comparison: WoW uses a stable **integer** as the content identity (e.g. itemID 19019) —
filling the role of our *key* (stable, authored), and because it's already an int it also
serves as the runtime/wire ID (no separate handle). We split into key+uuid for
environment-stability and readability; WoW carries one integer because it's hand-assigned
(stable across environments) and tooling translates IDs→names.

### 8.1 Instance identity vs content ref (no lookup for instances)
An `item_instances` row carries BOTH:
- `id` = **instance uuid** (this specific sword) — minted at creation (drop/craft),
  carried in memory and persisted as-is. **Saving instance state needs no lookup** — the
  game already holds the uuid; e.g. `UPDATE item_instances SET durability_current=95 WHERE
  id=<uuid>`. The instance uuid never left uuid-space, so there's nothing to translate.
- `item_id` = **content ref** (which definition) — THIS is where key↔uuid translation
  happens, only at load/save, only for FK columns.

WoW does the same split: shared `itemID` (content) + a unique server-minted **GUID**
(instance, a packed type-tagged integer). Our instance uuid = WoW's item GUID; minted at
creation, never changes, which is exactly what lets a *specific* item be tracked across
players/mail/bank — and what makes full-loot custody dupe-resistant.

---

## 9. Roadmap / Not Yet Built

### 9.1 Immediate next step — the vertical slice
Build ONE thread end to end before wiring in everything: **log in → see character in the
Elderholt → open bag → see the Honed sword → equip it.** Everything this touches is already
defined. Restart sequence: new URP project → lock schema→quicktype→Game.Core pipeline →
loader seam from a LOCAL JSON snapshot → render in inventory UI → validate against live DB.
DO NOT fully wire all 60 tables first — let the running slice reveal where the schema/types
want adjusting, then widen. (quicktype slice already proven: see
`content_catalog.sample.json` / `character_snapshot.sample.json` → `ContentCatalog.cs` /
`CharacterSnapshot.cs`. Newtonsoft for Unity; samples must exercise nullables + non-empty
arrays or inference goes wrong.)

### 9.2 Item custody / provenance ledger (build WITH the trade system)
For dupe / RMT / cheat auditing in a full-loot economy. An **append-only**
`item_custody_events` log — one immutable row per economically-meaningful custody change:
`item_instance_id`, `from_character_id`/`to_character_id` (nullable = world/mint),
`event_type` (minted/looted/traded/mailed/vendored/dropped/picked_up/destroyed/crafted),
`occurred_at`, context (container/zone, counterparties for RMT correlation).
- **Append-only, never mutate** — dupes show up as *impossible histories* (one instance in
  two chains, "looted" with no "dropped", non-conserved quantities); current state alone
  can't reveal them, and a rewritable log is worthless.
- **NOT in the live state DB hot path** — high-volume append-only store (separate table at
  minimum, ideally a separate audit DB / event stream / warehouse). Log only value-bearing
  transfers (not bag-slot reshuffles).
- **Emitted by the durable-immediate trade/custody txn** — the same atomic op that moves the
  item appends the event, so the log can never disagree with reality. The never-changing
  instance uuid is what makes following one item's whole life possible.
- **Timing**: build alongside the trade/custody transactional path — not before the slice
  (can't dupe a game that doesn't run yet).

### 9.3 Attributes (discussed, deferred)
Whether players *allocate* attributes (point-buy / per-level) or attributes are purely
race + gear. If allocated → a `character_attributes` table (the stored INPUT to stat
derivation, not computed output). If race+gear only → nothing to store. **Open question to
resolve before it feeds the resolver.**

### 9.4 Other deferred / optional
- **Quests** — top of the dependency stack; need the player-progress tracker (game-state)
  and lean hardest on world. Definition-half buildable but better after the player DB +
  the trade/economy paths. Objective types: kill/gather work today (npc/item refs);
  visit/talk need finer world/placement.
- **Currency / wallet** — player-tier balances + the market/order-book DB.
- **Node depletion pool ledger** — see §6.4.
- **Live entity runtime** — NPC/node/projectile instances, AI, spawning, threat (Redis).
- **Optional, build only on demand** (nothing requires them): gear sets, sockets/gems,
  factions/reputation, achievements/titles, talent trees, school-damage-bonus gear,
  per-control-type willpower weighting, multi-slot equipment (dual ring / main-off hand).
- **Basic-attack damage** still flat (open combat-formula decision: scale off power stat or
  weapon base_damage). **Ability AoE/targeting** (radius/cone/projectile/channel) — abilities
  are single-target only; cheap contained fix.

---

## 10. Conventions (schema)

- PK `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`; FKs are uuid. `pgcrypto` for uuids.
- Every table: `created_at`/`updated_at timestamptz`, with a `moddatetime` BEFORE UPDATE
  trigger. (`moddatetime` extension.)
- Lookup tables: `id` + `key text UNIQUE` + `name`. Code references lookups by KEY,
  resolving key→id once at load.
- Each table has an inline `--` header comment AND a `COMMENT ON TABLE`. Seeds sit under
  their CREATE TABLE; FKs resolved by key via subqueries.
- One run-once file per schema (no migrations during initial build); merges fold in
  dependency order. Verified with `sqlglot.parse(..., read="postgres")` (CREATE EXTENSION /
  SET search_path / plpgsql bodies harmlessly fall back to Command — not errors).
- Deploy order: `necro_content` (creates the schema, sets search_path) THEN `necro_player`
  (cross-schema FKs into content). Audit caught one real bug this way: player referenced
  `necro_content.races` but the table is `race_definitions` — sqlglot can't see cross-schema
  resolution, so a live `psql` apply is the real final gate.

---

## Changelog
- 2026-06 — Initial living doc. Captures: content/state line, stat spine, power trio,
  healing-via-spell_power, Charisma→willpower, proficiency model (rank-modifiers removed),
  loot/crafting/gathering, RS progression + XP model, world/biomes/per-resource spawning,
  NPCs, containers/equipment + equip trigger, scene-resume/camera, the uuid/key/handle ID
  model + instance-vs-content identity, quicktype slice, and the roadmap (vertical slice,
  custody ledger, attributes).
