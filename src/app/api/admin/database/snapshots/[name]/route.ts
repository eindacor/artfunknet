import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { readDatabaseSnapshotFile } from "@/server/database-snapshots";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { name } = await params;
  try {
    const bytes = await readDatabaseSnapshotFile(name);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-disposition": `attachment; filename="${name}"`,
        "content-type": "application/gzip",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The database snapshot could not be found." },
      { status: 404 },
    );
  }
}
