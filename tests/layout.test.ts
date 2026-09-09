import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  calculatorKeyForKeyboardEvent,
  isCalculatorKeyboardScopeTarget,
} from '../components/HvacCalculator';
import PhysicalCalculator, { PHYSICAL_KEY_ROWS } from '../components/calculator/PhysicalCalculator';
import { expressionSizeClass } from '../components/calculator/CalculatorDisplay';
import CalculatorKeypad, { accessibleKeyLabel } from '../components/calculator/CalculatorKeypad';
import { splitExpressionText } from '../components/calculator/ExpressionText';
import { type KeyId, calculatorReducer, initialCalculatorState } from '../lib/calculator/engine';

const keyboardTarget = (
  kind: 'background' | 'button' | 'input',
  editable = false,
  inCalculator = false,
): EventTarget => ({
  closest: (selector: string) => {
    if (selector === '[data-calculator-keyboard-scope="active"]') {
      return inCalculator ? ({} as Element) : null;
    }
    if (kind === 'background') return null;
    const selectors = selector.split(', ').map((item) => item.trim());
    const matches = kind === 'button'
      ? selectors.includes('button')
      : selectors.some((item) => item.startsWith('input'));
    return matches ? ({} as Element) : null;
  },
  isContentEditable: editable,
}) as unknown as EventTarget;

describe('physical HVAC keypad layout', () => {
  it('keeps the complete five-column, eight-row key order', () => {
    expect(PHYSICAL_KEY_ROWS).toHaveLength(8);
    expect(PHYSICAL_KEY_ROWS.every((row) => row.length === 5)).toBe(true);
    expect(PHYSICAL_KEY_ROWS.map((row) => row.map((key) => key.id))).toEqual([
      ['run', 'rise', 'diag', 'pitch', 'hip'],
      ['square', 'sqrt', 'circ', 'stair', 'jack'],
      ['sin', 'cos', 'tan', 'left', 'right'],
      ['meter', 'feet', 'inch', 'fraction', 'backspace'],
      ['conv', '7', '8', '9', 'divide'],
      ['recall', '4', '5', '6', 'multiply'],
      ['mplus', '1', '2', '3', 'subtract'],
      ['pi', '0', 'decimal', 'equals', 'add'],
    ]);
  });

  it('keeps the physical key color groups and converted legends', () => {
    const keys = Object.fromEntries(PHYSICAL_KEY_ROWS.flat().map((key) => [key.id, key]));
    expect(keys.conv.tone).toBe('yellow');
    expect(keys.run.tone).toBe('mid');
    expect(keys.hip.tone).toBe('dark');
    expect(keys['7'].tone).toBe('light');
    expect(keys.divide.tone).toBe('dark');
    expect(keys.run.secondary).toBe('Fan Law 1');
    expect(keys.pitch.secondary).toBe('Seg Radius');
    expect(keys.left.secondary).toBe('Offset');
    expect(keys.multiply.secondary).toBe('Clear All');
    expect(keys.equals.secondary).toBe('Prefs');
  });

  it('scales long written expressions without hiding their content', () => {
    expect(expressionSizeClass('8′ 2 3/8″ + 1′')).toBe('');
    expect(expressionSizeClass('123456789012345678901234')).toBe('expression-text-medium');
    expect(expressionSizeClass('12345678901234567890123456789012345678')).toBe('expression-text-small');
  });

  it('uses the freed title space for the physical calculation display', () => {
    const markup = renderToStaticMarkup(createElement(PhysicalCalculator, {
      active: true,
      state: initialCalculatorState(),
      onPress: () => undefined,
      onFactoryReset: () => undefined,
    }));
    expect(markup).toContain('calc-display-physical');
    expect(markup).toContain('display-guidance');
    expect(markup).not.toContain('PROFESSIONAL HVAC CALCULATOR');
    expect(markup).not.toContain('Sheet metal · Construction math');
  });

  it('renders the live triangle drawing inside the shared display without hiding the keypad', () => {
    const keys: KeyId[] = ['8', 'feet', 'run', '6', 'feet', 'rise', 'diag'];
    const triangleState = keys.reduce(
      (state, key) => calculatorReducer(state, { type: 'press', key }),
      initialCalculatorState(),
    );
    const markup = renderToStaticMarkup(createElement(PhysicalCalculator, {
      active: true,
      state: triangleState,
      onPress: () => undefined,
      onFactoryReset: () => undefined,
    }));

    expect(markup).toContain('data-diagram-kind="right-triangle"');
    expect(markup).toContain('data-metric="x"');
    expect(markup).toContain('diagram-status-entered');
    expect(markup).toContain('diagram-status-calculated');
    expect(markup).toContain('physical-keypad');
  });

  it('disables ordinary controls while Off and exposes the factory-reset chord', () => {
    const offState = { ...initialCalculatorState(), powered: false };
    const markup = renderToStaticMarkup(createElement(PhysicalCalculator, {
      active: true,
      state: offState,
      onPress: () => undefined,
      onFactoryReset: () => undefined,
    }));

    // The visible hint line was removed; the chord stays documented on the
    // controls themselves, which the two assertions below still pin.
    expect(markup).toMatch(/<button(?=[^>]*disabled="")(?=[^>]*data-key="7")[^>]*>/);
    expect(markup).toMatch(/<button(?=[^>]*data-key="multiply")(?=[^>]*tabindex="-1")[^>]*>/);
    expect(markup).toContain('Touch reset modifier: hold Multiply, then press On/C. Keyboard reset: hold asterisk and press Escape');
    expect(markup).toContain('Turn calculator on. For factory reset by touch, hold Multiply and press On/C. With a keyboard, hold asterisk and press Escape.');
  });

  it('disables Trade keys while Off except for On/C', () => {
    const markup = renderToStaticMarkup(createElement(CalculatorKeypad, {
      keys: [
        { id: 'on', label: 'On/C', key: 'on', powerControl: true },
        { id: 'clear', label: 'C', key: 'on' },
        { id: 'seven', label: '7', key: '7' },
        { id: 'preferences', label: 'Prefs', action: 'preferences' },
      ],
      powered: false,
      onPress: () => undefined,
      onAction: () => undefined,
    }));

    expect(markup).toMatch(/<button(?=[^>]*aria-label="On\/C")(?![^>]*disabled="")[^>]*>/);
    expect(markup).toMatch(/<button(?=[^>]*aria-label="C")(?=[^>]*disabled="")[^>]*>/);
    expect(markup).toMatch(/<button(?=[^>]*aria-label="7")(?=[^>]*disabled="")[^>]*>/);
    expect(markup).toMatch(/<button(?=[^>]*aria-label="Prefs")(?=[^>]*disabled="")[^>]*>/);
  });

  it('renders written fractions as legible typographic groups', () => {
    expect(splitExpressionText('23′ 4 5/8″')).toEqual([
      '23′ 4 ',
      { numerator: '5', denominator: '8' },
      '″',
    ]);
    expect(splitExpressionText('1/…″')).toEqual([
      { numerator: '1', denominator: '…' },
      '″',
    ]);
    expect(splitExpressionText('1/16″')).toEqual([
      { numerator: '1', denominator: '16' },
      '″',
    ]);
  });

  it('renders scientific notation and entered powers with a raised exponent', () => {
    expect(splitExpressionText('2.17000e10')).toEqual([
      '2.17000',
      { exponent: '10' },
    ]);
    expect(splitExpressionText('1.25000e-9')).toEqual([
      '1.25000',
      { exponent: '−9' },
    ]);
    expect(splitExpressionText('10^3')).toEqual([
      '10',
      { exponent: '3' },
    ]);
  });
});

describe('hardware keyboard routing', () => {
  it('enables shortcuts only while the active calculator region has focus', () => {
    const calculator = keyboardTarget('background', false, true);
    const body = keyboardTarget('background');
    const navDot = keyboardTarget('button');
    const unrelatedButton = keyboardTarget('button');

    expect(isCalculatorKeyboardScopeTarget(calculator)).toBe(true);
    expect(calculatorKeyForKeyboardEvent('7', calculator, calculator)).toBe('7');
    expect(calculatorKeyForKeyboardEvent('+', calculator, calculator)).toBe('add');
    expect(calculatorKeyForKeyboardEvent('Enter', calculator, calculator)).toBe('equals');
    expect(calculatorKeyForKeyboardEvent('7', body, body)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('+', navDot, navDot)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('=', unrelatedButton, unrelatedButton)).toBeUndefined();
  });

  it('leaves Enter and Space activation to interactive targets and focus', () => {
    const calculator = keyboardTarget('background', false, true);
    const interactive = keyboardTarget('button', false, true);
    const editable = keyboardTarget('input', true, true);

    expect(calculatorKeyForKeyboardEvent('Enter', interactive, calculator)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('Enter', calculator, interactive)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent(' ', interactive, calculator)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('Enter', editable, calculator)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('7', interactive, interactive)).toBe('7');
    expect(calculatorKeyForKeyboardEvent('+', interactive, interactive)).toBe('add');
    expect(calculatorKeyForKeyboardEvent('7', editable, editable)).toBeUndefined();
  });
});

describe('trade keypad accessibility', () => {
  it('includes the visible geometry detail in the accessible key name', () => {
    expect(accessibleKeyLabel({
      id: 'x',
      label: 'x',
      detail: 'Run',
      key: 'run',
      secondary: 'Fan Law 1',
    })).toBe('x Run; Conv function Fan Law 1');
  });
});
