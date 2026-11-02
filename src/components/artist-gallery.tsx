"use client";

import { useState } from "react";
import ArtworkThumbnail from "./artwork-thumbnail";
import ItemCard from "./item-cards/item-card";
import type { CardLegendaryAttribute } from "./item-cards/types";
import type { FeaturedArtistGallery, PublicArtistProfile } from "@/server/artist-types";
import type { Artwork } from "@/server/gameplay";
import { createArtistArtworkPreview } from "@/server/artist-artwork-preview";
import type { HydratedGameItem } from "@/server/item-artwork";

export function ArtistSocialLinks({ artist, onVisit }: { artist: PublicArtistProfile; onVisit?: () => void }) {
  const instagram = artist.instagramUsername ? `https://www.instagram.com/${encodeURIComponent(artist.instagramUsername)}/` : artist.socialLinks.instagram;
  const links = [
    { label: "Visit portfolio", url: artist.portfolioUrl },
    ...Object.entries({ ...artist.socialLinks, ...(instagram ? { instagram } : {}) })
      .map(([label, url]) => ({ label, url })),
  ].filter(link => link.url);
  return <nav aria-label={`${artist.name} websites and social links`} className="artist-social-links">
    {onVisit ? <button type="button" onClick={onVisit} aria-label={`Visit gallery: ${artist.name}`}>Visit gallery</button> : null}
    {links.map(link => <a href={link.url} key={link.label} target="_blank" rel="noopener noreferrer">{link.label}<i aria-hidden="true" className="fa fa-external-link" /></a>)}
  </nav>;
}

export function FeaturedArtistGalleries({ artists, onVisit }: {
  artists: FeaturedArtistGallery[]; onVisit: (playerId: string) => void;
}) {
  if (!artists.length) return null;
  return <section className="featured-artist-galleries" aria-label="Featured artist galleries">
    <header><h2>Featured contributing {artists.length == 1 ? "artist" : "artists"}</h2></header>
    <div className="featured-artist-grid">{artists.map(artist => <article className="featured-artist-card" key={artist.id}>
      <div className="featured-artist-preview">
        {artist.thumbnail ? <ArtworkThumbnail artworkId={artist.thumbnail._id} image={artist.thumbnail.image}
          adjustment={artist.thumbnail.thumbnail_adjustment} alt={`${artist.thumbnail.title} by ${artist.name}`} size={320} />
          : <span className="artist-empty-thumbnail"><i aria-hidden="true" className="fa fa-paint-brush" /></span>}
        <h3>{artist.name}</h3>
      </div>
      <ArtistSocialLinks artist={artist} onVisit={() => onVisit(artist.playerId)} />
    </article>)}</div>
  </section>;
}

export function ArtistGalleryIntroduction({ artist }: { artist: PublicArtistProfile }) {
  return <header className="artist-gallery-introduction">
    <p>Contributing artist {artist.featured ? "/ featured exhibition" : "/ exhibition"}</p>
    <h2>{artist.name}</h2>
    {artist.bio ? <p className="artist-bio">{artist.bio}</p> : null}
    <ArtistSocialLinks artist={artist} />
  </header>;
}

export function ArtistGalleryShowcase({ artist, works, legendaryAttributes, onPreview, viewerId }: {
  artist: PublicArtistProfile; works: Artwork[]; legendaryAttributes: CardLegendaryAttribute[];
  onPreview: (item: HydratedGameItem) => void; viewerId: string;
}) {
  return <section className="artist-gallery-showcase" aria-label={`${artist.name}'s artist showcase`}>
    <section className="artist-work-showcase">
      {!works.length ? <p>This artist has no active works yet.</p> : <div className="artist-work-grid">{works.map(work => {
        const preview = createArtistArtworkPreview(work);
        return <div key={work._id} className="artist-work-preview">
          <ItemCard item={preview} legendaryAttributes={legendaryAttributes}
            permissions={{ canManageItem: false, canCustomizeCosmetic: false }} viewerId={viewerId}
            onActivate={() => onPreview(preview)} />
          <button type="button" onClick={() => onPreview(preview)}>View {work.title} in the gallery <i aria-hidden="true" className="fa fa-arrow-up" /></button>
        </div>;
      })}</div>}
    </section>
    {artist.instagramUsername ? <InstagramProfile key={artist.instagramUsername} username={artist.instagramUsername} /> : null}
  </section>;
}

function InstagramProfile({ username }: { username: string }) {
  const [loaded, setLoaded] = useState(false);
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
  return <section className="artist-instagram">
    <h3>From Instagram</h3>
    <p>Loading this feed connects your browser to Instagram. Public profiles must allow embedding; browser privacy settings may also prevent it from loading.</p>
    <a href={profileUrl} rel="noopener noreferrer" target="_blank">Open @{username} on Instagram <i aria-hidden="true" className="fa fa-external-link" /></a>
    {loaded ? <iframe className="artist-instagram-frame" title={`Instagram profile for ${username}`} src={`${profileUrl}embed/`}
      loading="lazy" referrerPolicy="no-referrer" allow="encrypted-media" />
      : <button type="button" onClick={() => setLoaded(true)}>Load Instagram feed</button>}
  </section>;
}
