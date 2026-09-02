import GameplaySettingsForm from "./gameplay-settings-form";
import RaffleRewardForm from "./raffle-reward-form";
import SeasonalArtworkForm from "./seasonal-artwork-form";

import { getGameplaySettings } from "@/server/game-settings";
import {
  type Artwork,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { hydrateGameItems } from "@/server/item-artwork";
import { ensureRaffleState } from "@/server/raffle-gameplay";
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
  const raffleState = await ensureRaffleState(
    database,
    settings.active,
  );
  const raffleRewardDocuments = await database
    .collection<GameItem>("items")
    .find({
      _id: { $in: raffleState.prizes.map((prize) => prize.item_id) },
    })
    .toArray();
  if (raffleRewardDocuments.length !== raffleState.prizes.length) {
    throw new Error("Raffle prizes are unavailable.");
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
      throw new Error(`Raffle prize ${prize.item_id} is unavailable.`);
    }
    return {
      item: JSON.parse(JSON.stringify(item)),
      potency: prize.potency,
    };
  });

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
        <h2>Raffle prizes</h2>
        <p>
          The raffle keeps three prizes active. Winning prizes are replaced
          automatically; each current prize can also be adjusted here.
        </p>
        <RaffleRewardForm
          artworks={artworks.map((artwork) => ({
            id: artwork._id,
            artist: artwork.artist,
            title: artwork.title,
            rarity: artwork.rarity,
          }))}
          prizes={rafflePrizes}
        />
      </section>
      <section>
        <h2>Legacy controls queued for migration</h2>
        <p>
          Remaining NPC interactions and operational reset tools stay disabled
          until their corresponding gameplay systems are ported.
        </p>
      </section>
    </main>
  );
}
