import { describe, expect, it } from 'vitest';
import { CalculatorState, KeyId, calculatorReducer, initialCalculatorState } from '@/lib/calculator/engine';

function run(keys: KeyId[], initial = initialCalculatorState()): CalculatorState {
  return keys.reduce((state, key) => calculatorReducer(state, { type: 'press', key }), initial);
}

function digits(value: string): KeyId[] {
  return [...value].map((key) => key === '.' ? 'decimal' : key as KeyId);
}

describe('physical keypad workflow', () => {
  it('evaluates order of operations from key presses', () => {
    const state = run([
      ...digits('10'), 'add', ...digits('4'), 'multiply', ...digits('5'), 'equals',
    ]);
    expect(state.current?.amount).toBe(30);
    expect(state.display.label).toBe('RESULT');
  });

  it('enters mixed feet, inches and fractions', () => {
    const state = run([
      '5', 'feet', '3', 'inch', 'multiply',
      '1', '1', 'feet', '6', 'inch', '1', 'fraction', '2', 'equals',
    ]);
    expect(state.current?.power).toBe(2);
    expect(state.current!.amount / 144).toBeCloseTo(60.59375, 8);
  });

  it('stores triangle values and solves the diagonal', () => {
    const state = run([
      '9', 'feet', 'rise',
      '1', '2', 'feet', 'run',
      'diag',
    ]);
    expect(state.current?.amount).toBe(180);
    expect(state.display.label).toBe('R');
  });

  it('recomputes triangle results after replacing a stored side', () => {
    const state = run([
      '9', 'feet', 'rise',
      '1', '2', 'feet', 'run',
      'diag',
      '6', 'feet', 'run',
      'diag',
    ]);
    expect(state.current?.amount).toBeCloseTo(Math.hypot(108, 72), 8);
  });

  it('uses Conv + register keys and solves Fan Law 1', () => {
    const state = run([
      ...digits('1250'), 'conv', '4',
      ...digits('1400'), 'conv', '7',
      ...digits('750'), 'conv', '5',
      'conv', 'run',
    ]);
    expect(state.current?.amount).toBeCloseTo(840, 8);
    expect(state.display.label).toContain('RPMn');
  });

  it('cycles documented offset results', () => {
    const state = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    expect(state.current?.amount).toBeCloseTo(75, 10);
    expect(state.display.label).toBe('RAD');
  });

  it('converts VP to FPM with Conv + 0', () => {
    const state = run([...digits('.049'), 'conv', '0']);
    expect(state.current?.amount).toBeCloseTo(886.5445, 4);
    expect(state.display.label).toBe('FPM');
  });

  it('stores permanent M1 and recalls it', () => {
    const stored = run([...digits('42'), 'conv', '1', 'on']);
    const recalled = run(['recall', '1'], stored);
    expect(recalled.current?.amount).toBe(42);
    expect(recalled.display.label).toBe('M1');
  });

  it('enters millimeters with Conv + m', () => {
    const state = run([...digits('254'), 'conv', 'meter']);
    expect(state.current?.amount).toBeCloseTo(10, 10);
    expect(state.display.unitText).toBe('MM');
  });

  it('accepts D:M:S entry and converts it to decimal degrees', () => {
    const state = run([
      '2', '3', 'decimal', '4', '2', 'decimal', '3', '9', 'conv', 'decimal',
    ]);
    expect(state.current?.amount).toBeCloseTo(23.7108333, 6);
    expect(state.display.label).toBe('DEG');
  });

  it('implements the x10^y secondary function', () => {
    const state = run(['8', 'conv', 'fraction', '1', '4', 'equals']);
    expect(state.current?.amount).toBeCloseTo(8e14, 2);
  });

  it('cycles repeated unit keys through square and cubic input', () => {
    const state = run(['5', 'feet', 'feet', 'feet']);
    expect(state.current?.power).toBe(3);
    expect(state.current?.amount).toBe(5 * 12 ** 3);
  });

  it('solves a circular segment chord from radius and rise', () => {
    const state = run([
      '2', '4', 'inch', 'conv', 'pitch',
      '6', 'inch', 'rise',
      'run',
    ]);
    expect(state.display.label).toBe('CHORD');
    expect(state.current?.amount).toBeCloseTo(31.749, 3);
  });

  it('replaces stale arc degrees when a new arc length is entered', () => {
    const state = run([
      '5', 'feet', 'circ',
      '9', '0', 'conv', 'circ',
      'conv', 'circ',
      '3', '9', 'inch', 'conv', 'circ',
      'circ',
    ]);
    expect(state.display.label).toBe('ARC DEG');
    expect(state.current?.amount).toBeCloseTo(39 / 30 * 180 / Math.PI, 7);
  });

  it('auto-closes open parentheses on equals', () => {
    const state = run(['2', 'multiply', 'left', '3', 'add', '4', 'equals']);
    expect(state.current?.amount).toBe(14);
  });

  it('supports closing nested parentheses one key at a time', () => {
    const state = run(['left', 'left', '2', 'add', '3', 'right', 'right', 'equals']);
    expect(state.current?.amount).toBe(5);
    expect(state.parenthesisDepth).toBe(0);
  });
});
