import { notFound, redirect } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
import { getPlayerSession } from "@/server/session";
import { getGalleryExhibition } from "@/server/gallery-exhibition";
import AnonymousGalleryView from "./anonymous-gallery-view";

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
  const galleryOwner = await database
    .collection<{ _id: string; active: boolean }>("players")
    .findOne(
      { _id: playerId, active: true, account_deletion: { $ne: true } },
      { projection: { _id: 1 } },
    );
  if (!galleryOwner) notFound();
  if (session) {
    redirect(`/play?gallery=${encodeURIComponent(playerId)}`);
  }
  const gallery = await getGalleryExhibition(database, playerId, null);
  if (!gallery) notFound();
  return <AnonymousGalleryView gallery={JSON.parse(JSON.stringify(gallery))} />;
}
