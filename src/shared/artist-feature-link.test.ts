import assert from "node:assert/strict";
import test from "node:test";
import { getArtistFeatureEmbed, parseArtistFeatureUrl } from "./artist-feature-link.ts";

test("artist feature links detect eight providers and construct their content-specific embed URLs", () => {
  const cases = [
    ["https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m30s", "YouTube", "video", "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=90"],
    ["https://youtu.be/M7lc1UVf-VE?si=tracking", "YouTube", "video", "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"],
    ["https://m.youtube.com/shorts/M7lc1UVf-VE", "YouTube", "video", "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"],
    ["https://www.youtube.com/live/M7lc1UVf-VE", "YouTube", "video", "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE"],
    ["https://www.youtube.com/playlist?list=PLabcdefghijk", "YouTube", "video", "https://www.youtube-nocookie.com/embed/videoseries?list=PLabcdefghijk"],
    ["https://vimeo.com/76979871/abc123", "Vimeo", "video", "https://player.vimeo.com/video/76979871?h=abc123&dnt=1"],
    ["https://player.vimeo.com/video/76979871?h=abc123", "Vimeo", "video", "https://player.vimeo.com/video/76979871?h=abc123&dnt=1"],
    ["https://www.instagram.com/test.artist/?igsh=tracking", "Instagram", "social", "https://www.instagram.com/test.artist/embed/"],
    ["https://www.instagram.com/p/ABC_123-/", "Instagram", "social", "https://www.instagram.com/p/ABC_123-/embed/"],
    ["https://www.instagram.com/reel/ABC_123-/", "Instagram", "social", "https://www.instagram.com/reel/ABC_123-/embed/"],
    ["https://www.twitch.tv/ExampleArtist", "Twitch", "video", "https://player.twitch.tv/?channel=exampleartist&autoplay=false"],
    ["https://www.twitch.tv/videos/123456789", "Twitch", "video", "https://player.twitch.tv/?video=v123456789&autoplay=false"],
    ["https://clips.twitch.tv/CreativeClip-slug", "Twitch", "video", "https://clips.twitch.tv/embed?clip=CreativeClip-slug&autoplay=false"],
    ["https://www.twitch.tv/artist/clip/CreativeClip-slug", "Twitch", "video", "https://clips.twitch.tv/embed?clip=CreativeClip-slug&autoplay=false"],
    ["https://www.facebook.com/ArtistPage?tracking=discard", "Facebook", "social", "https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2FArtistPage&width=500&tabs=timeline&height=600&adapt_container_width=true&show_facepile=false"],
    ["https://www.facebook.com/artist/posts/pfbidABC123", "Facebook", "social", "https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2Fartist%2Fposts%2FpfbidABC123&width=500&show_text=true"],
    ["https://www.facebook.com/watch/?v=12345", "Facebook", "social", "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D12345&width=500&show_text=true"],
    ["https://www.tiktok.com/@artist/video/6718335390845095173", "TikTok", "portrait", "https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0&description=1"],
    ["https://www.tiktok.com/@artist/photo/6718335390845095173", "TikTok", "portrait", "https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0&description=1"],
    ["https://open.spotify.com/intl-de/track/0123456789abcdefghijkl?si=tracking", "Spotify", "audio", "https://open.spotify.com/embed/track/0123456789abcdefghijkl"],
    ["https://open.spotify.com/artist/0123456789abcdefghijkl", "Spotify", "audio", "https://open.spotify.com/embed/artist/0123456789abcdefghijkl"],
    ["https://open.spotify.com/episode/0123456789abcdefghijkl", "Spotify", "audio", "https://open.spotify.com/embed/episode/0123456789abcdefghijkl"],
    ["https://soundcloud.com/artist/track?utm_source=tracking", "SoundCloud", "audio", "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack&auto_play=false&visual=true"],
    ["https://soundcloud.com/artist/sets/collection", "SoundCloud", "audio", "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsets%2Fcollection&auto_play=false&visual=true"],
  ];
  for (const [link, provider, format, src] of cases) {
    assert.deepEqual(getArtistFeatureEmbed(link), { provider, format, src }, link);
  }
});

test("unrecognized content stays a link and cannot select arbitrary iframe hosts or unsafe protocols", () => {
  for (const link of [
    "https://portfolio.example.com/art",
    "https://youtube.com.evil.example/watch?v=M7lc1UVf-VE",
    "https://evil.example/youtube.com/watch?v=M7lc1UVf-VE",
    "https://www.youtube.com:8443/watch?v=M7lc1UVf-VE",
    "https://www.youtube.com/watch?v=invalid",
    "https://www.instagram.com/stories/artist/123",
    "https://www.instagram.com/accounts/",
    "https://www.twitch.tv/directory",
    "https://www.facebook.com/groups/12345",
    "https://vm.tiktok.com/shortlink/",
    "https://open.spotify.com/user/artist",
    "https://soundcloud.com/artist",
  ]) {
    assert.ok(parseArtistFeatureUrl(link), link);
    assert.equal(getArtistFeatureEmbed(link), null, link);
  }
  for (const link of ["", "not a URL", "javascript:alert(1)", "data:text/html,hello", "file:///private",
    "https://user:password@www.youtube.com/watch?v=M7lc1UVf-VE", `https://example.com/${"a".repeat(2048)}`]) {
    assert.equal(parseArtistFeatureUrl(link), null, link);
    assert.equal(getArtistFeatureEmbed(link), null, link);
  }
});
