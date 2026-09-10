/**
 * Which page a scroll position has landed on.
 *
 * The pager is a scroll container with `scroll-snap-type: x mandatory`, so the
 * browser owns the gesture, the inertia and the rubber band. Nothing here
 * projects a flick or springs to a target any more: that machinery existed to
 * take the horizontal gesture away from the browser, and taking it away is
 * precisely what could not be made to work on a phone.
 */
export function pageIndexForScroll(
  scrollLeft: number,
  viewportWidth: number,
  pageCount: number,
): number {
  if (!Number.isFinite(scrollLeft) || !Number.isFinite(viewportWidth)) return 0;
  if (viewportWidth <= 0 || pageCount <= 1) return 0;
  const index = Math.round(scrollLeft / viewportWidth);
  return Math.min(pageCount - 1, Math.max(0, index));
}
