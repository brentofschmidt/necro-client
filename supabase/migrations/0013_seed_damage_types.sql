-- ============================================================
-- 0013_seed_damage_types.sql
--
-- Seeds necro_content.damage_types with the full 13-type damage list
-- from D&D 5e: 3 physical (Bludgeoning, Piercing, Slashing) + 10
-- elemental/magical. Descriptions are paraphrased from the SRD.
--
-- display_color is a chosen hex per type — these flow through to UI tints
-- (combat log, tooltips, resistance icons). Picked to be distinguishable
-- on the dark theme and to match the conventional D&D associations.
--
-- resistance_stat is left empty until necro_content.stats is seeded.
--
-- IDs use lowercase slugs to match the convention from prior seeds.
-- Idempotent via ON CONFLICT (id) DO UPDATE.
-- ============================================================

insert into necro_content.damage_types (id, display_name, description, display_color, is_physical) values
    -- Physical
    ('bludgeoning', 'Bludgeoning', 'Blunt-force impacts from clubs, hammers, falls, or grappling.',           '#8B7355', true),
    ('piercing',    'Piercing',    'Punctures and impalements from arrows, spears, and fangs.',              '#C0C0C0', true),
    ('slashing',    'Slashing',    'Slicing wounds from swords, axes, and claws.',                            '#B22222', true),

    -- Elemental
    ('acid',        'Acid',        'Corrosive damage from venom, alchemical reagents, and oozes.',            '#5DAD3F', false),
    ('cold',        'Cold',        'Freezing damage from ice storms, glacial breath, and biting wind.',       '#4FB8E8', false),
    ('fire',        'Fire',        'Burning damage from flame, lava, and incinerating spells.',               '#E84F1A', false),
    ('lightning',   'Lightning',   'Electrical damage from storms, sparks, and arcing energy.',               '#F4D71B', false),
    ('thunder',     'Thunder',     'Concussive sonic damage from thunderclaps and shockwaves.',               '#6F8AE8', false),

    -- Magical
    ('force',       'Force',       'Pure magical energy — the most rarely resisted damage type.',             '#B14FE8', false),
    ('necrotic',    'Necrotic',    'Withering damage that drains life force; the signature of undeath.',      '#4A1F4A', false),
    ('poison',      'Poison',      'Toxins delivered by venom, gas, or ingestion.',                           '#6FAA3A', false),
    ('psychic',     'Psychic',     'Damage to the mind from telepathic assault and dissonant whispers.',      '#E84FAE', false),
    ('radiant',     'Radiant',     'Searing light from celestial sources; the bane of the undead.',           '#F8E8A8', false)

on conflict (id) do update set
    display_name  = excluded.display_name,
    description   = excluded.description,
    display_color = excluded.display_color,
    is_physical   = excluded.is_physical;
