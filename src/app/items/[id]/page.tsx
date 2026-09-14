import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import type { ArtworkImageRecord } from "@/server/artwork-storage";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getPublicItemView } from "@/server/public-showcase";
import { getPlayerSession } from "@/server/session";

import AnonymousItemView from "./anonymous-item-view";

const RARITY_COLORS: Record<string, string> = {
  common: "#39b54a",
  uncommon: "#3e7bff",
  rare: "#e1c429",
  legendary: "#ff8a1f",
  masterpiece: "#42e8f5",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const database = await getDatabase();
  const itemView = await getPublicItemView(database, id, null);

  if (!itemView) {
    return {
      title: "Item Not Found | artfunkel",
    };
  }

  const { artwork } = itemView.item;
  const title = artwork.title || "Untitled Artwork";
  const rarityFormatted =
    artwork.rarity.charAt(0).toUpperCase() + artwork.rarity.slice(1);
  const description = `${artwork.medium} • ${rarityFormatted}`;
  const imageUrl = `/api/artwork/${artwork._id}/image?variant=card`;
  const themeColor = RARITY_COLORS[artwork.rarity] || "#39b54a";

  let imageWidth: number | undefined;
  let imageHeight: number | undefined;

  const rawImage = (artwork as unknown as { image?: ArtworkImageRecord }).image;
  if (rawImage && "variants" in rawImage && rawImage.variants?.card) {
    imageWidth = rawImage.variants.card.width;
    imageHeight = rawImage.variants.card.height;
  } else if (!rawImage) {
    // Fallback seed_image.png has a 16:9 aspect ratio (3839x2159)
    imageWidth = 1200;
    imageHeight = 675;
  }

  return {
    title: `${title} | artfunkel`,
    description,
    other: {
      "theme-color": themeColor,
    },
    openGraph: {
      title: `${title} | artfunkel`,
      description,
      siteName: "artfunkel",
      images: [
        {
          url: imageUrl,
          width: imageWidth,
          height: imageHeight,
          type: "image/png",
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | artfunkel`,
      description,
      images: [imageUrl],
    },
  };
}

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
