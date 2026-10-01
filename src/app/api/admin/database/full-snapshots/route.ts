import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  generateFullDatabaseSnapshot,
  listFullDatabaseSnapshots,
} from "@/server/full-database-snapshots";
import { getDatabase } from "@/server/mongodb";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    snapshots: await listFullDatabaseSnapshots(),
  });
}

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  try {
    const database = await getDatabase();
    const snapshot = await generateFullDatabaseSnapshot(
      database.databaseName,
    );
    return NextResponse.json({ status: "ok", snapshot });
  } catch (error) {
    console.error("Unable to generate full database snapshot", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The full database snapshot could not be generated.",
      },
      { status: 500 },
    );
  }
}
