using System.Collections.Generic;
using Necro.Core.Content;
using Necro.Core.Player;
using Necro.Core.Stats;

namespace Necro.Core.Runtime
{
    /// <summary>
    /// The runtime join of a CharacterSnapshot (instances) with the GameDataRegistry
    /// (definitions). Resolves instance item keys to definitions, gathers Modifiers
    /// from equipped gear's rolled affixes, and computes stats through the resolver.
    /// This is the seam where "data" becomes "the character" — the client renders from
    /// it, the server simulates from it, both via Game.Core.
    /// </summary>
    public sealed class CharacterModel
    {
        private readonly GameDataRegistry _content;
        private readonly CharacterSnapshot _snap;
        private readonly Dictionary<string, ItemInstance> _instances;

        public CharacterModel(CharacterSnapshot snap, GameDataRegistry content)
        {
            _snap = snap;
            _content = content;
            _instances = new Dictionary<string, ItemInstance>();
            if (snap.ItemInstances != null)
                foreach (var ii in snap.ItemInstances) _instances[ii.Id] = ii;
        }

        public string Name => _snap.Name;
        public CharacterSnapshot Snapshot => _snap;

        public ItemInstance Instance(string id) => _instances[id];
        public ItemDefinition Definition(ItemInstance inst) => _content.Item(inst.ItemKey);

        /// <summary>
        /// Modifiers a single item instance contributes (its rolled affixes resolved
        /// against the affix definitions). Intrinsic item modifiers would also fold in
        /// here once those are in the catalog.
        /// </summary>
        public IEnumerable<Modifier> ModifiersFrom(ItemInstance inst)
        {
            if (inst.Affixes == null) yield break;
            var itemDef = _content.Item(inst.ItemKey);
            foreach (var rolled in inst.Affixes)
            {
                var def = _content.Affix(rolled.AffixKey);
                yield return new Modifier(
                    statKey: def.TargetStat,
                    type: ParseModifierType(def.ModifierType),
                    value: rolled.RolledValue,
                    source: $"{def.Name} ({itemDef.Name})");
            }
        }

        /// <summary>
        /// All modifiers from currently-equipped gear. (Buffs, race, and attribute
        /// derivations would also contribute here once wired — same pipeline.)
        /// </summary>
        public IEnumerable<Modifier> EquippedModifiers()
        {
            if (_snap.Equipment == null) yield break;
            foreach (var e in _snap.Equipment)
            {
                if (!_instances.TryGetValue(e.InstanceId, out var inst)) continue;
                foreach (var m in ModifiersFrom(inst)) yield return m;
            }
        }

        /// <summary>
        /// Resolve a stat for this character. baseValue stands in for the
        /// attribute-derived base (e.g. STR→attack_power) until attributes are wired;
        /// the pipeline itself is final.
        /// </summary>
        public double ResolveStat(string statKey, double baseValue = 0.0,
                                  double? clampMin = null, double? clampMax = null)
        {
            var mods = new List<Modifier>(EquippedModifiers());
            return StatResolver.Resolve(mods, statKey, baseValue, clampMin, clampMax);
        }

        private static ModifierType ParseModifierType(string key)
        {
            switch (key)
            {
                case "flat":      return ModifierType.Flat;
                case "increased": return ModifierType.Increased;
                case "more":      return ModifierType.More;
                case "override":  return ModifierType.Override;
                default: throw new System.ArgumentException($"unknown modifier_type '{key}'");
            }
        }
    }
}
