import GameplaySettingsForm from "./gameplay-settings-form";

import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const database = await getDatabase();
  const settings = await getGameplaySettings(database);

  return (
    <main className="admin-tools">
      <h1>Admin tools</h1>
      <section>
        <h2>Gameplay configuration</h2>
        <p>
          Actual and Debug settings are stored independently. Enabling Debug
          switches drops, gallery progression, condition decay, and NPC
          generation to the complete Debug configuration.
        </p>
        <GameplaySettingsForm initialSettings={settings} />
      </section>
      <section>
        <h2>Legacy controls queued for migration</h2>
        <p>
          Crate economics, seasonal rotation, player overrides, NPC
          interactions, and operational reset tools remain disabled until their
          corresponding gameplay systems are ported.
        </p>
      </section>
    </main>
  );
}
