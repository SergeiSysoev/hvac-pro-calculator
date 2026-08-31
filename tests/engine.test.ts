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

  it('recalls permanent regular and irregular pitches', () => {
    const stored = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
      'on',
    ]);
    const regular = run(['recall', 'pitch'], stored);
    const irregular = run(['recall', 'hip'], stored);
    expect(regular.current?.amount).toBeCloseTo(7, 10);
    expect(regular.display.label).toBe('PTCH STORED');
    expect(irregular.current?.amount).toBeCloseTo(8, 10);
    expect(irregular.display.label).toBe('IPCH STORED');
  });

  it('reviews all stored stair preferences', () => {
    const riser = run(['recall', 'stair']);
    const tread = run(['stair'], riser);
    const headroom = run(['stair'], tread);
    const floor = run(['stair'], headroom);
    expect(riser.display.label).toBe('R-HT STORED');
    expect(tread.display.label).toBe('T-WD STORED');
    expect(headroom.display.label).toBe('HDRM STORED');
    expect(floor.display.label).toBe('FLOR STORED');
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

  it('cycles VP, MPS, kPA and the original entry with plain 0', () => {
    const fpm = run([...digits('500'), 'conv', '0']);
    const vp = run(['0'], fpm);
    const mps = run(['0'], vp);
    const kpa = run(['0'], mps);
    const entered = run(['0'], kpa);
    expect(fpm.display.label).toBe('FPM');
    expect(vp.current?.amount).toBeCloseTo(0.015586, 6);
    expect(vp.display.label).toBe('VP');
    expect(mps.display.label).toBe('MPS');
    expect(kpa.display.label).toBe('kPA');
    expect(entered.current?.amount).toBe(500);
    expect(entered.display.label).toBe('ENTRY');
  });

  it('completes dimensional percentage calculations without equals', () => {
    const state = run([
      ...digits('500'), 'feet', 'multiply',
      ...digits('18'), 'conv', 'add',
    ]);
    expect(state.current?.amount).toBeCloseTo(90 * 12, 10);
    expect(state.current?.power).toBe(1);

    const metric = run([
      ...digits('350'), 'meter', 'divide',
      ...digits('80'), 'conv', 'add',
    ]);
    expect(metric.current?.amount).toBeCloseTo(437.5 * 1000 / 25.4, 10);
    expect(metric.display.valueText).toBe('437.500');
    expect(metric.display.unitText).toBe('M');
  });

  it('enters and converts powered Inch and Millimeter units', () => {
    const squareInches = run(['1', '4', 'feet', 'feet', 'conv', 'inch']);
    expect(squareInches.display.valueText).toBe('2016.');
    expect(squareInches.display.unitText).toBe('SQ INCH');

    const squareMeters = run(['meter'], squareInches);
    expect(squareMeters.current?.amount).toBeCloseTo(2016, 10);
    expect(squareMeters.display.unitText).toBe('SQ M');

    const squareMillimeters = run(['conv', 'meter'], squareMeters);
    expect(squareMillimeters.display.valueText).toBe('1300642.56');
    expect(squareMillimeters.display.unitText).toBe('SQ MM');

    const enteredSquareMillimeters = run(['5', 'conv', 'meter', 'meter']);
    expect(enteredSquareMillimeters.current?.power).toBe(2);
    expect(enteredSquareMillimeters.display.valueText).toBe('5.');
    expect(enteredSquareMillimeters.display.unitText).toBe('SQ MM');
  });

  it('preserves homogeneous Inch units through multiplication', () => {
    const state = run(['5', 'inch', 'multiply', '6', 'inch', 'equals']);
    expect(state.current?.amount).toBe(30);
    expect(state.display.valueText).toBe('30.');
    expect(state.display.unitText).toBe('SQ INCH');
  });

  it('recalls A, B, C and the stored fraction setting', () => {
    const stored = run(['2', '5', 'inch', 'conv', '6', 'on']);
    const recalled = run(['recall', '6'], stored);
    const enteredAsDiagonal = run(['equals', 'diag'], recalled);
    const fraction = run(['recall', 'fraction'], stored);
    expect(recalled.current?.amount).toBe(25);
    expect(recalled.display.label).toBe('C STORED');
    expect(enteredAsDiagonal.triangle.r).toBe(25);
    expect(fraction.current?.amount).toBe(1 / 16);
    expect(fraction.display.label).toBe('STD');
  });

  it('Clear All resets permanent key entries and can factory-reset preferences', () => {
    let custom = initialCalculatorState();
    custom = calculatorReducer(custom, { type: 'set-preference', key: 'onCenter', value: 24 });
    custom = calculatorReducer(custom, { type: 'set-preference', key: 'desiredRiser', value: 8 });
    custom = calculatorReducer(custom, { type: 'set-preference', key: 'treadWidth', value: 11 });
    const cleared = run(['conv', 'multiply'], custom);
    expect(cleared.preferences.onCenter).toBe(16);
    expect(cleared.preferences.desiredRiser).toBe(7.5);
    expect(cleared.preferences.treadWidth).toBe(11);
    const reset = calculatorReducer(cleared, { type: 'reset-preferences' });
    expect(reset.preferences.treadWidth).toBe(10);
  });
});
