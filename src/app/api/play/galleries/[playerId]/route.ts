import { NextResponse } from "next/server";

import {
  refreshGalleryMetadata,
} from "@/server/gallery-metadata";
import { getCommunityReactionSummary } from "@/server/community-reactions";
import { getLegendaryAttributes } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { getGalleryNpcs } from "@/server/npc-gameplay";
import { requirePlayerApi } from "@/server/player-api";
import { getPublicGalleryView } from "@/server/public-showcase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  const database = await getDatabase();
  const gallery = await getPublicGalleryView(
    database,
    playerId,
    auth.session.playerId,
  );
  if (!gallery) {
    return NextResponse.json(
      { error: "This gallery is unavailable." },
      { status: 404 },
    );
  }

  const metadata = await refreshGalleryMetadata(database, playerId);
  const legendaryIds = [
    ...new Set(
      gallery.items
        .map((item) => item.active_unique_attribute)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [npcs, legendaryAttributes, reactions] = await Promise.all([
    getGalleryNpcs(database, playerId),
    getLegendaryAttributes(database, legendaryIds),
    getCommunityReactionSummary(
      database,
      "gallery",
      playerId,
      auth.session.playerId,
    ),
  ]);

  return NextResponse.json({
    owner: gallery.owner,
    items: gallery.items,
    metadata: metadata ? { ...metadata, reactions } : null,
    npcs: npcs.map((npc) => ({
      ...npc,
      alreadyMet: npc.players_met.includes(auth.session.playerId),
    })),
    legendaryAttributes: legendaryAttributes.map((attribute) => ({
      id: attribute._id,
      title: attribute.title,
      description: attribute.description,
      flavorText: attribute.flavor_text,
      code: attribute.code,
      active: attribute.active,
    })),
  });
}
