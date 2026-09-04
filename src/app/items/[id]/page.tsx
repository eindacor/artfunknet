import Link from "next/link";
import { notFound } from "next/navigation";

import { resolveCardRendererId } from "@/components/item-cards/selection";
import { StandardItemDetails } from "@/components/item-cards/standard-item-dialog";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getPublicItemView } from "@/server/public-showcase";
import { getPlayerSession } from "@/server/session";

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
  const itemView = await getPublicItemView(
    database,
    id,
    session?.playerId ?? null,
  );
  if (!itemView) notFound();

  const legendaryAttributes = itemView.item.active_unique_attribute
    ? await getLegendaryAttributes(database, [
        itemView.item.active_unique_attribute,
      ])
    : [];

  return (
    <main className="public-showcase-page public-item-page">
      <PublicShowcaseHeader signedIn={Boolean(session)} />
      <article
        className="standard-item-dialog public-item-record"
        data-mint={itemView.item.mint ? "true" : undefined}
        data-rarity={itemView.item.artwork.rarity}
        data-seasonal={itemView.item.seasonal ? "true" : undefined}
      >
        <StandardItemDetails
          currentRendererId={resolveCardRendererId({
            itemRendererId: itemView.item.card_renderer,
          })}
          displayOwner={itemView.displayOwner ?? undefined}
          item={itemView.item}
          legendaryAttributes={legendaryAttributes.map((attribute) => ({
            id: attribute._id,
            title: attribute.title,
            description: attribute.description,
            flavorText: attribute.flavor_text,
            code: attribute.code,
            active: attribute.active,
          }))}
          permissions={{
            canManageItem: false,
            canCustomizeCosmetic: false,
          }}
          viewerId={session?.playerId ?? null}
        />
      </article>
    </main>
  );
}

function PublicShowcaseHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="public-showcase-header">
      <Link className="nav-title" href="/">
        artfunkel
      </Link>
      <Link
        className="public-showcase-nav-link"
        href={signedIn ? "/play" : "/play/login"}
      >
        {signedIn ? "Dashboard" : "Sign in"}
      </Link>
    </header>
  );
}
