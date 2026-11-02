import { requireAdminApi } from "@/server/admin-api";
import { artworkPreviewResponse } from "@/server/artwork-preview";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  return artworkPreviewResponse(request);
}
