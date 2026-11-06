import { getArtworkEffects } from "@/server/artwork-effects";
import { getGameplaySettings } from "@/server/game-settings";
import type { LootData } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import GameplaySettingsForm from "../gameplay-settings-form";
import LootPoolArtworks, { type ArtworkEffectDistribution } from "./loot-pool-artworks";
import type { DistributionArtwork } from "./artwork-value-distribution";

export const dynamic = "force-dynamic";

export default async function LootPoolPage() {
  const database = await getDatabase();
  const [settings, lootMetadata, artworks, effects, effectCounts] = await Promise.all([
    getGameplaySettings(database),
    database.collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    database.collection<DistributionArtwork>("artworks")
      .find({}, { projection: { _id: 1, title: 1, rarity: 1, active: 1, value_scale: 1 } })
      .sort({ title: 1, _id: 1 })
      .toArray(),
    getArtworkEffects(database),
    database.collection("artworks")
      .aggregate<{ _id: string; count: number }>([
        { $match: { effect_id: { $type: "string" } } },
        { $group: { _id: "$effect_id", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  if (!lootMetadata) throw new Error("Loot metadata is unavailable.");
  const effectCountById = new Map(effectCounts.map(entry => [entry._id, entry.count]));
  const effectDistribution: ArtworkEffectDistribution[] = effects.map(effect => ({
    id: effect._id,
    title: effect.title,
    effectType: effect.effect_type,
    artworkCount: effectCountById.get(effect._id) ?? 0,
  }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Loot pool</h1>
        <p className="mt-2 text-[var(--muted)]">
          Configure drop distributions and review the artwork pool. Actual and Debug settings are stored independently and shared with Gameplay config.
        </p>
      </div>
      <div className="grid gap-5">
        <GameplaySettingsForm
          initialRarityValues={lootMetadata.loot_data.rarity_values}
          initialSettings={settings}
          panel="loot-pool"
        />
        <LootPoolArtworks initialArtworks={artworks} effectDistribution={effectDistribution} />
      </div>
    </main>
  );
}
