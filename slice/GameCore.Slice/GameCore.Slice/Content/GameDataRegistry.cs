using System.Collections.Generic;

namespace Necro.Core.Content
{
    /// <summary>
    /// The in-memory content catalog: key → definition, built ONCE at load. This is
    /// the realization of "resolve key→id/def once at load." After this, runtime code
    /// holds definition references (or could cook to int handles for the hot path);
    /// keys are only re-touched for logging/saving. The DB's uuids never reach here —
    /// the server translated content-ref uuids → keys on the way out of Postgres.
    /// </summary>
    public sealed class GameDataRegistry
    {
        private readonly Dictionary<string, ItemDefinition> _items;
        private readonly Dictionary<string, AffixDefinition> _affixes;

        public GameDataRegistry(ContentCatalog catalog)
        {
            _items   = new Dictionary<string, ItemDefinition>(catalog.Items?.Length ?? 0);
            _affixes = new Dictionary<string, AffixDefinition>(catalog.Affixes?.Length ?? 0);

            if (catalog.Items != null)
                foreach (var i in catalog.Items) _items[i.Key] = i;
            if (catalog.Affixes != null)
                foreach (var a in catalog.Affixes) _affixes[a.Key] = a;
        }

        public ItemDefinition Item(string key) =>
            _items.TryGetValue(key, out var d) ? d
            : throw new KeyNotFoundException($"unknown item key '{key}'");

        public AffixDefinition Affix(string key) =>
            _affixes.TryGetValue(key, out var d) ? d
            : throw new KeyNotFoundException($"unknown affix key '{key}'");

        public bool TryItem(string key, out ItemDefinition d) => _items.TryGetValue(key, out d);
        public bool TryAffix(string key, out AffixDefinition d) => _affixes.TryGetValue(key, out d);
    }
}
