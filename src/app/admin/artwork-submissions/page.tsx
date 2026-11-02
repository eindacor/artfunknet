import { getConfiguredCardCosmetics } from "@/components/item-cards/catalog";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import { getDatabase } from "@/server/mongodb";
import type { ArtistRecord } from "@/server/artist-types";
import type { ArtworkCatalogEntry } from "@/components/artwork-editor/types";
import ArtworkSubmissionReviews from "./artwork-submission-reviews";

export const dynamic = "force-dynamic";

export default async function ArtworkSubmissionsPage() {
  const database = await getDatabase();
  const [works, artists, settings] = await Promise.all([
    database.collection<ArtworkCatalogEntry>("artworks").find({
      submission_status: { $in: ["pending", "denying"] }, active: false,
    }).sort({ created_at: 1 }).toArray(),
    database.collection<ArtistRecord>("artists").find({}).sort({ artist_name: 1 }).toArray(),
    getCardRendererSettings(database),
  ]);
  const cosmetics = new Map(getConfiguredCardCosmetics(settings.rendererNames).map(option => [option.id, option]));
  return <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
    <h1 className="text-3xl font-bold">Artwork submissions</h1>
    <p className="text-[var(--muted)]">Review incoming artist uploads, edit their metadata and crops, and choose a rarity. Accepting assigns a random value scale and the least-represented active effect or special attribute required by that rarity. These assignments can be edited in the catalog afterward. Denied submissions and their uploaded images are removed.</p>
    <ArtworkSubmissionReviews initialWorks={JSON.parse(JSON.stringify(works))}
      artists={artists.map(artist => ({ id: artist._id, name: artist.artist_name,
        dateOfBirth: artist.date_of_birth ?? "", dateOfDeath: "", artworkCount: 0 }))}
      rendererOptions={SHOWCASE_CARD_RENDERER_IDS.map(id => ({ id, name: cosmetics.get(id)?.name ?? id }))} />
  </main>;
}
