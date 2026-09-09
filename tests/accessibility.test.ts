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

  it('labels the result line with the word the state calls for', () => {
    const label = (keys: KeyId[]) => {
      const state = keys.reduce(
        (current, key) => calculatorReducer(current, { type: 'press', key }),
        initialCalculatorState(),
      );
      const markup = renderToStaticMarkup(createElement(CalculatorDisplay, {
        active: true,
        state,
        variant: 'physical',
      }));
      return markup.match(/class="expression-result-label">([^<]*)</)?.[1];
    };

    expect(label(['5', 'multiply', '5', 'equals'])).toBe('Result');
    expect(label(['2', 'multiply', 'left', '3', 'add', '4', 'right'])).toBe('Current group');
    expect(label(['6', 'feet', 'conv', 'inch'])).toBe('Converted');
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
