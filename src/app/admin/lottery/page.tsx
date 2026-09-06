import RaffleRewardForm from "../raffle-reward-form";

import { getGameplaySettings } from "@/server/game-settings";
import { type Artwork, type GameItem } from "@/server/gameplay";
import {
  hydrateGameItems,
  type HydratedGameItem,
} from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";
import {
  ensureRaffleState,
  type RafflePrize,
} from "@/server/raffle-gameplay";

export const dynamic = "force-dynamic";

type EditablePrize = {
  item: HydratedGameItem;
  potency: number;
};

export default async function LotteryAdminPage() {
  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const state = await ensureRaffleState(database, settings.active);
  const allPrizes = [...state.prizes, ...state.buffer_prizes];
  const [artworks, itemDocuments] = await Promise.all([
    database
      .collection<Artwork>("artworks")
      .find({ active: true })
      .project<Artwork>({ market_data: 0 })
      .sort({ rarity: 1, artist: 1, title: 1 })
      .toArray(),
    database
      .collection<GameItem>("items")
      .find({ _id: { $in: allPrizes.map((prize) => prize.item_id) } })
      .toArray(),
  ]);
  if (itemDocuments.length !== allPrizes.length) {
    throw new Error("Lottery items are unavailable.");
  }

  const hydratedItems = await hydrateGameItems(database, itemDocuments);
  const itemById = new Map(hydratedItems.map((item) => [item._id, item]));
  const serializePrizes = (prizes: RafflePrize[]): EditablePrize[] =>
    prizes.map((prize) => {
      const item = itemById.get(prize.item_id);
      if (!item) {
        throw new Error(`Lottery item ${prize.item_id} is unavailable.`);
      }
      return {
        item: JSON.parse(JSON.stringify(item)) as HydratedGameItem,
        potency: prize.potency,
      };
    });

  return (
    <main className="admin-tools">
      <h1>Lottery</h1>
      <RaffleRewardForm
        artworks={JSON.parse(JSON.stringify(artworks)) as Artwork[]}
        bufferPrizes={serializePrizes(state.buffer_prizes)}
        prizes={serializePrizes(state.prizes)}
      />
    </main>
  );
}
