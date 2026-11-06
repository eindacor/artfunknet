const pixelArtCache = new Map<string, Promise<string>>();
const PIXEL_ART_CACHE_LIMIT = 32;

export function getArcadePixelSource(source: string): string {
  if (!source.startsWith("/api/artwork/")) return source;
  const url = new URL(source, "https://artfunkel.invalid");
  // Bypass CDN redirects so the canvas can read the pixels.
  url.searchParams.set("texture", "1");
  return `${url.pathname}${url.search}`;
}

export function loadArcadePixelArt(source: string): Promise<string> {
  const cached = pixelArtCache.get(source);
  if (cached) return cached;
  const sameOriginArtwork = source.startsWith("/api/artwork/");
  const cacheable = sameOriginArtwork &&
    !new URL(source, "https://artfunkel.invalid").searchParams.has("admin");
  const pending = new Promise<string>((resolve, reject) => {
    const image = new Image();
    // Match background-image requests for same-origin artwork to reuse the download.
    if (!sameOriginArtwork) image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("Pixel artwork has no image dimensions.");
        const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Pixel artwork rendering is unavailable.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Pixel artwork could not be loaded."));
    image.src = getArcadePixelSource(source);
  }).catch(error => {
    if (pixelArtCache.get(source) === pending) pixelArtCache.delete(source);
    throw error;
  });
  if (cacheable) {
    if (pixelArtCache.size >= PIXEL_ART_CACHE_LIMIT) {
      pixelArtCache.delete(pixelArtCache.keys().next().value!);
    }
    pixelArtCache.set(source, pending);
  }
  return pending;
}
