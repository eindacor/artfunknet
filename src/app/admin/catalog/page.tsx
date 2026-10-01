import { getDatabase } from "@/server/mongodb";
import { getArtworkEffects } from "@/server/artwork-effects";

import CatalogEditor, {
  type ArtistCatalogEntry,
  type ArtworkCatalogEntry,
  type ArtworkEffectOption,
  type ArtworkEffectDistribution,
} from "./catalog-editor";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const database = await getDatabase();
  const [artistDocuments, effects, effectCounts, artworkDocuments] =
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
      getArtworkEffects(database),
      database
        .collection("artworks")
        .aggregate<{ _id: string; count: number }>([
          { $match: { effect_id: { $type: "string" } } },
          { $group: { _id: "$effect_id", count: { $sum: 1 } } },
        ])
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
              effect_id: 1,
              height: 1,
              width: 1,
              active: 1,
              nsfw: 1,
              image: 1,
            },
          },
        )
        .sort({ artist: 1, title: 1 })
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
  const effectCountById = new Map(
    effectCounts.map((entry) => [entry._id, entry.count]),
  );
  const effectDistribution: ArtworkEffectDistribution[] = effects.map(
    (effect) => ({
      id: effect._id,
      title: effect.title,
      effectType: effect.effect_type,
      artworkCount: effectCountById.get(effect._id) ?? 0,
    }),
  );
  const effectOptions: ArtworkEffectOption[] = effects.map((effect) => ({
    id: effect._id,
    title: effect.title,
    effectType: effect.effect_type,
    active: effect.active,
  }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Catalog editor</h1>
        <p className="mt-2 text-[var(--muted)]">
          Add artwork with its full image set, or modify approved artwork and
          artist records.
        </p>
      </div>
      <CatalogEditor
        effectDistribution={effectDistribution}
        effectOptions={effectOptions}
        initialArtists={artists}
        initialArtworks={JSON.parse(
          JSON.stringify(
            artworkDocuments.map((artwork) => ({
              ...artwork,
              hasImage: Boolean(
                artwork.image?.variants?.full?.storage ??
                  artwork.image?.storage,
              ),
            })),
          ),
        )}
      />
    </main>
  );
}
