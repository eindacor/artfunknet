"use client";

import { useEffect, useRef } from "react";

import ArtworkThumbnail from "./artwork-thumbnail";
import {
  ArchivedArtStyleBadges,
  ArchivedCategoryBadges,
} from "./item-cards/shared";
import type { HydratedPlayerArtworkArchive } from "@/server/item-artwork";

export default function ArchiveEntryDialog({
  archive,
  onClose,
  onForge,
  forgeDisabledReason,
}: {
  archive: HydratedPlayerArtworkArchive;
  onClose: () => void;
  onForge: () => void;
  forgeDisabledReason?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={`archive-entry-title-${archive._id}`}
      className="archive-entry-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="archive-entry-dialog-content">
        <button
          aria-label="Close archive entry"
          className="reroll-dialog-close"
          onClick={onClose}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-times" />
        </button>
        <ArtworkThumbnail
          alt={`${archive.artwork.title} by ${archive.artwork.artist}`}
          artworkId={archive.artwork_id}
          className="archive-entry-dialog-artwork"
          size={220}
        />
        <div className="archive-entry-dialog-heading">
          <p>Artwork archive</p>
          <h2 id={`archive-entry-title-${archive._id}`}>
            {archive.artwork.title}
          </h2>
          <span>{archive.artwork.artist}</span>
        </div>
        <dl className="archive-entry-dialog-facts">
          <div>
            <dt>Works archived</dt>
            <dd>{archive.archived_count.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total Archived Value</dt>
            <dd>${archive.combined_value.toLocaleString()}</dd>
          </div>
        </dl>
        <section>
          <h3>Archived modifiers</h3>
          <ArchivedCategoryBadges categories={archive.modifiers} />
        </section>
        {archive.artStyles.length > 0 ? (
          <section>
            <h3>Archived art styles</h3>
            <ArchivedArtStyleBadges styles={archive.artStyles} />
          </section>
        ) : null}
        <button
          aria-label="Create a forgery"
          className="item-action-button item-action-style"
          data-tooltip="Create a forgery"
          disabled={Boolean(forgeDisabledReason)}
          onClick={onForge}
          title={forgeDisabledReason}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-user-secret" />
        </button>
      </div>
    </dialog>
  );
}
