import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getCrateOffer,
  getCratePermission,
  getPurchasableCrateOffers,
} from "@/server/crate-gameplay";
import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "@/server/game-settings";
import { generateDailyDrop, type GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { getUnclaimedItemExpiration } from "@/server/item-expiration";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    level: number;
    money_spent_on_crates?: number;
  };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const [player, settings] = await Promise.all([
    database.collection<Player>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    getGameplaySettings(database),
  ]);
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 404 },
    );
  }

  const offers = await getPurchasableCrateOffers(
    database,
    player.profile.level,
    settings.active,
    player.test_account === true,
  );
  const offer = getCrateOffer(offers, id);
  if (!offer) {
    return NextResponse.json(
      { error: "That crate is no longer available." },
      { status: 404 },
    );
  }
  const permission = getCratePermission(
    offer,
    player.profile.level,
    player.profile.bank_balance,
  );
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 409 });
  }

  if (offer.cost > 0) {
    const charged = await database.collection<Player>("players").updateOne(
      {
        _id: player._id,
        active: true,
        "profile.level": player.profile.level,
        "profile.bank_balance": { $gte: offer.cost },
      },
      {
        $inc: {
          "profile.bank_balance": -offer.cost,
          "profile.money_spent_on_crates": offer.cost,
        },
      },
    );
    if (charged.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "Your balance changed before the crate could be opened." },
        { status: 409 },
      );
    }
  }

  const generationSource = `crate:${offer.id}:${randomUUID()}`;
  const now = new Date();
  try {
    const items = await generateDailyDrop(
      database,
      player._id,
      player.profile.level,
      {
        now,
        itemCount: offer.itemCount,
        generationMap: {
          ...getGameplayGenerationMap(settings.active),
          ...offer.generationMap,
        },
        useRawRarityMap: Boolean(offer.generationMap.rarity),
        mintValueMultiplier: settings.active.mintValueMultiplier,
        debug: settings.debugEnabled,
        source: generationSource,
        expiresAt: getUnclaimedItemExpiration(now),
      },
    );
    await database.collection<GameItem>("items").updateMany(
      {
        _id: { $in: items.map((item) => item._id) },
        owner: player._id,
        source: generationSource,
      },
      { $set: { source: `${offer.quality} crate` } },
    );
    return NextResponse.json({
      status: "ok",
      itemCount: items.length,
      item_ids: items.map((item) => item._id),
      bankBalance: player.profile.bank_balance - offer.cost,
      message: `${offer.name} opened. ${items.length} artworks were added to your loot.`,
    });
  } catch (error) {
    try {
      await database.collection<GameItem>("items").deleteMany({
        owner: player._id,
        source: generationSource,
      });
    } catch (cleanupError) {
      console.error("Unable to clean up failed crate items", cleanupError);
    }
    if (offer.cost > 0) {
      try {
        await database.collection<Player>("players").updateOne(
          { _id: player._id, active: true },
          {
            $inc: {
              "profile.bank_balance": offer.cost,
              "profile.money_spent_on_crates": -offer.cost,
            },
          },
        );
      } catch (refundError) {
        console.error("Unable to refund failed crate purchase", refundError);
        return NextResponse.json(
          {
            error:
              "The crate could not be opened and the purchase could not be automatically refunded.",
          },
          { status: 500 },
        );
      }
    }
    console.error("Unable to open purchased crate", error);
    return NextResponse.json(
      { error: "The crate could not be opened. Your purchase was refunded." },
      { status: 500 },
    );
  }
}
