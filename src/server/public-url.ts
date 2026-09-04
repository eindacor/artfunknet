import "server-only";

export function getPublicBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim();
  const url = new URL(configured || new URL(request.url).origin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use http or https.");
  }
  return `${url.origin}/`;
}

export function getPublicCallbackUrl(
  request: Request,
  pathname: string,
  override?: string,
): string {
  return new URL(override?.trim() || pathname, getPublicBaseUrl(request)).toString();
}
