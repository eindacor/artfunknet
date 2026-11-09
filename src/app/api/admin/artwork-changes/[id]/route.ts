import { NextResponse } from "next/server";
import { requireAdminApi } from "@/server/admin-api";
import { artistErrorResponse } from "@/server/artist-api";
import { approveArtworkChange, denyArtworkChange } from "@/server/artist-artwork-changes";
import { getDatabase } from "@/server/mongodb";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json({ error: "The artwork metadata is invalid." }, { status: 400 });
  }
  try {
    const { id } = await params;
    const artwork = await approveArtworkChange(await getDatabase(), id, input, auth.session.email);
    return NextResponse.json({ artwork });
  } catch (error) { return artistErrorResponse(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const expectedRevision = Number.isSafeInteger(body?.expectedRevision) ? Number(body.expectedRevision) : undefined;
    await denyArtworkChange(await getDatabase(), id, expectedRevision);
    return NextResponse.json({ message: "Proposed changes denied. The original artwork was not changed." });
  } catch (error) { return artistErrorResponse(error); }
}
