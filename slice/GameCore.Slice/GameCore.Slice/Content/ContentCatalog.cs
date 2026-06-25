using Newtonsoft.Json;

namespace Necro.Core.Content
{
    /// <summary>
    /// Definition-side DTOs — the static, designer-authored content loaded once and
    /// cached. Mirrors content_catalog.sample.json (the game-facing, key-based shape;
    /// quicktype-compatible). References are KEYS, never uuids: keys are stable across
    /// environments and readable; the DB's uuids stay at the DB boundary.
    /// </summary>
    public sealed class ContentCatalog
    {
        [JsonProperty("items")]   public ItemDefinition[] Items   { get; set; }
        [JsonProperty("affixes")] public AffixDefinition[] Affixes { get; set; }

        public static ContentCatalog FromJson(string json) =>
            JsonConvert.DeserializeObject<ContentCatalog>(json);
    }

    public sealed class ItemDefinition
    {
        [JsonProperty("key")]                  public string Key { get; set; }
        [JsonProperty("name")]                 public string Name { get; set; }
        [JsonProperty("itemType")]             public string ItemType { get; set; }
        [JsonProperty("category")]             public string Category { get; set; }
        [JsonProperty("slot")]                 public string Slot { get; set; }            // null = non-equippable
        [JsonProperty("weight")]               public double Weight { get; set; }
        [JsonProperty("stackMax")]             public int StackMax { get; set; }
        [JsonProperty("maxDurability")]        public int? MaxDurability { get; set; }     // null = indestructible
        [JsonProperty("rarity")]               public string Rarity { get; set; }
        [JsonProperty("tradeable")]            public bool Tradeable { get; set; }
        [JsonProperty("droppable")]            public bool Droppable { get; set; }
        [JsonProperty("governingProficiency")] public string GoverningProficiency { get; set; } // null if none
    }

    public sealed class AffixDefinition
    {
        [JsonProperty("key")]          public string Key { get; set; }
        [JsonProperty("name")]         public string Name { get; set; }
        [JsonProperty("affixType")]    public string AffixType { get; set; }     // prefix/suffix
        [JsonProperty("targetStat")]   public string TargetStat { get; set; }    // which stat it modifies
        [JsonProperty("modifierType")] public string ModifierType { get; set; }  // flat/increased/more/override
    }
}
