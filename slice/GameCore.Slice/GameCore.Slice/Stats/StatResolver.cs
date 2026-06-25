using System.Collections.Generic;

namespace Necro.Core.Stats
{
    /// <summary>
    /// The core stat pipeline shared by client and server. Collects every Modifier
    /// targeting a stat and folds them with PoE-style math:
    ///
    ///     final = (base + Σflat) × (1 + Σincreased) × Π(1 + more_i)  → override → clamp
    ///
    /// Stats are DERIVED, never stored — this is recomputed from sources on load and
    /// whenever gear/buffs change. Identical math for every stat and every source.
    /// </summary>
    public static class StatResolver
    {
        /// <summary>
        /// Resolve a single stat's final value from its modifiers.
        /// </summary>
        /// <param name="modifiers">All modifiers (any stat); only those matching statKey are used.</param>
        /// <param name="statKey">The stat to resolve.</param>
        /// <param name="baseValue">The stat's base (e.g. its default_val, or 0).</param>
        /// <param name="clampMin">Optional lower clamp (e.g. resistances 0).</param>
        /// <param name="clampMax">Optional upper clamp (e.g. resistances/willpower 0.75).</param>
        public static double Resolve(
            IEnumerable<Modifier> modifiers,
            string statKey,
            double baseValue = 0.0,
            double? clampMin = null,
            double? clampMax = null)
        {
            double flat = 0.0;
            double increasedSum = 0.0;
            bool hasOverride = false;
            double overrideValue = 0.0;

            // single pass: accumulate flat + increased, collect 'more' factors, track override
            var moreFactors = new List<double>();
            foreach (var m in modifiers)
            {
                if (m.StatKey != statKey) continue;
                switch (m.Type)
                {
                    case ModifierType.Flat:      flat += m.Value; break;
                    case ModifierType.Increased: increasedSum += m.Value; break;
                    case ModifierType.More:      moreFactors.Add(m.Value); break;
                    case ModifierType.Override:  hasOverride = true; overrideValue = m.Value; break;
                }
            }

            double final = (baseValue + flat) * (1.0 + increasedSum);
            for (int i = 0; i < moreFactors.Count; i++)
                final *= (1.0 + moreFactors[i]);

            if (hasOverride) final = overrideValue;

            if (clampMin.HasValue && final < clampMin.Value) final = clampMin.Value;
            if (clampMax.HasValue && final > clampMax.Value) final = clampMax.Value;

            return final;
        }
    }
}
