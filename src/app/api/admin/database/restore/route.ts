import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { restoreDatabaseSnapshot } from "@/server/database-snapshots";
import { getDatabase } from "@/server/mongodb";

type RestoreRequest = {
  filename?: unknown;
  confirmation?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as RestoreRequest;
  if (
    typeof body.filename !== "string" ||
    typeof body.confirmation !== "string"
  ) {
    return NextResponse.json(
      { error: "Choose a content package and enter the load confirmation." },
      { status: 400 },
    );
  }
  try {
    const result = await restoreDatabaseSnapshot(
      await getDatabase(),
      body.filename,
      body.confirmation,
    );
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    console.error("Unable to restore database snapshot", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The content package could not be loaded.",
      },
      { status: 409 },
    );
  }
}
