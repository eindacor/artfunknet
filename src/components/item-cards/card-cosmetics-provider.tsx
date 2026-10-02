"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CARD_COSMETICS,
  type CardCosmetic,
} from "./catalog";
import type { CardRendererId } from "./types";

type CardCosmeticsContextValue = {
  cosmetics: CardCosmetic[];
  updateName: (rendererId: CardRendererId, name: string) => void;
};

const CardCosmeticsContext = createContext<CardCosmeticsContextValue>({
  cosmetics: CARD_COSMETICS,
  updateName: () => undefined,
});

export function CardCosmeticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cosmetics, setCosmetics] = useState(CARD_COSMETICS);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/card-renderers", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as {
          cosmetics?: CardCosmetic[];
          error?: string;
        };
        if (!response.ok || !body.cosmetics) {
          throw new Error(body.error ?? "Art style names could not be loaded.");
        }
        setCosmetics(body.cosmetics);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("[CardCosmetics] failed to load names:", error);
        }
      });
    return () => controller.abort();
  }, []);

  const updateName = useCallback((rendererId: CardRendererId, name: string) => {
    setCosmetics((current) =>
      current.map((cosmetic) =>
        cosmetic.id === rendererId ? { ...cosmetic, name } : cosmetic,
      ),
    );
  }, []);
  const value = useMemo(
    () => ({ cosmetics, updateName }),
    [cosmetics, updateName],
  );

  return (
    <CardCosmeticsContext.Provider value={value}>
      {children}
    </CardCosmeticsContext.Provider>
  );
}

export function useCardCosmetics(): CardCosmetic[] {
  return useContext(CardCosmeticsContext).cosmetics;
}

export function useUpdateCardCosmeticName() {
  return useContext(CardCosmeticsContext).updateName;
}
