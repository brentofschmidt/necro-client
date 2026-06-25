namespace Necro.Core.Stats
{
    /// <summary>
    /// A single change to a stat, emitted by ANY source — race, attribute derivation,
    /// gear intrinsic modifiers, rolled affixes, buffs, proficiency effectiveness.
    /// Everything that changes a number produces these; the resolver applies them all
    /// through one pipeline, so no source is special-cased.
    /// </summary>
    public readonly struct Modifier
    {
        /// <summary>Target stat key (e.g. "attack_power"). Resolved from content stat_definitions.</summary>
        public readonly string StatKey;
        public readonly ModifierType Type;
        public readonly double Value;
        /// <summary>Where it came from, for debugging/audit (e.g. "Honed (Iron Sword)").</summary>
        public readonly string Source;

        public Modifier(string statKey, ModifierType type, double value, string source = null)
        {
            StatKey = statKey;
            Type = type;
            Value = value;
            Source = source;
        }
    }
}
