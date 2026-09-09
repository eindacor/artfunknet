import type { Db } from "mongodb";

import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
} from "./collection-gameplay.ts";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import {
  getGameplaySettings,
  type XpRewardKey,
  type XpRewardScalars,
} from "./game-settings.ts";

type XpPlayer = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
    xp: number;
    lottery_tickets: number;
  };
};

export class XpRewardService {
  private readonly scalars: XpRewardScalars;

  constructor(scalars: XpRewardScalars) {
    this.scalars = scalars;
  }

  static async create(database: Db): Promise<XpRewardService> {
    const settings = await getGameplaySettings(database);
    return new XpRewardService(settings.active.xpRewardScalars);
  }

  getScalar(key: XpRewardKey): number {
    return this.scalars[key];
  }

  getChunks(key: XpRewardKey, baseChunks: number): number {
    return Number(
      Math.max(0, baseChunks * this.getScalar(key)).toFixed(6),
    );
  }

  getAmount(key: XpRewardKey, level: number, baseChunks: number): number {
    return Math.floor(getXpChunk(level) * this.getChunks(key, baseChunks));
  }

  async award(
    database: Db,
    playerId: string,
    key: XpRewardKey,
    baseChunks: number,
    metricSource: string,
  ): Promise<number> {
    const player = await database.collection<XpPlayer>("players").findOne({
      _id: playerId,
      active: true,
    });
    if (!player) return 0;
    const chunks = this.getChunks(key, baseChunks);
    const amount = Math.floor(getXpChunk(player.profile.level) * chunks);
    if (amount <= 0) return 0;
    const progress = applyXp(
      player.profile.level,
      player.profile.xp,
      amount,
    );
    const updated = await database.collection<XpPlayer>("players").updateOne(
      {
        _id: playerId,
        active: true,
        "profile.level": player.profile.level,
        "profile.xp": player.profile.xp,
      },
      {
        $set: {
          "profile.level": progress.level,
          "profile.xp": progress.xp,
          ...Object.fromEntries(
            Object.entries(getCapsForLevel(progress.level)).map(
              ([name, value]) => [`profile.${name}`, value],
            ),
          ),
        },
        $inc: {
          "profile.lottery_tickets": progress.lotteryTickets,
        },
      },
    );
    if (updated.modifiedCount !== 1) return 0;
    await recordEconomyMetricsSafely(database, {
      amount: amount / Math.max(1, getXpChunk(player.profile.level)),
      currency: "xp",
      direction: "earned",
      source: metricSource,
    });
    return amount;
  }
}
