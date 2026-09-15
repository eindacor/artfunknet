// ─── artfunknet default shader card ────────────────────────────────────────
//
// Uniforms injected automatically by ShaderCard:
//
//   uniform vec2      u_resolution;   // canvas size in pixels
//   uniform float     u_time;         // seconds since mount
//   uniform sampler2D u_image;        // full artwork texture (card variant)
//   uniform vec3      u_itemRarity;   // rarity-coded RGB  (see shader-utils.ts)
//   uniform float     u_condition;    // 0.0 – 1.0  (item condition)
//   uniform float     u_level;        // item promotion level  (float)
//   uniform float     u_foil;         // 1.0 if foil, else 0.0
//   uniform float     u_mint;         // 1.0 if mint, else 0.0
//
// Add any extra uniforms to the shaderUniforms prop on <ShaderCard>.
// ────────────────────────────────────────────────────────────────────────────

precision mediump float;

uniform vec2      u_resolution;
uniform float     u_time;
uniform sampler2D u_image;
uniform vec3      u_itemRarity;
uniform float     u_condition;
uniform float     u_level;
uniform float     u_foil;
uniform float     u_mint;

// ── helpers ─────────────────────────────────────────────────────────────────

vec2 uv() {
  return gl_FragCoord.xy / u_resolution;
}

// Cheap hash-based noise (no texture needed)
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
    mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x),
    u.y
  );
}

// ── main ────────────────────────────────────────────────────────────────────

void main() {
  gl_FragColor = vec4(u_itemRarity, 1.0);
  return;
  vec2 st = uv();

  // Sample the full artwork image
  vec4 artwork = texture2D(u_image, st);

  // Animated rarity glow that pulses with time
  float pulse = 0.5 + 0.5 * sin(u_time * 1.8);
  float n     = noise(st * 6.0 + u_time * 0.3);
  vec3  glow  = u_itemRarity * (0.35 + 0.25 * pulse + 0.15 * n);

  // Vignette
  vec2  center  = st - 0.5;
  float vignette = 1.0 - smoothstep(0.35, 0.75, length(center));

  // Foil shimmer — extra horizontal shimmer bands when foil
  float foilShimmer = u_foil * 0.18 *
    sin((st.y * 18.0 - u_time * 3.0) * 3.14159);

  // Blend artwork with rarity glow
  vec3 color = mix(glow, artwork.rgb, 0.78 * vignette);
  color += foilShimmer * u_itemRarity;

  // Mint tint: subtle cool-blue overlay
  color = mix(color, color + vec3(0.0, 0.06, 0.12), u_mint * 0.4);

  gl_FragColor = vec4(vec3(1.) - color, 1.0);

}
