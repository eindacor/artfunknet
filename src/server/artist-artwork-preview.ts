import type { Artwork } from "./gameplay.ts";
import type { HydratedGameItem } from "./item-artwork.ts";

export function createArtistArtworkPreview(artwork: Artwork): HydratedGameItem {
  return {
    _id: `artist-preview:${artwork._id}`, artwork_id: artwork._id, artwork, card_renderer: "museum",
    condition: 1, mint: false, mint_value_multiplier: 1,
    attributes: { locked: [], unlocked: [], special: [] },
    owner: "preview", transaction_history: [], status: "displayed", revealed: true,
    source: "artist showcase preview", date_created: "2026-01-01", date_received: "2026-01-01",
    level: 0, roll_count: 0, reroll_spent: 0, foil: false, unlocked: false,
    seasonal: false, lottery: 0, original: false, patreon: false, vintage: false,
    authenticity: { forgery: false, forgery_quality: 0, liable: "", liability_pending: false,
      identified: false, fee: 0, original_owner: "" },
    tags: [], misprint: false, permanent: false, repairing: false, debug: false,
    odds: "", values: { sell: 0, purchase: 0, actual: 0, auction_min: 0, collector: 0, dealer: 0 },
    reroll_cost: 0,
  };
}
