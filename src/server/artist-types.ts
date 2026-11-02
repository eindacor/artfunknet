import type { Artwork } from "./gameplay.ts";

export const MAX_FEATURED_ARTISTS = 3;
export const ARTIST_AGREEMENT_VERSION = "2026-11-02";
export const ARTIST_UPLOAD_AGREEMENT =
  "I authorize artfunkel to use this artwork in the game and its artist showcase until I specifically request its removal. Approved artwork and artist credits remain after I delete my player account. Removal must be arranged with an administrator.";

export type ArtistSocialLinks = Partial<Record<"instagram" | "facebook" | "bluesky" | "youtube", string>>;

export type ArtistRecord = {
  _id: string;
  artist_name: string;
  date_of_birth: string;
  portfolio_url: string;
  bio: string;
  social_links: ArtistSocialLinks;
  player_id?: string;
  created_from_application: string;
  created_at: Date;
};

export type ArtistApplication = {
  _id: string;
  name: string;
  email: string;
  date_of_birth: string;
  portfolio_url: string;
  bio: string;
  player_id: string;
  existing_player: boolean;
  screen_name: string;
  credentials?: { salt: string; hash: string };
  status: "pending" | "approving" | "approved";
  created_at: Date;
  approval_started_at?: Date;
  approved_at?: Date;
  approved_by?: string;
};

export type PublicArtistProfile = {
  id: string;
  playerId: string;
  name: string;
  bio: string;
  portfolioUrl: string;
  socialLinks: ArtistSocialLinks;
  instagramUsername: string | null;
  featured: boolean;
};

export type FeaturedArtistGallery = PublicArtistProfile & {
  thumbnail: Pick<Artwork, "_id" | "title" | "image" | "thumbnail_adjustment"> | null;
};

export function getPlayerLandingPath(player: { artist_id?: string }): "/artist" | "/play" {
  return player.artist_id ? "/artist" : "/play";
}
