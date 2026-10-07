import GameplaySettingsForm from "./gameplay-settings-form";
import DropTestPanel from "./drop-test-panel";

import { getGameplaySettings } from "@/server/game-settings";
import type { LootData } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const database = await getDatabase();
  const [settings, lootMetadata] = await Promise.all([
    getGameplaySettings(database),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!lootMetadata) throw new Error("Loot metadata is unavailable.");

  return (
    <main className="admin-tools">
      <h1>Admin tools</h1>
      <section>
        <h2>Drop test</h2>
        <DropTestPanel />
      </section>
      <section>
        <h2>Gameplay configuration</h2>
        <p>
          Actual and Debug settings are stored independently. Enabling Debug
          switches drops, gallery progression, condition decay, and NPC
          generation to the complete Debug configuration.
        </p>
        <GameplaySettingsForm
          initialRarityValues={lootMetadata.loot_data.rarity_values}
          initialSettings={settings}
        />
      </section>
      <section>
        <h2>Legacy controls queued for migration</h2>
        <p>
          Remaining NPC interactions and operational reset tools stay disabled
          until their corresponding gameplay systems are ported.
        </p>
      </section>
    </main>
  );
}
