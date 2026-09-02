import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getAdminSession, requirePlayer } from "@/server/session";
import { getCardRendererSettings } from "@/server/card-renderer-settings";

import PlayerHeader from "../player-header";
import CosmeticStore from "./cosmetic-store";

type Player = {
  _id: string;
  screen_name: string;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    xp: number;
    owned_card_renderers?: string[];
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

  const adminSession = player.test_account ? await getAdminSession() : null;
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
        bankBalance={player.profile.bank_balance}
        impersonating={Boolean(adminSession && player.test_account)}
        screenName={player.screen_name}
        xp={player.profile.xp}
      />
      <CosmeticStore
        activeRendererIds={rendererSettings.activeRendererIds}
        initialBankBalance={player.profile.bank_balance}
        initialOwnedRendererIds={
          player.profile.owned_card_renderers ?? []
        }
        legendaryAttributes={legendaryAttributes.map((attribute) => ({
          id: attribute._id,
          title: attribute.title,
          description: attribute.description,
          flavorText: attribute.flavor_text,
          code: attribute.code,
          active: attribute.active,
        }))}
        rendererPrices={rendererSettings.rendererPrices}
        sampleItem={
          sampleItem
            ? JSON.parse(JSON.stringify(sampleItem))
            : null
        }
      />
    </div>
  );
}
