"use client";

import { useState } from "react";

export default function GalleryShareButton({ playerId }: { playerId: string }) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const sharePath = `/gallery/${encodeURIComponent(playerId)}`;

  return <>
    <button aria-label="Copy gallery link" className="gallery-share"
      title={copied ? "Gallery link copied" : "Copy gallery link"} type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).href);
          setCopied(true);
          setShareError(false);
        } catch {
          setCopied(false);
          setShareError(true);
        }
      }}><i aria-hidden="true" className={`fa ${copied ? "fa-check" : "fa-link"}`} /></button>
    <span className="sr-only" role="status">{copied ? "Gallery link copied." : ""}</span>
    {shareError ? <span className="gallery-share-error" role="alert">
      Could not copy. <a href={sharePath}>Copy the gallery link</a> instead.
    </span> : null}
  </>;
}
