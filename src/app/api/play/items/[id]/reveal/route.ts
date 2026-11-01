import { NextResponse } from "next/server";

import { revealPlayerItem } from "@/server/item-reveal";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!(await revealPlayerItem(await getDatabase(), auth.session.playerId, id))) {
    return NextResponse.json(
      { error: "This offer is no longer available to reveal." },
      { status: 409 },
    );
  }
  return NextResponse.json({ itemId: id, revealed: true });
}
