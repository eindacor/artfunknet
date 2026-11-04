"use client";

import Link from "next/link";
import { useState } from "react";
import GalleryExhibition, { getGalleryPreviewItem } from "@/components/gallery-exhibition";
import type { GalleryExhibitionData } from "@/server/gallery-exhibition";
import PlayerHeader from "../../play/player-header";

export default function AnonymousGalleryView({ gallery }: { gallery: GalleryExhibitionData }) {
  const [selectedItem, setSelectedItem] = useState(() => getGalleryPreviewItem(gallery));
  return <div className="game-shell" data-player-state="null">
    <PlayerHeader anonymous />
    <main className="legacy-game anonymous-gallery-page">
      <div className="legacy-container">
        <section className="public-gallery-join">
          <p>Discover art, build your collection, and create a gallery of your own.</p>
          <Link className="player-signup" href="/play/login?mode=register">Join artfunkel - create a free account</Link>
        </section>
        <section className={`visited-gallery${gallery.artist ? " visited-artist-gallery" : ""}`}>
          <GalleryExhibition gallery={gallery} viewerId={null} selectedItem={selectedItem} onSelectItem={setSelectedItem} />
        </section>
      </div>
    </main>
  </div>;
}
