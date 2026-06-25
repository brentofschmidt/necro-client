# Game.Core — Vertical Slice

The headless "game dev" half of Necro's vertical slice: load a character + content
from local JSON, resolve item definitions by key, and compute a stat through the
modifier pipeline — the same code path the Unity client and the server will share.

Proves the seam **schema → quicktype JSON → Game.Core → resolved stat** before any
engine work. (The data shape is the quicktype slice: `content_catalog.sample.json`,
`character_snapshot.sample.json` → `ContentCatalog.cs`, `CharacterSnapshot.cs`.)

## What the slice does

`log in → see Bremmar in the Elderholt → open bag → see the Honed sword → equip it`,
ending in: his `attack_power` reflects the rolled **+18% increased** from the sword
(50 → 59), and drops back to 50 unequipped.

## Layout

```
Stats/      ModifierType, Modifier, StatResolver   — the PoE pipeline (the heart)
Content/    ContentCatalog (DTOs), GameDataRegistry — definitions, key→def at load
Player/     CharacterSnapshot (DTOs)                — instance-side runtime state
Runtime/    CharacterModel                          — joins instances↔definitions, resolves stats
Demo/       Program, *.csproj, sample JSON          — runnable proof
```

`GameCore.Slice.csproj` is the shared library (**netstandard2.1**, so the one assembly
is referenced by both the Unity client and the server). `Demo/Demo.csproj` is a
throwaway console host (net8.0) that runs the slice headless.

## Run

```
# from GameCore.Slice/
dotnet run --project Demo
```

Expected output (verified via an equivalent reference implementation):

```
Character: Bremmar (human) in elderholt
Inventory:
  [backpack 0] Iron Sword
  [backpack 1] Small Health Potion x3
  [EQUIPPED main_hand] Iron Sword (Honed +18%)
attack_power:
   Increased   +0.18   <- Honed (Iron Sword)
   base 50 (STR, stubbed)
   => 59.0 with the Honed sword equipped
   => 50.0 with nothing equipped
   Honed sword contributes +9.0.
```

## How it maps to the design

| code | schema / decision |
|---|---|
| `StatResolver` | the stat spine: `(base+Σflat)×(1+Σincreased)×Π(1+more)→override→clamp` |
| keys everywhere, no uuids | content refs are keys; uuids stay at the DB boundary |
| `GameDataRegistry` | "resolve key→def once at load" |
| `ItemInstance` + `RolledAffix` | `item_instances` + `item_instance_affixes` (rolled per-instance) |
| stats not stored on the character | stats are DERIVED — recomputed from sources, never persisted |

## Honest stubs (next wiring steps)

- **`baseValue` for attack_power is a stand-in (50)** for the STR-derived base, until
  the attribute model is decided (see NECRO_DESIGN.md §9.3). The pipeline + affix
  application are real; only the base source is stubbed.
- **Intrinsic item modifiers** (a weapon's flat attack_power) aren't in the sample
  catalog yet — they fold into `ModifiersFrom` the same way affixes do.
- **Loader reads local JSON.** Swapping to a live DB means replacing the JSON source
  with a SQL `json_build_object`/`json_agg` query that emits the same shape — the DTOs
  and resolver don't change.
- **Newtonsoft.Json** for Unity compatibility; restore needs network access (nuget).
