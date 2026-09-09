import XpBalanceForm from "./xp-balance-form";

import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function XpBalancePage() {
  const settings = await getGameplaySettings(await getDatabase());

  return (
    <main className="admin-tools">
      <h1>XP balance</h1>
      <section>
        <h2>XP chunk rewards</h2>
        <p>
          These scalars adjust level-normalized XP chunk rewards without
          changing their rarity, quality, heat, item-level, or legendary-effect
          calculations. A value of zero disables that XP source.
        </p>
        <XpBalanceForm
          activeConfigName={settings.activeConfigName}
          initialActual={settings.actual.xpRewardScalars}
          initialDebug={settings.debug.xpRewardScalars}
        />
      </section>
    </main>
  );
}
