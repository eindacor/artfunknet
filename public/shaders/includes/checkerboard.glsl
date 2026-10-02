float checkerboard(vec2 pixelCoordinate, float cellSize) {
  vec2 cell = floor(pixelCoordinate / cellSize);
  return mod(cell.x + cell.y, 2.0);
}
