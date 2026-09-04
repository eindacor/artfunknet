"use client";

import { useEffect, useState } from "react";

import {
  COMMUNITY_EMOTES,
  createEmptyReactionSummary,
  type CommunityEmote,
  type CommunityReactionSummary,
  type CommunityReactionTarget,
} from "@/server/community-reactions-core";

export const COMMUNITY_EMOTE_DETAILS: Record<
  CommunityEmote,
  { symbol: string; label: string }
> = {
  heart: { symbol: "❤️", label: "Heart" },
  fire: { symbol: "🔥", label: "Fire" },
  laugh: { symbol: "😂", label: "Laugh" },
  clap: { symbol: "👏", label: "Clap" },
  wow: { symbol: "🤯", label: "Wow" },
  angry: { symbol: "😠", label: "Angry" },
  artfunkel: { symbol: "a", label: "artfunkel" },
};

export function CommunityEmoteSymbol({
  emote,
}: {
  emote: CommunityEmote;
}) {
  const details = COMMUNITY_EMOTE_DETAILS[emote];
  return (
    <span
      aria-hidden="true"
      className={emote === "artfunkel" ? "artfunkel-emote" : undefined}
    >
      {details.symbol}
    </span>
  );
}

export function CommunityReactionPicker({
  className = "",
  onChange,
  reactions,
  targetId,
  targetType,
}: {
  className?: string;
  onChange: (reactions: CommunityReactionSummary) => void;
  reactions: CommunityReactionSummary;
  targetId: string;
  targetType: CommunityReactionTarget;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<CommunityEmote | null>(null);

  async function toggle(emote: CommunityEmote) {
    setPending(emote);
    try {
      const response = await fetch(
        `/api/play/reactions/${targetType}/${encodeURIComponent(targetId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emote }),
        },
      );
      const body = (await response.json()) as {
        karma?: number;
        reactions?: CommunityReactionSummary;
      };
      if (response.ok && body.reactions) {
        onChange(body.reactions);
        if (typeof body.karma === "number") {
          window.dispatchEvent(
            new CustomEvent("artfunkel:karma-change", {
              detail: body.karma,
            }),
          );
        }
      }
    } finally {
      setPending(null);
      setOpen(false);
    }
  }

  return (
    <span
      className={`community-reactions ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {COMMUNITY_EMOTES.filter((emote) => reactions[emote].count > 0).map(
        (emote) => (
          <button
            aria-label={`${reactions[emote].reactedByViewer ? "Remove" : "Add"} ${COMMUNITY_EMOTE_DETAILS[emote].label} emote`}
            aria-pressed={reactions[emote].reactedByViewer}
            className="community-reaction-count"
            disabled={pending === emote}
            key={emote}
            onClick={() => void toggle(emote)}
            title={COMMUNITY_EMOTE_DETAILS[emote].label}
            type="button"
          >
            <CommunityEmoteSymbol emote={emote} />
            <small>{reactions[emote].count}</small>
          </button>
        ),
      )}
      <span className="community-emote-picker">
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Add an emote"
          className="community-emote-trigger"
          onClick={() => setOpen((current) => !current)}
          title="Add an emote"
          type="button"
        >
          <i aria-hidden="true" className="fa fa-smile-o" />
        </button>
        {open ? (
          <span
            aria-label="Choose an emote"
            className="community-emote-menu"
            role="menu"
          >
            {COMMUNITY_EMOTES.map((emote) => (
              <button
                aria-checked={reactions[emote].reactedByViewer}
                aria-label={COMMUNITY_EMOTE_DETAILS[emote].label}
                disabled={pending === emote}
                key={emote}
                onClick={() => void toggle(emote)}
                role="menuitemcheckbox"
                title={`:${emote}:`}
                type="button"
              >
                <CommunityEmoteSymbol emote={emote} />
              </button>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function CommunityReactionLoader({
  className,
  targetId,
  targetType,
}: {
  className?: string;
  targetId: string;
  targetType: CommunityReactionTarget;
}) {
  const [reactions, setReactions] = useState<CommunityReactionSummary>(
    createEmptyReactionSummary,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(
        `/api/play/reactions/${targetType}/${encodeURIComponent(targetId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        reactions?: CommunityReactionSummary;
      };
      if (!cancelled && response.ok && body.reactions) {
        setReactions(body.reactions);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [targetId, targetType]);

  return (
    <CommunityReactionPicker
      className={className}
      onChange={setReactions}
      reactions={reactions}
      targetId={targetId}
      targetType={targetType}
    />
  );
}
