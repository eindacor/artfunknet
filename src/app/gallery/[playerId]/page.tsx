import Link from "next/link";
import { notFound } from "next/navigation";

import PublicGallery from "@/components/public-gallery";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getPublicGalleryView } from "@/server/public-showcase";
import { getPlayerSession } from "@/server/session";

export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const [{ playerId }, session, database] = await Promise.all([
    params,
    getPlayerSession(),
    getDatabase(),
  ]);
  const gallery = await getPublicGalleryView(
    database,
    playerId,
    session?.playerId ?? null,
  );
  if (!gallery) notFound();

  const legendaryIds = [
    ...new Set(
      gallery.items
        .map((item) => item.active_unique_attribute)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const legendaryAttributes = await getLegendaryAttributes(
    database,
    legendaryIds,
  );

  return (
    <main className="public-showcase-page public-gallery-page">
      <header className="public-showcase-header">
        <Link className="nav-title" href="/">
          artfunkel
        </Link>
        <Link
          className="public-showcase-nav-link"
          href={session ? "/play" : "/play/login"}
        >
          {session ? "Dashboard" : "Sign in"}
        </Link>
      </header>
      <section className="public-gallery-intro">
        <p>Public gallery</p>
        <h1>@{gallery.owner.screenName}</h1>
        <span>
          {gallery.items.length.toLocaleString()}{" "}
          {gallery.items.length === 1 ? "work" : "works"} on display
        </span>
      </section>
      <PublicGallery
        items={JSON.parse(JSON.stringify(gallery.items))}
        legendaryAttributes={legendaryAttributes.map((attribute) => ({
          id: attribute._id,
          title: attribute.title,
          description: attribute.description,
          flavorText: attribute.flavor_text,
          code: attribute.code,
          active: attribute.active,
        }))}
        owner={gallery.owner}
        viewerId={session?.playerId ?? null}
      />
    </main>
  );
}
