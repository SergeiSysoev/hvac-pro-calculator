import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pageIndexForScroll } from '@/lib/carousel';

describe('which page the scroll landed on', () => {
  it('rounds to the nearest page', () => {
    expect(pageIndexForScroll(0, 390, 2)).toBe(0);
    expect(pageIndexForScroll(150, 390, 2)).toBe(0);
    expect(pageIndexForScroll(240, 390, 2)).toBe(1);
    expect(pageIndexForScroll(390, 390, 2)).toBe(1);
  });

  it('clamps to both ends, because a rubber band overshoots', () => {
    // The browser's own overscroll goes past the last page and before the
    // first; neither is a page that exists.
    expect(pageIndexForScroll(-60, 390, 2)).toBe(0);
    expect(pageIndexForScroll(520, 390, 2)).toBe(1);
  });

  it('answers 0 before the viewport has been measured', () => {
    // The scroll handler can run before the ResizeObserver has reported, and
    // dividing by zero there would mark the calculator as some other page.
    expect(pageIndexForScroll(120, 0, 2)).toBe(0);
    expect(pageIndexForScroll(120, Number.NaN, 2)).toBe(0);
    expect(pageIndexForScroll(Number.NaN, 390, 2)).toBe(0);
    expect(pageIndexForScroll(120, 390, 1)).toBe(0);
  });
});

describe('the pager is the browser scrolling, not a gesture we take', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const rule = (selector: string): string => {
    const match = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : '';
  };

  it('scrolls and snaps horizontally', () => {
    // This replaced a hand-written pager that followed the finger with a
    // transform. To do that it had to claim the horizontal gesture through
    // `touch-action`, which is resolved only up to the nearest scroll
    // container - and one of those sits inside the pager, so the claim never
    // reached the browser. The drag went a quarter of the way and sprang back
    // on every phone. A scroll container has no such claim to lose.
    const viewport = rule('.carousel-viewport');
    expect(viewport).toMatch(/overflow-x:\s*auto/);
    expect(viewport).toMatch(/scroll-snap-type:\s*x mandatory/);
  });

  it('gives every page a snap point', () => {
    expect(rule('.calculator-page')).toMatch(/scroll-snap-align:\s*start/);
  });

  it('claims no horizontal gesture anywhere', () => {
    // A single `touch-action` that forbids pan-x inside the pager would stop
    // the scroll dead. That is how this was broken; it must not come back.
    const declarations = [...css.matchAll(/touch-action:\s*([^;]+);/g)].map((m) => m[1].trim());
    for (const value of declarations) {
      expect(value).not.toMatch(/^pan-y/);
      expect(value).not.toBe('pan-x');
    }
  });
});
