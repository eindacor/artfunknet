"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getArtistFeatureEmbed } from "@/shared/artist-feature-link";

const subscribeToHostname = () => () => {};
const getHostname = () => window.location.hostname;
const getServerHostname = () => "";

export default function ArtistFeature({ link, artistName }: { link: string; artistName: string }) {
  const hostname = useSyncExternalStore(subscribeToHostname, getHostname, getServerHostname);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const embed = getArtistFeatureEmbed(link);
  const facebook = embed?.provider === "Facebook";
  useEffect(() => {
    if (!facebook || !container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.min(500, Math.max(180, Math.floor(entry.contentRect.width))));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [facebook]);

  if (!embed) return null;
  const src = new URL(embed.src);
  if (embed.provider === "Twitch" && hostname) src.searchParams.set("parent", hostname);
  if (facebook && width !== null) src.searchParams.set("width", String(width));
  const ready = (embed.provider !== "Twitch" || hostname) && (!facebook || width !== null);

  return <section className="artist-feature" aria-label={`Featured content from ${artistName}`}>
    <div className="artist-feature-frame-container" ref={container}>
      <iframe className={`artist-feature-frame artist-feature-frame-${embed.format}${embed.provider === "Twitch" ? " artist-feature-frame-twitch" : ""}`}
        title={`${artistName}'s featured ${embed.provider} content`} src={ready ? src.href : undefined}
        referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
    </div>
  </section>;
}
