"use client";

import { useEffect, useRef } from "react";

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentSource = `
precision mediump float;
varying vec2 uv;
uniform float time;

void main() {
  vec2 p = vec2(uv.x * 1.5, uv.y);
  float t = time * 0.12;
  float warp = sin(p.x * 4.8 + t) * 0.16
    + sin(p.y * 6.0 - p.x * 2.0 - t * 0.7) * 0.1;
  float field = p.y - p.x * 0.56 + warp;
  float firstDistance = (field - 0.12) * 8.0;
  float secondDistance = (field + 0.38) * 12.0;
  float ribbon = exp(-firstDistance * firstDistance);
  float second = exp(-secondDistance * secondDistance);
  float folds = 0.5 + 0.5 * sin(field * 155.0 + sin(p.x * 5.0 + t) * 3.0);
  float chrome = pow(folds, 12.0);
  vec3 spectrum = 0.5 + 0.5 * cos(
    6.28318 * (field * 2.2 + p.x * 0.35 - t * 0.12 + vec3(0.0, 0.32, 0.65))
  );
  vec3 color = spectrum * (0.75 + chrome * 0.6)
    + vec3(0.65, 0.85, 1.0) * pow(chrome, 4.0) * 0.22;
  color *= ribbon * (0.6 + chrome * 0.7) + second * (0.5 + chrome * 0.7);
  float contour = pow(0.5 + 0.5 * sin(field * 92.0 - t), 28.0);
  color += spectrum * contour * 0.12;
  gl_FragColor = vec4(color, 1.0);
}`;

// All visible cards share one small shader surface and one animation clock.
function createAtmosphere() {
  const surface = document.createElement("canvas");
  surface.width = 384;
  surface.height = 256;
  const gl = surface.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const release = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  if (!vertex || !fragment || !program || !buffer) {
    release();
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    release();
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const time = gl.getUniformLocation(program, "time");
  const targets = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
  const visible = new Set<HTMLCanvasElement>();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let lastFrame = -Infinity;
  let lost = false;

  const draw = (timestamp: number) => {
    gl.uniform1f(time, motion.matches ? 0 : timestamp / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    visible.forEach((canvas) => {
      targets.get(canvas)?.drawImage(surface, 0, 0);
      canvas.dataset.ready = "true";
    });
  };
  const tick = (timestamp: number) => {
    if (lost || document.hidden || !visible.size || motion.matches) {
      frame = 0;
      return;
    }
    if (timestamp - lastFrame >= 1000 / 20) {
      draw(timestamp);
      lastFrame = timestamp;
    }
    frame = requestAnimationFrame(tick);
  };
  const update = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (lost || document.hidden || !visible.size) return;
    draw(performance.now());
    if (!motion.matches) frame = requestAnimationFrame(tick);
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const canvas = entry.target as HTMLCanvasElement;
      if (entry.isIntersecting) visible.add(canvas);
      else visible.delete(canvas);
    });
    update();
  });
  const onContextLost = () => {
    lost = true;
    cancelAnimationFrame(frame);
    targets.forEach((_, canvas) => delete canvas.dataset.ready);
  };
  surface.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", update);
  motion.addEventListener("change", update);

  return {
    add(canvas: HTMLCanvasElement) {
      const context = canvas.getContext("2d");
      if (context) {
        targets.set(canvas, context);
        observer.observe(canvas);
      }
      return () => {
        observer.unobserve(canvas);
        targets.delete(canvas);
        visible.delete(canvas);
        delete canvas.dataset.ready;
        update();
      };
    },
    get size() {
      return targets.size;
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      surface.removeEventListener("webglcontextlost", onContextLost);
      release();
    },
  };
}

let atmosphere: ReturnType<typeof createAtmosphere> = null;
let unavailable = false;

export default function VaporwaveAtmosphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || unavailable) return;
    atmosphere ??= createAtmosphere();
    if (!atmosphere) {
      unavailable = true;
      return;
    }
    const current = atmosphere;
    const remove = current.add(canvas);
    return () => {
      remove();
      if (!current.size) {
        current.dispose();
        atmosphere = null;
      }
    };
  }, []);

  return (
    <canvas
      aria-hidden="true"
      className="vaporwave-card-atmosphere"
      width={384}
      height={256}
      ref={canvasRef}
    />
  );
}
