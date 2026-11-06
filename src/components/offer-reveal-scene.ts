import * as THREE from "three";
import { getArtworkImageUrl } from "../server/artwork-image-url.ts";

import {
  galleryColorToHex,
  type GalleryFinishes,
} from "../server/gallery-finishes.ts";
import type { ArtworkRarity } from "../server/gameplay.ts";
import { configureGalleryShadows } from "./gallery-lighting.ts";
import {
  GALLERY_FIELD_OF_VIEW,
  GALLERY_FRAME_DEPTH,
  GALLERY_FRAME_FRONT_Z,
  GALLERY_SCENE_SCALE,
  createGalleryLayout,
  getGalleryCameraFraming,
  toGalleryUnits,
  type GalleryArtworkDimensions,
  type GalleryLayout,
  type GallerySceneSettings,
} from "./gallery-layout.ts";

const WALK_DURATION = 14000;
const ROOM_VIEW_DURATION = 1500;
const ARTWORK_REVEAL_START = 9000;
const LIGHT_REVEAL_DURATION = 2800;
const RARITY_LIGHT_REVEAL_DURATION = 6500;
const PULLBACK_DURATION = 6500;
const RARITY_COLORS: Record<ArtworkRarity, string> = {
  common: "#39b54a",
  uncommon: "#3e7bff",
  rare: "#e1c429",
  legendary: "#ff8a1f",
  masterpiece: "#42e8f5",
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export type RoomRevealPhase = "approaching" | "loading-artwork" | "revealing" | "presenting" | "ready";
export type OfferRevealLayout = GalleryLayout & { lightStages: number[] };
export type OfferRevealSceneController = { skip: () => void; dispose: () => void };

export function createOfferRevealLayout(
  artwork: GalleryArtworkDimensions,
  displayed: GalleryArtworkDimensions[],
  finishes: Pick<GalleryFinishes, "frame_width" | "matte_width">,
  settings: Pick<GallerySceneSettings, "cameraHeightCm" | "artworkCenterHeightCm"> = {},
): OfferRevealLayout {
  const seen = new Set([artwork.id]);
  const companions = displayed.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const layout = createGalleryLayout([artwork, ...companions], finishes, settings);
  const halfWidth = (painting: GalleryLayout["paintings"][number]) =>
    painting.width / 2 + painting.frameWidth + painting.matteWidth;
  const center = layout.paintings[0];
  center.x = 0;
  const edges = [halfWidth(center), halfWidth(center)];
  layout.paintings.slice(1).forEach((painting, index) => {
    const side = index % 2;
    const width = halfWidth(painting);
    painting.x = (side === 0 ? -1 : 1) * (edges[side] + toGalleryUnits(2) + width);
    edges[side] += toGalleryUnits(2) + width * 2;
  });
  const stages = Math.ceil(companions.length / 2);
  return {
    ...layout,
    width: Math.max(...edges) * 2,
    height: Math.max(toGalleryUnits(5.5), layout.height),
    lightStages: [stages, ...companions.map((_, index) => stages - 1 - Math.floor(index / 2))],
  };
}

export function getRoomRevealProgress(
  elapsedMs: number,
  imageReadyAtMs = 0,
  lightStages = 0,
  skippedAtMs: number | null = null,
  reducedMotion = false,
) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const skipped = skippedAtMs !== null;
  const camera = skipped ? 1
    : 1 - (1 - clamp((elapsed - ROOM_VIEW_DURATION) / (WALK_DURATION - ROOM_VIEW_DURATION))) ** 3;
  const imageReady = Number.isFinite(imageReadyAtMs);
  const revealStart = skipped
    ? Math.max(skippedAtMs ?? 0, imageReadyAtMs)
    : Math.max(ARTWORK_REVEAL_START, imageReadyAtMs);
  const artwork = !imageReady ? 0 : skipped ? 1
    : clamp((elapsed - revealStart) / LIGHT_REVEAL_DURATION);
  const readyAt = Math.max(
    skippedAtMs ?? WALK_DURATION,
    revealStart + (skipped ? 0 : LIGHT_REVEAL_DURATION),
  );
  const ready = imageReady && elapsed >= readyAt;
  const pullback = !ready ? 0 : reducedMotion ? 1
    : THREE.MathUtils.smoothstep(elapsed - readyAt, 0, PULLBACK_DURATION);
  const lightDuration = Math.min(1800, (ARTWORK_REVEAL_START - 900) / Math.max(1, lightStages));
  const lightInterval = lightStages > 1
    ? (ARTWORK_REVEAL_START - 900 - lightDuration) / (lightStages - 1)
    : 0;
  return {
    camera,
    artwork,
    pullback,
    ready,
    raritySpotlight: reducedMotion ? 1
      : THREE.MathUtils.smoothstep(elapsed, 0, RARITY_LIGHT_REVEAL_DURATION),
    lights: Array.from({ length: lightStages }, (_, index) => skipped ? 1
      : THREE.MathUtils.smoothstep(elapsed - 900 - index * lightInterval, 0, lightDuration)),
    complete: ready && pullback === 1,
  };
}

export function mountOfferRevealScene(
  host: HTMLDivElement,
  layout: OfferRevealLayout,
  finishes: GalleryFinishes,
  rarity: ArtworkRarity,
  onPhase: (phase: RoomRevealPhase) => void,
  onUnavailable: () => void,
  onSelect: () => void,
): OfferRevealSceneController {
  const painting = layout.paintings[0];
  if (!painting) throw new Error("There is no artwork to reveal.");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const darkness = new THREE.Color(galleryColorToHex(finishes.wall)).multiplyScalar(0.04);
  scene.background = darkness;
  const fog = new THREE.FogExp2(darkness, 0.005 / GALLERY_SCENE_SCALE);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(GALLERY_FIELD_OF_VIEW, 1, toGalleryUnits(0.05), toGalleryUnits(1000));
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const hemisphere = new THREE.HemisphereLight("#fff5e8", "#30231d", 0.025);
  scene.add(hemisphere);
  const roomHeight = layout.height;
  const brightness = finishes.brightness;
  let disposed = false;
  let animation = 0;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let skippedAt: number | null = reducedMotion.matches ? 0 : null;
  let imageReadyAt = Infinity;
  let finalZ = toGalleryUnits(4);
  let startZ = toGalleryUnits(14);
  let lastPhase: RoomRevealPhase | null = null;
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

  const floor = box(1, toGalleryUnits(0.12), 1, surfaces.floor, 0, toGalleryUnits(-0.06), 0);
  const ceiling = box(1, toGalleryUnits(0.12), 1, surfaces.ceiling, 0, roomHeight + toGalleryUnits(0.06), 0);
  const wallFront = 0;
  const frontWall = box(1, roomHeight, toGalleryUnits(0.2), surfaces.wall, 0, roomHeight / 2, wallFront - toGalleryUnits(0.1));
  const frontTrim = box(1, toGalleryUnits(0.12), toGalleryUnits(0.035), surfaces.trim, 0, toGalleryUnits(0.06), wallFront + toGalleryUnits(0.0175));
  const backWall = box(1, roomHeight, toGalleryUnits(0.2), surfaces.wall, 0, roomHeight / 2, 0);
  const backTrim = box(1, toGalleryUnits(0.12), toGalleryUnits(0.035), surfaces.trim, 0, toGalleryUnits(0.06), 0);
  const sides = [-1, 1].flatMap((direction) => [
    box(toGalleryUnits(0.12), roomHeight, 1, surfaces.wall, direction, roomHeight / 2, 0),
    box(toGalleryUnits(0.035), toGalleryUnits(0.12), 1, surfaces.trim, direction, toGalleryUnits(0.06), 0),
  ]);

  const frameZ = GALLERY_FRAME_FRONT_Z - GALLERY_FRAME_DEPTH / 2;
  const artworkZ = GALLERY_FRAME_FRONT_Z - toGalleryUnits(0.005);
  const imageMaterials = new Map<string, THREE.MeshStandardMaterial[]>();
  let revealedArtwork: THREE.Mesh | null = null;
  const lights = layout.paintings.map((work, index) => {
    const { width, height, x, y, frameWidth: border, matteWidth } = work;
    const mattedWidth = width + matteWidth * 2;
    const mattedHeight = height + matteWidth * 2;
    box(mattedWidth, mattedHeight, toGalleryUnits(0.004), surfaces.matte, x, y, artworkZ - toGalleryUnits(0.003), true);
    for (const direction of [-1, 1]) {
      box(mattedWidth + border * 2, border, GALLERY_FRAME_DEPTH, surfaces.frame,
        x, y + direction * (mattedHeight + border) / 2, frameZ, true);
      box(border, mattedHeight, GALLERY_FRAME_DEPTH, surfaces.frame,
        x + direction * (mattedWidth + border) / 2, y, frameZ, true);
    }
    const imageMaterial = material("#ffffff");
    const imageGeometry = new THREE.PlaneGeometry(width, height);
    geometries.add(imageGeometry);
    const image = new THREE.Mesh(imageGeometry, imageMaterial);
    image.position.set(x, y, artworkZ);
    scene.add(image);
    if (index === 0) revealedArtwork = image;
    const imageUrl = getArtworkImageUrl(work.artworkId, "card", work.image, true);
    const matching = imageMaterials.get(imageUrl) ?? [];
    matching.push(imageMaterial);
    imageMaterials.set(imageUrl, matching);

    const lightZ = Math.max(toGalleryUnits(2.5), mattedHeight * 0.7, mattedWidth * 0.55);
    const lightY = Math.min(roomHeight - toGalleryUnits(0.2), y + mattedHeight / 2 + toGalleryUnits(0.8));
    const distance = Math.hypot(lightY - y, lightZ);
    const angle = Math.min(1.2, Math.atan2(Math.max(mattedWidth, mattedHeight) + toGalleryUnits(0.8), distance));
    const light = new THREE.SpotLight("#fff9ee", 0, distance * 3, angle, 1, 2);
    light.position.set(x, lightY, lightZ);
    light.target.position.set(x, y, artworkZ);
    light.shadow.mapSize.set(index === 0 ? 1024 : 512, index === 0 ? 1024 : 512);
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = toGalleryUnits(0.002);
    light.shadow.camera.near = toGalleryUnits(0.1);
    light.shadow.camera.far = Math.max(toGalleryUnits(30), distance * 3);
    scene.add(light, light.target);
    return light;
  });
  const { width, height, y, matteWidth } = painting;
  const mattedWidth = width + matteWidth * 2;
  const mattedHeight = height + matteWidth * 2;
  const rarityLightZ = Math.max(toGalleryUnits(1.1), mattedWidth * 0.3, mattedHeight * 0.35);
  const rarityLightY = Math.max(toGalleryUnits(0.4), y - mattedHeight * 0.25);
  const rarityLights = [-1, 1].map((direction) => {
    const x = direction * Math.max(toGalleryUnits(0.6), mattedWidth * 0.65);
    const targetX = -direction * mattedWidth * 0.22;
    const distance = Math.hypot(rarityLightY - toGalleryUnits(0.08), rarityLightZ, x - targetX);
    const light = new THREE.SpotLight(
      RARITY_COLORS[rarity], 0, distance * 3,
      Math.min(1.1, Math.atan2(Math.max(mattedWidth, mattedHeight) + toGalleryUnits(0.6), distance)),
      1, 2,
    );
    light.position.set(x, toGalleryUnits(0.08), rarityLightZ);
    light.target.position.set(targetX, rarityLightY, wallFront);
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = toGalleryUnits(0.002);
    light.shadow.camera.near = toGalleryUnits(0.1);
    light.shadow.camera.far = Math.max(toGalleryUnits(30), distance * 3);
    scene.add(light, light.target);
    return light;
  });
  configureGalleryShadows([...rarityLights, ...lights], renderer.capabilities.maxTextures);

  function invalidate() {
    if (!disposed && !animation) animation = window.requestAnimationFrame(render);
  }
  function publish(phase: RoomRevealPhase) {
    if (phase !== lastPhase) { lastPhase = phase; onPhase(phase); }
  }
  function render(time: number) {
    animation = 0;
    if (disposed) return;
    const progress = getRoomRevealProgress(
      time - started, imageReadyAt, layout.lightStages[0], skippedAt, reducedMotion.matches,
    );
    const travel = progress.camera;
    camera.position.set(0, layout.cameraHeight,
      THREE.MathUtils.lerp(startZ, finalZ, travel) + progress.pullback * Math.max(toGalleryUnits(0.8), Math.min(toGalleryUnits(2.5), finalZ * 0.24)));
    camera.lookAt(0, layout.cameraHeight, artworkZ);
    lights.forEach((light, index) => {
      const illumination = index === 0 ? progress.artwork : progress.lights[layout.lightStages[index]];
      light.intensity = illumination * light.position.distanceTo(light.target.position) ** 2 * (2.5 + brightness);
    });
    hemisphere.intensity = 0.025 + progress.camera * 0.045 + progress.artwork * (0.25 + brightness * 0.45);
    fog.density = 0.005 / GALLERY_SCENE_SCALE * (1 - progress.artwork);
    rarityLights.forEach((light) => {
      light.intensity = progress.raritySpotlight * light.position.distanceToSquared(light.target.position) * 0.3;
    });
    renderer.render(scene, camera);
    publish(progress.complete ? "ready" : progress.ready ? "presenting" : progress.artwork > 0 ? "revealing"
      : progress.camera < 1 ? "approaching" : "loading-artwork");
    if (!progress.complete && (progress.camera < 1 || Number.isFinite(imageReadyAt))) invalidate();
  }
  function resize() {
    if (disposed) return;
    const bounds = host.getBoundingClientRect();
    const viewportWidth = Math.max(1, bounds.width);
    const viewportHeight = Math.max(1, bounds.height);
    camera.aspect = viewportWidth / viewportHeight;
    finalZ = getGalleryCameraFraming(painting, camera.aspect, viewportWidth, layout.cameraHeight).z;
    const halfView = Math.tan(GALLERY_FIELD_OF_VIEW * Math.PI / 360);
    startZ = Math.max(finalZ + toGalleryUnits(8), artworkZ + layout.width / (2 * halfView * camera.aspect * 0.8),
      ...layout.paintings.map((work) => getGalleryCameraFraming(work, camera.aspect, viewportWidth, layout.cameraHeight).z + toGalleryUnits(2)));
    const roomDepth = startZ + toGalleryUnits(4);
    const roomWidth = Math.max(toGalleryUnits(14), layout.width + toGalleryUnits(6), roomDepth);
    camera.far = Math.max(toGalleryUnits(1000), roomDepth + roomWidth);
    camera.updateProjectionMatrix();
    renderer.setSize(viewportWidth, viewportHeight);
    for (const mesh of [floor, ceiling]) {
      mesh.scale.set(roomWidth, 1, roomDepth - wallFront);
      mesh.position.z = (roomDepth + wallFront) / 2;
    }
    for (const mesh of [frontWall, frontTrim, backWall, backTrim]) mesh.scale.x = roomWidth;
    backWall.position.z = roomDepth + toGalleryUnits(0.1);
    backTrim.position.z = roomDepth - toGalleryUnits(0.0175);
    sides.forEach((mesh, index) => {
      const direction = index < 2 ? -1 : 1;
      mesh.scale.z = roomDepth - wallFront;
      mesh.position.z = (roomDepth + wallFront) / 2;
      mesh.position.x = direction * (roomWidth / 2 + toGalleryUnits(index % 2 === 0 ? 0.06 : -0.0175));
    });
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  const observer = new ResizeObserver(resize);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event: Pick<MouseEvent, "clientX" | "clientY">) {
    if (disposed || !revealedArtwork || (lastPhase !== "presenting" && lastPhase !== "ready")) return false;
    const bounds = renderer.domElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    pointer.set(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(revealedArtwork).length > 0;
  }
  function click(event: MouseEvent) {
    if (pick(event)) onSelect();
  }
  function hover(event: MouseEvent) {
    renderer.domElement.style.cursor = pick(event) ? "pointer" : "";
  }
  function leave() {
    renderer.domElement.style.cursor = "";
  }
  function skip() {
    skippedAt ??= performance.now() - started;
    invalidate();
  }
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
    renderer.domElement.removeEventListener("click", click);
    renderer.domElement.removeEventListener("mousemove", hover);
    renderer.domElement.removeEventListener("mouseleave", leave);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    for (const geometry of geometries) geometry.dispose();
    for (const surface of materials) surface.dispose();
    for (const loaded of textures) loaded.dispose();
    for (const light of [...lights, ...rarityLights]) light.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }
  observer.observe(host);
  reducedMotion.addEventListener("change", motionChanged);
  renderer.domElement.addEventListener("click", click);
  renderer.domElement.addEventListener("mousemove", hover);
  renderer.domElement.addEventListener("mouseleave", leave);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  resize();
  const revealImageUrl = getArtworkImageUrl(painting.artworkId, "card", painting.image, true);
  for (const [imageUrl, matchingMaterials] of imageMaterials) {
    const texture = new THREE.TextureLoader().load(
      imageUrl,
      (loaded) => {
        if (disposed) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        renderer.initTexture(loaded);
        for (const surface of matchingMaterials) {
          surface.map = loaded;
          surface.needsUpdate = true;
        }
        if (imageUrl === revealImageUrl) imageReadyAt = performance.now() - started;
        invalidate();
      },
      undefined,
      () => {
        if (!disposed && imageUrl === revealImageUrl) { dispose(); onUnavailable(); }
      },
    );
    textures.add(texture);
  }
  return { skip, dispose };
}
