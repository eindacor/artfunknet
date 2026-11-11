import { getArcadePixelSource as getTextureSource } from "./arcade-pixel-art";

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D artwork;
uniform vec2 resolution;
uniform vec2 plateOffset;
uniform float aspect;

const float GRID = 0.008;
const float COVERAGE = 1.12;
const float EPSILON = 0.00001;
const float PI = 3.14159265359;

vec2 rotatePoint(vec2 point, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(c * point.x - s * point.y, s * point.x + c * point.y);
}

struct Sample {
  bool valid;
  float distance;
  vec3 color;
};

Sample sampleCell(float angle, vec2 point) {
  vec2 rotated = rotatePoint(vec2(point.x * aspect, point.y), angle);
  vec2 edge = floor(rotated / GRID) * GRID;
  vec2 center = edge + GRID * 0.5;
  Sample result;
  result.distance = distance(rotated, center);
  result.valid = false;
  result.color = vec3(0.0);
  if (result.distance > GRID * COVERAGE * 0.5 + 1.0 / resolution.y) return result;

  float count = 0.0;
  for (int x = 0; x < 4; x++) {
    for (int y = 0; y < 4; y++) {
      vec2 location = edge + (vec2(float(x), float(y)) + 0.5) * GRID / 4.0;
      vec2 source = rotatePoint(location, -angle) / vec2(aspect, 1.0);
      if (source.x < 0.0 || source.x > 1.0 || source.y < 0.0 || source.y > 1.0) continue;
      result.color += texture2D(artwork, source).rgb;
      count += 1.0;
    }
  }
  if (count > 0.0) {
    result.color /= count;
    result.valid = true;
  }
  return result;
}

float inkValue(vec3 color, int channel) {
  float black = 1.0 - max(color.r, max(color.g, color.b));
  if (channel == 3) return black;
  if (1.0 - black < EPSILON) return 0.0;
  vec3 cmy = (vec3(1.0) - color - black) / max(1.0 - black, EPSILON);
  if (channel == 0) return cmy.r;
  if (channel == 1) return cmy.g;
  return cmy.b;
}

float screenInk(float angle, vec2 point, int channel) {
  Sample cell = sampleCell(angle, point);
  if (!cell.valid) return 0.0;
  // Area-based radius preserves midtones rather than bleaching them into paper.
  float ink = clamp(inkValue(cell.color, channel), 0.0, 1.0);
  if (ink < EPSILON) return 0.0;
  float radius = GRID * COVERAGE * 0.5 * sqrt(ink);
  float aa = 0.7 / resolution.y;
  return 1.0 - smoothstep(max(0.0, radius - aa), radius + aa, cell.distance);
}

void main() {
  vec3 source = texture2D(artwork, uv).rgb;
  if (length(source) < 0.12) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 matched = vec3(-1.0);
  if (distance(source, vec3(0.0, 1.0, 1.0)) < 0.11) matched = vec3(0.0, 1.0, 1.0);
  else if (distance(source, vec3(1.0, 0.0, 1.0)) < 0.11) matched = vec3(1.0, 0.0, 1.0);
  else if (distance(source, vec3(1.0, 1.0, 0.0)) < 0.11) matched = vec3(1.0, 1.0, 0.0);
  else if (distance(source, vec3(1.0, 0.0, 0.0)) < 0.11) matched = vec3(1.0, 0.0, 0.0);
  else if (distance(source, vec3(0.0, 1.0, 0.0)) < 0.11) matched = vec3(0.0, 1.0, 0.0);
  else if (distance(source, vec3(0.0, 0.0, 1.0)) < 0.11) matched = vec3(0.0, 0.0, 1.0);
  if (matched.r >= 0.0) {
    gl_FragColor = vec4(matched, 1.0);
    return;
  }

  float cyan = screenInk(15.0 * PI / 180.0, uv + plateOffset, 0);
  float magenta = screenInk(75.0 * PI / 180.0, uv - plateOffset, 1);
  float yellow = screenInk(0.0, uv, 2);
  float black = screenInk(45.0 * PI / 180.0, uv, 3);
  vec3 color = mix(vec3(1.0), vec3(0.0, 1.0, 1.0), cyan)
    * mix(vec3(1.0), vec3(1.0, 0.0, 1.0), magenta)
    * mix(vec3(1.0), vec3(1.0, 1.0, 0.0), yellow)
    * (1.0 - black);
  gl_FragColor = vec4(color, 1.0);
}`;

function createRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: false, antialias: false, depth: false, powerPreference: "low-power",
  });
  if (!gl) throw new Error("Halftone WebGL is unavailable.");
  const shaders: WebGLShader[] = [];
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Halftone shader allocation failed.");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Halftone shader compilation failed.");
    }
    return shader;
  };
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const dispose = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
  try {
    if (!program || !buffer) throw new Error("Halftone resources could not be allocated.");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Halftone shader linking failed.");
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
    gl.uniform1i(gl.getUniformLocation(program, "artwork"), 0);
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    isLost: () => gl.isContextLost(),
    dispose,
    render(image: HTMLImageElement, misregistered: boolean) {
      if (gl.isContextLost()) throw new Error("Halftone WebGL context was lost.");
      const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const input = document.createElement("canvas");
      input.width = canvas.width;
      input.height = canvas.height;
      const context = input.getContext("2d");
      if (!context) throw new Error("Halftone image sampling is unavailable.");
      context.drawImage(image, 0, 0, input.width, input.height);
      const texture = gl.createTexture();
      if (!texture) throw new Error("Halftone texture allocation failed.");
      try {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
        gl.uniform2f(gl.getUniformLocation(program, "resolution"), canvas.width, canvas.height);
        gl.uniform1f(gl.getUniformLocation(program, "aspect"), canvas.width / canvas.height);
        gl.uniform2f(gl.getUniformLocation(program, "plateOffset"), misregistered ? 0.004 : 0, misregistered ? -0.002 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) {
          throw new Error("Halftone artwork rendering failed.");
        }
        return canvas.toDataURL("image/png");
      } finally {
        gl.deleteTexture(texture);
      }
    },
  };
}

const cache = new Map<string, Promise<string>>();
let renderer: ReturnType<typeof createRenderer> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let unavailable = false;

function renderImage(image: HTMLImageElement, misregistered: boolean) {
  clearTimeout(idleTimer);
  try {
    if (unavailable) throw new Error("Halftone WebGL is unavailable.");
    if (renderer?.isLost()) {
      renderer.dispose();
      renderer = null;
    }
    if (!renderer) {
      try {
        renderer = createRenderer();
      } catch (error) {
        unavailable = true;
        throw error;
      }
    }
    return renderer.render(image, misregistered);
  } finally {
    if (renderer) {
      idleTimer = setTimeout(() => {
        renderer?.dispose();
        renderer = null;
      }, 30_000);
    }
  }
}

// Cache only public images, including version and print registration in the key.
export function loadPopArtHalftone(source: string, misregistered = false): Promise<string> {
  const key = `${source}|${misregistered}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const cacheable = source.startsWith("/api/artwork/") &&
    !new URL(source, "https://artfunkel.invalid").searchParams.has("admin");
  const pending = new Promise<string>((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith("/api/artwork/")) image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("Halftone artwork has no dimensions.");
        resolve(renderImage(image, misregistered));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Halftone artwork could not be loaded."));
    image.src = getTextureSource(source);
  }).catch((error) => {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  });
  if (cacheable) {
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, pending);
  }
  return pending;
}
