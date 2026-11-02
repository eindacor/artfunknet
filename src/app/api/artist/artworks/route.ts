import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireArtistApi, artistErrorResponse } from "@/server/artist-api";
import { ArtistExperienceError } from "@/server/contributing-artists";
import { ARTIST_AGREEMENT_VERSION, ARTIST_UPLOAD_AGREEMENT } from "@/server/artist-types";
import { validateArtworkInput } from "@/server/artwork-create-input";
import { deleteArtworkImageRecord, publishArtworkUpload, type ArtworkImageRecord } from "@/server/artwork-storage";

export async function POST(request: Request) {
  const auth = await requireArtistApi(request);
  if (!auth.ok) return auth.response;
  let image: ArtworkImageRecord | undefined;
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) throw new ArtistExperienceError("Select an image to upload.");
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(String(form.get("metadata")));
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    } catch { throw new ArtistExperienceError("The artwork metadata is invalid."); }
    if (input.agreementAccepted !== true || input.agreementVersion !== ARTIST_AGREEMENT_VERSION) {
      throw new ArtistExperienceError("Accept the artwork submission agreement before submitting.");
    }
    const validation = validateArtworkInput({ ...input, artist_id: auth.artist._id, rarity: "common", active: false });
    if (!validation.ok) throw new ArtistExperienceError(validation.error);
    const id = randomBytes(12).toString("hex");
    image = await publishArtworkUpload({ artworkId: id, file });
    const full = image.variants.full;
    const now = new Date();
    const artwork = {
      _id: id, ...validation.value, artist: auth.artist.artist_name, serial_counter: 0,
      width: Number((validation.value.height * full.width / full.height).toFixed(2)),
      image_width: full.width, image_height: full.height, image, value_scale: Math.random(), market_data: {},
      submission_status: "pending", submitted_by: auth.session.playerId, created_at: now,
      artist_license: {
        type: "until_removal_request", artist_id: auth.artist._id,
        agreement_version: ARTIST_AGREEMENT_VERSION, agreement: ARTIST_UPLOAD_AGREEMENT, accepted_at: now,
      },
    };
    await auth.database.collection<typeof artwork>("artworks").insertOne(artwork);
    return NextResponse.json({ artwork, message: "Artwork submitted for admin review." }, { status: 201 });
  } catch (error) {
    if (image) await deleteArtworkImageRecord(image).catch(() => console.error("Artist upload image cleanup failed"));
    return artistErrorResponse(error);
  }
}
