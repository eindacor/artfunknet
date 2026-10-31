export const ITEM_SERIAL_INPUT_MAX_LENGTH = 64;
export const INVALID_FORGERY_SERIAL_MESSAGE =
  "The provided serial number is invalid.";

export type ItemSerialParts = {
  serial_number: number;
  serial_prefix: number;
};

export function getArtworkSerialPrefix(artworkId: string): number {
  if (/^[0-9a-f]+$/i.test(artworkId)) {
    return Number.parseInt(artworkId.slice(0, 12), 16);
  }
  // Older imports and test fixtures can use non-hexadecimal artwork IDs.
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffff");
  for (const byte of new TextEncoder().encode(artworkId)) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }
  return Number(hash);
}

export function formatItemSerialNumber(
  artworkId: string,
  serialNumber: number | undefined,
  serialPrefix = getArtworkSerialPrefix(artworkId),
): string {
  if (serialNumber === undefined) return "Not assigned";
  return `${serialPrefix}-${String(serialNumber).padStart(6, "0")}`;
}

export function parseItemSerialNumber(value: unknown): ItemSerialParts | null {
  if (typeof value !== "string" || value.length > ITEM_SERIAL_INPUT_MAX_LENGTH) {
    return null;
  }
  const match = /^(\d+)-(\d+)$/.exec(value.trim());
  if (!match) return null;
  const prefix = Number(match[1]);
  const number = Number(match[2]);
  if (
    !Number.isSafeInteger(prefix) || prefix < 0 ||
    !Number.isSafeInteger(number) || number < 1
  ) return null;
  return { serial_prefix: prefix, serial_number: number };
}

export function createRandomForgerySerial(
  artworkId: string,
  random: () => number = Math.random,
): ItemSerialParts {
  return {
    serial_prefix: getArtworkSerialPrefix(artworkId),
    serial_number: Math.floor(random() * 999_999) + 1,
  };
}
