import { describe, expect, it } from 'vitest';
import { accessibleDisplayIndicators } from '@/components/calculator/CalculatorDisplay';
import { accessibleKeyLabel } from '@/components/calculator/CalculatorKeypad';
import { calculatorExpressionView } from '@/lib/calculator/presentation';
import { calculatorReducer, initialCalculatorState } from '@/lib/calculator/engine';

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
});
