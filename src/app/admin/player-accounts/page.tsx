import PlayerAccountAdmin from "./player-account-admin";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export default async function PlayerAccountsAdminPage() {
  const database = await getDatabase();
  const [artists, players] = await Promise.all([
    database.collection<{ _id: string; artist_name: string; player_id?: string }>("artists")
      .find({}).project({ artist_name: 1, player_id: 1 }).sort({ artist_name: 1 }).toArray(),
    database.collection<{ _id: string; artist_id: string }>("players")
      .find({ artist_id: { $type: "string" } }).project({ artist_id: 1 }).toArray(),
  ]);
  const artistPlayers = new Map(players.map(player => [player.artist_id, player._id]));
  return (
    <main className="admin-tools">
      <h1>Player accounts</h1>
      <section>
        <h2>Account metadata and overrides</h2>
        <p>
          Search by player name or email to review account metadata, manage
          supporter status, reset a password, or link a catalog artist.
        </p>
        <PlayerAccountAdmin initialArtists={artists.map(artist => ({
          id: artist._id, name: artist.artist_name,
          playerId: artistPlayers.get(artist._id) ?? artist.player_id ?? null,
        }))} />
      </section>
    </main>
  );
}
