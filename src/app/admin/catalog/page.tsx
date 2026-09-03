import { getDatabase } from "@/server/mongodb";

import CatalogEditor, {
  type ArtistCatalogEntry,
  type ArtworkCatalogEntry,
} from "./catalog-editor";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const database = await getDatabase();
  const [artistDocuments, artworkDocuments, attributeDocuments] =
    await Promise.all([
      database
        .collection<{
          _id: string;
          artist_name: string;
          date_of_birth?: string | null;
          date_of_death?: string | null;
        }>("artists")
        .find({})
        .sort({ artist_name: 1 })
        .toArray(),
      database
        .collection<ArtworkCatalogEntry>("artworks")
        .find(
          {},
          {
            projection: {
              _id: 1,
              artist_id: 1,
              artist: 1,
              title: 1,
              date: 1,
              genre: 1,
              medium: 1,
              rarity: 1,
              value_scale: 1,
              height: 1,
              width: 1,
              active: 1,
              nsfw: 1,
              special_attributes: 1,
              image: 1,
            },
          },
        )
        .sort({ artist: 1, title: 1 })
        .toArray(),
      database
        .collection<{ _id: string; npc_name: string; active: boolean }>(
          "attributes",
        )
        .find({ active: true })
        .sort({ npc_name: 1 })
        .toArray(),
    ]);

  const artworkCounts = new Map<string, number>();
  for (const artwork of artworkDocuments) {
    artworkCounts.set(
      artwork.artist_id,
      (artworkCounts.get(artwork.artist_id) ?? 0) + 1,
    );
  }
  const artists: ArtistCatalogEntry[] = artistDocuments.map((artist) => ({
    id: artist._id,
    name: artist.artist_name,
    dateOfBirth: artist.date_of_birth ?? "",
    dateOfDeath: artist.date_of_death ?? "",
    artworkCount: artworkCounts.get(artist._id) ?? 0,
  }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Catalog editor</h1>
        <p className="mt-2 text-[var(--muted)]">
          Modify approved artwork metadata and artist records. Image replacement
          remains in the artwork intake workflow.
        </p>
      </div>
      <CatalogEditor
        initialArtists={artists}
        initialArtworks={JSON.parse(
          JSON.stringify(
            artworkDocuments.map((artwork) => ({
              ...artwork,
              hasImage: Boolean(artwork.image?.storage),
            })),
          ),
        )}
        attributes={attributeDocuments.map((attribute) => ({
          id: attribute._id,
          name: attribute.npc_name,
        }))}
      />
    </main>
  );
}
