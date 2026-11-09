import Link from "next/link";
import { redirect } from "next/navigation";
import { getConfiguredCardCosmetics } from "@/components/item-cards/catalog";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import { getPublicArtistProfile } from "@/server/contributing-artists";
import { getDatabase } from "@/server/mongodb";
import { requirePlayer } from "@/server/session";
import ArtistWorkspace from "./artist-workspace";
import type { ArtworkCatalogEntry } from "@/components/artwork-editor/types";
import type { ArtworkChangeRequest } from "@/server/artist-artwork-changes";

export const dynamic = "force-dynamic";

export default async function ArtistStudioPage() {
  const session = await requirePlayer();
  const database = await getDatabase();
  const artist = await getPublicArtistProfile(database, session.playerId);
  if (!artist) redirect("/artists/apply");
  const [settings, works, changes] = await Promise.all([
    getCardRendererSettings(database),
    database.collection<ArtworkCatalogEntry>("artworks")
      .find({ artist_id: artist.id }, { projection: {
        _id: 1, artist_id: 1, artist: 1, title: 1, date: 1, genre: 1, medium: 1, height: 1, width: 1,
        rarity: 1, value_scale: 1, image: 1, image_width: 1, image_height: 1, nsfw: 1,
        active: 1, submission_status: 1,
      } })
      .sort({ created_at: -1 }).toArray(),
    database.collection<ArtworkChangeRequest>("artwork_change_requests")
      .find({ artist_id: artist.id }).toArray(),
  ]);
  const cosmetics = new Map(getConfiguredCardCosmetics(settings.rendererNames).map(option => [option.id, option]));
  return <main className="mx-auto min-h-screen max-w-7xl space-y-8 px-6 py-8">
    <header className="flex flex-wrap items-center justify-between gap-5 border-b border-[var(--accent)]/40 pb-6">
      <div><p className="font-bold text-[var(--accent)]">artfunkel artist studio</p><h1 className="text-3xl font-bold">{artist.name}</h1></div>
      <nav className="flex flex-wrap gap-5 font-semibold text-[var(--accent)]">
        <Link href={`/play?gallery=${encodeURIComponent(session.playerId)}`}>My gallery</Link>
        <Link href="/play">Play artfunkel</Link><Link href="/play/account">Account settings</Link>
      </nav>
    </header>
    <ArtistWorkspace artist={artist} initialWorks={works.map(work => {
      const change = changes.find(candidate => candidate.artwork_id === work._id);
      const full = change?.image?.variants.full;
      const imageSource = change?.image ? {
        image: change.image, image_width: full!.width, image_height: full!.height,
        width: Number((change.metadata.height * full!.width / full!.height).toFixed(2)),
      } : {};
      return {
      id: work._id, title: work.title, status: work.submission_status === "pending" ? "Awaiting review" : work.active ? "Active" : "Inactive",
      artwork: JSON.parse(JSON.stringify(change ? { ...work, ...change.metadata, ...imageSource } : work)),
      pendingChange: Boolean(change), proposedImage: Boolean(change?.image),
    };
    })} rendererOptions={SHOWCASE_CARD_RENDERER_IDS.map(id => ({ id, name: cosmetics.get(id)?.name ?? id }))} />
  </main>;
}
