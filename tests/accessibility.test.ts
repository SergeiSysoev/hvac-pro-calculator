import { describe, expect, it } from 'vitest';
import { accessibleDisplayIndicators } from '@/components/calculator/CalculatorDisplay';
import { accessibleKeyLabel } from '@/components/calculator/CalculatorKeypad';
import { initialCalculatorState } from '@/lib/calculator/engine';

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
});
