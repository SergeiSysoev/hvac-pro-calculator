import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { accessibleDisplayIndicators } from '@/components/calculator/CalculatorDisplay';
import CalculatorDisplay from '@/components/calculator/CalculatorDisplay';
import { accessibleKeyLabel } from '@/components/calculator/CalculatorKeypad';
import { calculatorExpressionView } from '@/lib/calculator/presentation';
import { type KeyId, calculatorReducer, initialCalculatorState } from '@/lib/calculator/engine';

describe('calculator accessibility text', () => {
  it('names symbolic editing keys by purpose', () => {
    expect(accessibleKeyLabel({ id: 'back', label: '←', key: 'backspace' }))
      .toBe('Backspace');
    expect(accessibleKeyLabel({
      id: 'fraction',
      label: '/',
      key: 'fraction',
      secondary: 'x10ʸ',
    })).toBe('Fraction bar; Conv function x10ʸ');
  });

  it('exposes memory and recall indicators as words', () => {
    const state = initialCalculatorState();
    state.memory.m1 = { amount: 42, power: 0, unit: 'auto', system: 'neutral' };
    state.modifier = 'recall';
    expect(accessibleDisplayIndicators(state)).toEqual([
      'Memory contains a stored value',
      'Recall mode',
    ]);
  });

  it('announces an inline error recovery once without duplicating the old note', () => {
    const errorState = calculatorReducer(initialCalculatorState(), {
      type: 'press',
      key: 'circ',
    });
    const announcement = calculatorExpressionView(errorState).ariaText;
    expect(announcement).toContain('Circle needs valid inputs');
    expect(announcement.match(/Tap On\/C/g)).toHaveLength(1);
    expect(announcement).not.toContain('Press On/C.');
  });

  it('does not repeat the clear instruction after another key hits the error lock', () => {
    const firstError = calculatorReducer(initialCalculatorState(), {
      type: 'press',
      key: 'circ',
    });
    const locked = calculatorReducer(firstError, { type: 'press', key: 'stair' });
    const view = calculatorExpressionView(locked);
    const announcement = view.liveText;

    expect(announcement.match(/On\/C/g)).toHaveLength(1);
    expect(announcement).toContain('all other keys are locked');
    expect(view.resultText).toBe('Previous error is locked');
    expect(view.guidanceText).toBe(
      'Tap On/C to clear the previous error; all other keys are locked.',
    );
  });

  it('prints no caption a person can read off the layout, and nothing in the covered corners', () => {
    // Two removals, one reason. "Result" / "Current group" / "Converted" told a
    // sighted person what the position of the line already tells them. And the
    // strip along the top of the card - a context word on the left, state on
    // the right - sat exactly under the host app's Back and Messenger buttons,
    // so half of it could not be read at all. The context word is gone; the
    // state moved below the readout, where nothing covers it.
    const markup = (keys: KeyId[]) => renderToStaticMarkup(createElement(CalculatorDisplay, {
      active: true,
      state: keys.reduce(
        (current, key) => calculatorReducer(current, { type: 'press', key }),
        initialCalculatorState(),
      ),
      variant: 'physical',
    }));

    for (const keys of [
      ['5', 'multiply', '5', 'equals'],
      ['2', 'multiply', 'left', '3', 'add', '4', 'right'],
      ['6', 'feet', 'conv', 'inch'],
    ] as KeyId[][]) {
      const rendered = markup(keys);
      expect(rendered).not.toContain('expression-result-label');
      expect(rendered).not.toMatch(/>Result</);
      expect(rendered).not.toMatch(/>Current group</);
      expect(rendered).not.toMatch(/>Converted</);
      // The card opens with the readout; the status row, when it exists at
      // all, comes after it.
      const body = rendered.indexOf('display-body');
      const meta = rendered.indexOf('expression-meta');
      expect(body).toBeGreaterThan(-1);
      if (meta !== -1) expect(meta).toBeGreaterThan(body);
    }

    // The row still appears for state a person cannot otherwise see.
    expect(markup(['5', 'mplus'])).toContain('expression-meta');
  });

  it('describes the diagram outside the decorative SVG and keeps one live region', () => {
    const keys: KeyId[] = ['8', 'feet', 'run', '6', 'feet', 'rise', 'diag'];
    const triangle = keys.reduce(
      (state, key) => calculatorReducer(state, { type: 'press', key }),
      initialCalculatorState(),
    );
    const markup = renderToStaticMarkup(createElement(CalculatorDisplay, {
      active: true,
      state: triangle,
      variant: 'physical',
    }));

    expect(markup).toContain('aria-describedby="physical-calculator-guidance-description physical-calculator-diagram-description"');
    expect(markup).toContain('id="physical-calculator-diagram-description"');
    expect(markup).toContain('Right triangle · Run, Rise, Diagonal and Pitch');
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain('data-diagram-kind="right-triangle" aria-hidden="true"');
  });
});
