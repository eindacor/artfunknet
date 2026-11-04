import type { Db } from "mongodb";
import { ensureTutorialDonor } from "./npc-gameplay.ts";
import { getPlayerDailyCrateState, isDailyCrateReady } from "./daily-crate.ts";
import {
  getNextTutorialStep, getPlayerTutorial, TUTORIAL_ORDER, TutorialElement, type TutorialProgress,
} from "../shared/tutorial.ts";

type TutorialPlayer = {
  _id: string;
  active: boolean;
  account_type?: string;
  artist_id?: string;
  tutorial?: TutorialProgress;
  profile?: { display_cap?: number };
};

const TUTORIAL_ENTRY_CALLBACKS: Partial<Record<TutorialElement,
  (database: Db, playerId: string, progress: TutorialProgress) => Promise<TutorialProgress | void>>> = {
  [TutorialElement.TUTORIAL_MEET_VISITOR]: async (database, playerId, progress) => {
    await ensureTutorialDonor(database, playerId, new Date(), progress.revision);
  },
  [TutorialElement.TUTORIAL_FILL_FEATURES]: fulfillFilledFeatures,
  [TutorialElement.TUTORIAL_CLAIM_ITEM]: async (database, playerId, progress) => {
    const offer = await database.collection("items").findOne(
      { owner: playerId, status: "unclaimed" }, { projection: { _id: 1 } },
    );
    if (!offer) return fulfillTutorial(database, playerId, TutorialElement.TUTORIAL_CLAIM_ITEM, progress.revision);
  },
  [TutorialElement.TUTORIAL_DAILY_CRATE]: async (database, playerId, progress) => {
    const state = await getPlayerDailyCrateState(database, playerId);
    if (state?.timeZone && !isDailyCrateReady(state)) {
      return fulfillTutorial(database, playerId, TutorialElement.TUTORIAL_DAILY_CRATE, progress.revision);
    }
  },
};

export async function resumeTutorial(
  database: Db, playerId: string, progress?: TutorialProgress,
): Promise<TutorialProgress> {
  const current = progress ?? getPlayerTutorial(
    await database.collection<TutorialPlayer>("players").findOne({ _id: playerId, active: true }) ?? {},
  );
  const callback = current.step ? TUTORIAL_ENTRY_CALLBACKS[current.step] : undefined;
  return callback ? await callback(database, playerId, current) ?? current : current;
}

export async function restartTutorial(database: Db, playerId: string): Promise<TutorialProgress | null> {
  const updated = await database.collection<TutorialPlayer>("players").findOneAndUpdate(
    { _id: playerId, active: true, account_type: { $ne: "artist" }, artist_id: { $exists: false } },
    [{ $set: { tutorial: {
      step: TUTORIAL_ORDER[0],
      revision: { $add: [{ $ifNull: ["$tutorial.revision", 0] }, 1] },
    } } }],
    { returnDocument: "after" },
  );
  return updated ? resumeTutorial(database, playerId, getPlayerTutorial(updated)) : null;
}

export async function fulfillTutorial(
  database: Db, playerId: string, element: TutorialElement, expectedRevision?: number,
): Promise<TutorialProgress> {
  const players = database.collection<TutorialPlayer>("players");
  const updated = await players.findOneAndUpdate(
    { _id: playerId, active: true, account_type: { $ne: "artist" }, artist_id: { $exists: false }, "tutorial.step": element,
      ...(expectedRevision === undefined ? {} : { "tutorial.revision": expectedRevision }) },
    { $set: { "tutorial.step": getNextTutorialStep(element) }, $inc: { "tutorial.revision": 1 } },
    { returnDocument: "after" },
  );
  const progress = getPlayerTutorial(updated ?? await players.findOne({ _id: playerId, active: true }) ?? {});
  return resumeTutorial(database, playerId, progress);
}

export async function fulfillFilledFeatures(database: Db, playerId: string): Promise<TutorialProgress> {
  const player = await database.collection<TutorialPlayer>("players").findOne({ _id: playerId, active: true });
  const progress = getPlayerTutorial(player ?? {});
  const capacity = player?.profile?.display_cap ?? 0;
  if (progress.step !== TutorialElement.TUTORIAL_FILL_FEATURES || capacity <= 0) return progress;
  const displayed = await database.collection("items").countDocuments({ owner: playerId, status: "displayed" });
  return displayed >= capacity
    ? fulfillTutorial(database, playerId, TutorialElement.TUTORIAL_FILL_FEATURES) : progress;
}

export async function recordTutorialAction(
  database: Db, playerId: string, element: TutorialElement,
): Promise<TutorialProgress | undefined> {
  try {
    return await fulfillTutorial(database, playerId, element);
  } catch (error) {
    // A tutorial write must not roll back an already successful game action.
    console.error("Unable to record tutorial progress", error);
    return undefined;
  }
}
