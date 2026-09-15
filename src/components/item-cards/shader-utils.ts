import type { ArtworkRarity } from "@/server/gameplay";

/**
 * Maps each rarity tier to an RGB vec3 [r, g, b] (0–1 range).
 * This matches the `u_itemRarity` uniform in every shader card.
 */
export const RARITY_COLOR: Record<ArtworkRarity, [number, number, number]> = {
  common:      [57.0/256, 181.0/256, 74.0/256],
  uncommon:    [0.20, 0.50, 1.00],
  rare:        [.8, 0.8, .2],
  legendary:   [0.95, 0.65, 0.10],
  masterpiece: [0., 0.9, 0.9],
};

/**
 * Returns the vec3 colour for a rarity, falling back to common grey.
 */
export function rarityToVec3(rarity: string): [number, number, number] {
  return RARITY_COLOR[rarity as ArtworkRarity] ?? RARITY_COLOR.common;
}

/**
 * Loads an image from a URL and uploads it to the given WebGL texture slot.
 * Returns a cleanup function that deletes the texture.
 */
export function loadImageTexture(
  gl: WebGLRenderingContext,
  url: string,
  texture: WebGLTexture,
  unit: number = 0,
  onLoad?: (image: HTMLImageElement) => void,
): () => void {
  const image = new Image();
  image.crossOrigin = "anonymous";

  image.onload = () => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    onLoad?.(image);
  };

  image.src = url;

  return () => {
    gl.deleteTexture(texture);
  };
}

/**
 * Compiles a GLSL shader stage. Returns null and logs on failure.
 */
export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("[ShaderCard] compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Links a vertex + fragment shader into a WebGL program.
 */
export function linkProgram(
  gl: WebGLRenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("[ShaderCard] link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/** Minimal vertex shader — covers the full quad. */
export const QUAD_VERTEX_SHADER = /* glsl */ `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;
