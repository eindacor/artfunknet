import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import * as THREE from "three";
import sharp from "sharp";
import ts from "typescript";
import {
  createGalleryLayout,
  GALLERY_CAMERA_HEIGHT,
  GALLERY_OVERVIEW_DISTANCE_CM,
  GALLERY_FRAME_FRONT_Z,
  getGalleryCameraFraming,
  getGalleryWideCameraFraming,
  toGalleryUnits,
} from "./gallery-layout.ts";
import { createGalleryVisitors } from "./gallery-visitors.ts";

type VisitorMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

test("each visitor gets a quality-colored interactive figure and three ambient figures, spread across the camera depth", async t => {
  let requests = 0;
  let complete: ((image: HTMLImageElement) => void) | undefined;
  t.mock.method(THREE.ImageLoader.prototype, "load", (url: string, ready: typeof complete) => {
    assert.equal(url, "/textures/gallery/visitor-silhouettes-clean.png");
    requests++;
    complete = ready;
    return {} as HTMLImageElement;
  });
  const { data, info: image } = await sharp(fileURLToPath(new URL("../../public/textures/gallery/visitor-silhouettes-clean.png", import.meta.url)))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true, value: { createElement: () => ({
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) }),
    }) },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const visitors = [
    { _id: "bronze", quality: "bronze" as const, alreadyMet: false },
    { _id: "silver", quality: "silver" as const, alreadyMet: false, disabled: true },
    { _id: "gold", quality: "gold" as const, alreadyMet: true },
    { _id: "platinum", quality: "platinum" as const, alreadyMet: false },
  ];
  const colors = ["e8a48d", "aaaaaa", "e8bf6c", "dfdfdf"];
  const layouts = [
    createGalleryLayout([]),
    createGalleryLayout([{ id: "tiny", artworkId: "tiny", width: 1, height: 1 }]),
    createGalleryLayout([
      { id: "small", artworkId: "small", width: 50, height: 80 },
      { id: "wide", artworkId: "wide", width: 600, height: 80 },
      { id: "tall", artworkId: "tall", width: 50, height: 450 },
    ]),
    ...[0.4, 1, 1.2].map(visitorScale => createGalleryLayout([], undefined, { visitorScale })),
  ];
  const layers = layouts.map(layout => createGalleryVisitors(layout, () => {}));
  layers.forEach(layer => layer.setVisitors(visitors));
  assert.equal(requests, 1, "Concurrent galleries share the same in-flight image request");
  for (const [index, layer] of layers.entries()) {
    const meshes = layer.group.children as VisitorMesh[];
    assert.equal(meshes.length, visitors.length * 4);
    visitors.forEach((visitor, index) => {
      const [colored, ...ambient] = meshes.slice(index * 4, index * 4 + 4);
      assert.equal(colored.userData.visitorId, visitor._id);
      assert.equal(colored.material.color.getHexString(), colors[index]);
      assert.equal(colored.material.opacity, visitor.alreadyMet ? 0.2 : 0.8);
      assert.equal(colored.userData.interactive, !visitor.alreadyMet && !visitor.disabled);
      for (const mesh of ambient) {
        assert.equal(mesh.userData.visitorId, undefined);
        assert.equal(mesh.material.color.getHexString(), "302c28");
        assert.equal(mesh.material.opacity, 0.35);
      }
    });
    for (const mesh of meshes) {
      assert.equal(mesh.material.transparent, true);
      assert.ok(mesh.material.opacity > 0 && mesh.material.opacity < 1);
      assert.equal(mesh.material.depthWrite, false);
      assert.ok(mesh.material.alphaMap);
      const uv = mesh.geometry.getAttribute("uv");
      const u = Array.from({ length: uv.count }, (_, vertex) => uv.getX(vertex));
      const v = Array.from({ length: uv.count }, (_, vertex) => uv.getY(vertex));
      assert.ok(Math.abs(mesh.geometry.parameters.height - toGalleryUnits(1.6) * layouts[index].visitorScale) < toGalleryUnits(0.01),
        "Colored and ambient visitors apply the configured coefficient to their existing scene scale");
      assert.ok(Math.abs(mesh.geometry.parameters.height / GALLERY_CAMERA_HEIGHT
        - 1.4 / GALLERY_CAMERA_HEIGHT * 6.3 / 5.5 * layouts[index].visitorScale) < 1e-10);
      const cropAspect = (Math.max(...u) - Math.min(...u)) * image.width /
        ((Math.max(...v) - Math.min(...v)) * image.height);
      assert.ok(Math.abs(mesh.geometry.parameters.width / mesh.geometry.parameters.height - cropAspect) < 1e-6);
      assert.equal(mesh.position.y, mesh.geometry.parameters.height / 2);
    }
    for (const [width, height] of [[320, 640], [600, 600], [1200, 480]]) {
      const aspect = width / height;
      const wide = getGalleryWideCameraFraming(layouts[index]);
      for (const depth of [wide.z,
        GALLERY_OVERVIEW_DISTANCE_CM.min / 100, GALLERY_OVERVIEW_DISTANCE_CM.max / 100,
        GALLERY_FRAME_FRONT_Z + toGalleryUnits(0.001),
        ...layouts[index].paintings.map(painting => getGalleryCameraFraming(painting, aspect, width).z)]) {
        if (depth <= GALLERY_FRAME_FRONT_Z) continue;
        layer.setCameraDepth(depth);
        const depths = meshes.map(mesh => mesh.position.z);
        assert.ok(Math.max(...depths) - Math.min(...depths) > (depth - GALLERY_FRAME_FRONT_Z) * 0.2,
          "Depth quartiles stay distributed even when the camera is close to the wall");
        for (const mesh of meshes) {
          assert.ok(mesh.position.z > GALLERY_FRAME_FRONT_Z);
          assert.ok(mesh.position.z < depth);
          assert.ok(Math.abs(mesh.position.x) + mesh.geometry.parameters.width / 2 < (layouts[index].width + toGalleryUnits(4)) / 2);
        }
      }
      const wideDepth = wide.z;
      layer.setCameraDepth(wideDepth);
      const depths = meshes.map(mesh => mesh.position.z);
      assert.ok(Math.max(...depths) > wideDepth * 0.65, "Figures should extend toward the camera, not cluster at the wall");
      assert.ok(Math.max(...depths) - Math.min(...depths) > (wideDepth - GALLERY_FRAME_FRONT_Z) * 0.45);
    }
    const positions = meshes.map(mesh => mesh.position.toArray());
    layer.setVisible(false);
    layer.setVisible(true);
    assert.deepEqual(meshes.map(mesh => mesh.position.toArray()), positions, "Toggling must not reshuffle visitors");
  }
  const first = layers[0];
  const firstMesh = first.group.children[0] as VisitorMesh;
  let textureDisposals = 0;
  let materialDisposals = 0;
  let geometryDisposals = 0;
  firstMesh.material.alphaMap!.addEventListener("dispose", () => { textureDisposals++; });
  firstMesh.material.addEventListener("dispose", () => { materialDisposals++; });
  const firstGeometries = new Set((first.group.children as VisitorMesh[]).map(mesh => mesh.geometry));
  firstGeometries.forEach(geometry => geometry.addEventListener("dispose", () => { geometryDisposals++; }));
  first.dispose();
  layers[1].setVisible(false);
  assert.ok(complete);
  complete({ width: image.width, height: image.height } as HTMLImageElement);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(first.group.visible, false, "A late image must not restore a disposed gallery");
  assert.equal(layers[1].group.visible, false, "A late image must respect the current hidden setting");
  assert.equal(layers[2].group.visible, true);
  layers[1].setVisible(true);
  assert.equal(layers[1].group.visible, true);
  assert.equal(textureDisposals, 1);
  assert.equal(materialDisposals, 1);
  assert.equal(geometryDisposals, firstGeometries.size);
  const activeLayer = layers[2];
  const meshes = activeLayer.group.children as VisitorMesh[];
  const colored = meshes[0];
  const previousPositions = meshes.map(mesh => mesh.position.toArray());
  activeLayer.setVisitors(visitors.map(visitor => ({ ...visitor, alreadyMet: visitor._id === "bronze" || visitor.alreadyMet })));
  assert.equal(activeLayer.group.children[0], colored);
  assert.equal(colored.material.opacity, 0.2);
  assert.equal(colored.userData.interactive, false);
  assert.deepEqual(meshes.map(mesh => mesh.position.toArray()), previousPositions, "Meeting a visitor must not reshuffle the crowd");
  activeLayer.setVisitors(visitors);
  meshes.forEach((mesh, index) => { mesh.position.x = index * 10; });
  function rayAt(mesh: VisitorMesh, solid: boolean) {
    const uv = mesh.geometry.getAttribute("uv");
    const u = Array.from({ length: uv.count }, (_, index) => uv.getX(index));
    const v = Array.from({ length: uv.count }, (_, index) => uv.getY(index));
    const left = Math.round(Math.min(...u) * image.width);
    const top = Math.round((1 - Math.max(...v)) * image.height);
    const right = Math.round(Math.max(...u) * image.width);
    const bottom = Math.round((1 - Math.min(...v)) * image.height);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if ((data[(y * image.width + x) * 4 + 1] >= 128) !== solid) continue;
      const position = new THREE.Vector3(
        mesh.position.x + ((x + 0.5 - left) / (right - left) - 0.5) * mesh.geometry.parameters.width,
        mesh.position.y + (0.5 - (y + 0.5 - top) / (bottom - top)) * mesh.geometry.parameters.height,
        100,
      );
      return new THREE.Raycaster(position, new THREE.Vector3(0, 0, -1));
    }
    assert.fail("Expected both silhouette and transparent pixels in the crop");
  }
  const raycaster = rayAt(colored, true);
  const intersections = t.mock.method(raycaster, "intersectObjects");
  assert.deepEqual(activeLayer.pick(raycaster), { visitorId: "bronze", interactive: true });
  assert.deepEqual(intersections.mock.calls[0].arguments[0].map(mesh => mesh.userData.visitorId),
    ["bronze", "silver", "platinum"], "Do not even raycast ambient or already-met figures");
  assert.equal(activeLayer.pick(rayAt(colored, false)), undefined, "Transparent padding must not intercept artwork clicks");
  assert.equal(activeLayer.pick(rayAt(meshes[1], true)), undefined, "Ambient figures must be click-through");
  assert.deepEqual(activeLayer.pick(rayAt(meshes[4], true)), { visitorId: "silver", interactive: false });
  assert.equal(activeLayer.pick(rayAt(meshes[8], true)), undefined, "Already-met figures must be click-through");
  for (const [mesh, offset] of [[meshes[1], 0.25], [meshes[8], 0.5]] as const) {
    mesh.geometry = colored.geometry;
    mesh.position.copy(colored.position);
    mesh.position.z += offset;
  }
  assert.deepEqual(activeLayer.pick(rayAt(colored, true)), { visitorId: "bronze", interactive: true },
    "Ambient and met figures in front of an unmet visitor must not block it");
  activeLayer.setVisitors(visitors.map(visitor => ({ ...visitor, alreadyMet: visitor._id === "bronze" || visitor.alreadyMet })));
  meshes.forEach((mesh, index) => { mesh.position.x = index * 10; });
  assert.equal(activeLayer.pick(rayAt(colored, true)), undefined, "Newly met visitors must immediately become click-through");
  activeLayer.setVisible(false);
  assert.equal(activeLayer.pick(rayAt(colored, true)), undefined);
  activeLayer.setVisible(true);
  let removed = 0;
  meshes[4].material.addEventListener("dispose", () => { removed++; });
  activeLayer.setVisitors(visitors.filter(visitor => visitor._id !== "silver"));
  assert.equal(activeLayer.group.children.length, 12);
  assert.equal(removed, 1);
  activeLayer.setVisitors([]);
  assert.equal(activeLayer.group.children.length, 0);
  const next = createGalleryVisitors(layouts[0], () => {});
  next.setVisitors(visitors);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(requests, 1, "Later galleries reuse the decoded image without another request");
  assert.equal(next.group.visible, true);
  assert.notEqual((next.group.children[0] as VisitorMesh).material.alphaMap, firstMesh.material.alphaMap,
    "Each renderer owns its GPU texture so disposing another gallery cannot break it");
  layers.slice(1).forEach(layer => layer.dispose());
  next.dispose();

  await t.test("public crowds use only default click-through figures and reuse cached textures", async () => {
    for (const artworkCount of [0, 1, 3]) {
      const layout = createGalleryLayout(Array.from({ length: artworkCount }, (_, index) => ({
        id: `artwork-${index}`, artworkId: `artwork-${index}`, width: 50, height: 80,
      })));
      const layer = createGalleryVisitors(layout, () => {});
      const count = artworkCount * 4;
      layer.setVisitors([], count);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(layer.group.children.length, count);
      assert.equal(layer.group.visible, true);
      const meshes = layer.group.children as VisitorMesh[];
      for (const mesh of meshes) {
        assert.equal(mesh.material.color.getHexString(), "302c28");
        assert.equal(mesh.material.opacity, 0.35);
        assert.equal(mesh.userData.visitorId, undefined);
        assert.notEqual(mesh.userData.interactive, true);
        assert.equal(mesh.position.y, mesh.geometry.parameters.height / 2);
        assert.ok(mesh.position.z > GALLERY_FRAME_FRONT_Z && mesh.position.z < layout.overviewDistance);
        const ray = rayAt(mesh, true);
        const intersections = t.mock.method(ray, "intersectObjects");
        assert.equal(layer.pick(ray), undefined);
        assert.equal(intersections.mock.calls[0].arguments[0].length, 0, "Default visitors are excluded from raycasting");
      }
      const positions = meshes.map(mesh => mesh.position.toArray());
      layer.setVisitors([], count);
      layer.setVisible(false);
      assert.equal(layer.group.visible, false);
      layer.setVisible(true);
      assert.deepEqual(meshes.map(mesh => mesh.position.toArray()), positions, "Updating or toggling ambient crowds must not shuffle them");
      for (const depth of [0.5, 6, 12]) {
        layer.setCameraDepth(depth);
        for (const mesh of meshes) assert.ok(mesh.position.z > GALLERY_FRAME_FRONT_Z && mesh.position.z < depth);
      }
      let disposedMaterials = 0;
      let disposedTextures = 0;
      if (meshes.length) {
        assert.equal(new Set(meshes.map(mesh => mesh.material)).size, 1, "Ambient crowds share one material");
        meshes[0].material.addEventListener("dispose", () => { disposedMaterials++; });
        meshes[0].material.alphaMap!.addEventListener("dispose", () => { disposedTextures++; });
      }
      layer.setVisitors([], count + 4);
      assert.equal(layer.group.children.length, count + 4);
      layer.setVisitors([], 4);
      assert.equal(layer.group.children.length, 4);
      layer.setVisitors([]);
      assert.equal(layer.group.children.length, 0);
      assert.equal(disposedMaterials, 0, "Removing figures does not prematurely dispose shared resources");
      layer.dispose();
      if (count) {
        assert.equal(disposedMaterials, 1);
        assert.equal(disposedTextures, 1);
      }
    }
    assert.equal(requests, 1, "Public crowds share the existing decoded silhouette image");
  });
});

test("scene clicks meet active colored visitors and select artwork when the visitor picker passes through", async () => {
  const source = ts.createSourceFile("gallery-scene.ts",
    await readFile(new URL("./gallery-scene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const functions: string[] = [];
  function collect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && ["pick", "click", "hover", "updateCursor"].includes(node.name?.text ?? "")) {
      functions.push(node.getText(source));
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  const code = ts.transpileModule(functions.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const meetings: string[] = [];
  const selections: string[] = [];
  let hit: { visitorId?: string; interactive: boolean } | undefined;
  const style = { cursor: "" };
  const { click, hover } = runInNewContext(`${code}\n({ click, hover })`, {
    renderer: { domElement: { style, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    pointer: new THREE.Vector2(), camera: {},
    raycaster: { setFromCamera() {}, intersectObjects: () => [{ object: { userData: { itemId: "painting" } } }] },
    visitors: { pick: () => hit }, paintings: [], layout: { paintings: [{ id: "painting" }] },
    activeIndex: 0, zoomed: false, hoverPosition: null,
    onMeetVisitor: (id: string) => meetings.push(id), onSelect: (id: string) => selections.push(id),
  }) as { click: (event: object) => void; hover: (event: object) => void };
  for (const [target, cursor] of [
    [{ visitorId: "bronze", interactive: true }, "pointer"],
    [{ visitorId: "disabled", interactive: false }, ""],
    [undefined, "zoom-in"],
  ] as const) {
    hit = target;
    click({ clientX: 50, clientY: 50 });
    hover({ clientX: 50, clientY: 50 });
    assert.equal(style.cursor, cursor);
  }
  assert.deepEqual(meetings, ["bronze"]);
  assert.deepEqual(selections, ["painting"]);
});

test("zoom maximizes each framed artwork while overview uses the admin distance and restores visitors", async () => {
  const source = ts.createSourceFile("gallery-scene.ts",
    await readFile(new URL("./gallery-scene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const functions: string[] = [];
  function collect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && ["focus", "setVisitorsVisible", "updateDestination"].includes(node.name?.text ?? "")) {
      functions.push(node.getText(source));
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  const code = ts.transpileModule(functions.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [overviewDistanceCm, cameraHeightCm, artworkCenterHeightCm] of [[600, 158, 140], [1250, 185, 170]]) for (const initiallyZoomed of [false, true])
    for (const [width, height] of [[320, 640], [600, 600], [1200, 480]]) {
    let visible: boolean | undefined;
    const layout = createGalleryLayout([
      { id: "painting", artworkId: "small", width: 50, height: 80 },
      { id: "tall", artworkId: "tall", width: 50, height: 450 },
      { id: "wide", artworkId: "wide", width: 600, height: 80 },
    ], undefined, { overviewDistanceCm, cameraHeightCm, artworkCenterHeightCm });
    const aspect = width / height;
    const destination = new THREE.Vector3();
    const { focus, setVisitorsVisible } = runInNewContext(`${code}\n({ focus, setVisitorsVisible })`, {
      layout, activeIndex: 0, zoomed: initiallyZoomed,
      visitorsVisible: true, visitors: { setVisible: (next: boolean) => { visible = next; } },
      destination, targetDestination: new THREE.Vector3(),
      artworkZ: GALLERY_FRAME_FRONT_Z - toGalleryUnits(0.005),
      camera: { aspect }, host: { clientWidth: width },
      getGalleryWideCameraFraming, getGalleryCameraFraming,
      updateCursor() {}, invalidate() {},
    }) as { focus: (id: string, zoomed: boolean) => void; setVisitorsVisible: (visible: boolean) => void };
    focus("painting", initiallyZoomed);
    assert.equal(destination.y, initiallyZoomed ? layout.paintings[0].y : cameraHeightCm / 100);
    assert.equal(destination.z, initiallyZoomed ? getGalleryCameraFraming(layout.paintings[0], aspect, width).z : overviewDistanceCm / 100);
    setVisitorsVisible(true);
    assert.equal(visible, !initiallyZoomed);
    focus("tall", true);
    assert.equal(destination.y, layout.paintings[1].y, "Zoom follows floor-raised artworks, not the nominal centerline");
    assert.equal(destination.x, layout.paintings[1].x);
    assert.equal(destination.z, getGalleryCameraFraming(layout.paintings[1], aspect, width).z);
    for (const painting of layout.paintings) {
      focus(painting.id, true);
      const camera = new THREE.PerspectiveCamera(48, aspect, toGalleryUnits(0.05), 100);
      camera.position.copy(destination);
      camera.lookAt(painting.x, painting.y, GALLERY_FRAME_FRONT_Z);
      camera.updateMatrixWorld(true);
      const surround = painting.frameWidth + painting.matteWidth;
      let horizontalReach = 0;
      let verticalReach = 0;
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        const corner = new THREE.Vector3(
          painting.x + x * (painting.width / 2 + surround),
          painting.y + y * (painting.height / 2 + surround),
          GALLERY_FRAME_FRONT_Z,
        ).project(camera);
        horizontalReach = Math.max(horizontalReach, Math.abs(corner.x));
        verticalReach = Math.max(verticalReach, Math.abs(corner.y));
        assert.ok((1 - Math.abs(corner.x)) * width / 2 >= 64 - 1e-8, "Zoom leaves navigation clearance");
        assert.ok(Math.abs(corner.y) <= 0.84 + 1e-8, "The complete frame stays in view");
      }
      assert.ok(Math.max(horizontalReach / Math.min(0.84, 1 - 128 / width), verticalReach / 0.84) > 0.99,
        "Zoom fills at least one available viewport dimension instead of retaining a fixed distance");
    }
    focus("painting", true);
    assert.equal(destination.y, layout.paintings[0].y, "Changing the selected artwork updates the zoom height");
    assert.ok(destination.z < overviewDistanceCm / 100, "Zooming to ordinary artworks moves closer than overview");
    assert.equal(visible, false);
    setVisitorsVisible(true);
    assert.equal(visible, false, "Show visitors cannot override a zoomed-in view");
    focus("painting", false);
    assert.equal(destination.y, cameraHeightCm / 100, "Zoom-out restores the configured overview camera height");
    assert.equal(destination.z, overviewDistanceCm / 100);
    assert.equal(visible, true);
    setVisitorsVisible(false);
    focus("painting", true);
    focus("painting", false);
    assert.equal(visible, false, "Zooming out must preserve a manual Hide visitors selection");
    focus("painting", true);
    setVisitorsVisible(true);
    assert.equal(visible, false);
    focus("painting", false);
    assert.equal(visible, true, "The latest manual preference applies when leaving zoom");
  }
});

test("camera and target glide together horizontally without timing offsets and settle on the selected artwork", async () => {
  const source = ts.createSourceFile("gallery-scene.ts",
    await readFile(new URL("./gallery-scene.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const functions: string[] = [];
  function collect(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && ["render", "updateDestination", "focus", "setVisitorsVisible"].includes(node.name?.text ?? "")) {
      functions.push(node.getText(source));
    }
    ts.forEachChild(node, collect);
  }
  collect(source);
  const code = ts.transpileModule(functions.join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const height of [0, 0.5, 1.58 - toGalleryUnits(0.0001), 1.58 + toGalleryUnits(0.0001), 1.8, 10]) {
    for (const zoomed of [false, true]) for (const reducedMotion of [false, true]) for (const fps of [30, 60, 120]) {
      const layout = createGalleryLayout([
        { id: "previous", artworkId: "previous", width: 20, height: 30 },
        { id: "painting", artworkId: "selected", width: 50, height: 80 },
      ]);
      const painting = layout.paintings[1];
      painting.y = height;
      const framing = getGalleryWideCameraFraming(layout);
      const destination = new THREE.Vector3();
      const camera = new THREE.PerspectiveCamera(48, 2, toGalleryUnits(0.05), 100);
      camera.position.set(layout.paintings[0].x, zoomed ? GALLERY_CAMERA_HEIGHT : layout.paintings[0].y, framing.z);
      const artworkZ = GALLERY_FRAME_FRONT_Z - toGalleryUnits(0.005);
      const target = new THREE.Vector3(layout.paintings[0].x, layout.paintings[0].y, artworkZ);
      const targetDestination = new THREE.Vector3();
      const initialPosition = camera.position.clone();
      const initialTarget = target.clone();
      let pending = true;
      let frames = 0;
      let targetArrivalFrame = 0;
      let cameraArrivalFrame = 0;
      let lastRenderedHeight: number | undefined;
      let visitorDepth: number | undefined;
      let overview = !zoomed;
      const { render, focus } = runInNewContext(`${code}\n({ render, focus })`, {
        animation: 0, lastTime: 0, disposed: false, unavailable: false,
        scene: {}, camera, destination, target, targetDestination, toGalleryUnits, reducedMotion: { matches: reducedMotion },
        layout, activeIndex: 0, artworkZ, zoomed, host: { clientWidth: 1100 }, visitorsVisible: true,
        getGalleryWideCameraFraming, getGalleryCameraFraming,
        visitors: { setVisible() {}, setCameraDepth: (depth: number) => { visitorDepth = depth; } }, updateCursor() {},
        renderer: { render: () => {
          lastRenderedHeight = camera.position.y;
          if (overview) assert.equal(camera.position.y, layout.cameraHeight, "Every zoomed-out frame uses the static configured height");
          assert.equal(visitorDepth, camera.position.z, "Visitor bounds follow the camera's live depth, not its destination");
          camera.updateMatrixWorld(true);
          const center = target.clone().project(camera);
          assert.ok(Math.abs(center.x) < 1e-10 && Math.abs(center.y) < 1e-10,
            "The camera follows its blended target instead of snapping to the selected artwork");
          assert.equal(camera.position.x, target.x, "Camera and target stay horizontally aligned on every frame");
          if (!targetArrivalFrame && target.equals(targetDestination)) targetArrivalFrame = frames;
          if (!cameraArrivalFrame && camera.position.equals(destination)) cameraArrivalFrame = frames;
        } },
        invalidate: () => { pending = true; },
      }) as { render: (time: number) => void; focus: (id: string, zoomed: boolean) => void };
      focus("painting", zoomed);
      assert.ok(camera.position.equals(initialPosition), "Selecting a work must not jump the camera");
      assert.ok(target.equals(initialTarget), "Selecting a work must not jump its target");
      pending = false;
      render(++frames * 1000 / fps);
      if (!reducedMotion) {
        assert.ok(!camera.position.equals(initialPosition), "Camera translation starts immediately with the target");
        assert.ok(!target.equals(initialTarget) && !target.equals(targetDestination), "The target blends rather than snapping");
        assert.ok(target.distanceTo(targetDestination) < initialTarget.distanceTo(targetDestination));
      }
      while (pending && frames < fps * 3) {
        pending = false;
        render(++frames * 1000 / fps);
      }
      assert.equal(pending, false, "The camera animation settles");
      if (reducedMotion) assert.equal(frames, 1, "Reduced motion snaps both position and target without a delay");
      else {
        assert.ok(targetArrivalFrame > 1);
        assert.equal(targetArrivalFrame, cameraArrivalFrame, "Camera and target settle together without a timing offset");
      }
      assert.equal(lastRenderedHeight, zoomed ? height : 1.58, "Aiming preserves overview and zoom camera heights");
      assert.deepEqual(camera.position.toArray(), destination.toArray());
      assert.ok(target.equals(new THREE.Vector3(painting.x, painting.y, artworkZ)));
      const center = new THREE.Vector3(painting.x, painting.y, artworkZ).project(camera);
      assert.ok(Math.abs(center.x) < 1e-10 && Math.abs(center.y) < 1e-10, "The selected artwork is exactly centered once in position");
      assert.equal(camera.position.z, zoomed ? getGalleryCameraFraming(painting, 2).z : framing.z,
        "Zoom fits the selected artwork while overview uses the configured wall distance");
      if (height === 0.5 && zoomed && !reducedMotion && fps === 60) {
        for (const interruptionFrames of [2, 8]) {
          const settledPosition = camera.position.clone();
          focus("previous", zoomed);
          for (let frame = 0; frame < interruptionFrames; frame++) {
            pending = false;
            render(++frames * 1000 / fps);
          }
          assert.ok(!camera.position.equals(settledPosition), "Both short and long slides start without a delay");
          const interruptedPosition = camera.position.clone();
          const interruptedTarget = target.clone();
          focus("painting", zoomed);
          assert.ok(camera.position.equals(interruptedPosition) && target.equals(interruptedTarget),
            "Rapid navigation retargets from the current view without snapping");
          pending = false;
          render(++frames * 1000 / fps);
          assert.ok(!camera.position.equals(interruptedPosition), "Retargeted camera movement resumes without a delay");
          assert.ok(target.distanceTo(targetDestination) < interruptedTarget.distanceTo(targetDestination));
          assert.equal(pending, true, "Interrupted glides continue until camera and target have both settled");
          const limit = frames + fps * 3;
          while (pending && frames < limit) {
            pending = false;
            render(++frames * 1000 / fps);
          }
          assert.equal(pending, false);
          assert.ok(camera.position.equals(destination) && target.equals(targetDestination));
        }
      }
      if (zoomed) {
        overview = true;
        focus("previous", false);
        const limit = frames + fps * 3;
        do {
          pending = false;
          render(++frames * 1000 / fps);
        } while (pending && frames < limit);
        assert.equal(pending, false);
        assert.equal(camera.position.y, layout.cameraHeight, "Leaving zoom does not animate camera height");
        assert.equal(target.y, layout.paintings[0].y, "Only the overview target tracks artwork elevation");
      }
    }
  }
});
