import {
  getLegendaryAttributes,
  type LegendaryAttributeParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";

import LegendaryAttributeEditor, {
  type LegendaryAttributeView,
} from "./legendary-attribute-editor";

type Attribute = {
  _id: string;
  npc_name: string;
};

export const dynamic = "force-dynamic";

export default async function LegendaryAttributesAdminPage() {
  const database = await getDatabase();
  const [legendaryAttributes, attributes] = await Promise.all([
    getLegendaryAttributes(database),
    database
      .collection<Attribute>("attributes")
      .find({})
      .project<Attribute>({ npc_name: 1 })
      .toArray(),
  ]);
  const attributeNames = new Map(
    attributes.map((attribute) => [attribute._id, attribute.npc_name]),
  );
  const records: LegendaryAttributeView[] = legendaryAttributes.map(
    (attribute) => ({
      id: attribute._id,
      title: attribute.title,
      description: attribute.description,
      flavorText: attribute.flavor_text,
      code: attribute.code,
      active: attribute.active,
      linkedAttributeNames: attribute.linked_attributes.map(
        (id) => attributeNames.get(id) ?? id,
      ) as [string, string],
      parameters: attribute.parameters as Record<
        string,
        LegendaryAttributeParameter
      >,
    }),
  );

  return (
    <main className="admin-tools">
      <h1>Legendary attributes</h1>
      <section>
        <h2>Pair effects</h2>
        <p>
          Legendary artwork receives the effect linked to its two special
          attributes. Masterpieces receive all three pair effects and may
          choose which one is active. Pair assignments are fixed to the
          original matrix; behavior, text, parameters, and availability can be
          changed here.
        </p>
        <LegendaryAttributeEditor initialRecords={records} />
      </section>
    </main>
  );
}
