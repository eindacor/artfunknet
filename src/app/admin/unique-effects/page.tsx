import { getArtworkEffects } from "@/server/artwork-effects";
import { getDatabase } from "@/server/mongodb";

import ArtworkEffectEditor, {
  type ArtworkEffectView,
} from "./unique-effect-editor";

type Attribute = {
  _id: string;
  icon?: string;
  npc_name: string;
};

type EffectArtwork = {
  _id: string;
  active: boolean;
  artist: string;
  effect_id: string;
  rarity: string;
  title: string;
};

export const dynamic = "force-dynamic";

export default async function UniqueEffectsAdminPage() {
  const database = await getDatabase();
  const [effects, attributes, artworks] = await Promise.all([
    getArtworkEffects(database),
    database
      .collection<Attribute>("attributes")
      .find({})
      .project<Attribute>({ icon: 1, npc_name: 1 })
      .toArray(),
    database
      .collection<EffectArtwork>("artworks")
      .find({ effect_id: { $type: "string" } })
      .project<EffectArtwork>({
        active: 1,
        artist: 1,
        effect_id: 1,
        rarity: 1,
        title: 1,
      })
      .sort({ effect_id: 1, active: -1, artist: 1, title: 1 })
      .toArray(),
  ]);
  const attributeNames = new Map(
    attributes.map((attribute) => [attribute._id, attribute.npc_name]),
  );
  const artworksByEffect = Map.groupBy(
    artworks,
    (artwork) => artwork.effect_id,
  );
  const records: ArtworkEffectView[] = effects.map(
    (attribute) => ({
      id: attribute._id,
      effectType: attribute.effect_type,
      title: attribute.title,
      description: attribute.description,
      flavorText: attribute.flavor_text,
      code: attribute.code,
      active: attribute.active,
      linkedAttributeIds: [...attribute.linked_attributes],
      linkedAttributeNames: attribute.linked_attributes.map(
        (id) => attributeNames.get(id) ?? id,
      ),
      linkedAttributeIcons: attribute.linked_attributes.map(
        (id) => attributes.find((entry) => entry._id === id)?.icon ?? "fa-tag",
      ),
      parameters: attribute.parameters,
      artworks: (artworksByEffect.get(attribute._id) ?? []).map((artwork) => ({
        id: artwork._id,
        active: artwork.active,
        artist: artwork.artist,
        rarity: artwork.rarity,
        title: artwork.title,
      })),
      artworkCount: artworksByEffect.get(attribute._id)?.length ?? 0,
    }),
  );

  return (
    <main className="admin-tools unique-effects-admin-page">
      <h1>Unique effects</h1>
      <section>
        <p>
          Legendary effects link two attributes; masterpiece effects link one.
          New effects remain inactive until explicitly activated.
        </p>
        <ArtworkEffectEditor
          attributes={attributes.map((attribute) => ({
            id: attribute._id,
            icon: attribute.icon ?? "fa-tag",
            name: attribute.npc_name,
          }))}
          initialRecords={records}
        />
      </section>
    </main>
  );
}
