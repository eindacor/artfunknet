"use client";

import { useState } from "react";
import ArtworkEditorPanel from "@/components/artwork-editor/artwork-editor-panel";
import type { ArtistCatalogEntry, ArtworkCatalogEntry, ArtworkEditorMetadata } from "@/components/artwork-editor/types";
import type { CardRendererId } from "@/components/item-cards/types";

export default function NewArtworkForm({ initialArtists, rendererOptions }: {
  initialArtists: ArtistCatalogEntry[];
  rendererOptions: { id: CardRendererId; name: string }[];
}) {
  const [artists, setArtists] = useState(initialArtists);
  async function save(metadata: ArtworkEditorMetadata, file: File | null) {
    if (!file || file.size === 0) throw new Error("Select an image to upload.");
    const body = new FormData();
    body.set("image", file);
    body.set("metadata", JSON.stringify(metadata));
    const response = await fetch("/api/admin/artworks", { method: "POST", body });
    const result = await response.json() as { artwork: ArtworkCatalogEntry; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Artwork creation failed.");
    return result.artwork;
  }
  return <ArtworkEditorPanel mode="add" artists={artists} rendererOptions={rendererOptions} onSave={save}
    onArtistCreated={artist => setArtists(current => [...current, artist].sort((left, right) => left.name.localeCompare(right.name)))} />;
}
