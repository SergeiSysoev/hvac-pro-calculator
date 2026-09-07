import { describe, expect, it } from 'vitest';
import {
  CalculatorState,
  KeyId,
  calculatorReducer,
  initialCalculatorState,
  persistedState,
} from '@/lib/calculator/engine';

function run(keys: KeyId[], initial = initialCalculatorState()): CalculatorState {
  return keys.reduce((state, key) => calculatorReducer(state, { type: 'press', key }), initial);
}

function digits(value: string): KeyId[] {
  return [...value].map((key) => key === '.' ? 'decimal' : key as KeyId);
}

describe('physical keypad workflow', () => {
  it('runs direct converted buttons atomically even when Recall was armed', () => {
    const recalled = run(['8', 'recall']);
    const changedSign = calculatorReducer(recalled, {
      type: 'press-converted',
      key: 'subtract',
    });
    expect(changedSign.display.label).not.toBe('ERROR');
    expect(changedSign.entry).toBe('-8');
    expect(run(['equals'], changedSign).current?.amount).toBe(-8);
    expect(changedSign.modifier).toBeUndefined();
  });

  it('round-trips approximate memory and exact source entry text safely', () => {
    const state = initialCalculatorState();
    state.memory.m1 = {
      amount: 1000 / 3 / 25.4,
      power: 1,
      unit: 'm',
      system: 'metric',
      approximate: true,
      source: { amount: 1 / 3, unit: 'm', power: 1, entryText: '1/3' },
    };
    state.permanentPitchSlope = 1 / 3;
    state.permanentPitchApproximate = true;
    state.irregularPitchSlope = 2 / 3;
    state.irregularPitchApproximate = true;
    state.onCenterStored = true;
    state.onCenterApproximate = true;
    state.desiredRiserApproximate = true;
    const hydrated = calculatorReducer(initialCalculatorState(), {
      type: 'hydrate',
      payload: persistedState(state),
    });
    expect(hydrated.memory.m1).toMatchObject({
      approximate: true,
      source: { entryText: '1/3' },
    });
    expect(hydrated).toMatchObject({
      permanentPitchApproximate: true,
      irregularPitchApproximate: true,
      onCenterStored: true,
      onCenterApproximate: true,
      desiredRiserApproximate: true,
    });
  });

  it('evaluates order of operations from key presses', () => {
    const state = run([
      ...digits('10'), 'add', ...digits('4'), 'multiply', ...digits('5'), 'equals',
    ]);
    expect(state.current?.amount).toBe(30);
    expect(state.display.label).toBe('RESULT');
  });

  it('does not reject a valid dimensional expression while previewing an incomplete product', () => {
    const pendingProduct = run(['1', 'feet', 'add', '2', 'multiply']);
    const completed = run(['3', 'feet', 'equals'], pendingProduct);

    expect(pendingProduct.display).toMatchObject({ label: '*', valueText: '2' });
    expect(completed.current?.amount).toBe(84);
    expect(completed.display).toMatchObject({
      valueText: '7 - 0',
      unitText: 'FEET        INCH',
    });
  });

  it('enters mixed feet, inches and fractions', () => {
    const state = run([
      '5', 'feet', '3', 'inch', 'multiply',
      '1', '1', 'feet', '6', 'inch', '1', 'fraction', '2', 'equals',
    ]);
    expect(state.current?.power).toBe(2);
    expect(state.current!.amount / 144).toBeCloseTo(60.59375, 8);
  });

  it('keeps the complete feet-inch value visible while its fraction is entered', () => {
    const beforeDenominator = run([
      '1', '5', 'feet', '9', 'inch', '1', 'fraction',
    ]);
    expect(beforeDenominator.display).toMatchObject({
      label: 'ENTRY',
      valueText: '15 - 9 1/16',
      unitText: 'FEET        INCH',
      plainText: '15\u2032 9-1/16\u2033',
    });

    const complete = run(['2'], beforeDenominator);
    expect(complete.display).toMatchObject({
      label: 'ENTRY',
      valueText: '15 - 9 1/2',
      unitText: 'FEET        INCH',
      plainText: '15\u2032 9-1/2\u2033',
    });

    const restored = run(['backspace', 'backspace', 'backspace'], complete);
    expect(restored.display).toMatchObject({
      label: 'ENTRY',
      valueText: '15 - 9',
      unitText: 'FEET        INCH',
      plainText: '15\u2032 9\u2033',
    });

    const inchesOnly = run(['8', 'inch', '1', 'fraction', '8']);
    expect(inchesOnly.display.valueText).toBe('8 1/8');
    expect(inchesOnly.display.unitText).toBe('INCH');
  });

  it('treats standalone fractions as inches like the published guide', () => {
    const sum = run([
      '1', 'fraction', '2', 'add',
      '3', 'fraction', '8', 'add',
      '1', '1', 'fraction', '1', '6', 'equals',
    ]);
    const decimal = run(['7', 'fraction', '3', '2', 'conv', 'inch']);
    expect(sum.current?.amount).toBe(1.5625);
    expect(sum.display.valueText).toBe('1 9/16');
    expect(sum.display.unitText).toBe('INCH');
    expect(decimal.display.valueText).toBe('0.21875');
    expect(decimal.display.unitText).toBe('INCH');
  });

  it('shows the documented leading zero for sub-inch fraction results and recall', () => {
    const result = run([
      '1', 'fraction', '2', 'add',
      '3', 'fraction', '8', 'add',
      '1', '1', 'fraction', '1', '6', 'equals',
      'subtract', '5', 'fraction', '8', 'equals',
    ]);
    const recalledResolution = run(['recall', 'fraction'], result);

    expect(result.display).toMatchObject({
      valueText: '0 15/16',
      unitText: 'INCH',
      plainText: '0-15/16\u2033',
    });
    expect(recalledResolution.display).toMatchObject({
      label: 'STD',
      valueText: '0 1/16',
      unitText: 'INCH',
    });
  });

  it('shows the running dimensional subtotal when an operator is pressed', () => {
    const subtotal = run([
      '5', 'feet', '4', 'inch', '1', 'fraction', '2', 'add',
      '8', 'inch', 'add',
    ]);
    expect(subtotal.display).toMatchObject({
      valueText: '6 - 0 1/2',
      unitText: 'FEET        INCH',
      plainText: '6\u2032 0-1/2\u2033',
    });

    const completed = run(['3', 'decimal', '5', 'meter', 'equals'], subtotal);
    expect(completed.display).toMatchObject({
      valueText: '17 - 6 5/16',
      unitText: 'FEET        INCH',
    });
  });

  it('keeps entered 1/32 precision through arithmetic and cumulative memory', () => {
    const first = run([
      '5', 'inch', '1', 'fraction', '1', '6',
      'multiply', '2', '0', 'equals', 'mplus',
    ]);
    const second = run([
      '3', 'fraction', '3', '2', 'multiply', '1', '9', 'equals',
    ], first);
    const stored = run(['mplus'], second);
    const recalled = run(['recall', 'mplus'], stored);

    expect(second.current?.amount).toBeCloseTo(1.78125, 10);
    expect(second.display).toMatchObject({ valueText: '1 25/32', unitText: 'INCH' });
    expect(stored.display.label).toBe('M+');
    expect(recalled.display).toMatchObject({
      label: 'M+ STORED',
      valueText: '103 1/32',
      unitText: 'INCH',
    });
  });

  it('uses the preference denominator only when constant-fraction mode is enabled', () => {
    let constant = initialCalculatorState();
    constant = calculatorReducer(constant, {
      type: 'set-preference',
      key: 'constantFraction',
      value: true,
    });
    const state = run([
      '3', 'fraction', '3', '2', 'multiply', '1', '9', 'equals',
    ], constant);

    expect(state.current?.amount).toBeCloseTo(1.78125, 10);
    expect(state.display).toMatchObject({ valueText: '1 13/16', unitText: 'INCH' });
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

  it('advances entered Diagonal directly to Plumb while calculated Diagonal starts at R', () => {
    const enteredDiagonal = run(['1', '5', 'run', '3', '5', 'diag']);
    const enteredPlumb = run(['diag'], enteredDiagonal);
    expect(enteredDiagonal.display.label).toBe('R');
    expect(enteredPlumb.display.label).toBe('PLMB');
    expect(enteredPlumb.current?.amount).toBeCloseTo(64.62307, 5);

    const calculatedDiagonal = run(['9', 'feet', 'rise', '1', '2', 'feet', 'run', 'diag']);
    const calculatedPlumb = run(['diag'], calculatedDiagonal);
    expect(calculatedDiagonal.display.label).toBe('R');
    expect(calculatedPlumb.display.label).toBe('PLMB');
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

  it('keeps raw Fan Law registers scalar after dimensional calculations', () => {
    const state = run([
      '1', '0', 'feet', 'run', 'on',
      ...digits('1250'), 'conv', '4',
      ...digits('1400'), 'conv', '7',
      ...digits('750'), 'conv', '5',
      'conv', 'run',
    ]);
    expect(state.display.label).toContain('RPMn');
    expect(state.current?.amount).toBeCloseTo(840, 8);
  });

  it('rejects dimensional values in Fan Law registers', () => {
    const state = run([
      '1', '2', '5', '0', 'feet', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);
    expect(state.display).toMatchObject({ label: 'ERROR', valueText: 'DIM Error' });
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

  it('advances converted result cycles with the original primary key', () => {
    const radius = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    const wrapper = run(['left'], radius);
    const heel = run(['left'], wrapper);
    expect(wrapper.display.label).toBe('WL');
    expect(heel.display.label).toBe('HEEL');

    const lawA = run([
      '5', 'feet', 'conv', '4',
      '6', 'feet', 'conv', '5',
      '7', 'feet', 'conv', '6',
      'conv', '9',
    ]);
    expect(lawA.display.label).toBe('∠A');
    expect(run(['9'], lawA).display.label).toBe('∠B');
  });

  it('restarts Law of Cosines with Conv + 9 and reproduces the guide p68-p69 memory sum', () => {
    const angleA = run([
      '2', 'feet', '2', 'inch', 'conv', '4',
      '1', '0', 'feet', '2', 'inch', '1', 'fraction', '4', 'conv', '5',
      '9', 'feet', '8', 'inch', '1', 'fraction', '8', 'conv', '6',
      'conv', '9',
    ]);
    expect(angleA.display.label).toBe('∠A');
    expect(angleA.current?.amount).toBeCloseTo(12.17384, 5);

    const storedM1 = run(['equals', 'conv', '1'], angleA);
    const angleC = run(['conv', '9', '9', '9'], storedM1);
    expect(angleC.display.label).toBe('∠C');
    expect(angleC.current?.amount).toBeCloseTo(70.36573, 5);

    const storedM2 = run(['equals', 'conv', '2'], angleC);
    expect(storedM2.memory.m1?.amount).toBeCloseTo(12.17384, 5);
    expect(storedM2.memory.m2?.amount).toBeCloseTo(70.36573, 5);

    const storedM3 = run([
      'on',
      '8', 'feet', '7', 'inch', '5', 'fraction', '8', 'conv', '4',
      '2', 'feet', 'conv', '5',
      'recall', '6',
      'conv', '9', 'equals', 'conv', '3',
    ], storedM2);
    expect(storedM3.memory.m3?.amount).toBeCloseTo(53.40618, 5);

    const total = run([
      'recall', '1', 'add',
      'recall', '2', 'add',
      'recall', '3', 'equals',
    ], storedM3);
    expect(total.current?.amount).toBeCloseTo(135.9458, 4);
  });

  it('solves a unitless Law of Cosines triangle without inventing length units', () => {
    const angleA = run([
      '3', 'conv', '4', '4', 'conv', '5', '5', 'conv', '6', 'conv', '9',
    ]);
    const area = run(['9', '9', '9'], angleA);
    expect(angleA.current?.amount).toBeCloseTo(36.86989765, 8);
    expect(area.display.label).toBe('AREA');
    expect(area.current).toMatchObject({ amount: 6, power: 0, unit: 'auto' });
  });

  it('uses Standard mixed-unit output rules for Law of Cosines and Column volume', () => {
    const lawArea = run([
      '3', 'feet', 'conv', '4',
      '4', 'feet', 'conv', '5',
      '6', '0', 'inch', 'conv', '6',
      'conv', '9', '9', '9', '9',
    ]);
    expect(lawArea.display).toMatchObject({ label: 'AREA', valueText: '6.', unitText: 'SQ FEET' });

    const column = run([
      '2', 'feet', '4', 'inch', 'circ',
      '4', 'feet', '6', 'inch', 'rise',
      'conv', 'right',
    ]);
    expect(column.display).toMatchObject({ label: 'COL', valueText: '19.24226', unitText: 'CU FEET' });

    const incompatible = run([
      '1', '0', '0', 'conv', 'meter', 'circ',
      '1', '0', '0', 'rise',
      'conv', 'right',
    ]);
    expect(incompatible.display.label).toBe('ERROR');
  });

  it('preserves millimeter and inch formats in field geometry', () => {
    const metricRadius = run([
      ...digits('2045'), 'conv', 'meter', 'run',
      ...digits('573'), 'conv', 'meter', 'rise',
      ...digits('1727'), 'conv', 'meter', 'conv', '4',
      'conv', 'left',
    ]);
    expect(metricRadius.display.label).toBe('RAD');
    expect(metricRadius.display.valueText).toBe('1967.868');
    expect(metricRadius.display.unitText).toBe('MM');
    expect(run(['left'], metricRadius).display.unitText).toBe('MM');

    const inchRadius = run([
      ...digits('45'), 'inch', 'run',
      ...digits('12'), 'inch', '5', 'fraction', '8', 'rise',
      ...digits('38'), 'inch', 'conv', '4',
      'conv', 'left',
    ]);
    expect(inchRadius.display.valueText).toBe('43 1/4');
    expect(inchRadius.display.unitText).toBe('INCH');
  });

  it('uses the most recently entered dimensional unit for mixed-unit triangle results', () => {
    const metricLast = run([
      '1', 'feet', 'run',
      '2', '5', 'conv', 'meter', 'rise',
      '3', '0', 'pitch', 'run',
    ]);
    const imperialLast = run([
      '2', '5', 'conv', 'meter', 'run',
      '1', 'feet', 'rise',
      '3', '0', 'pitch', 'run',
    ]);

    expect(metricLast.display).toMatchObject({ valueText: '43.3013', unitText: 'MM' });
    expect(imperialLast.display.unitText).toBe('FEET        INCH');
  });

  it('converts VP to FPM with Conv + 0', () => {
    const state = run([...digits('.049'), 'conv', '0']);
    expect(state.current?.amount).toBeCloseTo(886.5445, 4);
    expect(state.display.label).toBe('FPM');
  });

  it('stores permanent M-1 and recalls it with the hardware label', () => {
    const stored = run([...digits('42'), 'conv', '1', 'on']);
    const recalled = run(['recall', '1'], stored);
    expect(recalled.current?.amount).toBe(42);
    expect(recalled.display.label).toBe('M-1 STORED');
  });

  it('replaces unfinished numeric entry with constants and recalled values', () => {
    const pi = run(['2', 'pi', 'add', '1', 'equals']);
    const arcK = run(['2', 'conv', 'pi', 'add', '1', 'equals']);
    const stored = run(['5', 'conv', '1', 'on', '2', 'recall', '1', 'add', '1', 'equals']);

    expect(pi.current?.amount).toBeCloseTo(Math.PI + 1, 10);
    expect(arcK.current?.amount).toBeCloseTo(Math.PI / 180 + 1, 10);
    expect(stored.current?.amount).toBe(6);
    for (const state of [pi, arcK, stored]) {
      expect(state.entry).toBe('');
      expect(state.fractionNumerator).toBeUndefined();
      expect(state.composedInches).toBeUndefined();
      expect(state.exponentBase).toBeUndefined();
    }
  });

  it('does not treat error clearing as the second consecutive On/C press', () => {
    const errored = run(['1', '0', '0', 'mplus', 'on', 'stair']);
    expect(errored.display.label).toBe('ERROR');
    expect(errored.display.valueText).toBe('ERROR');

    const cleared = run(['on'], errored);
    const recalled = run(['recall', 'mplus'], cleared);
    expect(recalled.current?.amount).toBe(100);
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

  it('does not overwrite permanent Pitch with a calculated equals result', () => {
    const calculated = run([
      '7', 'inch', 'pitch',
      'on', 'on',
      '3', '0', 'add', '5', 'equals', 'pitch',
      'on', 'on',
      'recall', 'pitch',
    ]);
    expect(calculated.display).toMatchObject({
      label: 'PTCH STORED',
      valueText: '7',
      unitText: 'INCH',
    });
  });

  it('recalls the stored riser without blocking the next Stair calculation', () => {
    const riser = run(['9', 'feet', '1', '1', 'inch', 'rise', 'recall', 'stair']);
    const calculated = run(['stair'], riser);
    expect(riser.display.label).toBe('R-HT STORED');
    expect(calculated.display.label).toBe('R-HT');
    expect(calculated.display.valueText).toBe('7 7/16');
    expect(calculated.display.unitText).toBe('INCH');
  });

  it('enters millimeters with Conv + m', () => {
    const state = run([...digits('254'), 'conv', 'meter']);
    expect(state.current?.amount).toBeCloseTo(10, 10);
    expect(state.display.unitText).toBe('MM');
  });

  it('echoes direct meter entry before applying fixed meter precision to answers', () => {
    const entered = run(['3', 'decimal', '5', 'meter']);
    const calculated = run(['multiply', '5', 'equals'], entered);
    expect(entered.display).toMatchObject({ valueText: '3.5', unitText: 'M' });
    expect(calculated.display).toMatchObject({ valueText: '17.500', unitText: 'M' });
  });

  it('matches the guide conversion from feet-inches to meters, then millimeters', () => {
    const meters = run(['8', 'feet', '6', 'inch', 'conv', 'meter']);
    const millimeters = run(['conv', 'meter'], meters);
    expect(meters.current?.amount).toBeCloseTo(102, 10);
    expect(meters.display).toMatchObject({ valueText: '2.591', unitText: 'M' });
    expect(millimeters.current?.amount).toBeCloseTo(102, 10);
    expect(millimeters.display).toMatchObject({ valueText: '2590.8', unitText: 'MM' });
  });

  it('accepts D:M:S entry and converts it to decimal degrees', () => {
    const state = run([
      '2', '3', 'decimal', '4', '2', 'decimal', '3', '9', 'conv', 'decimal',
    ]);
    expect(state.current?.amount).toBeCloseTo(23.7108333, 6);
    expect(state.display.label).toBe('DEG');
  });

  it('shows the DMS annunciator as soon as the second separator is entered', () => {
    const state = run(['2', '3', 'decimal', '4', '2', 'decimal']);
    expect(state.display).toMatchObject({ label: 'DMS', valueText: '23.42.' });
  });

  it('converts decimal degrees to D:M:S and back', () => {
    const dms = run([...digits('44.29'), 'conv', 'decimal']);
    const decimal = run(['conv', 'decimal'], dms);
    expect(dms.current?.amount).toBeCloseTo(44.29, 8);
    expect(dms.display.valueText).toBe('44.17.24');
    expect(dms.display.label).toBe('DMS');
    expect(decimal.current?.amount).toBeCloseTo(44.29, 8);
    expect(decimal.display.label).toBe('DEG');
  });

  it('does not leak percent or D:M:S semantics into a fresh numeric entry', () => {
    const percent = run([...digits('75'), 'conv', 'add', ...digits('30'), 'pitch']);
    const dms = run([...digits('44.29'), 'conv', 'decimal', '5', 'conv', 'decimal']);
    expect(percent.display).toMatchObject({ label: '∠θ', valueText: '30', unitText: 'DEG' });
    expect(percent.permanentPitchSlope).toBeCloseTo(Math.tan(Math.PI / 6), 10);
    expect(dms.display).toMatchObject({ label: 'DMS', valueText: '5.00.00' });
  });

  it('normalizes an improper D:M:S entry when an operator commits it', () => {
    const state = run([
      '3', '0', 'decimal', '8', '9', 'decimal', '0',
      'add', '0', 'equals',
    ]);
    expect(state.current?.angle).toBe(true);
    expect(state.current?.amount).toBeCloseTo(31 + 29 / 60, 8);
  });

  it('starts fresh decimal-degree conversion after full On/C, Off, and direct decimal entry', () => {
    const oldDms = run([...digits('44.29'), 'conv', 'decimal']);
    expect(oldDms.display.label).toBe('DMS');

    const afterFullClear = run(['on', 'on', ...digits('.5'), 'conv', 'decimal'], oldDms);
    expect(afterFullClear.current?.amount).toBeCloseTo(0.5, 10);
    expect(afterFullClear.display).toMatchObject({ label: 'DMS', valueText: '0.30.00' });

    const afterOff = run(['off', 'on', ...digits('.5'), 'conv', 'decimal'], oldDms);
    expect(afterOff.current?.amount).toBeCloseTo(0.5, 10);
    expect(afterOff.display).toMatchObject({ label: 'DMS', valueText: '0.30.00' });

    const directEntry = run([...digits('.5'), 'conv', 'decimal'], oldDms);
    expect(directEntry.current?.amount).toBeCloseTo(0.5, 10);
    expect(directEntry.display).toMatchObject({ label: 'DMS', valueText: '0.30.00' });

    const afterSingleClear = run(['on', 'pi', 'conv', 'decimal'], oldDms);
    expect(afterSingleClear.current?.amount).toBeCloseTo(Math.PI, 10);
    expect(afterSingleClear.display).toMatchObject({ label: 'DMS', valueText: '3.08.30' });

    const directConstant = run(['pi', 'conv', 'decimal'], oldDms);
    expect(directConstant.current?.amount).toBeCloseTo(Math.PI, 10);
    expect(directConstant.display).toMatchObject({ label: 'DMS', valueText: '3.08.30' });

    const storedThenDms = run(['5', 'conv', '1', 'on', ...digits('44.29'), 'conv', 'decimal']);
    const recalled = run(['recall', '1', 'conv', 'decimal'], storedThenDms);
    expect(recalled.current?.amount).toBeCloseTo(5, 10);
    expect(recalled.display).toMatchObject({ label: 'DMS', valueText: '5.00.00' });
  });

  it('clears stale percent semantics when Pi replaces the current value', () => {
    const state = run([...digits('75'), 'conv', 'add', 'pi', 'pitch']);
    expect(state.display.label).toBe('∠θ');
    expect(state.current?.amount).toBeCloseTo(Math.PI, 10);
  });

  it('lets a fresh constant replace a stale result sequence', () => {
    const pitch = run(['7', 'inch', 'pitch', 'pi', 'pitch']);
    expect(pitch.display.label).toBe('∠θ');
    expect(pitch.current?.amount).toBeCloseTo(Math.PI, 10);

    const invalidCircle = run(['1', '0', 'inch', 'circ', 'pi', 'circ']);
    expect(invalidCircle.display).toMatchObject({ label: 'ERROR', valueText: 'DIM Error' });
  });

  it('converts a calculated angle to D:M:S and back', () => {
    const angle = run(['9', 'feet', 'rise', '1', '2', 'feet', 'run', 'diag', 'diag']);
    const dms = run(['conv', 'decimal'], angle);
    const decimal = run(['conv', 'decimal'], dms);
    expect(angle.current?.angle).toBe(true);
    expect(dms.display.label).toBe('DMS');
    expect(decimal.display.label).toBe('DEG');
    expect(decimal.current?.amount).toBeCloseTo(angle.current!.amount, 3);
  });

  it('keeps D:M:S values semantic through documented angle arithmetic', () => {
    const theta = run([
      ...digits('80.5'), 'inch', 'run',
      '2', '2', 'inch', '9', 'fraction', '1', '6', 'rise',
      '6', '8', 'inch', 'conv', '4',
      'conv', 'left', 'left', 'left', 'left', 'left',
      'conv', 'decimal',
      'multiply', '2', 'equals',
    ]);
    expect(theta.current?.angle).toBe(true);
    expect(theta.current?.amount).toBeCloseTo(31.3142, 3);
    expect(theta.display.label).toBe('DMS');
    expect(theta.display.valueText).toBe('31.18.51');
  });

  it('does not relabel a D:M:S angle as a linear dimension', () => {
    const state = run([
      '2', '3', 'decimal', '4', '2', 'decimal', '3', '9', 'meter',
    ]);
    expect(state.display).toMatchObject({ label: 'ERROR', valueText: 'TYP Error' });
  });

  it('implements the x10^y secondary function', () => {
    const state = run(['8', 'conv', 'fraction', '1', '4', 'equals']);
    expect(state.current?.amount).toBeCloseTo(8e14, 2);
  });

  it('finalizes x10^y before unary, unit, and triangle keys', () => {
    const squared = run(['8', 'conv', 'fraction', '2', 'square']);
    const inches = run(['8', 'conv', 'fraction', '2', 'inch']);
    const diagonal = run([
      '8', 'conv', 'fraction', '2', 'run',
      '6', 'conv', 'fraction', '2', 'rise',
      'diag',
    ]);
    expect(squared.current?.amount).toBe(640_000);
    expect(inches.current).toMatchObject({ amount: 800, power: 1, unit: 'in' });
    expect(diagonal.current?.amount).toBe(1000);
  });

  it('accepts recalled scalar exponents without discarding the pending x10^y base', () => {
    const permanent = run([
      '1', '4', 'conv', '1', 'on',
      '8', 'conv', 'fraction', 'recall', '1', 'equals',
    ]);
    const shared = run([
      '3', 'conv', '4', 'on',
      '2', 'conv', 'fraction', 'recall', '4', 'equals',
    ]);
    const cumulative = run([
      '4', 'mplus', 'on',
      '2', 'conv', 'fraction', 'recall', 'recall', 'equals',
    ]);
    const negative = run([
      '1', '4', 'conv', '1', 'on',
      '8', 'conv', 'fraction', 'recall', '1',
      'conv', 'subtract', 'equals',
    ]);

    expect(permanent.current?.amount).toBeCloseTo(8e14, 2);
    expect(shared.current?.amount).toBe(2000);
    expect(cumulative.current?.amount).toBe(20000);
    expect(cumulative.memory.cumulative).toBeUndefined();
    expect(negative.current?.amount).toBeCloseTo(8e-14, 20);
    expect(negative.display.valueText).toBe('8.00000e-14');
  });

  it('rejects a recalled dimensional exponent', () => {
    const memory = run([
      '2', 'feet', 'conv', '1', 'on',
      '8', 'conv', 'fraction', 'recall', '1', 'equals',
    ]);
    const preference = run([
      '8', 'conv', 'fraction', 'recall', 'jack', 'equals',
    ]);
    expect(memory.display).toMatchObject({ label: 'ERROR', valueText: 'EXP Error' });
    expect(preference.display).toMatchObject({ label: 'ERROR', valueText: 'EXP Error' });
  });

  it('uses x10^y operands inside a longer expression', () => {
    const state = run([
      ...digits('1.78'), 'conv', 'fraction', ...digits('10'), 'add',
      ...digits('3.9'), 'conv', 'fraction', '9', 'equals',
    ]);
    expect(state.current?.amount).toBeCloseTo(2.17e10, 2);
    expect(state.display.valueText).toBe('2.17000e10');
  });

  it('honors exponent preference before changing a dimensional display unit', () => {
    const scientific = run([...digits('100000000'), 'conv', 'meter']);
    const scientificMeters = run([...digits('100000000'), 'meter']);
    let noExponent = initialCalculatorState();
    noExponent = calculatorReducer(noExponent, {
      type: 'set-preference',
      key: 'exponent',
      value: false,
    });
    const autoRanged = run([...digits('100000000'), 'conv', 'meter'], noExponent);
    const autoRangedMeters = run([...digits('100000000'), 'meter'], noExponent);

    expect(scientific.display).toMatchObject({ valueText: '1.00000e8', unitText: 'MM' });
    expect(scientificMeters.display).toMatchObject({ valueText: '1.00000e8', unitText: 'M' });
    expect(autoRanged.display).toMatchObject({ valueText: '100000.', unitText: 'M' });
    expect(autoRangedMeters.display).toMatchObject({ valueText: '100000', unitText: 'KM' });
  });

  it('preserves metric provenance when dimensional division or roots return a length', () => {
    const meters = run(['1', 'meter', 'meter', 'divide', '1', 'conv', 'meter', 'equals']);
    expect(meters.display).toMatchObject({ valueText: '1000.000', unitText: 'M' });

    const millimeters = run(['1', 'conv', 'meter', 'meter', 'divide', '1', 'meter', 'equals']);
    expect(millimeters.display).toMatchObject({ valueText: '0.001', unitText: 'MM' });

    const rooted = run([
      '1', 'meter', 'multiply', '1', 'conv', 'meter', 'equals', 'sqrt',
    ]);
    expect(rooted.display.unitText).toBe('M');
    expect(rooted.current?.amount).toBeCloseTo(Math.sqrt(39.37007874015748 * 0.03937007874015748), 10);
  });

  it('cycles repeated unit keys through square and cubic input', () => {
    const state = run(['5', 'feet', 'feet', 'feet']);
    expect(state.current?.power).toBe(3);
    expect(state.current?.amount).toBe(5 * 12 ** 3);
    const linearAgain = run(['feet'], state);
    expect(linearAgain.current?.power).toBe(1);
    expect(linearAgain.display.unitText).toBe('FEET        INCH');
  });

  it('only changes dimensional power on consecutive unit presses', () => {
    const squared = run(['5', 'feet', 'square', 'feet']);
    const calculated = run(['5', 'feet', 'multiply', '2', 'equals', 'feet']);
    expect(squared.current?.power).toBe(2);
    expect(squared.display.unitText).toBe('SQ FEET');
    expect(calculated.current?.power).toBe(1);
    expect(calculated.display.unitText).toBe('FEET');
  });

  it('keeps dimensional units through cube roots', () => {
    const state = run([...digits('2028'), 'inch', 'inch', 'inch', 'conv', 'sqrt']);
    expect(state.current?.amount).toBeCloseTo(12.6577345, 7);
    expect(state.display.valueText).toBe('12 11/16');
    expect(state.display.unitText).toBe('INCH');
  });

  it('solves a circular segment chord from radius and rise', () => {
    const state = run([
      '2', '4', 'inch', 'conv', 'pitch',
      '6', 'inch', 'rise',
      'run',
    ]);
    expect(state.display.label).toBe('CORD');
    expect(state.current?.amount).toBeCloseTo(31.749, 3);
  });

  it('recomputes segment radius from a fresh chord-and-rise pair', () => {
    const oldRadius = run(['2', '4', 'inch', 'conv', 'pitch']);
    const freshRadius = run([
      'on', '3', '0', 'inch', 'run', '1', '0', 'inch', 'rise', 'conv', 'pitch',
    ], oldRadius);
    expect(freshRadius.display.label).toBe('RAD');
    expect(freshRadius.current?.amount).toBeCloseTo(16.25, 10);
  });

  it('does not mix raw segment sides with a dimensioned radius', () => {
    const state = run([
      '3', '0', 'run', '1', '0', 'rise',
      '1', '0', '0', '0', 'conv', 'meter', 'conv', 'pitch',
      'run',
    ]);
    expect(state.display.label).toBe('ERROR');
  });

  it('replaces stale arc degrees when a new arc length is entered', () => {
    const state = run([
      '5', 'feet', 'circ',
      '9', '0', 'conv', 'circ',
      'conv', 'circ',
      '3', '9', 'inch', 'conv', 'circ',
      'circ',
    ]);
    expect(state.display.label).toBe('ARC');
    expect(state.current?.amount).toBeCloseTo(39 / 30 * 180 / Math.PI, 7);
  });

  it('echoes an entered arc angle with two decimals like the guide', () => {
    const state = run(['5', 'feet', 'circ', '8', '5', 'conv', 'circ']);
    expect(state.display).toMatchObject({ label: 'ARC', valueText: '85.00', unitText: 'DEG' });
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

  it('shows each closed-parenthesis result immediately', () => {
    const state = run(['left', '2', 'add', '3', 'right']);
    expect(state.display.label).toBe(')');
    expect(state.display.valueText).toBe('5.');
    expect(state.parenthesisDepth).toBe(0);
  });

  it('uses a just-closed parenthesis result in the next operation', () => {
    const squared = run(['left', '2', 'add', '3', 'right', 'square']);
    const continued = run(['left', '2', 'add', '3', 'right', 'multiply', '4', 'equals']);
    expect(squared.current?.amount).toBe(25);
    expect(continued.current?.amount).toBe(20);
  });

  it('cycles VP, MPS, KPA and the original entry with plain 0', () => {
    const fpm = run([...digits('500'), 'conv', '0']);
    const vp = run(['0'], fpm);
    const mps = run(['0'], vp);
    const kpa = run(['0'], mps);
    const entered = run(['0'], kpa);
    expect(fpm.display.label).toBe('FPM');
    expect(vp.current?.amount).toBeCloseTo(0.015586, 6);
    expect(vp.display.label).toBe('VP');
    expect(mps.display.label).toBe('MPS');
    expect(kpa.display.label).toBe('KPA');
    expect(entered.current?.amount).toBe(500);
    expect(entered.display.label).toBe('ENTRY');
  });

  it('matches the guide display precision for trig, velocity, circle, and reverse Fan Law 2', () => {
    expect(run(['1', '2', 'sin']).display.valueText).toBe('0.207912');

    const fpm = run(['5', '0', '0', 'conv', '0']);
    expect(fpm.display).toMatchObject({ label: 'FPM', valueText: '89554.52' });
    const kpa = run(['0', '0', '0'], fpm);
    expect(kpa.display).toMatchObject({ label: 'KPA', valueText: '147928.99' });

    const area = run(['1', '1', 'inch', 'circ', 'circ', 'circ']);
    expect(area.display).toMatchObject({ label: 'AREA', valueText: '95.03318', unitText: 'SQ INCH' });

    const fan2 = run([
      '1', '8', '5', '0', 'conv', '4',
      '1', 'decimal', '2', 'conv', '5',
      'decimal', '8', '3', 'conv', '8',
      'conv', 'rise',
    ]);
    expect(fan2.display).toMatchObject({ label: 'CFMn FAN LAW 2', valueText: '1538.58' });
  });

  it('starts each new velocity-pressure conversion at the last displayed position', () => {
    const first = run([...digits('.049'), 'conv', '0', '0']);
    const second = run([...digits('.123'), 'conv', '0'], first);
    expect(first.display.label).toBe('VP');
    expect(second.display.label).toBe('VP');
    expect(second.current?.amount).toBeCloseTo(Math.pow(.123 / 4005, 2), 12);
  });

  it('restarts velocity conversion at FPM after full On/C and Off resets', () => {
    const atKpa = run([...digits('500'), 'conv', '0', '0', '0', '0']);
    expect(atKpa.display.label).toBe('KPA');

    const afterFullClear = run(['on', 'on', ...digits('.049'), 'conv', '0'], atKpa);
    expect(afterFullClear.display.label).toBe('FPM');
    expect(afterFullClear.current?.amount).toBeCloseTo(886.5445, 4);

    const afterOff = run(['off', 'on', ...digits('.049'), 'conv', '0'], atKpa);
    expect(afterOff.display.label).toBe('FPM');
    expect(afterOff.current?.amount).toBeCloseTo(886.5445, 4);
  });

  it('preserves a dimensional sign through products and first M− storage', () => {
    const negativeArea = run([
      '5', 'feet', 'conv', 'subtract', 'multiply', '2', 'feet', 'equals',
    ]);
    const memoryArea = run([
      '5', 'feet', 'conv', 'mplus', 'recall', 'mplus', 'multiply', '2', 'feet', 'equals',
    ]);
    expect(negativeArea.current?.amount).toBe(-10 * 144);
    expect(memoryArea.current?.amount).toBe(-10 * 144);
  });

  it('changes the sign of a complete mixed fraction instead of its denominator', () => {
    const negative = run(['5', 'inch', '1', 'fraction', '2', 'conv', 'subtract']);
    const positiveAgain = run(['conv', 'subtract'], negative);
    expect(negative.current?.amount).toBe(-5.5);
    expect(negative.display).toMatchObject({ valueText: '−5 1/2', unitText: 'INCH' });
    expect(positiveAgain.current?.amount).toBe(5.5);
  });

  it('rejects tangent at odd right angles', () => {
    expect(run(['9', '0', 'tan']).display.valueText).toBe('TRIG Error');
    expect(run(['2', '7', '0', 'tan']).display.valueText).toBe('TRIG Error');
  });

  it('returns exact cardinal trig values instead of IEEE floating-point residue', () => {
    expect(run(['1', '8', '0', 'sin']).display.valueText).toBe('0.');
    expect(run(['3', '6', '0', 'sin']).display.valueText).toBe('0.');
    expect(run(['9', '0', 'cos']).display.valueText).toBe('0.');
    expect(run(['2', '7', '0', 'cos']).display.valueText).toBe('0.');
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

  it('supports the documented Rcl Conv Hip/V irregular-pitch recall', () => {
    const stored = run(['8', 'inch', 'conv', 'hip', 'on']);
    const recalled = run(['recall', 'conv', 'hip'], stored);
    expect(recalled.display.label).toBe('IPCH STORED');
    expect(recalled.display.valueText).toBe('8');
    expect(recalled.display.unitText).toBe('INCH');
  });

  it('cycles Circle through exactly diameter, circumference and area', () => {
    const diameter = run(['1', '0', 'inch', 'circ']);
    const circumference = run(['circ'], diameter);
    const area = run(['circ'], circumference);
    const wrapped = run(['circ'], area);
    expect(diameter.display.label).toBe('DIA');
    expect(circumference.display.label).toBe('CIRC');
    expect(area.display.label).toBe('AREA');
    expect(area.display.unitText).toBe('SQ INCH');
    expect(wrapped.display.label).toBe('DIA');
  });

  it('uses a recalled dimension as a new Circle input instead of advancing an old cycle', () => {
    const stored = run(['2', '0', 'inch', 'conv', '1', '1', '0', 'inch', 'circ']);
    const recalled = run(['recall', '1', 'circ'], stored);
    expect(recalled.display.label).toBe('DIA');
    expect(recalled.current?.amount).toBe(20);
  });

  it('repeatedly toggles converted Feet and Inch formats', () => {
    const decimalFeet = run(['6', 'feet', '9', 'inch', '1', 'fraction', '2', 'conv', 'feet']);
    const feetInches = run(['feet'], decimalFeet);
    const decimalAgain = run(['feet'], feetInches);
    expect(decimalFeet.display.unitText).toBe('FEET');
    expect(feetInches.display.unitText).toBe('FEET        INCH');
    expect(decimalAgain.display.unitText).toBe('FEET');

    const decimalInches = run(['8', 'inch', '1', 'fraction', '8', 'conv', 'inch']);
    const fractional = run(['inch'], decimalInches);
    const decimalInchesAgain = run(['inch'], fractional);
    expect(decimalInches.display.valueText).toBe('8.125');
    expect(fractional.display.valueText).toBe('8 1/8');
    expect(decimalInchesAgain.display.valueText).toBe('8.125');
  });

  it('shows first-entry decimal Feet and Inch before conversion toggles', () => {
    const feet = run([...digits('17.32'), 'feet']);
    const inches = run([...digits('9.0625'), 'inch']);
    const composed = run(['8', 'inch', '1', 'fraction', '8', 'equals']);
    expect(feet.display.valueText).toBe('17.32');
    expect(feet.display.unitText).toBe('FEET');
    expect(inches.display.valueText).toBe('9.0625');
    expect(inches.display.unitText).toBe('INCH');
    expect(composed.display.valueText).toBe('8 1/8');
  });

  it('matches the documented fractional-inch to decimal-feet key sequence', () => {
    const fractionalInches = run([...digits('9.0625'), 'inch', 'conv', 'inch']);
    const feetAndInches = run(['feet'], fractionalInches);
    const decimalFeet = run(['feet'], feetAndInches);
    expect(fractionalInches.display).toMatchObject({ valueText: '9 1/16', unitText: 'INCH' });
    expect(feetAndInches.display.unitText).toBe('FEET        INCH');
    expect(decimalFeet.display).toMatchObject({ valueText: '0.755208', unitText: 'FEET' });
  });

  it('accepts Law of Cosines angle arithmetic as a Pitch input', () => {
    const state = run([
      '3', '5', 'feet', '8', 'inch', '3', 'fraction', '4', 'conv', '4',
      '2', '1', 'feet', '8', 'inch', '1', '5', 'fraction', '1', '6', 'conv', '5',
      '2', '4', 'feet', '3', 'inch', '7', 'fraction', '8', 'conv', '6',
      ...digits('180'), 'subtract',
      'conv', '9', 'equals',
      'pitch',
    ]);
    expect(state.display.label).toBe('∠θ');
    expect(state.current?.amount).toBeCloseTo(78.43128, 5);
  });

  it('uses a calculated result as the next Run entry', () => {
    const state = run([
      '7', 'inch', 'pitch',
      '1', '4', 'feet', '4', 'inch', 'divide', '2', 'equals',
      'run',
    ]);
    expect(state.display.label).toBe('X');
    expect(state.triangle.x).toBe(86);
  });

  it('solves documented raw-number triangle workflows without dimensional labels', () => {
    const angle = run(['1', '5', 'run', '3', '5', 'diag', 'pitch']);
    expect(angle.current?.amount).toBeCloseTo(64.62307, 5);
    expect(angle.current?.angle).toBe(true);
    expect(angle.display.label).toBe('∠θ');

    const runResult = run(['1', '8', 'rise', '2', '0', 'pitch', 'run']);
    expect(runResult.current?.amount).toBeCloseTo(49.45459, 5);
    expect(runResult.current?.power).toBe(0);
  });

  it('keeps fresh raw triangle inputs unitless after a prior dimensional result', () => {
    const state = run([
      '1', '0', 'feet', 'run', 'on',
      '1', '8', 'rise',
      '2', '0', 'pitch',
      'run',
    ]);
    expect(state.current?.amount).toBeCloseTo(49.45459, 5);
    expect(state.current?.power).toBe(0);
    expect(state.display.unitText).toBe('');
  });

  it('starts solved Pitch at slope for Rise+Run and at angle for Run+Diagonal', () => {
    const diagonalFromLegs = run(['9', 'feet', 'rise', '1', '2', 'feet', 'run', 'diag']);
    const pitchFromLegs = run(['pitch'], diagonalFromLegs);
    const angleFromLegs = run(['pitch'], pitchFromLegs);
    expect(pitchFromLegs.display).toMatchObject({ label: 'PTCH', valueText: '9', unitText: 'INCH' });
    expect(angleFromLegs.display.label).toBe('∠θ');
    expect(angleFromLegs.current?.amount).toBeCloseTo(36.8699, 4);

    const diagonalEntered = run(['1', '5', 'run', '3', '5', 'diag']);
    const angleFromDiagonal = run(['pitch'], diagonalEntered);
    expect(angleFromDiagonal.display.label).toBe('∠θ');
    expect(angleFromDiagonal.current?.amount).toBeCloseTo(64.62307, 5);
  });

  it('uses stored pitch only when fewer than two fresh triangle inputs are available', () => {
    const freshSides = run([
      '7', 'inch', 'pitch',
      'on', 'on',
      '1', '5', 'run',
      '3', '5', 'diag',
      'pitch',
    ]);
    expect(freshSides.current?.amount).toBeCloseTo(64.62307, 5);
    expect(freshSides.current?.angle).toBe(true);
    expect(freshSides.display.label).toBe('∠θ');

    const storedPitchFallback = run([
      '7', 'inch', 'pitch',
      'on', 'on',
      '1', '2', 'feet', 'run',
      'rise',
    ]);
    expect(storedPitchFallback.current?.amount).toBeCloseTo(84, 10);
    expect(storedPitchFallback.display.label).toBe('Y');
  });

  it('prefers a fresh two-side slope over stored pitch for Hip and Jack results', () => {
    const freshGeometry = run([
      '7', 'inch', 'pitch',
      'on', 'on',
      '1', '5', 'feet', 'run',
      '3', '5', 'feet', 'diag',
      'pitch',
    ]);
    const runInches = 15 * 12;
    const slope = Math.sqrt(35 ** 2 - 15 ** 2) / 15;

    const hip = run(['hip'], freshGeometry);
    expect(hip.display.label).toBe('H/V');
    expect(hip.current?.amount).toBeCloseTo(
      Math.hypot(Math.SQRT2 * runInches, runInches * slope),
      8,
    );

    const jackOc = run(['jack'], freshGeometry);
    const firstJack = run(['jack'], jackOc);
    expect(jackOc.display.label).toBe('JKOC');
    expect(firstJack.display.label).toBe('JK1');
    expect(firstJack.current?.amount).toBeCloseTo(
      (runInches - freshGeometry.preferences.onCenter) * Math.sqrt(1 + slope ** 2),
      8,
    );
  });

  it('solves all-raw offset values and keeps them unitless', () => {
    const state = run([
      ...digits('2045'), 'run',
      ...digits('573'), 'rise',
      ...digits('1727'), 'conv', '4',
      'conv', 'left',
    ]);
    expect(state.display.label).toBe('RAD');
    expect(state.current?.amount).toBeCloseTo(1967.868, 3);
    expect(state.current?.power).toBe(0);
    expect(state.display.unitText).toBe('');
  });

  it('rejects mixed dimensional and unitless Offset inputs', () => {
    const state = run([
      '2', '0', '4', '5', 'run',
      '5', '7', '3', 'rise',
      '1', '7', '2', '7', 'conv', 'meter', 'conv', '4',
      'conv', 'left',
    ]);
    expect(state.display).toMatchObject({ label: 'ERROR', valueText: 'DIM Error' });
  });

  it('derives the documented Arc cycle from segment radius, chord, and rise', () => {
    const radius = run([
      '1', '5', 'feet', 'run',
      '5', 'feet', 'rise',
      'conv', 'pitch',
    ]);
    const angle = run(['conv', 'circ'], radius);
    const arcLength = run(['circ'], angle);
    expect(radius.display.label).toBe('RAD');
    expect(radius.current?.amount).toBeCloseTo(97.5, 8);
    expect(angle.display.label).toBe('ARC');
    expect(angle.current?.amount).toBeCloseTo(134.76027, 5);
    expect(angle.current?.angle).toBe(true);
    expect(arcLength.display.label).toBe('ARC');
    expect(arcLength.current?.amount).toBeCloseTo(229.321, 3);
  });

  it('keeps the latest side unit for the guide mixed-unit arched-window sequence', () => {
    const radius = run([
      '2', 'feet', '7', 'inch', 'run',
      '1', '0', 'inch', '1', 'fraction', '2', 'rise',
      'conv', 'pitch',
    ]);
    expect(radius.display).toMatchObject({ label: 'RAD', valueText: '16 11/16', unitText: 'INCH' });

    const arc = run(['conv', 'circ', 'circ'], radius);
    expect(arc.display).toMatchObject({ label: 'ARC', valueText: '39 3/4', unitText: 'INCH' });
    const segment = run(['circ', 'circ'], arc);
    expect(segment.display).toMatchObject({ label: 'SEG', valueText: '235.7767', unitText: 'SQ INCH' });
  });

  it('returns computed imperial lengths in standard fractional format', () => {
    const half = run(['4', '5', 'inch', 'divide', '2', 'equals']);
    const percent = run(['5', '0', '0', 'feet', 'multiply', '1', '8', 'conv', 'add']);
    const circumference = run(['1', '0', '0', 'multiply', '5', 'feet', 'multiply', 'conv', 'pi', 'equals']);
    expect(half.display).toMatchObject({ valueText: '22 1/2', unitText: 'INCH' });
    expect(percent.display).toMatchObject({ valueText: '90 - 0', unitText: 'FEET        INCH' });
    expect(circumference.display).toMatchObject({ valueText: '8 - 8 3/4', unitText: 'FEET        INCH' });
  });

  it('uses the physical keypad workflow for all 13 preference screens', () => {
    let state = run(['conv', 'equals']);
    expect(state.preferenceMode).toBe('edit');
    expect(state.display.label).toBe('FRAC');
    state = run(['add'], state);
    expect(state.preferences.fractionDenominator).toBe(32);
    for (let index = 0; index < 12; index += 1) state = run(['equals'], state);
    expect(state.preferenceIndex).toBe(12);
    expect(state.display.label).toBe('FRAC');
    state = run(['add'], state);
    expect(state.preferences.constantFraction).toBe(true);
    state = run(['equals'], state);
    expect(state.preferenceIndex).toBe(0);
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

  it('clears a permanent register by storing zero and fully resets with the documented action', () => {
    const stored = run(['4', '2', 'conv', '1']);
    const cleared = run(['0', 'conv', '1'], stored);
    expect(cleared.memory.m1).toBeUndefined();

    let custom = run(['7', 'inch', 'pitch', '8', 'inch', 'conv', 'hip'], stored);
    custom = calculatorReducer(custom, { type: 'set-preference', key: 'treadWidth', value: 12 });
    const reset = calculatorReducer(custom, { type: 'factory-reset' });
    expect(reset.display.valueText).toBe('ALL rESEt');
    expect(reset.preferences).toEqual(initialCalculatorState().preferences);
    expect(reset.memory).toEqual({});
    expect(reset.permanentPitchSlope).toBeUndefined();
    expect(reset.irregularPitchSlope).toBeUndefined();
  });

  it('rejects invalid Pitch domains and angle values in dimensional functions', () => {
    expect(run(['1', '9', '0', 'pitch']).display.valueText).toBe('ENT Error');
    expect(run(['3', '0', 'pitch', 'conv', 'meter']).display.valueText).toBe('TYP Error');

    const law = run([
      '3', '0', 'pitch', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      'conv', '9',
    ]);
    expect(law.display.valueText).toBe('TYP Error');

    const storedAngle = run(['3', '0', 'pitch', 'equals', 'conv', '1', 'on', 'on']);
    expect(run(['recall', '1', 'run'], storedAngle).display.valueText).toBe('TYP Error');
    expect(run(['3', '0', 'pitch', 'equals', 'conv', '0']).display.valueText).toBe('TYP Error');

    const offset = run([
      '1', '0', 'feet', 'run', '5', 'feet', 'rise',
      'recall', '1', 'conv', '4', 'conv', 'left',
    ], storedAngle);
    expect(offset.display.valueText).toBe('TYP Error');
  });

  it('sanitizes persisted calculator state before hydration', () => {
    const hydrated = calculatorReducer(initialCalculatorState(), {
      type: 'hydrate',
      payload: {
        powered: false,
        preferences: {
          fractionDenominator: 3,
          onCenter: -4,
          exponent: false,
          areaFormat: 'unsupported',
        },
        permanentPitchSlope: Number.NaN,
        irregularPitchSlope: -0.5,
        memory: {
          m1: {
            amount: 42,
            power: 1,
            unit: 'in',
            system: 'imperial',
            fractionDenominator: 32,
          },
          m2: { amount: 4, power: 4, unit: 'auto', system: 'neutral' },
          m3: {
            amount: 90,
            power: 1,
            unit: 'in',
            system: 'imperial',
            fractionDenominator: 3,
          },
          cumulative: { amount: 90, power: 1, angle: true, unit: 'ft-in', system: 'imperial' },
        },
      },
    });
    expect(hydrated.powered).toBe(true);
    expect(hydrated.preferences.fractionDenominator).toBe(16);
    expect(hydrated.preferences.onCenter).toBe(16);
    expect(hydrated.preferences.exponent).toBe(false);
    expect(hydrated.preferences.areaFormat).toBe('standard');
    expect(hydrated.permanentPitchSlope).toBeUndefined();
    expect(hydrated.irregularPitchSlope).toBeUndefined();
    expect(hydrated.memory.m1?.amount).toBe(42);
    expect(hydrated.memory.m1?.fractionDenominator).toBe(32);
    expect(hydrated.memory.m2).toBeUndefined();
    expect(hydrated.memory.m3?.amount).toBe(90);
    expect(hydrated.memory.m3?.fractionDenominator).toBeUndefined();
    expect(hydrated.memory.cumulative).toBeUndefined();

    const zeroMemory = calculatorReducer(initialCalculatorState(), {
      type: 'hydrate',
      payload: {
        memory: {
          m1: { amount: 0, power: 0, unit: 'auto', system: 'neutral' },
        },
      },
    });
    expect(zeroMemory.memory.m1).toBeUndefined();
  });
});
