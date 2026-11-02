import type { Db } from "mongodb";

import {
  isPlayerSupporter,
  type SupporterStatusPlayer,
} from "./supporter-status.ts";

export type SupporterPromptPlayer = SupporterStatusPlayer & {
  profile?: {
    supporter_prompt_acknowledged_at?: Date | string | null;
  };
};

export type SupporterPromptState = {
  period: string;
  required: boolean;
};

export function getSupporterPromptState(
  player: SupporterPromptPlayer,
  now = new Date(),
): SupporterPromptState {
  const period = now.toISOString().slice(0, 7);
  const acknowledgedAt = getAcknowledgedAt(
    player.profile?.supporter_prompt_acknowledged_at,
  );
  return {
    period,
    required:
      player.active === true &&
      !isPlayerSupporter(player) &&
      player.patreon?.is_supporter !== true &&
      (!acknowledgedAt || acknowledgedAt.toISOString().slice(0, 7) < period),
  };
}

export async function acknowledgeSupporterPrompt(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<Date | null> {
  const player = await database.collection<SupporterPromptPlayer>("players")
    .findOneAndUpdate(
      { _id: playerId, active: true },
      {
        $max: {
          "profile.supporter_prompt_acknowledged_at": now,
          updated_at: now,
        },
      },
      {
        returnDocument: "after",
        projection: { "profile.supporter_prompt_acknowledged_at": 1 },
      },
    );
  return getAcknowledgedAt(player?.profile?.supporter_prompt_acknowledged_at);
}

function getAcknowledgedAt(value: unknown): Date | null {
  if (!(value instanceof Date) && typeof value !== "string") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
