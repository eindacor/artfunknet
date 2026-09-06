import SeasonalArtworkForm from "../seasonal-artwork-form";

import { getGameplaySettings } from "@/server/game-settings";
import { type Artwork, type LootData } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { getSeasonalArtworkSelections } from "@/server/seasonal-artwork";

export const dynamic = "force-dynamic";

export default async function GameStateAdminPage() {
  const database = await getDatabase();
  const [settings, artworks, lootMetadata] = await Promise.all([
    getGameplaySettings(database),
    database
      .collection<Artwork>("artworks")
      .find({ active: true })
      .project<Artwork>({ market_data: 0 })
      .sort({ rarity: 1, artist: 1, title: 1 })
      .toArray(),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!lootMetadata) throw new Error("Loot metadata is unavailable.");

  const artworkOptions = JSON.parse(
    JSON.stringify(artworks),
  ) as Artwork[];
  const seasonalArtworkOptions = artworkOptions.map((artwork) => ({
    id: artwork._id,
    artist: artwork.artist,
    title: artwork.title,
    rarity: artwork.rarity,
  }));

  return (
    <main className="admin-tools">
      <h1>Shared game state</h1>
      <section>
        <h2>Seasonal artwork</h2>
        <p>
          Choose one active artwork for each rarity. Every newly created item
          of a selected artwork is automatically seasonal.
        </p>
        <SeasonalArtworkForm
          artworks={seasonalArtworkOptions}
          initialSelections={getSeasonalArtworkSelections(
            lootMetadata.loot_data,
          )}
        />
      </section>
    </main>
  );
}
