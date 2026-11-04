"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  CLIENT_TUTORIAL_ELEMENTS, isTutorialElement, mergeTutorialProgress,
  type TutorialElement, type TutorialProgress,
} from "@/shared/tutorial";

type TutorialContextValue = {
  progress: TutorialProgress;
  saving: boolean;
  error: string;
  showTutorial: (element: TutorialElement) => boolean;
  fulfillTutorial: (element: TutorialElement) => Promise<void>;
  skipTutorial: (element: TutorialElement) => Promise<void>;
  retryTutorial: () => Promise<void>;
  updateTutorial: (progress?: TutorialProgress) => void;
};

const TutorialContext = createContext<TutorialContextValue>({
  progress: { step: null, revision: 0 }, saving: false, error: "",
  showTutorial: () => false, fulfillTutorial: async () => {}, updateTutorial: () => {},
  skipTutorial: async () => {}, retryTutorial: async () => {},
});

export function TutorialProvider({ initialProgress, children }: {
  initialProgress: TutorialProgress; children: ReactNode;
}) {
  const [cached, setCached] = useState(initialProgress);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{
    element: TutorialElement; revision: number; message: string; skip: boolean;
  } | null>(null);
  const inFlight = useRef(new Set<number>());
  const progress = mergeTutorialProgress(cached, initialProgress);
  if (progress !== cached) setCached(progress);
  const updateTutorial = useCallback((incoming?: TutorialProgress) => {
    if (!incoming || !Number.isSafeInteger(incoming.revision) ||
        (incoming.step !== null && !isTutorialElement(incoming.step))) return;
    setCached(current => mergeTutorialProgress(current, incoming));
  }, []);

  const saveTutorial = useCallback(async (element: TutorialElement, skip: boolean) => {
    if (progress.step !== element || inFlight.current.has(progress.revision) ||
        (!skip && !CLIENT_TUTORIAL_ELEMENTS.includes(element))) return;
    inFlight.current.add(progress.revision);
    setSaving(true);
    setFailure(null);
    try {
      const response = await fetch(skip ? "/api/play/tutorial" : "/api/play/tutorial/fulfill", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ element, revision: progress.revision, ...(skip ? { action: "skip" } : {}) }),
      });
      const body = await response.json() as { tutorial?: TutorialProgress; error?: string };
      if (!response.ok || !body.tutorial) throw new Error(body.error ?? "Your progress could not be saved.");
      updateTutorial(body.tutorial);
    } catch (error) {
      setFailure(current => current && current.revision > progress.revision ? current : {
        element, revision: progress.revision, skip,
        message: error instanceof Error ? error.message : "Your progress could not be saved." });
    } finally {
      inFlight.current.delete(progress.revision);
      setSaving(inFlight.current.size > 0);
    }
  }, [progress.step, progress.revision, updateTutorial]);
  const fulfillTutorial = useCallback((element: TutorialElement) => saveTutorial(element, false), [saveTutorial]);
  const skipTutorial = useCallback((element: TutorialElement) => saveTutorial(element, true), [saveTutorial]);

  return (
    <TutorialContext.Provider value={{
      progress, saving, error: failure?.element === progress.step && failure.revision === progress.revision ? failure.message : "",
      showTutorial: element => progress.step === element, fulfillTutorial, skipTutorial, updateTutorial,
      retryTutorial: () => failure ? saveTutorial(failure.element, failure.skip) : Promise.resolve(),
    }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
