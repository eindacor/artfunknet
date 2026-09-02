import GameplaySettingsForm from "./gameplay-settings-form";
import SeasonalArtworkForm from "./seasonal-artwork-form";

import { getGameplaySettings } from "@/server/game-settings";
import {
  type Artwork,
  type LootData,
} from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { getSeasonalArtworkSelections } from "@/server/seasonal-artwork";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const database = await getDatabase();
  const [settings, artworks, lootMetadata] = await Promise.all([
    getGameplaySettings(database),
    database
      .collection<Pick<Artwork, "_id" | "artist" | "title" | "rarity">>(
        "artworks",
      )
      .find({ active: true })
      .sort({ rarity: 1, artist: 1, title: 1 })
      .toArray(),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!lootMetadata) throw new Error("Loot metadata is unavailable.");

  return (
    <main className="admin-tools">
      <h1>Admin tools</h1>
      <section>
        <h2>Gameplay configuration</h2>
        <p>
          Actual and Debug settings are stored independently. Enabling Debug
          switches drops, gallery progression, condition decay, and NPC
          generation to the complete Debug configuration.
        </p>
        <GameplaySettingsForm initialSettings={settings} />
      </section>
      <section>
        <h2>Seasonal artwork</h2>
        <p>
          Choose one active artwork for each rarity. Every newly created item
          of a selected artwork is automatically seasonal.
        </p>
        <SeasonalArtworkForm
          artworks={artworks.map((artwork) => ({
            id: artwork._id,
            artist: artwork.artist,
            title: artwork.title,
            rarity: artwork.rarity,
          }))}
          initialSelections={getSeasonalArtworkSelections(
            lootMetadata.loot_data,
          )}
        />
      </section>
      <section>
        <h2>Legacy controls queued for migration</h2>
        <p>
          Crate economics, player overrides, NPC interactions, and operational
          reset tools remain disabled until their corresponding gameplay
          systems are ported.
        </p>
      </section>
    </main>
  );
}
