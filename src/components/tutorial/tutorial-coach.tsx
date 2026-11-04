"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TutorialElement as Step, TUTORIAL_MESSAGES, TUTORIAL_ORDER, type TutorialElement } from "@/shared/tutorial";
import { useTutorial } from "./tutorial-provider";
import styles from "./tutorial.module.css";

type Target = { element: HTMLElement; primary: boolean; message: string; step: TutorialElement };

function findTarget(step: TutorialElement): Target | null {
  const selector = (element: TutorialElement) => `[data-tutorial-element="${element}"]`;
  const candidates = [
    { selector: step === Step.TUTORIAL_CLAIM_ITEM ? `.loot-preview ${selector(step)}` : selector(step),
      message: TUTORIAL_MESSAGES[step], primary: true },
    { selector: selector(step), message: TUTORIAL_MESSAGES[step], primary: true },
  ];
  if (step === Step.TUTORIAL_FEATURE_ITEM) {
    candidates.push({ selector: selector(Step.TUTORIAL_SELECT_ITEM),
      message: "Select an unfeatured work from your collection to see the Feature button. If none are available, skip this step.",
      primary: false });
  } else if (step === Step.TUTORIAL_CLAIM_ITEM) {
    candidates.push({ selector: '[data-tutorial-loot-category="unclaimed"]',
      message: "Choose Unclaimed to find an offer, then add it to your collection.", primary: false });
  } else if (step === Step.TUTORIAL_MEET_VISITOR) {
    candidates.push({ selector: selector(Step.TUTORIAL_GO_TO_GALLERY),
      message: "Return to your own gallery and interact with an Art Donor.", primary: false });
  } else if (step === Step.TUTORIAL_SEE_ACTION_INFO) {
    candidates.push({ selector: "[data-tutorial-close-modify]",
      message: "Close this dialog to see the action information button.", primary: false });
  }
  const needsModifyDialog: TutorialElement[] = [
    Step.TUTORIAL_SEE_MODIFY_ATTRIBUTES, Step.TUTORIAL_REROLL_ATTRIBUTE, Step.TUTORIAL_REROLL_VALUE,
  ];
  if (needsModifyDialog.includes(step)) {
    candidates.push({ selector: selector(Step.TUTORIAL_SEE_MODIFY_ATTRIBUTES),
      message: "This work has no suitable attributes for this action. Close this dialog and select another work, or skip this step.",
      primary: false });
    candidates.push({ selector: selector(Step.TUTORIAL_MODIFY_ITEM),
      message: "Select a work and open Modify attributes to continue.", primary: false });
  }
  const needsOffers: TutorialElement[] = [Step.TUTORIAL_SEE_OFFERS, Step.TUTORIAL_CLAIM_ITEM, Step.TUTORIAL_DAILY_CRATE];
  const destination = needsOffers.includes(step) ? "loot" : "collection";
  const needsGallery = step === Step.TUTORIAL_GO_TO_GALLERY || step === Step.TUTORIAL_MEET_VISITOR;
  const homeMessage = needsGallery ? "Return Home, then press Go to your gallery." : "Return Home to continue.";
  candidates.push({ selector: destination === "loot" ? ".loot-dashboard"
    : needsGallery ? ".home-featured-panel" : selector(Step.TUTORIAL_SELECT_ITEM),
    message: step === Step.TUTORIAL_CLAIM_ITEM
      ? "No unclaimed offers are available here. Open a crate to get more offers, or skip this step."
      : destination === "loot" ? "You're already in Offers. If the required action isn't available, skip this step."
      : needsGallery ? "Press Go to your gallery to continue. If it isn't available, skip this step."
      : "Select a work from your collection to continue. If no suitable work is available, skip this step.",
    primary: false });
  candidates.push({ selector: `[data-tutorial-navigation="${destination}"]`,
    message: destination === "loot" ? "Go to Offers to continue." : homeMessage, primary: false });
  candidates.push({ selector: ".dashboard-navigation .responsive-menu-toggle",
    message: destination === "loot" ? "Open this menu, then choose Offers." : `Open this menu. ${homeMessage}`,
    primary: false });
  const modal = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
  if (modal) candidates.push({ selector: "dialog[open]",
    message: "Close this dialog to continue the walkthrough, or skip this step.", primary: false });
  for (const candidate of candidates) {
    const element = [...document.querySelectorAll<HTMLElement>(candidate.selector)].find(target =>
      (!modal || modal.contains(target)) && target.getClientRects().length > 0 &&
      getComputedStyle(target).visibility !== "hidden");
    if (element) {
      const reason = element.getAttribute("data-tutorial-unavailable") ||
        (element.matches(':disabled, [aria-disabled="true"]')
          ? element.getAttribute("data-tooltip") || element.title || "This action isn't available right now."
          : "");
      return { element, message: reason ? `${reason} You can skip this step to continue the walkthrough.` : candidate.message,
        primary: candidate.primary && !reason, step };
    }
  }
  return null;
}

export default function TutorialCoach() {
  const { progress, showTutorial, fulfillTutorial, skipTutorial, retryTutorial, saving, error } = useTutorial();
  const [target, setTarget] = useState<Target | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef<HTMLDialogElement>(null);
  const step = progress.step;

  useEffect(() => {
    if (!step || step === Step.TUTORIAL_COMPLETE) return;
    let frame = 0;
    const update = () => {
      const next = findTarget(step);
      setTarget(current => current?.element === next?.element && current?.message === next?.message &&
        current?.step === next?.step ? current : next);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "open", "hidden", "data-open", "disabled", "aria-disabled", "title", "data-tooltip",
        "data-tutorial-element", "data-tutorial-unavailable"],
    });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, [step]);

  useEffect(() => {
    if (step !== Step.TUTORIAL_COMPLETE) return;
    const dialog = completionRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [step]);

  useEffect(() => {
    const bubble = bubbleRef.current;
    const anchor = target?.element;
    if (!step || target?.step !== step || !anchor || !bubble) return;
    anchor.classList.add(styles.highlight);
    anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
    bubble.showPopover();
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const width = bubble.offsetWidth, height = bubble.offsetHeight;
      const above = bounds.bottom + height + 24 > innerHeight && bounds.top >= height + 24;
      bubble.style.left = `${Math.max(16, Math.min(bounds.left + bounds.width / 2 - width / 2, innerWidth - width - 16))}px`;
      bubble.style.top = `${Math.max(16, Math.min(above ? bounds.top - height - 12 : bounds.bottom + 12, innerHeight - height - 16))}px`;
    };
    const resize = new ResizeObserver(position);
    resize.observe(anchor);
    resize.observe(bubble);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    position();
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      anchor.classList.remove(styles.highlight);
      if (bubble.matches(":popover-open")) bubble.hidePopover();
    };
  }, [target, step]);

  if (step === Step.TUTORIAL_COMPLETE) {
    return (
      <dialog aria-describedby="tutorial-complete-description" aria-labelledby="tutorial-complete-title"
        className={`${styles.bubble} ${styles.completion}`} onCancel={event => event.preventDefault()} ref={completionRef}>
        <h2 id="tutorial-complete-title">You&apos;ve got the basics!</h2>
        <p id="tutorial-complete-description">{TUTORIAL_MESSAGES[step]}</p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.completionActions}>
          <a href="https://discord.gg/3dQdyhXVb" rel="noopener noreferrer" target="_blank">
            <i aria-hidden="true" className="fa-brands fa-discord" /> Join Discord
          </a>
          <button disabled={saving} onClick={() => void (error ? retryTutorial() : fulfillTutorial(step))} type="button">
            {saving ? "Saving..." : error ? "Retry saving" : "OK"}
          </button>
        </div>
      </dialog>
    );
  }
  if (!step || !showTutorial(step) || !target || target.step !== step || !target.element.isConnected) return null;
  const acknowledge = target.primary &&
    (step === Step.TUTORIAL_SEE_MODIFY_ATTRIBUTES || step === Step.TUTORIAL_SEE_ACTION_INFO);
  return createPortal(
    <div aria-label="Getting started" className={styles.bubble} data-tutorial-bubble={step}
      popover="manual" ref={bubbleRef} role="status">
      <strong className={styles.title}>
        <i aria-hidden="true" className="fa fa-star" /> Getting started
        <small>{TUTORIAL_ORDER.indexOf(step) + 1} / {TUTORIAL_ORDER.length}</small>
      </strong>
      <p>{target.message}</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {acknowledge || error ? (
        <button disabled={saving} onClick={() => void (error ? retryTutorial() : fulfillTutorial(step))} type="button">
          {saving ? "Saving..." : error ? "Retry saving" : "OK"}
        </button>
      ) : null}
      {!acknowledge ? (
        <button className={styles.skip} disabled={saving} onClick={() => void skipTutorial(step)}
          title="Continue without changing your items, currency, or daily crate." type="button">
          Skip step
        </button>
      ) : null}
    </div>,
    target.element.closest("dialog[open]") ?? document.body,
  );
}
