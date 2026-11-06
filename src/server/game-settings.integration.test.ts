import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";
import * as settingsCore from "./game-settings.ts";
import * as rarityValues from "./rarity-values.ts";

const require = createRequire(import.meta.url);

test("admin gallery settings persist independently for Actual and Debug with safe legacy defaults", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const database = client.db("gallery-camera-settings");
  const metadata = database.collection<{ _id: string; [key: string]: unknown }>("metadata");
  const ranges = Object.fromEntries(rarityValues.RARITY_VALUE_TIERS.map(
    (rarity, index) => [rarity, { min: index * 100 + 1, max: (index + 1) * 100 }],
  ));
  await metadata.insertOne({ _id: "loot-data", loot_data: { rarity_values: ranges } });
  assert.equal((await settingsCore.getGameplaySettings(database)).active.galleryOverviewDistanceCm, 600);
  assert.equal((await settingsCore.getGameplaySettings(database)).active.galleryVisitorScale, 0.8);
  await metadata.insertOne({
    _id: "gameplay-settings", gameplay: { configs: {
      actual: { gallery_zoom_distance_cm: 950 },
      debug: { gallery_zoom_distance_cm: 325 },
    } },
  });
  const previous = await settingsCore.getGameplaySettings(database);
  assert.equal(previous.actual.galleryOverviewDistanceCm, 950, "Preserve previous fixed-distance settings as overview distances");
  assert.equal(previous.debug.galleryOverviewDistanceCm, 325);
  for (const config of [previous.actual, previous.debug]) {
    assert.equal(config.galleryCameraHeightCm, 158);
    assert.equal(config.galleryArtworkCenterHeightCm, 140);
  }

  const code = ts.transpileModule(await readFile(
    new URL("../app/api/admin/gameplay-settings/route.ts", import.meta.url), "utf8",
  ), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  function loadRoute() {
    const dependencies: Record<string, unknown> = {
      "next/server": require("next/server"),
      "@/server/admin-api": { requireAdminApi: async () => ({ ok: true, session: { email: "admin@example.com" } }) },
      "@/server/game-settings": settingsCore,
      "@/server/mongodb": { getDatabase: async () => database },
      "@/server/rarity-values": rarityValues,
    };
    return runInNewContext(`${code}\nexports`, {
      exports: {}, Date,
      require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
    }) as typeof import("../app/api/admin/gameplay-settings/route.ts");
  }
  const route = loadRoute();
  const body = {
    debugEnabled: false,
    actual: {
      ...settingsCore.DEFAULT_ACTUAL_GAMEPLAY_CONFIG, galleryOverviewDistanceCm: 1250, galleryVisitorScale: 0.55,
      galleryCameraHeightCm: 175, galleryArtworkCenterHeightCm: 160,
    },
    debug: {
      ...settingsCore.DEFAULT_DEBUG_GAMEPLAY_CONFIG, galleryOverviewDistanceCm: 450, galleryVisitorScale: 1.35,
      galleryCameraHeightCm: 185, galleryArtworkCenterHeightCm: 170,
    },
    rarityValues: ranges,
  };
  const save = () => route.PATCH(new Request("http://localhost/api/admin/gameplay-settings", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  assert.equal((await save()).status, 200);
  const stored = await metadata.findOne({ _id: "gameplay-settings" });
  const gameplay = stored?.gameplay as { configs: { actual: Record<string, unknown>; debug: Record<string, unknown> } };
  assert.equal(gameplay.configs.actual.gallery_overview_distance_cm, 1250);
  assert.equal(gameplay.configs.debug.gallery_overview_distance_cm, 450);
  assert.equal("gallery_zoom_distance_cm" in gameplay.configs.actual, false);
  assert.equal("gallery_zoom_distance_cm" in gameplay.configs.debug, false);
  assert.equal(gameplay.configs.actual.gallery_visitor_scale, 0.55);
  assert.equal(gameplay.configs.debug.gallery_visitor_scale, 1.35);
  assert.equal(gameplay.configs.actual.gallery_camera_height_cm, 175);
  assert.equal(gameplay.configs.actual.gallery_artwork_center_height_cm, 160);
  assert.equal(gameplay.configs.debug.gallery_camera_height_cm, 185);
  assert.equal(gameplay.configs.debug.gallery_artwork_center_height_cm, 170);
  const savedActual = (await (await loadRoute().GET()).json()).active;
  assert.equal(savedActual.galleryCameraHeightCm, 175);
  assert.equal(savedActual.galleryArtworkCenterHeightCm, 160);
  assert.equal((await (await loadRoute().GET()).json()).active.galleryOverviewDistanceCm, 1250);
  assert.equal((await (await loadRoute().GET()).json()).active.galleryVisitorScale, 0.55);
  body.debugEnabled = true;
  assert.equal((await save()).status, 200);
  assert.equal((await (await loadRoute().GET()).json()).active.galleryOverviewDistanceCm, 450);
  assert.equal((await (await loadRoute().GET()).json()).active.galleryVisitorScale, 1.35);
  const savedDebug = (await (await loadRoute().GET()).json()).active;
  assert.equal(savedDebug.galleryCameraHeightCm, 185);
  assert.equal(savedDebug.galleryArtworkCenterHeightCm, 170);
  for (const key of ["galleryCameraHeightCm", "galleryArtworkCenterHeightCm"] as const) {
    const height = body.actual[key];
    body.actual[key] = 0;
    assert.equal((await save()).status, 400);
    assert.equal((await settingsCore.getGameplaySettings(database)).actual[key], height);
    body.actual[key] = height;
  }

  for (const distanceCm of [10, 49]) {
    body.actual.galleryOverviewDistanceCm = distanceCm;
    assert.equal((await save()).status, 400, "Distances below 50 cm are rejected, not applied as meters");
    assert.equal((await settingsCore.getGameplaySettings(database)).actual.galleryOverviewDistanceCm, 1250);
  }
  body.actual.galleryOverviewDistanceCm = 1250;
  body.actual.galleryVisitorScale = 0;
  assert.equal((await save()).status, 400);
  assert.equal((await settingsCore.getGameplaySettings(database)).actual.galleryVisitorScale, 0.55);
  await metadata.updateOne({ _id: "gameplay-settings" }, {
    $unset: {
      "gameplay.configs.actual.gallery_overview_distance_cm": "",
      "gameplay.configs.actual.gallery_visitor_scale": "",
      "gameplay.configs.actual.gallery_camera_height_cm": "",
      "gameplay.configs.actual.gallery_artwork_center_height_cm": "",
    },
    $set: { "gameplay.debug_enabled": false },
  });
  assert.equal((await settingsCore.getGameplaySettings(database)).active.galleryOverviewDistanceCm, 600);
  assert.equal((await settingsCore.getGameplaySettings(database)).active.galleryVisitorScale, 0.8);
  const withoutHeights = await settingsCore.getGameplaySettings(database);
  assert.equal(withoutHeights.active.galleryCameraHeightCm, 158);
  assert.equal(withoutHeights.active.galleryArtworkCenterHeightCm, 140);
  await metadata.updateOne({ _id: "gameplay-settings" }, {
    $set: {
      "gameplay.configs.actual.gallery_overview_distance_cm": -20,
      "gameplay.configs.actual.gallery_visitor_scale": "oversized",
      "gameplay.configs.actual.gallery_camera_height_cm": "175",
      "gameplay.configs.actual.gallery_artwork_center_height_cm": -1,
    },
  });
  assert.equal((await settingsCore.getGameplaySettings(database)).active.galleryOverviewDistanceCm, 600);
  assert.equal((await settingsCore.getGameplaySettings(database)).active.galleryVisitorScale, 0.8);
  const invalidHeights = await settingsCore.getGameplaySettings(database);
  assert.equal(invalidHeights.active.galleryCameraHeightCm, 158);
  assert.equal(invalidHeights.active.galleryArtworkCenterHeightCm, 140);
  await metadata.replaceOne({ _id: "gameplay-settings" }, {
    _id: "gameplay-settings", gameplay: { daily_drop_count: 12, gallery_visitor_scale: 1.2, gallery_zoom_distance_cm: 875 },
  });
  const legacy = await settingsCore.getGameplaySettings(database);
  assert.equal(legacy.actual.dailyDropCount, 12);
  assert.equal(legacy.actual.galleryOverviewDistanceCm, 875);
  assert.equal(legacy.debug.galleryOverviewDistanceCm, 600);
  assert.equal(legacy.actual.galleryVisitorScale, 1.2);
  assert.equal(legacy.debug.galleryVisitorScale, 0.8);
});
