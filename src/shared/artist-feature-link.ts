export const ARTIST_FEATURE_LINK_HELP =
  "Feature a YouTube or Vimeo video, Instagram profile/post/reel, Twitch stream/video/clip, Facebook page/post/video, TikTok post, Spotify artist/music/podcast, or SoundCloud track/playlist. Use a direct content URL; unsupported URLs cannot be embedded. Content must be public and allow embedding.";

export type ArtistFeatureEmbed = {
  provider: string;
  src: string;
  format: "video" | "portrait" | "social" | "audio";
};

export function parseArtistFeatureUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return value.length <= 2048 && ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url : null;
  } catch {
    return null;
  }
}

function startSeconds(value: string | null): string | null {
  if (!value) return null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  const seconds = /^\d+$/.test(value) ? Number(value)
    : match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : NaN;
  return Number.isSafeInteger(seconds) && seconds > 0 ? String(seconds) : null;
}

export function getArtistFeatureEmbed(value: string): ArtistFeatureEmbed | null {
  const url = parseArtistFeatureUrl(value);
  if (!url || url.port) return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const path = url.pathname;
  const embed = (provider: string, src: string, format: ArtistFeatureEmbed["format"]): ArtistFeatureEmbed =>
    ({ provider, src, format });

  if (["youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? /^\/([\w-]+)\/?$/.exec(path)?.[1]
      : path === "/watch" ? url.searchParams.get("v")
      : /^\/(?:shorts|embed|live)\/([\w-]+)\/?$/.exec(path)?.[1];
    const playlist = url.searchParams.get("list");
    const validId = id && /^[\w-]{11}$/.test(id);
    const validPlaylist = playlist && /^[\w-]{10,100}$/.test(playlist);
    if (!validId && !validPlaylist) return null;
    const src = new URL(`https://www.youtube-nocookie.com/embed/${validId ? id : "videoseries"}`);
    if (validPlaylist) src.searchParams.set("list", playlist);
    const start = startSeconds(url.searchParams.get("start") ?? url.searchParams.get("t"));
    if (start) src.searchParams.set("start", start);
    return embed("YouTube", src.href, "video");
  }

  if (["vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = /^\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(path);
    if (!match) return null;
    const src = new URL(`https://player.vimeo.com/video/${match[1]}`);
    const hash = url.searchParams.get("h") ?? match[2];
    if (hash && /^[a-zA-Z0-9]+$/.test(hash)) src.searchParams.set("h", hash);
    src.searchParams.set("dnt", "1");
    return embed("Vimeo", src.href, "video");
  }

  if (host === "instagram.com") {
    const post = /^\/(p|reel|reels|tv)\/([\w-]+)\/?$/.exec(path);
    if (post) return embed("Instagram",
      `https://www.instagram.com/${post[1] === "reels" ? "reel" : post[1]}/${post[2]}/embed/`, "social");
    const profile = /^\/([a-zA-Z0-9._]{1,30})\/?$/.exec(path)?.[1];
    if (profile && !["accounts", "direct", "explore", "stories", "p", "reel", "reels", "tv", "about", "developer", "legal"].includes(profile.toLowerCase())) {
      return embed("Instagram", `https://www.instagram.com/${profile}/embed/`, "social");
    }
    return null;
  }

  if (["twitch.tv", "clips.twitch.tv"].includes(host)) {
    const clip = host === "clips.twitch.tv"
      ? (path === "/embed" ? url.searchParams.get("clip") : /^\/([\w-]+)\/?$/.exec(path)?.[1])
      : /^\/\w+\/clip\/([\w-]+)\/?$/.exec(path)?.[1];
    if (clip && /^[\w-]+$/.test(clip)) {
      return embed("Twitch", `https://clips.twitch.tv/embed?clip=${clip}&autoplay=false`, "video");
    }
    if (host !== "twitch.tv") return null;
    const video = /^\/videos\/(\d+)\/?$/.exec(path)?.[1];
    const channel = /^\/(\w{1,25})\/?$/.exec(path)?.[1];
    if (!video && (!channel || ["directory", "downloads", "jobs", "p", "search", "settings", "subscriptions", "videos"].includes(channel.toLowerCase()))) return null;
    return embed("Twitch", `https://player.twitch.tv/?${video ? `video=v${video}` : `channel=${channel!.toLowerCase()}`}&autoplay=false`, "video");
  }

  if (host === "facebook.com") {
    const target = new URL(`https://www.facebook.com${path}`);
    for (const key of ["id", "story_fbid", "v"]) {
      const id = url.searchParams.get(key);
      if (id && /^\d+$/.test(id)) target.searchParams.set(key, id);
    }
    const video = /^\/(?:[^/]+\/videos\/\d+|reel\/\d+)\/?$/.test(path) ||
      (["/watch", "/watch/", "/video.php"].includes(path) && target.searchParams.has("v"));
    const post = /^\/[^/]+\/posts\/[\w.-]+\/?$/.test(path) ||
      (["/permalink.php", "/story.php"].includes(path) && target.searchParams.has("story_fbid") && target.searchParams.has("id"));
    const page = /^\/(?:[\w.-]+|pages\/[^/]+\/\d+|people\/[^/]+\/\d+)\/?$/.test(path) &&
      !["/watch", "/reel", "/groups", "/events", "/login", "/share", "/marketplace"].includes(path.replace(/\/$/, "")) &&
      !path.endsWith(".php");
    const profilePage = path === "/profile.php" && target.searchParams.has("id");
    if (!video && !post && !page && !profilePage) return null;
    const src = new URL(`https://www.facebook.com/plugins/${video ? "video" : post ? "post" : "page"}.php`);
    src.searchParams.set("href", target.href);
    src.searchParams.set("width", "500");
    if (!video && !post) {
      src.searchParams.set("tabs", "timeline");
      src.searchParams.set("height", "600");
      src.searchParams.set("adapt_container_width", "true");
      src.searchParams.set("show_facepile", "false");
    } else src.searchParams.set("show_text", "true");
    return embed("Facebook", src.href, "social");
  }

  if (host === "tiktok.com") {
    const id = /^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/.exec(path)?.[1] ??
      /^\/player\/v1\/(\d+)\/?$/.exec(path)?.[1];
    return id ? embed("TikTok", `https://www.tiktok.com/player/v1/${id}?autoplay=0&description=1`, "portrait") : null;
  }

  if (host === "open.spotify.com") {
    const match = /^\/(?:intl-[a-zA-Z-]+\/)?(?:embed\/)?(artist|album|track|playlist|episode|show)\/([a-zA-Z0-9]{22})\/?$/.exec(path);
    return match ? embed("Spotify", `https://open.spotify.com/embed/${match[1]}/${match[2]}`, "audio") : null;
  }

  if (host === "soundcloud.com") {
    if (!/^\/[\w-]+\/(?:[\w-]+|sets\/[\w-]+)\/?$/.test(path)) return null;
    const target = new URL(`https://soundcloud.com${path}`);
    const token = url.searchParams.get("secret_token");
    if (token && /^s-[\w-]+$/.test(token)) target.searchParams.set("secret_token", token);
    const src = new URL("https://w.soundcloud.com/player/");
    src.searchParams.set("url", target.href);
    src.searchParams.set("auto_play", "false");
    src.searchParams.set("visual", "true");
    return embed("SoundCloud", src.href, "audio");
  }
  return null;
}
