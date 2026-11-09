import { getConfiguredCardCosmetics } from "@/components/item-cards/catalog";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import { getDatabase } from "@/server/mongodb";
import type { ArtistRecord } from "@/server/artist-types";
import type { ArtworkCatalogEntry } from "@/components/artwork-editor/types";
import type { ArtworkChangeRequest } from "@/server/artist-artwork-changes";
import ArtworkSubmissionReviews from "./artwork-submission-reviews";

export const dynamic = "force-dynamic";

export default async function ArtworkSubmissionsPage() {
  const database = await getDatabase();
  const [works, artists, settings, changes] = await Promise.all([
    database.collection<ArtworkCatalogEntry>("artworks").find({
      submission_status: { $in: ["pending", "denying"] }, active: false,
    }).sort({ created_at: 1 }).toArray(),
    database.collection<ArtistRecord>("artists").find({}).sort({ artist_name: 1 }).toArray(),
    getCardRendererSettings(database),
    database.collection<ArtworkChangeRequest>("artwork_change_requests").find({}).sort({ created_at: 1 }).toArray(),
  ]);
  const currentWorks = changes.length ? await database.collection<ArtworkCatalogEntry>("artworks")
    .find({ _id: { $in: changes.map(change => change.artwork_id) } }).toArray() : [];
  const initialChanges = changes.map(change => {
    const current = currentWorks.find(work => work._id === change.artwork_id) ?? null;
    const base = current ?? change.original;
    const full = change.image?.variants.full;
    const ratio = full ? full.width / full.height : base.width / base.height;
    return {
      changeId: change._id, current, hasNewImage: Boolean(change.image), revision: change.revision ?? 0,
      artwork: {
        ...base, ...change.metadata, width: Number((change.metadata.height * ratio).toFixed(2)),
        ...(change.image ? { image: change.image, image_width: full!.width, image_height: full!.height } : {}),
      },
    };
  });
  const cosmetics = new Map(getConfiguredCardCosmetics(settings.rendererNames).map(option => [option.id, option]));
  return <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
    <h1 className="text-3xl font-bold">Artwork submissions</h1>
    <p className="text-[var(--muted)]">Review new artist uploads and proposed changes to existing artwork. New artwork acceptance assigns a random value scale and the least-represented active effect or special attribute required by its chosen rarity. Change requests preserve the artwork&apos;s gameplay settings. Denying a change request removes only the proposal and its replacement image, not the original artwork.</p>
    <ArtworkSubmissionReviews initialWorks={JSON.parse(JSON.stringify(works))} initialChanges={JSON.parse(JSON.stringify(initialChanges))}
      artists={artists.map(artist => ({ id: artist._id, name: artist.artist_name,
        dateOfBirth: artist.date_of_birth ?? "", dateOfDeath: "", artworkCount: 0 }))}
      rendererOptions={SHOWCASE_CARD_RENDERER_IDS.map(id => ({ id, name: cosmetics.get(id)?.name ?? id }))} />
  </main>;
}
