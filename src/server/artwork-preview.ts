import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { processArtworkImage } from "./artwork-image-processing";
import { readArtworkUpload } from "./artwork-storage";

export async function artworkPreviewResponse(request: Request) {
  let processed: Awaited<ReturnType<typeof processArtworkImage>> | undefined;
  try {
    const file = (await request.formData()).get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Select an image to preview." }, { status: 400 });
    const upload = await readArtworkUpload(file);
    // PNG previews also support source formats that browsers cannot display.
    processed = await processArtworkImage({ artworkId: "preview", extension: "png", source: upload.bytes });
    const bytes = await readFile(/* turbopackIgnore: true */ processed.variants.card.path);
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "content-type": "image/png", "cache-control": "no-store",
      "x-artwork-width": String(processed.variants.full.width),
      "x-artwork-height": String(processed.variants.full.height),
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The image could not be previewed." }, { status: 400 });
  } finally { await processed?.cleanup(); }
}
