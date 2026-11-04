"use client";

import { TutorialElement } from "@/shared/tutorial";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
} from "react";

type GroupableActionProps = {
  children?: ReactNode;
  destructive?: boolean;
};

export default function ItemActionLayout({
  actions,
  artStyleAction,
  className = "",
  onClick,
  primaryAction,
  showHelp = false,
}: {
  actions?: ReactNode;
  artStyleAction?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  primaryAction?: ReactNode;
  showHelp?: boolean;
}) {
  const { destructive, nonDestructive } = partitionActions(actions);
  if (
    !primaryAction &&
    nonDestructive.length === 0 &&
    destructive.length === 0 &&
    !artStyleAction
  ) {
    return null;
  }

  return (
    <div
      className={`${className} card-actions${
        primaryAction ? " card-actions-with-primary" : ""
      }${showHelp ? " card-actions-with-help" : ""}`.trim()}
      onClick={onClick}
    >
      {primaryAction ? (
        <section
          aria-label="Main action"
          className="card-action-main card-action-primary"
        >
          {primaryAction}
        </section>
      ) : null}
      <div className="card-action-groups">
        <section
          aria-label="Non-destructive actions"
          className="card-action-section card-action-nondestructive"
        >
          {nonDestructive}
          {artStyleAction}
        </section>
        <section
          aria-label="Destructive actions"
          className="card-action-section card-action-destructive"
        >
          {destructive}
        </section>
      </div>
      {showHelp ? <ItemActionHelp /> : null}
    </div>
  );
}

const ACTION_GUIDE = [
  ["fa-picture-o", "Feature", "Display or unfeature a work to attract visitors and earn money and XP."],
  ["fa-wrench", "Repair", "Restore condition over time, or stop repairs."],
  ["fa-magic", "Modify attributes", "Reroll or replace the work's attributes."],
  ["fa-paint-brush", "Art style", "Change the artwork's card design."],
  ["fa-search", "Authenticate", "Pay to check whether the work is a forgery."],
  ["fa-undo", "Return", "Return an eligible forgery for a refund."],
  ["fa-tags", "Tags", "Add or edit labels for sorting and filtering."],
  ["fa-heart", "Permanent collection", "Protect a work from disposal, or remove that protection."],
  ["fa-binoculars", "Art Collectors", "Offer the work to Art Collectors, or withdraw it."],
  ["fa-gavel", "Auction", "List a work for auction or bid on an offered auction."],
  ["fa-usd", "Sell", "Sell the item immediately for money."],
  ["fa-archive", "Archive", "Permanently consume the item to add it to your archive."],
  ["fa-share-square", "Donate", "Give up the item in exchange for Karma."],
  ["fa-museum", "Historian", "Submit the item toward a matching Historian quest."],
  ["fa-plus", "Collect", "Add the offered work to your collection."],
  ["fa-shopping-cart", "Purchase", "Buy the offered work at its listed price."],
  ["fa-times", "Decline / dismiss", "Discard an offer or dismiss a private auction."],
  ["fa-globe", "Make public", "Move a private auction into the public auction house."],
] as const;

function getRenderedActionGuide(container: Element | null) {
  const icons = new Set(Array.from(container?.querySelectorAll(
    ".card-action-main button i, .card-action-groups button i",
  ) ?? []).flatMap(icon => Array.from(icon.classList)));
  return ACTION_GUIDE.filter(([icon]) => icons.has(icon));
}

function ItemActionHelp() {
  const helpId = useId();
  const helpRef = useRef<HTMLDivElement>(null);
  const [actions, setActions] = useState<ReturnType<typeof getRenderedActionGuide>>([]);

  useEffect(() => {
    const help = helpRef.current;
    const container = help?.closest(".card-actions");
    const observer = new MutationObserver((mutations) => {
      if (help?.matches(":popover-open") && mutations.some(mutation => !help.contains(mutation.target))) {
        setActions(getRenderedActionGuide(container ?? null));
      }
    });
    if (container) observer.observe(container, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
    });
    const hideHelp = () => helpRef.current?.hidePopover();
    window.addEventListener("resize", hideHelp);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", hideHelp);
    };
  }, []);

  function showHelp(trigger: HTMLElement) {
    const help = helpRef.current;
    if (!help || help.matches(":popover-open")) return;
    setActions(getRenderedActionGuide(help.closest(".card-actions")));
    trigger.scrollIntoView({ block: "nearest", inline: "nearest" });
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 32);
    const above = Math.max(0, bounds.top - 16);
    const below = Math.max(0, window.innerHeight - bounds.bottom - 16);
    const showAbove = above >= below;
    Object.assign(help.style, {
      left: `${Math.max(16, Math.min(bounds.right - width, window.innerWidth - width - 16))}px`,
      top: showAbove ? "auto" : `${bounds.bottom}px`,
      bottom: showAbove ? `${window.innerHeight - bounds.top}px` : "auto",
      maxHeight: `${Math.min(480, Math.max(above, below))}px`,
    });
    help.showPopover();
    help.scrollTop = 0;
  }

  return (
    <div
      className="card-action-help"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) helpRef.current?.hidePopover();
      }}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) showHelp(event.currentTarget);
      }}
      onMouseEnter={(event) => showHelp(event.currentTarget)}
      onMouseLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) helpRef.current?.hidePopover();
      }}
    >
      <button
        aria-describedby={helpId}
        aria-label="Artwork action guide"
        className="card-action-help-button"
        data-tutorial-element={TutorialElement.TUTORIAL_SEE_ACTION_INFO}
        onClick={(event) => showHelp(event.currentTarget)}
        type="button"
      >
        <i aria-hidden="true" className="fa fa-info-circle" />
      </button>
      <div className="card-action-help-popover" id={helpId} popover="auto" ref={helpRef} role="tooltip" tabIndex={0}>
        <strong>Artwork actions</strong>
        <ul>
          {actions.map(([icon, label, description]) => (
            <li key={icon}>
              <i aria-hidden="true" className={`fa ${icon}`} />
              <span><strong>{label}</strong> {description}</span>
            </li>
          ))}
        </ul>
        {actions.some(([icon]) => icon === "fa-plus" || icon === "fa-shopping-cart") ? (
          <p>Offer actions may purchase or collect the work first.</p>
        ) : null}
      </div>
    </div>
  );
}

function partitionActions(actions: ReactNode): {
  destructive: ReactNode[];
  nonDestructive: ReactNode[];
} {
  const groups = {
    destructive: [] as ReactNode[],
    nonDestructive: [] as ReactNode[],
  };

  function flatten(children: ReactNode): ReactNode {
    return Children.map(children, (child) => {
      if (
        isValidElement<GroupableActionProps>(child) &&
        child.type === Fragment
      ) {
        return flatten(child.props.children);
      }
      return child;
    });
  }

  Children.forEach(flatten(actions), (child) => {
    if (
      isValidElement<GroupableActionProps>(child) &&
      child.props.destructive
    ) {
      groups.destructive.push(child);
    } else if (child !== null && child !== undefined && child !== false) {
      groups.nonDestructive.push(child);
    }
  });
  return groups;
}
