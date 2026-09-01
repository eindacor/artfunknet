import { getDatabase } from "@/server/mongodb";

import TestAccountList, { type TestAccountView } from "./test-account-list";

type TestPlayer = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  test_account: boolean;
  profile: {
    level: number;
    bank_balance: number;
    last_activity: string;
  };
};

export const dynamic = "force-dynamic";

export default async function TestPlayersAdminPage() {
  const database = await getDatabase();
  const testPlayers = await database
    .collection<TestPlayer>("players")
    .find({ test_account: true, active: true })
    .sort({ screen_name: 1 })
    .toArray();
  const accounts: TestAccountView[] = await Promise.all(
    testPlayers.map(async (player) => ({
      id: player._id,
      screenName: player.screen_name,
      email: player.email,
      level: player.profile.level,
      bankBalance: player.profile.bank_balance,
      itemCount: await database
        .collection("items")
        .countDocuments({ owner: player._id }),
      lastActivity: player.profile.last_activity,
    })),
  );

  return (
    <main className="admin-tools">
      <h1>Test players</h1>
      <section>
        <h2>Seeded accounts</h2>
        <p>
          Open a test account to use the complete player experience. Your
          administrator session remains active so you can exit the player
          account and return here without signing in again.
        </p>
        <TestAccountList accounts={accounts} />
      </section>
    </main>
  );
}
