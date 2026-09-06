"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import { FloatingPopover } from "@/components/floating-popover";
import {
  COMMUNITY_EMOTE_DETAILS,
  CommunityReactionPicker,
  CommunityEmoteSymbol,
} from "@/components/community-emotes";
import type { GalleryChatMessageView } from "@/server/gallery-chat";
import { ARTFUNKEL_SYSTEM_AUTHOR_ID } from "@/server/gallery-chat-core";
import type { GalleryChatToken } from "@/server/gallery-chat-core";

export default function GalleryChat({
  galleryOwnerId,
  global = false,
  viewerId,
}: {
  galleryOwnerId?: string;
  global?: boolean;
  viewerId: string;
}) {
  const [messages, setMessages] = useState<GalleryChatMessageView[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLOListElement>(null);
  const endpoint = global
    ? "/api/play/chat"
    : `/api/play/galleries/${encodeURIComponent(galleryOwnerId ?? "")}/chat`;

  const loadMessages = useCallback(async (quiet = false) => {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = (await response.json()) as {
        error?: string;
        messages?: GalleryChatMessageView[];
      };
      if (!response.ok || !body.messages) {
        throw new Error(body.error ?? "Gallery chat is unavailable.");
      }
      setMessages(body.messages);
      setError("");
    } catch (loadError) {
      if (!quiet) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Gallery chat is unavailable.",
        );
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadMessages(), 0);
    // TODO(JEP): Evaluate managed realtime pub/sub or WebSockets if chat traffic outgrows polling.
    const pollTimer = window.setInterval(
      () => void loadMessages(true),
      5_000,
    );
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
    };
  }, [loadMessages]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!global) return;
    function receiveSharedItem(event: Event) {
      const message = (event as CustomEvent<GalleryChatMessageView>).detail;
      setMessages((current) =>
        current.some((candidate) => candidate.id === message.id)
          ? current
          : [...current, message].slice(-50),
      );
    }
    window.addEventListener(
      "artfunkel:global-chat-message",
      receiveSharedItem,
    );
    return () =>
      window.removeEventListener(
        "artfunkel:global-chat-message",
        receiveSharedItem,
      );
  }, [global]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = content.trim();
    if (!message) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: message }),
        });
      const body = (await response.json()) as {
        error?: string;
        message?: GalleryChatMessageView;
      };
      if (!response.ok || !body.message) {
        throw new Error(body.error ?? "The message could not be sent.");
      }
      setMessages((current) => [...current, body.message!].slice(-50));
      setContent("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The message could not be sent.",
      );
    } finally {
      setSending(false);
    }
  }

  async function report(messageId: string) {
    setError("");
    const response = await fetch(
      `${endpoint}/${encodeURIComponent(messageId)}/report`,
      { method: "POST" },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "The message could not be reported.");
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, reportedByViewer: true }
          : message,
      ),
    );
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <aside className="gallery-chat-panel">
      <header>
        <div>
          <span>
            <i aria-hidden="true" className="fa fa-comments" />{" "}
            {global ? "Global chat" : "Gallery chat"}
          </span>
          <small>Messages expire after seven days</small>
        </div>
        <button
          aria-label={`Refresh ${global ? "global" : "gallery"} chat`}
          disabled={loading === true}
          onClick={() => void loadMessages()}
          title="Refresh"
          type="button"
        >
          <i aria-hidden="true" className={`fa fa-refresh ${loading ? "fa-spin" : ""}`} />
        </button>
      </header>
      <ol className="gallery-chat-messages" ref={messageListRef}>
        {loading && messages.length === 0 ? (
          <li className="gallery-chat-empty">Loading conversation...</li>
        ) : messages.length === 0 ? (
          <li className="gallery-chat-empty">
            No messages yet. Start the conversation.
          </li>
        ) : (
          messages.map((message) => {
            const isGalleryOwner =
              !global && message.authorId === galleryOwnerId;
            return (
              <li
                className={[
                  message.authorId === viewerId ? "own" : "",
                  isGalleryOwner ? "gallery-owner" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={message.id}
              >
                {message.authorId === ARTFUNKEL_SYSTEM_AUTHOR_ID ? (
                  <strong className="gallery-chat-author gallery-chat-system-author">
                    @{message.authorName}
                  </strong>
                ) : (
                  <a
                    className={`gallery-chat-author${isGalleryOwner ? " gallery-chat-owner" : ""}`}
                    href={`/gallery/${encodeURIComponent(message.authorId)}`}
                    title={isGalleryOwner ? "Gallery owner" : undefined}
                  >
                    @{message.authorName}
                  </a>
                )}
                <time dateTime={message.createdAt}>
                  {new Date(message.createdAt).toISOString().slice(11, 16)}
                </time>
                <span className="gallery-chat-message">
                  {message.tokens.map((token, index) => (
                    <ChatToken key={`${message.id}-${index}`} token={token} />
                  ))}
                  <CommunityReactionPicker
                    className="gallery-chat-reactions"
                    onChange={(reactions) =>
                      setMessages((current) =>
                        current.map((candidate) =>
                          candidate.id === message.id
                            ? { ...candidate, reactions }
                            : candidate,
                        ),
                      )
                    }
                    reactions={message.reactions}
                    targetId={message.id}
                    targetType="message"
                  />
                </span>
                {message.authorId !== viewerId &&
                message.authorId !== ARTFUNKEL_SYSTEM_AUTHOR_ID ? (
                  <button
                    aria-label={
                      message.reportedByViewer
                        ? "Message reported"
                        : `Report message from ${message.authorName}`
                    }
                    disabled={message.reportedByViewer}
                    onClick={() => void report(message.id)}
                    title={message.reportedByViewer ? "Reported" : "Report"}
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-flag" />
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ol>
      <form className="gallery-chat-composer" onSubmit={send}>
        <textarea
          aria-label={`${global ? "Global" : "Gallery"} chat message`}
          maxLength={500}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={
            global
              ? "Message everyone... Use @player name or paste an item link."
              : "Message this gallery... Use @player name or paste an item link."
          }
          rows={2}
          value={content}
        />
        <button disabled={sending || content.trim().length === 0} type="submit">
          {sending ? "Sending..." : "Send"}
        </button>
      </form>
      {error ? (
        <p className="gallery-chat-error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

function ChatToken({ token }: { token: GalleryChatToken }) {
  if (token.kind === "emote") {
    return (
      <span
        aria-label={COMMUNITY_EMOTE_DETAILS[token.emote].label}
        className="gallery-chat-inline-emote"
        title={token.text}
      >
        <CommunityEmoteSymbol emote={token.emote} />
      </span>
    );
  }
  if (token.kind === "player") {
    return (
      <a
        className="gallery-chat-mention"
        href={`/gallery/${encodeURIComponent(token.playerId)}`}
      >
        {token.text}
      </a>
    );
  }
  if (token.kind === "item") {
    return <ChatItemToken token={token} />;
  }
  return token.text;
}

function ChatItemToken({
  token,
}: {
  token: Extract<GalleryChatToken, { kind: "item" }>;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <span
      className="gallery-chat-item-wrap"
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      ref={anchorRef}
    >
      <a
        aria-label={`View ${token.item.title} by ${token.item.artist}`}
        className="gallery-chat-item-link"
        data-rarity={token.item.rarity}
        href={`/items/${encodeURIComponent(token.item.id)}`}
        title={`${token.item.title} by ${token.item.artist}`}
      >
        <i aria-hidden="true" className="fa fa-picture-o" />
      </a>
      <FloatingPopover
        anchorRef={anchorRef}
        className="gallery-chat-item-preview"
        open={open}
        role="tooltip"
      >
        <ArtworkThumbnail
          alt=""
          artworkId={token.item.artworkId}
          size={180}
          variant="thumb"
        />
        <strong>{token.item.title}</strong>
        <span>{token.item.artist}</span>
        <span>
          {token.item.rarity} · ${token.item.value.toLocaleString()}
        </span>
      </FloatingPopover>
    </span>
  );
}
