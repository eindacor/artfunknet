import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { settlePlayerItemRepairs } from "@/server/preservationist-gameplay";
import type { KnowledgeReward } from "@/server/art-expert-gameplay";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    repairing_cap?: number;
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
  const now = new Date();
  let completedRepairs = 0;
  let repairKnowledge: KnowledgeReward | null = null;
  try {
    const settlement = await settlePlayerItemRepairs(
      database,
      auth.session.playerId,
      now,
    );
    completedRepairs = settlement.completedItems;
    repairKnowledge = settlement.knowledge;
  } catch (error) {
    console.error("Unable to settle item repairs before repair action", error);
  }
  const completionSuffix =
    completedRepairs > 0
      ? ` ${completedRepairs} existing ${completedRepairs === 1 ? "repair also completed" : "repairs also completed"}${
          repairKnowledge
            ? formatKnowledgeReward(repairKnowledge)
            : ""
        }.`
      : "";

  const [player, item] = await Promise.all([
    database.collection<Player>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    database.collection<GameItem>("items").findOne({
      _id: id,
      owner: auth.session.playerId,
      status: "claimed",
    }),
  ]);
  if (!player || !item) {
    return NextResponse.json(
      { error: "This item is not available for repair." },
      { status: 409 },
    );
  }

  if (item.repairing) {
    const stopped = await database.collection<GameItem>("items").updateOne(
      {
        _id: item._id,
        owner: player._id,
        status: "claimed",
        repairing: true,
      },
      {
        $set: { repairing: false },
        $unset: { repair_tick_at: "" },
      },
    );
    if (stopped.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "The repair state changed before it could be stopped." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      status: "ok",
      message: `Repair stopped for this item at ${Math.floor(item.condition * 100)}% condition.${completionSuffix}`,
    });
  }

  function formatKnowledgeReward(reward: KnowledgeReward): string {
    const summary = Object.entries(reward).flatMap(([type, amount]) =>
      amount > 0 ? [`${amount} ${type.replaceAll("_", " ")}`] : [],
    );
    return summary.length > 0 ? ` and generated ${summary.join(", ")}` : "";
  }

  if (item.condition >= 1) {
    return NextResponse.json(
      { error: "This item is already at 100% condition." },
      { status: 409 },
    );
  }
  const repairingCap = Math.max(0, player.profile.repairing_cap ?? 4);
  const repairingCount = await database.collection<GameItem>("items").countDocuments({
    owner: player._id,
    repairing: true,
  });
  if (repairingCount >= repairingCap) {
    return NextResponse.json(
      {
        error: `Your ${repairingCap}-item repair limit has been reached.`,
      },
      { status: 409 },
    );
  }

  const started = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: player._id,
      status: "claimed",
      repairing: { $ne: true },
      condition: item.condition,
    },
    {
      $set: {
        repairing: true,
        repair_tick_at: now.toISOString(),
      },
    },
  );
  if (started.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "The repair state changed before it could be started." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    message:
      `Repair started. Condition will increase by 10% for each completed hour.${completionSuffix}`,
  });
}
