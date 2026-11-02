import type { Light } from "three";

export function configureGalleryShadows(
  lights: readonly Pick<Light, "castShadow">[],
  maxTextures: number,
) {
  // Standard materials need a color map and Three's DFG lookup alongside shadows.
  const shadowBudget = Math.max(0, Math.floor(maxTextures) - 2);
  lights.forEach((light, index) => {
    light.castShadow = index < shadowBudget;
  });
}
