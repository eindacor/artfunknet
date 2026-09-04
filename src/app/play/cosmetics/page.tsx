import type { GameItem } from "@/server/gameplay";
import { getCardStyleInventory } from "@/components/item-cards/catalog";
import { hydrateGameItems } from "@/server/item-artwork";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getAdminSession, requirePlayer } from "@/server/session";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import { sanitizePlayerFacingAuthenticity } from "@/server/forgery-gameplay";
import { getPlayerAuctionEscrow } from "@/server/auction-gameplay";

import PlayerHeader from "../player-header";
import CosmeticStore from "./cosmetic-store";

type Player = {
  _id: string;
  screen_name: string;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    xp: number;
    card_style_consumables?: Record<string, number>;
  };
};

export const dynamic = "force-dynamic";

export default async function CardCosmeticStorePage() {
  const session = await requirePlayer();
  const database = await getDatabase();
  const player = await database.collection<Player>("players").findOne({
    _id: session.playerId,
    active: true,
  });
  if (!player) return null;

  const [adminSession, auctionEscrow] = await Promise.all([
    player.test_account ? getAdminSession() : Promise.resolve(null),
    getPlayerAuctionEscrow(database, player._id),
  ]);
  const rawSampleItem =
    (await database.collection<GameItem>("items").findOne({
      owner: player._id,
      status: { $in: ["claimed", "displayed"] },
    })) ??
    (await database.collection<GameItem>("items").findOne({
      status: { $in: ["unclaimed", "for_sale", "claimed", "displayed"] },
    }));
  const [[sampleItem], rendererSettings] = await Promise.all([
    rawSampleItem
      ? hydrateGameItems(database, [rawSampleItem])
      : Promise.resolve([]),
    getCardRendererSettings(database),
  ]);
  const legendaryAttributes = sampleItem
    ? await getLegendaryAttributes(
        database,
        sampleItem.artwork.unique_attributes ?? [],
      )
    : [];

  return (
    <div className="game-shell">
      <PlayerHeader
        auctionEscrow={auctionEscrow}
        bankBalance={player.profile.bank_balance}
        impersonating={Boolean(adminSession && player.test_account)}
      />
      <CosmeticStore
        activeRendererIds={rendererSettings.activeRendererIds}
        initialStyleInventory={getCardStyleInventory(
          player.profile.card_style_consumables,
        )}
        legendaryAttributes={legendaryAttributes.map((attribute) => ({
          id: attribute._id,
          title: attribute.title,
          description: attribute.description,
          flavorText: attribute.flavor_text,
          code: attribute.code,
          active: attribute.active,
        }))}
        sampleItem={
          sampleItem
            ? JSON.parse(
                JSON.stringify(
                  sanitizePlayerFacingAuthenticity(
                    sampleItem,
                    rawSampleItem?.owner !== player._id,
                  ),
                ),
              )
            : null
        }
        viewerId={player._id}
      />
    </div>
  );
}
