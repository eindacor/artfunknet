import { notFound, redirect } from "next/navigation";

import { getDatabase } from "@/server/mongodb";
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
  const galleryOwner = await database
    .collection<{ _id: string; active: boolean }>("players")
    .findOne(
      { _id: playerId, active: true },
      { projection: { _id: 1 } },
    );
  if (!galleryOwner) notFound();
  if (session) {
    redirect(`/play?gallery=${encodeURIComponent(playerId)}`);
  }
  redirect("/play/login");
}
