import { getDatabase } from "@/server/mongodb";
import { MAX_FEATURED_ARTISTS, type ArtistRecord } from "@/server/artist-types";
import type { PlayerAccountRecord } from "@/server/player-account";
import ContributingArtistAccounts from "./contributing-artist-accounts";

export const dynamic = "force-dynamic";

export default async function ContributingArtistsPage() {
  const database = await getDatabase();
  const players = await database.collection<PlayerAccountRecord>("players").find({
    artist_id: { $type: "string" }, account_deletion: { $ne: true },
  }, { projection: { screen_name: 1, artist_id: 1, artist_featured: 1, active: 1 } }).sort({ screen_name: 1 }).toArray();
  const artists = await database.collection<ArtistRecord>("artists")
    .find({ _id: { $in: players.flatMap(player => player.artist_id ? [player.artist_id] : []) } }).toArray();
  const byId = new Map(artists.map(artist => [artist._id, artist]));
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
    <h1 className="text-3xl font-bold">Contributing artists</h1>
    <p className="text-[var(--muted)]">Feature up to {MAX_FEATURED_ARTISTS} artist galleries above the public gallery directory.</p>
    <ContributingArtistAccounts artists={players.flatMap(player => {
      const artist = player.artist_id ? byId.get(player.artist_id) : null;
      return artist ? [{ playerId: player._id, name: artist.artist_name, screenName: player.screen_name,
        portfolioUrl: artist.portfolio_url, featured: player.artist_featured === true, active: player.active }] : [];
    })} />
  </main>;
}
