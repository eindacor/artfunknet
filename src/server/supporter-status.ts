import type { Db } from "mongodb";

export type SupporterStatusPlayer = {
  _id: string;
  active: boolean;
  patreon?: {
    is_supporter?: boolean;
    requires_reauthorization?: boolean;
  };
};

export function isPlayerSupporter(player: SupporterStatusPlayer): boolean {
  return (
    player.patreon?.is_supporter === true &&
    player.patreon.requires_reauthorization !== true
  );
}

export async function getPlayerSupporterStatus(
  database: Db,
  playerId: string,
): Promise<boolean> {
  const player = await database
    .collection<SupporterStatusPlayer>("players")
    .findOne(
      { _id: playerId, active: true },
      {
        projection: {
          "patreon.is_supporter": 1,
          "patreon.requires_reauthorization": 1,
        },
      },
    );
  return player ? isPlayerSupporter(player) : false;
}
