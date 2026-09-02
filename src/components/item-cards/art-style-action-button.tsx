"use client";

export default function ArtStyleActionButton({
  active = false,
  onClick,
}: {
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label="Apply art style"
      className={`item-action-button item-action-style ${
        active ? "item-action-style-active" : ""
      }`}
      data-dialog-persistent="true"
      data-tooltip="Apply art style"
      onClick={onClick}
      type="button"
    >
      <i aria-hidden="true" className="fa fa-paint-brush" />
    </button>
  );
}
