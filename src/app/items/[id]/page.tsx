import { notFound, redirect } from "next/navigation";

import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getPublicItemView } from "@/server/public-showcase";
import { getPlayerSession } from "@/server/session";

import AnonymousItemView from "./anonymous-item-view";

export default async function PublicItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session, database] = await Promise.all([
    params,
    getPlayerSession(),
    getDatabase(),
  ]);
  if (session) {
    redirect(`/play?item=${encodeURIComponent(id)}`);
  }
  const itemView = await getPublicItemView(database, id, null);
  if (!itemView) notFound();

  const legendaryAttributes = itemView.item.active_unique_attribute
    ? await getLegendaryAttributes(database, [
        itemView.item.active_unique_attribute,
      ])
    : [];

  return (
    <AnonymousItemView
      item={JSON.parse(JSON.stringify(itemView.item))}
      legendaryAttributes={legendaryAttributes.map((attribute) => ({
        id: attribute._id,
        title: attribute.title,
        description: attribute.description,
        flavorText: attribute.flavor_text,
        code: attribute.code,
        active: attribute.active,
      }))}
    />
  );
}
