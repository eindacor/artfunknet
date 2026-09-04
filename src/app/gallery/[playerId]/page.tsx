import { redirect } from "next/navigation";

import { getPlayerSession } from "@/server/session";

export default async function PublicGalleryPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const [{ playerId }, session] = await Promise.all([
    params,
    getPlayerSession(),
  ]);
  if (session) {
    redirect(`/play?gallery=${encodeURIComponent(playerId)}`);
  }
  redirect("/play/login");
}
