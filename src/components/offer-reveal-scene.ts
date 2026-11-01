import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

import {
  galleryColorToHex,
  type GalleryFinishes,
} from "../server/gallery-finishes.ts";
import type { ArtworkRarity } from "../server/gameplay.ts";
import {
  GALLERY_FIELD_OF_VIEW,
  GALLERY_FRAME_DEPTH,
  GALLERY_FRAME_FRONT_Z,
  getGalleryCameraFraming,
  type GalleryLayout,
} from "./gallery-layout.ts";

const WALK_DURATION = 14000;
const ARTWORK_REVEAL_START = 9000;
const LIGHT_REVEAL_DURATION = 2800;
const LIGHT_COUNT = 6;
const HALLWAY_LENGTH = 28;
const ARTWORK_WALL_OFFSET = 0.18;
const RARITY_COLORS: Record<ArtworkRarity, string> = {
  common: "#39b54a",
  uncommon: "#3e7bff",
  rare: "#e1c429",
  legendary: "#ff8a1f",
  masterpiece: "#42e8f5",
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type HallwayPhase = "walking" | "loading-artwork" | "revealing" | "ready";
export type OfferRevealSceneController = { skip: () => void; dispose: () => void };

export function getHallwayRevealProgress(
  elapsedMs: number,
  imageReadyAtMs = 0,
  skipped = false,
) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const camera = skipped ? 1 : 1 - (1 - clamp(elapsed / WALK_DURATION)) ** 3;
  const imageReady = Number.isFinite(imageReadyAtMs);
  const artwork = !imageReady ? 0 : skipped ? 1
    : clamp((elapsed - Math.max(ARTWORK_REVEAL_START, imageReadyAtMs)) / LIGHT_REVEAL_DURATION);
  return {
    camera,
    artwork,
    backlight: skipped ? 1 : THREE.MathUtils.smoothstep(camera, 0.5, 0.75),
    lights: Array.from({ length: LIGHT_COUNT }, (_, index) => {
      // Fade up each light while it is still 8 to 4 meters ahead of the camera.
      const distanceAhead = HALLWAY_LENGTH * (index + 0.5) / LIGHT_COUNT
        - 2 - (HALLWAY_LENGTH - 2) * camera;
      return THREE.MathUtils.smoothstep(8 - distanceAhead, 0, 4)
        * (skipped ? 1 : THREE.MathUtils.smoothstep(elapsed, 0, 900));
    }),
    complete: camera === 1 && artwork === 1,
  };
}

export function mountOfferRevealScene(
  host: HTMLDivElement,
  layout: GalleryLayout,
  finishes: GalleryFinishes,
  rarity: ArtworkRarity,
  onPhase: (phase: HallwayPhase) => void,
  onUnavailable: () => void,
): OfferRevealSceneController {
  const painting = layout.paintings[0];
  if (!painting) throw new Error("There is no artwork to reveal.");
  if (!("LTC_FLOAT_1" in THREE.UniformsLib)) RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const darkness = new THREE.Color(galleryColorToHex(finishes.wall)).multiplyScalar(0.04);
  scene.background = darkness;
  const fog = new THREE.FogExp2(darkness, 0.025);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(GALLERY_FIELD_OF_VIEW, 1, 0.05, 1000);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const hemisphere = new THREE.HemisphereLight("#fff5e8", "#30231d", 0.025);
  scene.add(hemisphere);
  const roomWidth = Math.max(3.8, layout.width + 2);
  const roomHeight = layout.height;
  const brightness = finishes.brightness;
  let disposed = false;
  let animation = 0;
  let skipped = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let imageReadyAt = Infinity;
  let finalZ = 4;
  let hallwayLength = 32;
  let lastPhase: HallwayPhase | null = null;
  const started = performance.now();

  function material(color: string) {
    const surface = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
    materials.add(surface);
    return surface;
  }
  const surfaces = {
    wall: material(galleryColorToHex(finishes.wall)),
    floor: material(galleryColorToHex(finishes.floor)),
    ceiling: material(galleryColorToHex(finishes.ceiling)),
    trim: material(galleryColorToHex(finishes.trim)),
    frame: material(galleryColorToHex(finishes.frame)),
    matte: material(galleryColorToHex(finishes.matte)),
  };
  function box(
    width: number, height: number, depth: number, surface: THREE.Material,
    x: number, y: number, z: number, castsShadow = false,
  ) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    mesh.castShadow = castsShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const floor = box(roomWidth, 0.12, 1, surfaces.floor, 0, -0.06, 0);
  const ceiling = box(roomWidth, 0.12, 1, surfaces.ceiling, 0, roomHeight + 0.06, 0);
  const wallFront = GALLERY_FRAME_FRONT_Z - GALLERY_FRAME_DEPTH;
  box(roomWidth + 0.24, roomHeight, 0.2, surfaces.wall, 0, roomHeight / 2, wallFront - 0.1);
  box(roomWidth, 0.12, 0.035, surfaces.trim, 0, 0.06, wallFront + 0.0175);
  const sides = [-1, 1].flatMap((direction) => [
    box(0.12, roomHeight, 1, surfaces.wall, direction * (roomWidth / 2 + 0.06), roomHeight / 2, 0),
    box(0.035, 0.12, 1, surfaces.trim, direction * (roomWidth / 2 - 0.0175), 0.06, 0),
  ]);

  const { width, height, y, frameWidth: border, matteWidth } = painting;
  const mattedWidth = width + matteWidth * 2;
  const mattedHeight = height + matteWidth * 2;
  const frameZ = GALLERY_FRAME_FRONT_Z - GALLERY_FRAME_DEPTH / 2 + ARTWORK_WALL_OFFSET;
  const artworkZ = GALLERY_FRAME_FRONT_Z - 0.005 + ARTWORK_WALL_OFFSET;
  box(mattedWidth, mattedHeight, 0.004, surfaces.matte, 0, y, artworkZ - 0.003, true);
  for (const direction of [-1, 1]) {
    box(mattedWidth + border * 2, border, GALLERY_FRAME_DEPTH, surfaces.frame,
      0, y + direction * (mattedHeight + border) / 2, frameZ, true);
    box(border, mattedHeight, GALLERY_FRAME_DEPTH, surfaces.frame,
      direction * (mattedWidth + border) / 2, y, frameZ, true);
  }
  const imageMaterial = material("#ffffff");
  const imageGeometry = new THREE.PlaneGeometry(width, height);
  geometries.add(imageGeometry);
  const image = new THREE.Mesh(imageGeometry, imageMaterial);
  image.position.set(0, y, artworkZ);
  scene.add(image);

  const hallwayLights = Array.from({ length: LIGHT_COUNT }, () => {
    const light = new THREE.SpotLight("#fff4df", 0, 0, 1.1, 1, 2);
    light.position.y = roomHeight - 0.15;
    light.target.position.y = 0;
    scene.add(light, light.target);
    return light;
  });
  const artworkLight = new THREE.SpotLight("#fff9ee", 0, 0, 0.8, 1, 2);
  artworkLight.castShadow = true;
  artworkLight.shadow.mapSize.set(1024, 1024);
  artworkLight.shadow.normalBias = 0.01;
  artworkLight.target.position.set(0, y, artworkZ);
  scene.add(artworkLight, artworkLight.target);
  const backlightWidth = mattedWidth + border;
  const backlightHeight = mattedHeight + border;
  const backlights = [
    [backlightWidth, 0.02, 0, -backlightHeight / 2],
    [backlightWidth, 0.02, 0, backlightHeight / 2],
    [0.02, backlightHeight, -backlightWidth / 2, 0],
    [0.02, backlightHeight, backlightWidth / 2, 0],
  ].map(([lightWidth, lightHeight, x, vertical]) => {
    const light = new THREE.RectAreaLight(RARITY_COLORS[rarity], 0, lightWidth, lightHeight);
    light.position.set(x, y + vertical, wallFront + ARTWORK_WALL_OFFSET / 2);
    light.lookAt(x, y + vertical, wallFront);
    scene.add(light);
    return light;
  });

  function invalidate() {
    if (!disposed && !animation) animation = window.requestAnimationFrame(render);
  }
  function publish(phase: HallwayPhase) {
    if (phase !== lastPhase) { lastPhase = phase; onPhase(phase); }
  }
  function render(time: number) {
    animation = 0;
    if (disposed) return;
    const progress = getHallwayRevealProgress(time - started, imageReadyAt, skipped);
    const travel = progress.camera;
    camera.position.set(0,
      THREE.MathUtils.lerp(Math.min(1.55, y), y, travel),
      THREE.MathUtils.lerp(hallwayLength - 2, finalZ, travel));
    camera.lookAt(0, y, artworkZ);
    hallwayLights.forEach((light, index) => {
      light.intensity = progress.lights[index] * roomHeight ** 2 * (1.1 + brightness);
    });
    hemisphere.intensity = 0.025 + progress.camera * 0.045 + progress.artwork * (0.25 + brightness * 0.45);
    fog.density = 0.025 * (1 - progress.artwork);
    artworkLight.intensity = progress.artwork * artworkLight.position.distanceTo(artworkLight.target.position) ** 2 * 4;
    backlights.forEach((light) => {
      light.intensity = progress.backlight * 30;
    });
    renderer.render(scene, camera);
    publish(progress.complete ? "ready" : progress.artwork > 0 ? "revealing"
      : progress.camera < 1 ? "walking" : "loading-artwork");
    if (!progress.complete && (progress.camera < 1 || Number.isFinite(imageReadyAt))) invalidate();
  }
  function resize() {
    if (disposed) return;
    const bounds = host.getBoundingClientRect();
    const viewportWidth = Math.max(1, bounds.width);
    const viewportHeight = Math.max(1, bounds.height);
    camera.aspect = viewportWidth / viewportHeight;
    finalZ = getGalleryCameraFraming(painting, camera.aspect, viewportWidth).z + ARTWORK_WALL_OFFSET;
    hallwayLength = finalZ + HALLWAY_LENGTH;
    camera.far = Math.max(1000, hallwayLength + 20);
    camera.updateProjectionMatrix();
    renderer.setSize(viewportWidth, viewportHeight);
    for (const mesh of [floor, ceiling, ...sides]) {
      mesh.scale.z = hallwayLength;
      mesh.position.z = hallwayLength / 2;
    }
    hallwayLights.forEach((light, index) => {
      const z = finalZ + HALLWAY_LENGTH * (1 - (index + 0.5) / LIGHT_COUNT);
      light.position.z = z;
      light.target.position.z = z;
    });
    const distance = Math.max(3, height * 1.2);
    artworkLight.position.set(-0.2, Math.min(roomHeight - 0.2, y + mattedHeight / 2 + 0.5), distance + ARTWORK_WALL_OFFSET);
    artworkLight.angle = Math.max(0.45, Math.min(1.2, Math.atan2(Math.max(mattedWidth, mattedHeight), distance)));
    artworkLight.shadow.camera.far = Math.max(30, distance * 3);
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  const texture = new THREE.TextureLoader().load(
    `/api/artwork/${encodeURIComponent(painting.artworkId)}/image?variant=card&texture=1`,
    (loaded) => {
      if (disposed) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      renderer.initTexture(loaded);
      imageMaterial.map = loaded;
      imageMaterial.needsUpdate = true;
      imageReadyAt = performance.now() - started;
      invalidate();
    },
    undefined,
    () => { if (!disposed) { dispose(); onUnavailable(); } },
  );
  textures.add(texture);
  const observer = new ResizeObserver(resize);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  function skip() { skipped = true; invalidate(); }
  function motionChanged() { if (reducedMotion.matches) skip(); }
  function contextLost(event: Event) {
    event.preventDefault();
    if (!disposed) { dispose(); onUnavailable(); }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(animation);
    observer.disconnect();
    reducedMotion.removeEventListener("change", motionChanged);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
    for (const loaded of textures) loaded.dispose();
    for (const light of [...hallwayLights, artworkLight]) light.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }
  observer.observe(host);
  reducedMotion.addEventListener("change", motionChanged);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  resize();
  return { skip, dispose };
}
