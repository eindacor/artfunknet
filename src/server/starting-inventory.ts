import type { Db } from "mongodb";

import { getGameplayGenerationMap, getGameplaySettings } from "./game-settings.ts";
import { generateDailyDrop, type GameItem } from "./gameplay.ts";

export async function generateStartingInventory(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<GameItem[]> {
  const settings = await getGameplaySettings(database);
  const source = "starting inventory";
  const items: GameItem[] = [];
  try {
    for (const [rarity, itemCount] of [["common", 4], ["uncommon", 2]] as const) {
      items.push(...await generateDailyDrop(database, playerId, 0, {
        now,
        itemCount,
        source,
        status: "claimed",
        generationMap: {
          ...getGameplayGenerationMap(settings.active),
          rarity: {
            common: rarity === "common" ? 1 : 0,
            uncommon: rarity === "uncommon" ? 1 : 0,
            rare: 0,
            legendary: 0,
            masterpiece: 0,
          },
        },
        useRawRarityMap: true,
        mintValueMultiplier: settings.active.mintValueMultiplier,
        debug: settings.debugEnabled,
      }));
    }
    return items;
  } catch (error) {
    await database.collection<GameItem>("items").deleteMany({
      owner: playerId, source, date_created: now.toISOString(),
    });
    throw error;
  }
}
