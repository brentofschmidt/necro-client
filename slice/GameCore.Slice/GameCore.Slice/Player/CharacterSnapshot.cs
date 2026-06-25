using Newtonsoft.Json;

namespace Necro.Core.Player
{
    /// <summary>
    /// Instance-side DTOs — per-character runtime state loaded from a snapshot.
    /// Mirrors character_snapshot.sample.json. Instance IDs are uuids (the specific
    /// sword, minted at creation, never changes); content references are KEYS
    /// (itemKey, affixKey, race, slot...) resolved against the GameDataRegistry.
    /// </summary>
    public sealed class CharacterSnapshot
    {
        [JsonProperty("id")]            public string Id { get; set; }            // instance uuid
        [JsonProperty("name")]          public string Name { get; set; }
        [JsonProperty("race")]          public string Race { get; set; }          // content key
        [JsonProperty("lastZone")]      public string LastZone { get; set; }      // content key
        [JsonProperty("position")]      public Vec3 Position { get; set; }
        [JsonProperty("facing")]        public float Facing { get; set; }
        [JsonProperty("camera")]        public CameraState Camera { get; set; }
        [JsonProperty("playtimeSecs")]  public long PlaytimeSecs { get; set; }
        [JsonProperty("equipment")]     public EquipmentEntry[] Equipment { get; set; }
        [JsonProperty("containers")]    public ContainerState[] Containers { get; set; }
        [JsonProperty("itemInstances")] public ItemInstance[] ItemInstances { get; set; }
        [JsonProperty("proficiencies")] public ProficiencyEntry[] Proficiencies { get; set; }

        public static CharacterSnapshot FromJson(string json) =>
            JsonConvert.DeserializeObject<CharacterSnapshot>(json);
    }

    public sealed class Vec3
    {
        [JsonProperty("x")] public float X { get; set; }
        [JsonProperty("y")] public float Y { get; set; }
        [JsonProperty("z")] public float Z { get; set; }
    }

    public sealed class CameraState
    {
        [JsonProperty("yaw")]   public float Yaw { get; set; }
        [JsonProperty("pitch")] public float Pitch { get; set; }
        [JsonProperty("zoom")]  public float Zoom { get; set; }
    }

    public sealed class EquipmentEntry
    {
        [JsonProperty("slot")]       public string Slot { get; set; }        // content equipment_slots key
        [JsonProperty("instanceId")] public string InstanceId { get; set; }  // -> ItemInstance.Id
    }

    public sealed class ContainerState
    {
        [JsonProperty("id")]          public string Id { get; set; }
        [JsonProperty("storageType")] public string StorageType { get; set; } // content key
        [JsonProperty("slotCount")]   public int SlotCount { get; set; }
        [JsonProperty("items")]       public ContainerSlot[] Items { get; set; }
    }

    public sealed class ContainerSlot
    {
        [JsonProperty("slot")]       public int Slot { get; set; }
        [JsonProperty("instanceId")] public string InstanceId { get; set; }
    }

    public sealed class ItemInstance
    {
        [JsonProperty("id")]                public string Id { get; set; }       // instance uuid
        [JsonProperty("itemKey")]           public string ItemKey { get; set; }  // -> ItemDefinition
        [JsonProperty("durabilityCurrent")] public int? DurabilityCurrent { get; set; }
        [JsonProperty("stackQty")]          public int StackQty { get; set; }
        [JsonProperty("affixes")]           public RolledAffix[] Affixes { get; set; }
    }

    public sealed class RolledAffix
    {
        [JsonProperty("affixKey")]    public string AffixKey { get; set; }    // -> AffixDefinition
        [JsonProperty("rolledValue")] public double RolledValue { get; set; } // magnitude rolled at drop/craft
    }

    public sealed class ProficiencyEntry
    {
        [JsonProperty("key")]  public string Key { get; set; }   // content proficiency key
        [JsonProperty("rank")] public int Rank { get; set; }
        [JsonProperty("xp")]   public long Xp { get; set; }
    }
}
