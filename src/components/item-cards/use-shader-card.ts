"use client";

import { useEffect, useRef } from "react";

import {
  compileShader,
  linkProgram,
  loadImageTexture,
  QUAD_VERTEX_SHADER,
} from "./shader-utils";

/**
 * Extra uniforms you can pass through `shaderUniforms` on ShaderCard.
 * Values map to WebGL uniform setters:
 *   number  → uniform1f
 *   [number, number] → uniform2fv
 *   [number, number, number] → uniform3fv
 *   [number, number, number, number] → uniform4fv
 */
export type ShaderUniformValue =
  | number
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];

export type ShaderUniforms = Record<string, ShaderUniformValue>;

export type UseShaderCardOptions = {
  /** URL of the GLSL fragment shader to fetch and compile. */
  shaderUrl: string;
  /** URL of the artwork image to bind as u_image (texture unit 0). */
  imageUrl: string;
  /** Rarity colour vec3 for u_itemRarity. */
  itemRarity: [number, number, number];
  /** Item condition [0–1] for u_condition. */
  condition: number;
  /** Promotion level for u_level. */
  level: number;
  /** 1 if foil, 0 otherwise. */
  foil: number;
  /** 1 if mint, 0 otherwise. */
  mint: number;
  /** Optional additional uniforms forwarded verbatim to the shader. */
  extraUniforms?: ShaderUniforms;
};

/**
 * Manages a full WebGL render loop on a canvas ref.
 * Fetches the fragment shader source from `shaderUrl`, compiles it,
 * binds all standard item uniforms plus any extras, and animates.
 *
 * Returns the canvas ref to attach to your element.
 */
export function useShaderCard(options: UseShaderCardOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Keep a stable ref to options so the effect doesn't re-run on every render.
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: false });
    if (!gl) {
      console.warn("[ShaderCard] WebGL not supported");
      return;
    }
    // Capture as a typed non-null constant so async closures don't lose narrowing.
    const glCtx: WebGLRenderingContext = gl;

    let animFrame: number;
    let program: WebGLProgram | null = null;
    let cleanupTexture: (() => void) | null = null;
    let destroyed = false;

    // ── full-screen quad ──────────────────────────────────────────────────
    const quadBuffer = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, quadBuffer);
    glCtx.bufferData(
      glCtx.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      glCtx.STATIC_DRAW,
    );

    // ── fetch + compile shader ────────────────────────────────────────────
    async function init() {
      const opts = optsRef.current;

      let fragSource: string;
      try {
        const res = await fetch(opts.shaderUrl);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        fragSource = await res.text();
      } catch (err) {
        console.error("[ShaderCard] failed to load shader:", err);
        return;
      }

      if (destroyed) return;

      const vert = compileShader(glCtx, glCtx.VERTEX_SHADER, QUAD_VERTEX_SHADER);
      const frag = compileShader(glCtx, glCtx.FRAGMENT_SHADER, fragSource);
      if (!vert || !frag) return;

      program = linkProgram(glCtx, vert, frag);
      glCtx.deleteShader(vert);
      glCtx.deleteShader(frag);
      if (!program) return;

      // ── image texture ──────────────────────────────────────────────────
      const texture = glCtx.createTexture()!;
      // Upload a 1×1 placeholder so the shader renders immediately.
      glCtx.bindTexture(glCtx.TEXTURE_2D, texture);
      glCtx.texImage2D(
        glCtx.TEXTURE_2D,
        0,
        glCtx.RGBA,
        1,
        1,
        0,
        glCtx.RGBA,
        glCtx.UNSIGNED_BYTE,
        new Uint8Array([128, 128, 128, 255]),
      );

      let imageAspectRatio = 1.;
      cleanupTexture = loadImageTexture(
        glCtx, 
        opts.imageUrl, 
        texture, 
        0,
        (image) => {
          imageAspectRatio = image.naturalWidth / image.naturalHeight;
        },
      );

      // ── render loop ────────────────────────────────────────────────────
      const startTime = performance.now();

      function render() {
        if (!program || destroyed) return;
        const opts = optsRef.current;

        const w = canvas!.clientWidth;
        const h = canvas!.clientHeight;
        if (canvas!.width !== w || canvas!.height !== h) {
          canvas!.width = w;
          canvas!.height = h;
        }
        glCtx.viewport(0, 0, w, h);

        glCtx.useProgram(program);

        // Position attribute
        const posLoc = glCtx.getAttribLocation(program, "a_position");
        glCtx.bindBuffer(glCtx.ARRAY_BUFFER, quadBuffer);
        glCtx.enableVertexAttribArray(posLoc);
        glCtx.vertexAttribPointer(posLoc, 2, glCtx.FLOAT, false, 0, 0);

        // Standard uniforms
        setUniform(glCtx, program, "u_resolution", [w, h]);
        setUniform(
          glCtx,
          program,
          "u_time",
          (performance.now() - startTime) / 1000,
        );
        setUniform(glCtx, program, "u_itemRarity", opts.itemRarity);
        setUniform(glCtx, program, "u_condition", opts.condition);
        setUniform(glCtx, program, "u_level", opts.level);
        setUniform(glCtx, program, "u_foil", opts.foil);
        setUniform(glCtx, program, "u_mint", opts.mint);
        setUniform(glCtx, program, "u_aspectRatio", imageAspectRatio);

        // Image texture
        glCtx.activeTexture(glCtx.TEXTURE0);
        glCtx.bindTexture(glCtx.TEXTURE_2D, texture);
        const imgLoc = glCtx.getUniformLocation(program, "u_image");
        if (imgLoc !== null) glCtx.uniform1i(imgLoc, 0);

        // Extra custom uniforms
        if (opts.extraUniforms) {
          for (const [name, value] of Object.entries(opts.extraUniforms)) {
            setUniform(glCtx, program, name, value);
          }
        }

        glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);
        animFrame = requestAnimationFrame(render);
      }

      animFrame = requestAnimationFrame(render);
    }

    void init();

    return () => {
      destroyed = true;
      cancelAnimationFrame(animFrame);
      cleanupTexture?.();
      if (program) glCtx.deleteProgram(program);
      glCtx.deleteBuffer(quadBuffer);
    };
  }, [
    // Only re-initialize when the shader file or image actually changes.
    options.shaderUrl,
    options.imageUrl,
  ]);

  return canvasRef;
}

// ── uniform dispatch helper ───────────────────────────────────────────────────

function setUniform(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string,
  value: ShaderUniformValue,
) {
  const loc = gl.getUniformLocation(program, name);
  if (loc === null) return;
  if (typeof value === "number") {
    gl.uniform1f(loc, value);
  } else if (value.length === 2) {
    gl.uniform2fv(loc, value);
  } else if (value.length === 3) {
    gl.uniform3fv(loc, value);
  } else {
    gl.uniform4fv(loc, value);
  }
}
