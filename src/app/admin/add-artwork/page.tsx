import { getConfiguredCardCosmetics } from "@/components/item-cards/catalog";
import { SHOWCASE_CARD_RENDERER_IDS } from "@/components/item-cards/types";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import { getDatabase } from "@/server/mongodb";
import NewArtworkForm from "./new-artwork-form";

export const dynamic = "force-dynamic";

export default async function AddArtworkPage() {
  const database = await getDatabase();
  const [artists, settings] = await Promise.all([
    database.collection<{
      _id: string; artist_name: string;
      date_of_birth?: string | null; date_of_death?: string | null;
    }>("artists").find({}).sort({ artist_name: 1 }).toArray(),
    getCardRendererSettings(database),
  ]);
  const cosmetics = new Map(getConfiguredCardCosmetics(settings.rendererNames).map(option => [option.id, option]));
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <NewArtworkForm
        initialArtists={artists.map(artist => ({
          id: artist._id, name: artist.artist_name,
          dateOfBirth: artist.date_of_birth ?? "",
          dateOfDeath: artist.date_of_death ?? "", artworkCount: 0,
        }))}
        rendererOptions={SHOWCASE_CARD_RENDERER_IDS.map(id => ({
          id, name: cosmetics.get(id)?.name ?? id,
        }))}
      />
    </main>
  );
}
