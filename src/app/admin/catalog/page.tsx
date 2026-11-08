import { getDatabase } from "@/server/mongodb";
import { getArtworkEffects } from "@/server/artwork-effects";
import { getConfiguredCardCosmetics } from "@/components/item-cards/catalog";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import { getCardRendererSettings } from "@/server/card-renderer-settings";

import CatalogEditor, {
  type ArtistCatalogEntry,
  type ArtworkCatalogEntry,
  type ArtworkAttributeOption,
  type ArtworkEffectOption,
} from "./catalog-editor";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const database = await getDatabase();
  const [
    artistDocuments,
    effects,
    attributeDocuments,
    artworkDocuments,
    rendererSettings,
  ] =
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
        .collection<{
          _id: string;
          title: string;
          active: boolean;
        }>("attributes")
        .find({})
        .sort({ title: 1 })
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
              created_at: 1,
              date: 1,
              genre: 1,
              medium: 1,
              rarity: 1,
              value_scale: 1,
              effect_id: 1,
              special_attributes: 1,
              height: 1,
              width: 1,
              active: 1,
              nsfw: 1,
              image: 1,
              image_width: 1,
              image_height: 1,
              art_style_adjustments: 1,
              detail_image_adjustments: 1,
              thumbnail_adjustment: 1,
              feature_card_adjustment: 1,
            },
          },
        )
        .sort({ artist: 1, title: 1 })
        .toArray(),
      getCardRendererSettings(database),
    ]);

  const artworkCounts = new Map<string, number>();
  const cosmetics = new Map(getConfiguredCardCosmetics(rendererSettings.rendererNames).map(option => [option.id, option]));
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
  const effectOptions: ArtworkEffectOption[] = effects.map((effect) => ({
    id: effect._id,
    title: effect.title,
    effectType: effect.effect_type,
    active: effect.active,
  }));
  const attributeOptions: ArtworkAttributeOption[] = attributeDocuments.map(
    (attribute) => ({
      id: attribute._id,
      title: attribute.title,
      active: attribute.active,
    }),
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Catalog editor</h1>
        <p className="mt-2 text-[var(--muted)]">
          Modify approved artwork and artist records. Use the Add artwork
          panel to upload and configure new artwork.
        </p>
      </div>
      <CatalogEditor
        rendererOptions={SHOWCASE_CARD_RENDERER_IDS.map(id => ({ id, name: cosmetics.get(id)?.name ?? id }))}
        attributeOptions={attributeOptions}
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
