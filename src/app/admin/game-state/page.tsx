import RaffleRewardForm from "../raffle-reward-form";
import SeasonalArtworkForm from "../seasonal-artwork-form";

import { getGameplaySettings } from "@/server/game-settings";
import {
  type Artwork,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";
import { ensureRaffleState } from "@/server/raffle-gameplay";
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

  const raffleState = await ensureRaffleState(database, settings.active);
  const raffleRewardDocuments = await database
    .collection<GameItem>("items")
    .find({
      _id: { $in: raffleState.prizes.map((prize) => prize.item_id) },
    })
    .toArray();
  if (raffleRewardDocuments.length !== raffleState.prizes.length) {
    throw new Error("Lottery items are unavailable.");
  }

  const raffleRewardItems = await hydrateGameItems(
    database,
    raffleRewardDocuments,
  );
  const raffleRewardById = new Map(
    raffleRewardItems.map((item) => [item._id, item]),
  );
  const rafflePrizes = raffleState.prizes.map((prize) => {
    const item = raffleRewardById.get(prize.item_id);
    if (!item) {
      throw new Error(`Lottery item ${prize.item_id} is unavailable.`);
    }
    return {
      item: JSON.parse(JSON.stringify(item)),
      potency: prize.potency,
    };
  });
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
      <section>
        <h2>Lottery items</h2>
        <p>
          The lottery keeps three items active. Winners are checked daily;
          each current item can also be adjusted here.
        </p>
        <RaffleRewardForm
          artworks={artworkOptions}
          prizes={rafflePrizes}
        />
      </section>
    </main>
  );
}
