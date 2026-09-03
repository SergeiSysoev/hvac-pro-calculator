import { describe, expect, it } from 'vitest';
import { projectVelocity, projectedPageIndex, rubberBandDistance } from '@/lib/carousel';

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
});
