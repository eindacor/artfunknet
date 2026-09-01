import { NextResponse } from "next/server";

import { getPlayerSession } from "@/server/session";

export async function requirePlayerApi() {
  const session = await getPlayerSession();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Player authentication is required." },
        { status: 401 },
      ),
    };
  }

  return { ok: true as const, session };
}
