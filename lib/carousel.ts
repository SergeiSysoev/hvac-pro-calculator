export function rubberBandDistance(overshoot: number, dimension: number, constant = 0.55): number {
  if (!Number.isFinite(overshoot) || !Number.isFinite(dimension) || dimension <= 0) return 0;
  return overshoot * dimension * constant / (dimension + constant * Math.abs(overshoot));
}

export function projectVelocity(velocityPxPerSecond: number, decelerationRate = 0.998): number {
  if (!Number.isFinite(velocityPxPerSecond)) return 0;
  const rate = Math.min(0.999, Math.max(0.9, decelerationRate));
  return velocityPxPerSecond / 1000 * rate / (1 - rate);
}

export function projectedPageIndex(
  offsetPx: number,
  velocityPxPerSecond: number,
  viewportWidth: number,
  pageCount: number,
  currentPageIndex: number,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0 || pageCount <= 1) return 0;
  const projected = offsetPx + projectVelocity(velocityPxPerSecond);
  const rawIndex = Math.round(-projected / viewportWidth);
  const current = Math.min(pageCount - 1, Math.max(0, Math.round(currentPageIndex)));
  const adjacentIndex = Math.min(current + 1, Math.max(current - 1, rawIndex));
  return Math.min(pageCount - 1, Math.max(0, adjacentIndex));
}
