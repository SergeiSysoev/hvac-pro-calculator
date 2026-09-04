import { describe, expect, it } from 'vitest';
import { calculatorKeyForKeyboardEvent } from '../components/HvacCalculator';
import {
  PHYSICAL_KEY_ROWS,
  lcdValueSizeClass,
} from '../components/calculator/PhysicalCalculator';
import { accessibleKeyLabel } from '../components/calculator/CalculatorKeypad';
import { splitLcdValueText } from '../components/calculator/LcdValue';

const keyboardTarget = (interactive: boolean, editable = false): EventTarget => ({
  closest: () => interactive ? ({} as Element) : null,
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

  it('compacts only long LCD values that need the narrow-screen digit budget', () => {
    expect(lcdValueSizeClass('147928.99')).toBe('');
    expect(lcdValueSizeClass('19999999.99')).toBe('lcd-value-compact');
    expect(lcdValueSizeClass('123456789012')).toBe('lcd-value-dense');
    expect(lcdValueSizeClass('-19999999.99')).toBe('lcd-value-dense');
  });

  it('renders entered and calculated fractions as the original stacked LCD group', () => {
    expect(splitLcdValueText('23 - 4 5/8')).toEqual([
      '23 - 4 ',
      { numerator: '5', denominator: '8' },
    ]);
    expect(splitLcdValueText('1/16')).toEqual([
      { numerator: '1', denominator: '16' },
    ]);
  });

  it('renders scientific notation as the original raised LCD exponent', () => {
    expect(splitLcdValueText('2.17000e10')).toEqual([
      '2.17000',
      { exponent: '10' },
    ]);
    expect(splitLcdValueText('1.25000e-9')).toEqual([
      '1.25000',
      { exponent: '−9' },
    ]);
  });
});

describe('hardware keyboard routing', () => {
  it('keeps calculator shortcuts on non-interactive page background', () => {
    const background = keyboardTarget(false);
    expect(calculatorKeyForKeyboardEvent('7', background, background)).toBe('7');
    expect(calculatorKeyForKeyboardEvent('Enter', background, background)).toBe('equals');
  });

  it('leaves Enter and Space activation to interactive targets and focus', () => {
    const background = keyboardTarget(false);
    const interactive = keyboardTarget(true);
    const editable = keyboardTarget(false, true);

    expect(calculatorKeyForKeyboardEvent('Enter', interactive, background)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('Enter', background, interactive)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent(' ', interactive, background)).toBeUndefined();
    expect(calculatorKeyForKeyboardEvent('Enter', editable, background)).toBeUndefined();
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
