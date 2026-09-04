import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { storeUploadedDatabaseSnapshot } from "@/server/database-snapshots";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const formData = await request.formData();
  const file = formData.get("snapshot");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Choose an Artfunknet content package." },
      { status: 400 },
    );
  }
  try {
    const snapshot = await storeUploadedDatabaseSnapshot(
      file.name,
      Buffer.from(await file.arrayBuffer()),
    );
    return NextResponse.json({ status: "ok", snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The content package could not be uploaded.",
      },
      { status: 400 },
    );
  }
}
