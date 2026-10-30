import * as THREE from "three";

import {
  GALLERY_FIELD_OF_VIEW,
  GALLERY_FRAME_DEPTH,
  GALLERY_FRAME_FRONT_Z,
  getGalleryCameraFraming,
  getGalleryWideCameraFraming,
  type GalleryLayout,
} from "./gallery-layout";
import {
  DEFAULT_GALLERY_FINISHES,
  GALLERY_FINISH_SLOTS,
  type GalleryFinishes,
} from "@/server/gallery-finishes";

const CEILING_TILE_SIZE = 0.6;
const CEILING_GRID_OPACITY = 0.12;
const mix = THREE.MathUtils.lerp;

// Set a URL here after adding a tileable color texture to public\textures\gallery.
const SURFACE_TEXTURES: Record<
  "wall" | "floor" | "ceiling" | "frame",
  string | null
> = {
  wall: null,
  floor: null,
  ceiling: null,
  frame: null,
};

export type GallerySceneController = {
  focus: (id: string, zoomed?: boolean) => void;
  setFinishes: (finishes: GalleryFinishes) => void;
  dispose: () => void;
};

export function mountGalleryScene(
  host: HTMLDivElement,
  layout: GalleryLayout,
  initialId: string | undefined,
  onSelect: (id: string) => void,
  onUnavailable: () => void,
  initiallyZoomed = false,
  finishes: GalleryFinishes = DEFAULT_GALLERY_FINISHES,
): GallerySceneController {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The room and lights are static; camera movement can reuse every shadow map.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const background = new THREE.Color();
  scene.background = background;
  const hemiLight = new THREE.HemisphereLight("#fff5df", "#61513e", 0.6);
  const ambientLight = new THREE.AmbientLight("#fff4e5", 0.05);
  scene.add(hemiLight, ambientLight);
  const camera = new THREE.PerspectiveCamera(GALLERY_FIELD_OF_VIEW, 1, 0.05, 1000);
  const destination = new THREE.Vector3();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const loader = new THREE.TextureLoader();
  const paintings: THREE.Mesh[] = [];
  const lights: THREE.SpotLight[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let unavailable = false;
  let animation = 0;
  let lastTime = 0;
  let zoomed = initiallyZoomed;
  let hoverPosition: Pick<MouseEvent, "clientX" | "clientY"> | null = null;
  let activeIndex = Math.max(
    0,
    layout.paintings.findIndex(({ id }) => id === initialId),
  );

  function invalidate() {
    if (!disposed && !unavailable && !animation) {
      animation = window.requestAnimationFrame(render);
    }
  }

  function render(time: number) {
    animation = 0;
    if (disposed || unavailable) return;
    const delta = Math.min((time - lastTime) / 1000 || 1 / 60, 0.05);
    lastTime = time;
    if (reducedMotion.matches || camera.position.distanceTo(destination) < 0.001) {
      camera.position.copy(destination);
    } else {
      camera.position.lerp(destination, 1 - Math.exp(-delta * 10));
    }
    camera.lookAt(camera.position.x, camera.position.y, 0);
    renderer.render(scene, camera);
    updateCursor();
    if (camera.position.distanceTo(destination) > 0.001) invalidate();
  }

  function loadTexture(url: string, ready: (texture: THREE.Texture) => void) {
    const texture = loader.load(
      url,
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        ready(loaded);
        invalidate();
      },
      undefined,
      () => {
        if (!disposed) invalidate();
      },
    );
    textures.add(texture);
  }

  function material(color: string) {
    const result = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    materials.add(result);
    return result;
  }

  function box(
    width: number,
    height: number,
    depth: number,
    surface: THREE.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    textureSlot?: keyof typeof SURFACE_TEXTURES,
  ) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometries.add(geometry);
    // Meter-based UVs keep surface textures tileable instead of stretching them.
    if (textureSlot) {
      const uv = geometry.getAttribute("uv");
      for (let face = 0; face < 6; face++) {
        const [u, v] =
          face < 2 ? [depth, height]
            : face < 4 ? [width, depth]
              : [width, height];
        for (let vertex = face * 4; vertex < face * 4 + 4; vertex++) {
          uv.setXY(vertex, uv.getX(vertex) * u, uv.getY(vertex) * v);
        }
      }
    }
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  const surfaces = {
    wall: material("#ffffff"),
    floor: material("#ffffff"),
    ceiling: material("#ffffff"),
    trim: material("#ffffff"),
    frame: material("#ffffff"),
    matte: material("#ffffff"),
  };

  function setFinishes(nextFinishes: GalleryFinishes) {
    for (const slot of GALLERY_FINISH_SLOTS) {
      surfaces[slot].color.setRGB(...nextFinishes[slot], THREE.SRGBColorSpace);
    }
    hemiLight.intensity = mix(0.6, 2.2, nextFinishes.brightness);
    ambientLight.intensity = mix(0.05, 0.5, nextFinishes.brightness);
    background.copy(surfaces.wall.color);
    invalidate();
  }
  setFinishes(finishes);

  for (const slot of Object.keys(SURFACE_TEXTURES) as (keyof typeof SURFACE_TEXTURES)[]) {
    const url = SURFACE_TEXTURES[slot];
    if (url) {
      loadTexture(url, (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        surfaces[slot].map = texture;
        surfaces[slot].needsUpdate = true;
        if (slot === "floor") {
          surfaces.trim.map = texture;
          surfaces.trim.needsUpdate = true;
        }
      });
    }
  }
  const endPadding = 2;
  const wallThickness = 0.15;
  const trimDepth = 0.04;
  const roomWidth = layout.width + endPadding * 2;
  box(
    roomWidth, layout.height, wallThickness, surfaces.wall,
    0, layout.height / 2, -wallThickness / 2, "wall",
  );
  const floor = box(1, 0.12, 1, surfaces.floor, 0, -0.06, 0, "floor");
  const ceiling = box(
    1, 0.12, 1, surfaces.ceiling,
    0, layout.height + 0.06, 0, "ceiling",
  );
  const ceilingGridMaterial = new THREE.LineBasicMaterial({
    color: "#000000",
    transparent: true,
    opacity: CEILING_GRID_OPACITY,
    depthWrite: false,
  });
  materials.add(ceilingGridMaterial);
  const ceilingGrid = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    ceilingGridMaterial,
  );
  ceilingGrid.position.y = layout.height - 0.002;
  geometries.add(ceilingGrid.geometry);
  scene.add(ceilingGrid);
  box(
    roomWidth, 0.12, trimDepth, surfaces.trim,
    0, 0.06, trimDepth / 2, "floor",
  );
  const wallReturns = [-1, 1].map((direction) => ({
    wall: box(
      wallThickness, layout.height, 1, surfaces.wall,
      direction * (roomWidth + wallThickness) / 2, layout.height / 2, 0, "wall",
    ),
    trim: box(
      trimDepth, 0.12, 1, surfaces.trim,
      direction * (roomWidth - trimDepth) / 2, 0.06, 0, "floor",
    ),
  }));
  const imageMaterials = new Map<string, THREE.MeshStandardMaterial[]>();
  const frameZ = GALLERY_FRAME_FRONT_Z - GALLERY_FRAME_DEPTH / 2;
  const artworkZ = GALLERY_FRAME_FRONT_Z - 0.005;
  const matDepth = 0.004;
  const matZ = artworkZ - 0.001 - matDepth / 2;

  for (const painting of layout.paintings) {
    const { width, height, x, y, frameWidth: border, matteWidth } = painting;
    const mattedWidth = width + matteWidth * 2;
    const mattedHeight = height + matteWidth * 2;
    const mat = box(
      mattedWidth, mattedHeight, matDepth, surfaces.matte, x, y, matZ,
    );
    mat.castShadow = true;
    mat.userData.itemId = painting.id;
    paintings.push(mat);
    const imageMaterial = material("#e9e3d6");
    const geometry = new THREE.PlaneGeometry(width, height);
    geometries.add(geometry);
    const image = new THREE.Mesh(geometry, imageMaterial);
    image.position.set(x, y, artworkZ);
    image.userData.itemId = painting.id;
    paintings.push(image);
    scene.add(image);
    const matchingMaterials = imageMaterials.get(painting.artworkId) ?? [];
    matchingMaterials.push(imageMaterial);
    imageMaterials.set(painting.artworkId, matchingMaterials);

    for (const direction of [-1, 1]) {
      box(
        mattedWidth + border * 2, border, GALLERY_FRAME_DEPTH, surfaces.frame,
        x, y + direction * (mattedHeight + border) / 2, frameZ, "frame",
      ).castShadow = true;
      box(
        border, mattedHeight, GALLERY_FRAME_DEPTH, surfaces.frame,
        x + direction * (mattedWidth + border) / 2, y, frameZ, "frame",
      ).castShadow = true;
    }

    const plateCanvas = document.createElement("canvas");
    plateCanvas.width = 1024;
    plateCanvas.height = 512;
    const context = plateCanvas.getContext("2d");
    const plateMaterial = material("#eee8dc");
    if (context) {
      context.fillStyle = "#eee8dc";
      context.fillRect(0, 0, plateCanvas.width, plateCanvas.height);
      context.fillStyle = "#28251f";
      context.textBaseline = "top";
      context.font = "bold 64px Georgia";
      const words = (painting.title ?? "Untitled").split(/\s+/);
      let firstLine = words.shift() ?? "";
      while (
        words.length &&
        context.measureText(`${firstLine} ${words[0]}`).width <= 936
      ) {
        firstLine += ` ${words.shift()}`;
      }
      context.fillText(firstLine, 44, 44, 936);
      context.fillText(words.join(" "), 44, 120, 936);
      context.font = "48px Georgia";
      context.fillText(painting.artist ?? "", 44, 260, 936);
      context.font = "40px 'Courier New', monospace";
      context.fillText(painting.date ?? "", 44, 352, 936);
      const texture = new THREE.CanvasTexture(plateCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.add(texture);
      plateMaterial.map = texture;
      plateMaterial.color.set("#ffffff");
    }
    const plate = box(
      0.36, 0.18, 0.012, plateMaterial,
      x + mattedWidth / 2 + border + 0.28,
      y - mattedHeight / 2 + 0.06, 0.018,
    );
    plate.castShadow = true;
    plate.userData.itemId = painting.id;
    paintings.push(plate);

    const lightZ = Math.max(1.7, mattedHeight * 0.7, mattedWidth * 0.55);
    const lightY = y + mattedHeight / 2 + 0.8;
    const distance = Math.hypot(lightY - y, lightZ);
    const angle = Math.min(
      1.2,
      Math.atan2(Math.max(mattedWidth, mattedHeight) + 0.8, distance),
    );
    const light = new THREE.SpotLight(
      "#fff0d9", 1.75 * distance * distance, distance * 3, angle, 1, 2,
    );
    light.position.set(x, lightY, lightZ);
    light.target.position.set(x, y, 0);
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.002;
    light.shadow.camera.near = 0.1;
    light.castShadow = true;
    lights.push(light);
    scene.add(light, light.target);
  }
  for (const [artworkId, matchingMaterials] of imageMaterials) {
    loadTexture(
      `/api/artwork/${encodeURIComponent(artworkId)}/image?variant=card&texture=1`,
      (texture) => {
        for (const surface of matchingMaterials) {
          surface.map = texture;
          surface.color.set("#ffffff");
          surface.needsUpdate = true;
        }
      },
    );
  }

  function updateDestination() {
    const painting = layout.paintings[activeIndex];
    const framing = zoomed
      ? getGalleryCameraFraming(painting, camera.aspect, host.clientWidth)
      : getGalleryWideCameraFraming(layout, camera.aspect, host.clientWidth);
    destination.set(painting?.x ?? 0, framing.y, framing.z);
  }

  function focus(id: string, nextZoomed = false) {
    const index = layout.paintings.findIndex((painting) => painting.id === id);
    if (index >= 0) activeIndex = index;
    zoomed = nextZoomed;
    updateDestination();
    updateCursor();
    invalidate();
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    updateDestination();
    // Size the room for every possible view so focusing never changes geometry.
    const maximumDistance = getGalleryWideCameraFraming(
      layout,
      camera.aspect,
      width,
    ).z;
    camera.far = Math.max(100, maximumDistance * 4, layout.width * 2);
    camera.updateProjectionMatrix();
    const roomDepth = maximumDistance + 8;
    floor.scale.set(roomWidth, 1, roomDepth);
    ceiling.scale.copy(floor.scale);
    floor.position.z = ceiling.position.z = roomDepth / 2;
    const gridVertices: number[] = [];
    for (
      let x = Math.ceil(-roomWidth / 2 / CEILING_TILE_SIZE) * CEILING_TILE_SIZE;
      x < roomWidth / 2;
      x += CEILING_TILE_SIZE
    ) {
      gridVertices.push(x, 0, 0, x, 0, roomDepth);
    }
    for (let z = CEILING_TILE_SIZE; z < roomDepth; z += CEILING_TILE_SIZE) {
      gridVertices.push(-roomWidth / 2, 0, z, roomWidth / 2, 0, z);
    }
    geometries.delete(ceilingGrid.geometry);
    ceilingGrid.geometry.dispose();
    ceilingGrid.geometry = new THREE.BufferGeometry();
    ceilingGrid.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(gridVertices, 3),
    );
    geometries.add(ceilingGrid.geometry);
    const tiledSurfaces: [THREE.Mesh, number, number][] = [
      [floor, roomWidth, roomDepth],
      [ceiling, roomWidth, roomDepth],
    ];
    for (const { wall, trim } of wallReturns) {
      wall.scale.z = roomDepth + wallThickness;
      wall.position.z = (roomDepth - wallThickness) / 2;
      trim.scale.z = roomDepth - trimDepth;
      trim.position.z = (roomDepth + trimDepth) / 2;
      tiledSurfaces.push(
        [wall, wall.scale.z, 1],
        [trim, trim.scale.z, 1],
      );
    }
    for (const [mesh, u, v] of tiledSurfaces) {
      const uv = mesh.geometry.getAttribute("uv");
      const original = mesh.geometry.getAttribute("originalUv");
      if (!original) mesh.geometry.setAttribute("originalUv", uv.clone());
      const base = mesh.geometry.getAttribute("originalUv");
      for (let vertex = 0; vertex < uv.count; vertex++) {
        uv.setXY(vertex, base.getX(vertex) * u, base.getY(vertex) * v);
      }
      uv.needsUpdate = true;
    }
    renderer.setSize(width, height);
    camera.position.copy(destination);
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }

  function pick(event: Pick<MouseEvent, "clientX" | "clientY">) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      (event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(paintings)[0]?.object.userData.itemId as string | undefined;
  }
  function click(event: MouseEvent) {
    const id = pick(event);
    if (id) onSelect(id);
  }
  function hover(event: MouseEvent) {
    hoverPosition = { clientX: event.clientX, clientY: event.clientY };
    updateCursor();
  }
  function updateCursor() {
    const id = hoverPosition ? pick(hoverPosition) : undefined;
    renderer.domElement.style.cursor = id
      ? id === layout.paintings[activeIndex]?.id
        ? zoomed ? "zoom-out" : "zoom-in"
        : "pointer"
      : "";
  }
  function leave() {
    hoverPosition = null;
    renderer.domElement.style.cursor = "";
  }
  function contextLost(event: Event) {
    event.preventDefault();
    if (disposed) return;
    unavailable = true;
    window.cancelAnimationFrame(animation);
    onUnavailable();
  }
  renderer.domElement.addEventListener("click", click);
  renderer.domElement.addEventListener("mousemove", hover);
  renderer.domElement.addEventListener("mouseleave", leave);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  focus(initialId ?? "", initiallyZoomed);

  return {
    focus,
    setFinishes,
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("mousemove", hover);
      renderer.domElement.removeEventListener("mouseleave", leave);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((surface) => surface.dispose());
      textures.forEach((texture) => texture.dispose());
      lights.forEach((light) => light.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
