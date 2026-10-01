import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getFullDatabaseSnapshotDownload } from "@/server/full-database-snapshots";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { name } = await params;
  try {
    const snapshot = await getFullDatabaseSnapshotDownload(name);
    const body = Readable.toWeb(createReadStream(snapshot.path));
    return new Response(body as ReadableStream, {
      headers: {
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(snapshot.size),
        "content-type": "application/gzip",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The full database snapshot could not be found." },
      { status: 404 },
    );
  }
}
