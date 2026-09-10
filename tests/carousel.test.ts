import { describe, expect, it } from 'vitest';
import { projectVelocity, projectedPageIndex, rubberBandDistance } from '@/lib/carousel';
import {
  carouselOffsetForPointer,
  isCarouselGestureControl,
  releasePointerVelocity,
} from '@/components/HvacCalculator';

const gestureTarget = (matchingSelector?: string, editable = false): EventTarget => ({
  closest: (selector: string) => matchingSelector && selector.includes(matchingSelector)
    ? ({} as Element)
    : null,
  isContentEditable: editable,
}) as unknown as EventTarget;

/** Matches a whole selector in the list, the way a real `closest` does. The
 *  helper above matches substrings, so it reports a plain <button> as excluded
 *  purely because `[role="spinbutton"]` contains the letters. */
const elementMatchingExactly = (...selectors: string[]): EventTarget => ({
  closest: (selector: string) => selector
    .split(',')
    .map((part) => part.trim())
    .some((part) => selectors.includes(part))
    ? ({} as Element)
    : null,
  isContentEditable: false,
}) as unknown as EventTarget;

const targetInsideFocusableCalculatorSection = (): EventTarget => ({
  closest: (selector: string) => selector.includes('[tabindex]:not([tabindex="-1"])')
    ? ({} as Element)
    : null,
  isContentEditable: false,
}) as unknown as EventTarget;

describe('swipe pager physics', () => {
  it('projects a flick in its direction', () => {
    expect(projectVelocity(500)).toBeGreaterThan(200);
    expect(projectVelocity(-500)).toBeLessThan(-200);
  });

  it('uses release velocity to select the next page', () => {
    expect(projectedPageIndex(-40, -900, 390, 3, 0)).toBe(1);
    expect(projectedPageIndex(-390, -900, 390, 3, 1)).toBe(2);
    expect(projectedPageIndex(-390, 900, 390, 3, 1)).toBe(0);
  });

  it('clamps page targets to both ends', () => {
    expect(projectedPageIndex(0, 1200, 390, 3, 0)).toBe(0);
    expect(projectedPageIndex(-780, -1200, 390, 3, 2)).toBe(2);
  });

  it('never skips over a screen on a single flick', () => {
    expect(projectedPageIndex(-300, -5000, 390, 3, 0)).toBe(1);
    expect(projectedPageIndex(-480, 5000, 390, 3, 2)).toBe(1);
  });

  it('softens overscroll while preserving its sign', () => {
    expect(rubberBandDistance(200, 390)).toBeGreaterThan(0);
    expect(rubberBandDistance(200, 390)).toBeLessThan(200);
    expect(rubberBandDistance(-200, 390)).toBeLessThan(0);
  });

  it('drops stale flick velocity after the pointer is held still', () => {
    const velocity = releasePointerVelocity(-1200, 160, 1000, 160, 1200);
    const releaseOffset = carouselOffsetForPointer(0, 200, 160, 390, 3);

    expect(velocity).toBe(0);
    expect(releaseOffset).toBe(-40);
    expect(projectedPageIndex(releaseOffset, velocity, 390, 3, 0)).toBe(0);
  });

  it('uses the final pointer position and preserves fresh release momentum', () => {
    expect(carouselOffsetForPointer(0, 200, 80, 390, 3)).toBe(-120);
    expect(releasePointerVelocity(-900, 100, 1000, 100, 1005)).toBeLessThan(-850);
    expect(releasePointerVelocity(0, 100, 1000, 70, 1120)).toBe(-250);
  });

  it('does not begin carousel gestures on controls or editable content', () => {
    expect(isCarouselGestureControl(gestureTarget())).toBe(false);
    expect(isCarouselGestureControl(gestureTarget('a[href]'))).toBe(true);
    expect(isCarouselGestureControl(gestureTarget('input:not'))).toBe(true);
    expect(isCarouselGestureControl(gestureTarget('select'))).toBe(true);
    expect(isCarouselGestureControl(gestureTarget('textarea'))).toBe(true);
    expect(isCarouselGestureControl(gestureTarget('label'))).toBe(true);
    expect(isCarouselGestureControl(gestureTarget(undefined, true))).toBe(true);
  });

  it('allows page swipes beneath the focusable calculator section', () => {
    expect(isCarouselGestureControl(targetInsideFocusableCalculatorSection())).toBe(false);
  });

  it('lets a swipe start on a key, because the keypad is the whole screen', () => {
    // This was `true`, and it made the pager unusable on a phone: everything
    // below the display is a key, so the only place a swipe could begin was a
    // 150 px strip at the top. Confirmed in a real browser before and after.
    // A tap still presses - the drag needs 10 px of horizontal movement to
    // lock, and only then is the click suppressed.
    expect(isCarouselGestureControl(elementMatchingExactly('button'))).toBe(false);
    expect(isCarouselGestureControl(elementMatchingExactly('[role="button"]'))).toBe(false);
    // The neighbours are still refused, so this is a removal and not a hole.
    expect(isCarouselGestureControl(elementMatchingExactly('a[href]'))).toBe(true);
    expect(isCarouselGestureControl(elementMatchingExactly('textarea'))).toBe(true);
    expect(isCarouselGestureControl(elementMatchingExactly('[role="slider"]'))).toBe(true);
  });
});
