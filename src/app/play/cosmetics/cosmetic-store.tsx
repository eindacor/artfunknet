"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ItemCard from "@/components/item-cards/item-card";
import {
  type CardCosmetic,
  type CardRendererPriceMap,
  getActiveCardCosmetics,
  getOwnedCardRendererIds,
} from "@/components/item-cards/catalog";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function CosmeticStore({
  activeRendererIds,
  initialBankBalance,
  initialOwnedRendererIds,
  sampleItem,
  legendaryAttributes,
  rendererPrices,
}: {
  activeRendererIds: string[];
  initialBankBalance: number;
  initialOwnedRendererIds: string[];
  sampleItem: HydratedGameItem | null;
  legendaryAttributes: CardLegendaryAttribute[];
  rendererPrices: CardRendererPriceMap;
}) {
  const router = useRouter();
  const [bankBalance, setBankBalance] = useState(initialBankBalance);
  const [ownedRendererIds, setOwnedRendererIds] = useState(
    getOwnedCardRendererIds(initialOwnedRendererIds),
  );
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function purchase(cosmetic: CardCosmetic) {
    setPurchasingId(cosmetic.id);
    setError("");
    try {
      const response = await fetch(
        `/api/play/cosmetics/card-renderers/${cosmetic.id}/purchase`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        error?: string;
        bankBalance?: number;
        ownedRendererIds?: string[];
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The cosmetic could not be purchased.");
      }
      setBankBalance(body.bankBalance ?? bankBalance - cosmetic.price);
      setOwnedRendererIds(
        getOwnedCardRendererIds(body.ownedRendererIds),
      );
      router.refresh();
    } catch (purchaseError) {
      setError(
        purchaseError instanceof Error
          ? purchaseError.message
          : "The cosmetic could not be purchased.",
      );
    } finally {
      setPurchasingId(null);
    }
  }

  const owned = new Set(ownedRendererIds);

  return (
    <main className="cosmetic-store">
      <header className="cosmetic-store-heading">
        <div>
          <p>Artfunkel cosmetics</p>
          <h1>Card style store</h1>
          <span>
            Purchase a renderer once, then apply it independently to any
            artwork you own from that item&apos;s detail dialog.
          </span>
        </div>
        <strong>${bankBalance.toLocaleString()}</strong>
      </header>
      {error ? (
        <p className="cosmetic-store-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cosmetic-store-grid">
        {getActiveCardCosmetics(activeRendererIds, rendererPrices).map((cosmetic) => {
          const isOwned = owned.has(cosmetic.id);
          return (
            <article className="cosmetic-store-product" key={cosmetic.id}>
              <header>
                <span>
                  STYLE #{cosmetic.number.toString().padStart(2, "0")}
                </span>
                <h2>{cosmetic.name}</h2>
                <p>{cosmetic.description}</p>
              </header>
              <div className="cosmetic-store-preview">
                {sampleItem ? (
                  <ItemCard
                    forceRendererId={cosmetic.id}
                    item={sampleItem}
                    legendaryAttributes={legendaryAttributes}
                  />
                ) : (
                  <p>No artwork is available for this preview.</p>
                )}
              </div>
              <footer>
                <strong>
                  {cosmetic.price === 0
                    ? isOwned
                      ? "Included"
                      : "Free"
                    : `$${cosmetic.price.toLocaleString()}`}
                </strong>
                {isOwned ? (
                  <span className="cosmetic-owned">
                    <i aria-hidden="true" className="fa fa-check" /> owned
                  </span>
                ) : (
                  <button
                    disabled={
                      purchasingId !== null ||
                      bankBalance < cosmetic.price
                    }
                    onClick={() => purchase(cosmetic)}
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-shopping-cart" />
                    {purchasingId === cosmetic.id
                      ? "Purchasing..."
                      : cosmetic.price === 0
                        ? "Add"
                      : bankBalance < cosmetic.price
                        ? "Insufficient funds"
                        : "Purchase"}
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </main>
  );
}
