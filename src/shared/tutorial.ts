export const TutorialElement = {
  TUTORIAL_SELECT_ITEM: "TUTORIAL_SELECT_ITEM",
  TUTORIAL_FEATURE_ITEM: "TUTORIAL_FEATURE_ITEM",
  TUTORIAL_FILL_FEATURES: "TUTORIAL_FILL_FEATURES",
  TUTORIAL_GO_TO_GALLERY: "TUTORIAL_GO_TO_GALLERY",
  TUTORIAL_MEET_VISITOR: "TUTORIAL_MEET_VISITOR",
  TUTORIAL_SEE_OFFERS: "TUTORIAL_SEE_OFFERS",
  TUTORIAL_CLAIM_ITEM: "TUTORIAL_CLAIM_ITEM",
  TUTORIAL_DAILY_CRATE: "TUTORIAL_DAILY_CRATE",
  TUTORIAL_MODIFY_ITEM: "TUTORIAL_MODIFY_ITEM",
  TUTORIAL_SEE_MODIFY_ATTRIBUTES: "TUTORIAL_SEE_MODIFY_ATTRIBUTES",
  TUTORIAL_REROLL_ATTRIBUTE: "TUTORIAL_REROLL_ATTRIBUTE",
  TUTORIAL_REROLL_VALUE: "TUTORIAL_REROLL_VALUE",
  TUTORIAL_SEE_ACTION_INFO: "TUTORIAL_SEE_ACTION_INFO",
  TUTORIAL_COMPLETE: "TUTORIAL_COMPLETE",
} as const;

export type TutorialElement = typeof TutorialElement[keyof typeof TutorialElement];
export type TutorialProgress = { step: TutorialElement | null; revision: number };

export const TUTORIAL_ORDER: readonly TutorialElement[] = [
  TutorialElement.TUTORIAL_SELECT_ITEM,
  TutorialElement.TUTORIAL_FEATURE_ITEM,
  TutorialElement.TUTORIAL_FILL_FEATURES,
  TutorialElement.TUTORIAL_GO_TO_GALLERY,
  TutorialElement.TUTORIAL_MEET_VISITOR,
  TutorialElement.TUTORIAL_SEE_OFFERS,
  TutorialElement.TUTORIAL_CLAIM_ITEM,
  TutorialElement.TUTORIAL_DAILY_CRATE,
  TutorialElement.TUTORIAL_MODIFY_ITEM,
  TutorialElement.TUTORIAL_SEE_MODIFY_ATTRIBUTES,
  TutorialElement.TUTORIAL_REROLL_ATTRIBUTE,
  TutorialElement.TUTORIAL_REROLL_VALUE,
  TutorialElement.TUTORIAL_SEE_ACTION_INFO,
  TutorialElement.TUTORIAL_COMPLETE,
];

export const TUTORIAL_MESSAGES: Record<TutorialElement, string> = {
  TUTORIAL_SELECT_ITEM: "Select a work from your inventory to preview it.",
  TUTORIAL_FEATURE_ITEM: "Press Feature to display this work in your gallery.",
  TUTORIAL_FILL_FEATURES: "Fill every available feature slot to attract more visitors and earn money and XP.",
  TUTORIAL_GO_TO_GALLERY: "Use this button to see your featured works and visitors.",
  TUTORIAL_MEET_VISITOR: "Click an Art Donor in your own gallery to receive artwork offers.",
  TUTORIAL_SEE_OFFERS: "Find items that have been offered to you in the Offers section.",
  TUTORIAL_CLAIM_ITEM: "Select an unclaimed offer, then press Add to collection.",
  TUTORIAL_DAILY_CRATE: "Open your free daily crate for more artwork offers.",
  TUTORIAL_MODIFY_ITEM: "Open Modify attributes on a work in your collection.",
  TUTORIAL_SEE_MODIFY_ATTRIBUTES: "These attributes determine which visitors a featured work attracts. Higher values mean stronger attraction.",
  TUTORIAL_REROLL_ATTRIBUTE: "Use Replace attribute to change an unlocked visitor type.",
  TUTORIAL_REROLL_VALUE: "Use Reroll value to roll a new attraction value for an attribute.",
  TUTORIAL_SEE_ACTION_INFO: "Hover or tap this information icon for a guide to this work's action buttons.",
  TUTORIAL_COMPLETE: "Join our Discord community to meet other players, ask questions, and stay up to date with Artfunkel.",
};

export const CLIENT_TUTORIAL_ELEMENTS: readonly TutorialElement[] = [
  TutorialElement.TUTORIAL_SELECT_ITEM,
  TutorialElement.TUTORIAL_GO_TO_GALLERY,
  TutorialElement.TUTORIAL_SEE_OFFERS,
  TutorialElement.TUTORIAL_MODIFY_ITEM,
  TutorialElement.TUTORIAL_SEE_MODIFY_ATTRIBUTES,
  TutorialElement.TUTORIAL_SEE_ACTION_INFO,
  TutorialElement.TUTORIAL_COMPLETE,
];

export function isTutorialElement(value: unknown): value is TutorialElement {
  return typeof value === "string" && Object.values(TutorialElement).includes(value as TutorialElement);
}

export function getNextTutorialStep(step: TutorialElement): TutorialElement | null {
  const index = TUTORIAL_ORDER.indexOf(step);
  return index < 0 ? null : TUTORIAL_ORDER[index + 1] ?? null;
}

export function getPlayerTutorial(player: {
  tutorial?: TutorialProgress | null; account_type?: string; artist_id?: string;
}): TutorialProgress {
  if (player.account_type === "artist" || player.artist_id || !player.tutorial) return { step: null, revision: 0 };
  return {
    step: isTutorialElement(player.tutorial.step) ? player.tutorial.step : null,
    revision: Number.isSafeInteger(player.tutorial.revision) && player.tutorial.revision >= 0
      ? player.tutorial.revision : 0,
  };
}

export function mergeTutorialProgress(current: TutorialProgress, incoming: TutorialProgress): TutorialProgress {
  return incoming.revision > current.revision ? incoming : current;
}
