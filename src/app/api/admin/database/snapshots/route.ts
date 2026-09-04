import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  generateDatabaseSnapshot,
  listDatabaseSnapshots,
} from "@/server/database-snapshots";
import { getDatabase } from "@/server/mongodb";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    snapshots: await listDatabaseSnapshots(),
  });
}

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await generateDatabaseSnapshot(await getDatabase());
    return NextResponse.json({ status: "ok", snapshot });
  } catch (error) {
    console.error("Unable to generate database snapshot", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The content package could not be generated.",
      },
      { status: 500 },
    );
  }
}
