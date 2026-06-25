using System;
using System.IO;
using System.Linq;
using Necro.Core.Content;
using Necro.Core.Player;
using Necro.Core.Runtime;

namespace Necro.Core.Demo
{
    /// <summary>
    /// The vertical slice, headless: load the local JSON snapshots (the loader seam,
    /// no DB yet) → build the registry → build the character → list inventory →
    /// resolve attack_power with the Honed sword equipped vs. not. This is the same
    /// thread the Unity inventory UI will render; proving it here means the data and
    /// resolver are correct before any engine code.
    ///
    /// Run (once a .NET SDK + Newtonsoft.Json are available):
    ///   dotnet run --project GameCore.Slice/Demo
    /// expecting the two sample JSON files alongside the binary (or pass paths).
    /// </summary>
    public static class Program
    {
        public static int Main(string[] args)
        {
            string catalogPath  = args.Length > 0 ? args[0] : "content_catalog.sample.json";
            string snapshotPath = args.Length > 1 ? args[1] : "character_snapshot.sample.json";

            // 1. Loader seam: local JSON -> DTOs (later: same shape from a DB query).
            var catalog = ContentCatalog.FromJson(File.ReadAllText(catalogPath));
            var snap    = CharacterSnapshot.FromJson(File.ReadAllText(snapshotPath));

            // 2. Registry: key -> definition, built once.
            var content = new GameDataRegistry(catalog);

            // 3. Runtime model: join instances to definitions.
            var hero = new CharacterModel(snap, content);

            Console.WriteLine($"Character: {hero.Name} ({snap.Race}) in {snap.LastZone}");
            Console.WriteLine($"  pos ({snap.Position.X}, {snap.Position.Y}, {snap.Position.Z})  " +
                              $"facing {snap.Facing}  cam(zoom {snap.Camera.Zoom})\n");

            // 4. Inventory (resolve each instance's itemKey -> definition).
            Console.WriteLine("Inventory:");
            foreach (var c in snap.Containers)
                foreach (var s in c.Items.OrderBy(x => x.Slot))
                {
                    var inst = hero.Instance(s.InstanceId);
                    var def  = hero.Definition(inst);
                    var qty  = inst.StackQty > 1 ? $" x{inst.StackQty}" : "";
                    Console.WriteLine($"  [{c.StorageType} {s.Slot}] {def.Name}{qty}");
                }
            foreach (var e in snap.Equipment)
            {
                var inst = hero.Instance(e.InstanceId);
                var def  = hero.Definition(inst);
                var rolled = (inst.Affixes != null && inst.Affixes.Length > 0)
                    ? string.Join(", ", inst.Affixes.Select(a =>
                        $"{content.Affix(a.AffixKey).Name} +{a.RolledValue * 100:0}%"))
                    : "no affixes";
                Console.WriteLine($"  [EQUIPPED {e.Slot}] {def.Name} ({rolled})");
            }

            // 5. Resolve attack_power. baseValue is a stand-in for the STR-derived base
            //    until attributes are wired; the pipeline + affix application are real.
            const double strDerivedBaseAttackPower = 50.0; // TODO: from attributes
            double apEquipped = hero.ResolveStat("attack_power", baseValue: strDerivedBaseAttackPower);

            Console.WriteLine("\nattack_power:");
            foreach (var m in hero.EquippedModifiers())
                Console.WriteLine($"   {m.Type,-9} {m.Value,+7:0.00}   <- {m.Source}");
            Console.WriteLine($"   base {strDerivedBaseAttackPower} (STR, stubbed)");
            Console.WriteLine($"   => {apEquipped:0.0} with the Honed sword equipped");

            // Unequip to show the delta.
            var bare = new CharacterSnapshot
            {
                Equipment = Array.Empty<EquipmentEntry>(),
                ItemInstances = snap.ItemInstances
            };
            double apBare = new CharacterModel(bare, content)
                .ResolveStat("attack_power", baseValue: strDerivedBaseAttackPower);
            Console.WriteLine($"   => {apBare:0.0} with nothing equipped");
            Console.WriteLine($"   Honed sword contributes +{apEquipped - apBare:0.0}.");

            return 0;
        }
    }
}
