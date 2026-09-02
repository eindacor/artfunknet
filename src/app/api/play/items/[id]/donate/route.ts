import { NextResponse } from "next/server";

import {
  getCardCosmetic,
  getCardStyleInventory,
} from "@/components/item-cards/catalog";
import {
  calculateDonationKnowledge,
  KNOWLEDGE_TYPES,
  type KnowledgeType,
} from "@/server/art-expert-gameplay";
import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  punishForgeryQuality,
  rollForgeryDetected,
  transferForgeryLiability,
} from "@/server/forgery-gameplay";
import { getDisplayedLegendaryEffect } from "@/server/legendary-attributes";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    knowledge: Partial<Record<KnowledgeType, number>>;
    card_style_consumables?: Record<string, number>;
    last_activity: string;
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
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["claimed", "unclaimed"] },
    permanent: { $ne: true },
    original: { $ne: true },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item cannot currently be donated." },
      { status: 409 },
    );
  }

  const [hydratedItem] = await hydrateGameItems(database, [item]);
  if (!hydratedItem) {
    return NextResponse.json(
      { error: "The artwork data needed for this donation is unavailable." },
      { status: 500 },
    );
  }
  await transferForgeryLiability(
    database,
    item,
    auth.session.playerId,
  );
  if (item.authenticity.forgery && rollForgeryDetected(hydratedItem, "donate")) {
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: auth.session.playerId, status: item.status },
      {
        $set: {
          status: "claimed",
          "authenticity.liable": auth.session.playerId,
          "authenticity.liability_pending": false,
          "authenticity.identified": true,
          "authenticity.forgery_quality": punishForgeryQuality(item.authenticity.forgery_quality),
        },
      },
    );
    return NextResponse.json({
      status: "ok",
      knowledge: {},
      message: "The museum detected the forgery. It was returned to your inventory and yielded no knowledge.",
    });
  }

  const rendererFilter =
    item.card_renderer === undefined
      ? { card_renderer: { $exists: false } }
      : { card_renderer: item.card_renderer };
  const donatedItem = await database
    .collection<GameItem>("items")
    .findOneAndDelete({
      _id: item._id,
      owner: auth.session.playerId,
      status: item.status,
      level: item.level,
      foil: item.foil,
      unlocked: item.unlocked,
      mint: item.mint,
      mint_value_multiplier: item.mint_value_multiplier,
      seasonal: item.seasonal,
      lottery: item.lottery,
      vintage: item.vintage,
      permanent: { $ne: true },
      original: { $ne: true },
      ...rendererFilter,
    });
  if (!donatedItem) {
    return NextResponse.json(
      { error: "This item changed before it could be donated." },
      { status: 409 },
    );
  }

  const style = getCardCosmetic(donatedItem.card_renderer ?? "");
  const recoveredStyle =
    style && style.id !== "museum" ? style : undefined;
  const knowledge = calculateDonationKnowledge({
    rarity: hydratedItem.artwork.rarity,
    level: donatedItem.level,
    valueProperties: donatedItem,
    hasArtStyle: Boolean(recoveredStyle),
    randomRoll: Math.random(),
  });
  if (donatedItem.authenticity.forgery) {
    const bonus = await getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "DONATE_FORGERY_BONUS",
    );
    const multiplier = bonus
      ? donatedItem.authenticity.identified ? 2 : 4
      : 1;
    for (const type of KNOWLEDGE_TYPES) knowledge[type] *= multiplier;
  }
  const increments: Record<string, number> = Object.fromEntries([
    ...KNOWLEDGE_TYPES.map((type) => [
      `profile.knowledge.${type}`,
      knowledge[type],
    ]),
    ...(recoveredStyle
      ? [[`profile.card_style_consumables.${recoveredStyle.id}`, 1]]
      : []),
  ]);

  const player = await database.collection<Player>("players").findOneAndUpdate(
    { _id: auth.session.playerId, active: true },
    {
      $inc: increments,
      $set: { "profile.last_activity": new Date().toISOString() },
    },
    { returnDocument: "after" },
  );
  if (!player) {
    await database.collection<GameItem>("items").insertOne(donatedItem);
    return NextResponse.json(
      { error: "The donation could not be applied to your account." },
      { status: 500 },
    );
  }

  const knowledgeSummary = KNOWLEDGE_TYPES.flatMap((type) =>
    knowledge[type] > 0
      ? [`${knowledge[type]} ${type.replaceAll("_", " ")}`]
      : [],
  ).join(", ");

  return NextResponse.json({
    status: "ok",
    knowledge,
    recoveredStyle: recoveredStyle?.id,
    styleInventory: getCardStyleInventory(
      player.profile.card_style_consumables,
    ),
    message: `${hydratedItem.artwork.title} was donated for ${
      knowledgeSummary || "no knowledge"
    }${recoveredStyle ? `, and its ${recoveredStyle.name} style was recovered` : ""}.`,
  });
}
