import DatabaseAdmin from "./database-admin";

import { getArtworkStorageConnectionStatus } from "@/server/artwork-storage";
import { listDatabaseSnapshots } from "@/server/database-snapshots";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function DatabaseAdminPage() {
  const database = await getDatabase();

  return (
    <main className="admin-tools">
      <h1>Database</h1>
      <p className="database-admin-warning">
        Content packages exclude players and generated game state, but artwork
        metadata may still be private until publication. Transfer them
        securely.
      </p>
      <DatabaseAdmin
        databaseName={database.databaseName}
        initialSnapshots={await listDatabaseSnapshots()}
        initialStorageStatus={await getArtworkStorageConnectionStatus()}
      />
    </main>
  );
}
