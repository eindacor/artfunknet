import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getArtworkStorageConnectionStatus } from "@/server/artwork-storage";

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const status = await getArtworkStorageConnectionStatus({ verify: true });
  return NextResponse.json({ status });
}
