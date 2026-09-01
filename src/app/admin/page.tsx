import GameplaySettingsForm from "./gameplay-settings-form";

import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const settings = await getGameplaySettings(await getDatabase());

  return (
    <main className="admin-tools">
      <h1>Admin tools</h1>
      <section>
        <h2>Gameplay timing</h2>
        <p>
          These controls replace the old in-memory admin settings and hardcoded
          Meteor interval constants. Changes apply to subsequent drops and
          gallery settlements.
        </p>
        <GameplaySettingsForm initialSettings={settings} />
      </section>
      <section>
        <h2>Legacy controls queued for migration</h2>
        <p>
          Loot probabilities, crate economics, seasonal rotation, attributes,
          player overrides, NPC generation, and operational reset tools remain
          disabled until their corresponding gameplay systems are ported.
        </p>
      </section>
    </main>
  );
}
