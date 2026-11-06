export function getArtworkBaseGenerationWeight(valueScale: number): number {
  return 50 + Math.floor((1 - valueScale) * 50);
}
