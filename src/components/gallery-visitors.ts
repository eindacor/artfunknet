import * as THREE from "three";
import {
  GALLERY_FRAME_FRONT_Z,
  getGalleryWideCameraFraming,
  toGalleryUnits,
  type GalleryLayout,
} from "./gallery-layout.ts";
import type { NpcQuality } from "../server/npc-gameplay.ts";

export type GallerySceneVisitor = {
  _id: string;
  quality: NpcQuality;
  alreadyMet: boolean;
  disabled?: boolean;
};

const QUALITY_COLORS: Record<NpcQuality, string> = {
  bronze: "#e8a48d", silver: "#aaaaaa", gold: "#e8bf6c", platinum: "#dfdfdf",
};

const TEXTURE_URL = "/textures/gallery/visitor-silhouettes-clean.png";
const VISITOR_HEIGHT = toGalleryUnits(1.4 * 6.3 / 5.5);
const SOURCE_WIDTH = 960;
const SOURCE_HEIGHT = 672;
const SILHOUETTES = [
  { left: 20, top: 32, width: 280, height: 608 },
  { left: 374, top: 28, width: 212, height: 616 },
  { left: 700, top: 18, width: 200, height: 636 },
];

// Share the decoded image; each renderer still owns and disposes its GPU texture.
type VisitorImage = { image: HTMLImageElement; pixels: Uint8ClampedArray };
let cachedImage: Promise<VisitorImage> | undefined;

function loadImage(): Promise<VisitorImage> {
  cachedImage ??= new Promise<HTMLImageElement>((resolve, reject) => {
    new THREE.ImageLoader().load(TEXTURE_URL, resolve, undefined, reject);
  }).then(image => {
    const canvas = document.createElement("canvas");
    canvas.width = SOURCE_WIDTH;
    canvas.height = SOURCE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Unable to read visitor silhouettes.");
    context.drawImage(image, 0, 0);
    return { image, pixels: context.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT).data };
  }).catch((error: unknown) => {
    cachedImage = undefined;
    throw error;
  });
  return cachedImage;
}

export function createGalleryVisitors(layout: GalleryLayout, invalidate: () => void) {
  const group = new THREE.Group();
  group.name = "gallery-visitors";
  group.visible = false;
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.NoColorSpace;
  const ambientMaterial = new THREE.MeshBasicMaterial({
    color: "#302c28",
    alphaMap: texture,
    transparent: true,
    opacity: 0.35,
    alphaTest: 0.02,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const visitorHeight = VISITOR_HEIGHT * layout.visitorScale;
  const geometries = SILHOUETTES.map(crop => {
    // Scale the cropped silhouette rather than the original canvas's empty space.
    const geometry = new THREE.PlaneGeometry(
      visitorHeight * crop.width / crop.height,
      visitorHeight,
    );
    const uv = geometry.getAttribute("uv");
    for (let vertex = 0; vertex < uv.count; vertex++) {
      uv.setXY(vertex,
        (crop.left + uv.getX(vertex) * crop.width) / SOURCE_WIDTH,
        1 - (crop.top + (1 - uv.getY(vertex)) * crop.height) / SOURCE_HEIGHT);
    }
    return geometry;
  });
  type Figure = {
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    depth: number;
    horizontal: number;
  };
  const crowds = new Map<string, { figures: Figure[]; material: THREE.MeshBasicMaterial }>();
  const ambientFigures: Figure[] = [];
  let figures: Figure[] = [];
  let clickTargets: Figure["mesh"][] = [];
  let cameraDepth = getGalleryWideCameraFraming(layout).z;
  let visible = true;
  let loaded = false;
  let disposed = false;
  let pixels: Uint8ClampedArray | undefined;
  void loadImage().then((asset) => {
    if (disposed) return;
    texture.image = asset.image;
    pixels = asset.pixels;
    texture.needsUpdate = true;
    loaded = true;
    group.visible = visible;
    invalidate();
  }).catch(() => {});

  function setCameraDepth(depth: number) {
    cameraDepth = depth;
    const availableDepth = Math.max(0, depth - GALLERY_FRAME_FRONT_Z);
    const nearWall = GALLERY_FRAME_FRONT_Z + Math.min(toGalleryUnits(0.1), availableDepth * 0.2);
    const farEdge = depth - Math.min(Math.max(toGalleryUnits(0.1), availableDepth * 0.12), availableDepth * 0.25);
    for (const figure of figures) {
      figure.mesh.position.z = nearWall + figure.depth * (farEdge - nearWall);
    }
  }

  function createFigure(material: THREE.MeshBasicMaterial, depthQuartile: number): Figure {
    const geometry = geometries[Math.floor(Math.random() * geometries.length)];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = visitorHeight / 2;
    group.add(mesh);
    return {
      mesh, horizontal: Math.random(),
      depth: (depthQuartile + 0.2 + Math.random() * 0.6) / 4,
    };
  }

  return {
    group,
    setCameraDepth,
    setVisitors(visitors: readonly GallerySceneVisitor[], ambientVisitorCount = 0) {
      const ids = new Set(visitors.map(visitor => visitor._id));
      for (const [id, crowd] of crowds) {
        if (ids.has(id)) continue;
        crowd.figures.forEach(figure => group.remove(figure.mesh));
        crowd.material.dispose();
        crowds.delete(id);
      }
      clickTargets = [];
      for (const visitor of visitors) {
        let crowd = crowds.get(visitor._id);
        if (!crowd) {
          const material = ambientMaterial.clone();
          const offset = Math.floor(Math.random() * 4);
          const added = Array.from({ length: 4 }, (_, index) =>
            createFigure(index === 0 ? material : ambientMaterial, (index + offset) % 4));
          added[0].mesh.userData.visitorId = visitor._id;
          crowd = { figures: added, material };
          crowds.set(visitor._id, crowd);
        }
        crowd.material.color.set(QUALITY_COLORS[visitor.quality]);
        crowd.material.opacity = visitor.alreadyMet ? 0.2 : 0.8;
        crowd.figures[0].mesh.userData.interactive = !visitor.alreadyMet && !visitor.disabled;
        if (!visitor.alreadyMet) clickTargets.push(crowd.figures[0].mesh);
      }
      const count = Number.isFinite(ambientVisitorCount) ? Math.max(0, Math.floor(ambientVisitorCount)) : 0;
      while (ambientFigures.length > count) group.remove(ambientFigures.pop()!.mesh);
      while (ambientFigures.length < count) {
        ambientFigures.push(createFigure(ambientMaterial, ambientFigures.length % 4));
      }
      figures = [...crowds.values()].flatMap(crowd => crowd.figures).concat(ambientFigures);
      figures.forEach((figure, index) => {
        const span = Math.max(0, layout.width + toGalleryUnits(2) - figure.mesh.geometry.parameters.width);
        figure.mesh.position.x = ((index + 0.2 + figure.horizontal * 0.6) / figures.length - 0.5) * span;
      });
      setCameraDepth(cameraDepth);
      invalidate();
    },
    pick(raycaster: THREE.Raycaster) {
      if (!group.visible || !pixels) return;
      group.updateWorldMatrix(true, true);
      // Raycasting must ignore the transparent parts of each rectangular plane.
      for (const hit of raycaster.intersectObjects(clickTargets, false)) {
        if (!hit.uv) continue;
        const x = Math.max(0, Math.min(SOURCE_WIDTH - 1, Math.floor(hit.uv.x * SOURCE_WIDTH)));
        const y = Math.max(0, Math.min(SOURCE_HEIGHT - 1, Math.floor((1 - hit.uv.y) * SOURCE_HEIGHT)));
        if (pixels[(y * SOURCE_WIDTH + x) * 4 + 1] < 32) continue;
        return {
          visitorId: hit.object.userData.visitorId as string | undefined,
          interactive: hit.object.userData.interactive === true,
        };
      }
    },
    setVisible(nextVisible: boolean) {
      visible = nextVisible;
      group.visible = loaded && visible;
      invalidate();
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      crowds.forEach(crowd => crowd.material.dispose());
      ambientMaterial.dispose();
      texture.dispose();
    },
  };
}
