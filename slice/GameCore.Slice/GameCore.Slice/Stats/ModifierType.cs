namespace Necro.Core.Stats
{
    /// <summary>
    /// How a modifier combines into a stat. Drives the resolver pipeline:
    /// final = (base + Σflat) × (1 + Σincreased) × Π(1 + more_i) → override → clamp.
    /// Stored in content as a lookup key (modifier_types.key); resolved to this enum
    /// once at load.
    /// </summary>
    public enum ModifierType
    {
        /// <summary>Added to the base before scaling (e.g. +5 attack_power).</summary>
        Flat,
        /// <summary>Summed with other 'increased', applied as one (1 + Σ) multiplier (additive %).</summary>
        Increased,
        /// <summary>Each applied as its own (1 + value) multiplier (multiplicative %).</summary>
        More,
        /// <summary>Replaces the computed value outright (last override wins).</summary>
        Override
    }
}
