import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@/lib/calculator/core';
import {
  CalculatorState,
  KeyId,
  calculatorReducer,
  initialCalculatorState,
} from '@/lib/calculator/engine';
import {
  columnConeResults,
  jackRafterResults,
  segmentRise,
} from '@/lib/calculator/formulas';
import { calculatorExpressionView } from '@/lib/calculator/presentation';

function run(keys: KeyId[], initial = initialCalculatorState()): CalculatorState {
  return keys.reduce(
    (state, key) => calculatorReducer(state, { type: 'press', key }),
    initial,
  );
}

function digits(value: string): KeyId[] {
  return [...value].map((key) => key === '.' ? 'decimal' : key as KeyId);
}

function cycle(
  initial: CalculatorState,
  trigger: KeyId,
  count: number,
): CalculatorState[] {
  const states = [initial];
  while (states.length < count) states.push(run([trigger], states.at(-1)!));
  return states;
}

describe('official Model 4090 special-key workflows', () => {
  it('cycles Circle through diameter, circumference, area, and wrap', () => {
    const states = cycle(run(['1', '1', 'inch', 'circ']), 'circ', 4);
    expect(states.map((state) => state.display.label))
      .toEqual(['DIA', 'CIRC', 'AREA', 'DIA']);
    expect(states[1].display).toMatchObject({ valueText: '34 9/16', unitText: 'INCH' });
    expect(states[2].display).toMatchObject({ valueText: '95.03318', unitText: 'SQ INCH' });
  });

  it('keeps the Arc entry and then cycles every derived result in manual order', () => {
    const entered = run([
      '5', 'feet', 'circ',
      '3', 'feet', '3', 'inch', 'conv', 'circ',
    ]);
    const states = cycle(entered, 'circ', 7);
    expect(states.map((state) => state.display.label))
      .toEqual(['ARC', 'ARC', 'CORD', 'SEG', 'PIE', 'RISE', 'OC']);
    expect(states[0].display).toMatchObject({ valueText: '3 - 3', unitText: 'FEET        INCH' });
    expect(states[1].current?.amount).toBeCloseTo(74.48451, 5);
    expect(states[2].display).toMatchObject({ valueText: '3 - 0 5/16', unitText: 'FEET        INCH' });
    expect(states[3].current!.amount / 144).toBeCloseTo(1.051381, 5);
    expect(states[4].current!.amount / 144).toBeCloseTo(4.0625, 6);
  });

  it('cycles all eight Offset results from the official 10-5-7 example', () => {
    const first = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    const states = cycle(first, 'left', 8);
    expect(states.map((state) => state.display.label))
      .toEqual(['RAD', 'WL', 'HEEL', 'THRT', 'THET', 'X', 'Y', 'A STORED']);
    const expectedLengths = [75, 139.094283, 117, 33];
    states.slice(0, 4).forEach((state, index) => {
      expect(state.current!.amount).toBeCloseTo(expectedLengths[index], 6);
    });
    expect(states[4].current?.amount).toBeCloseTo(26.565051, 6);
  });

  it('rejects mixed dimensional and unitless Offset inputs', () => {
    const mixed = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'conv', '4',
      'conv', 'left',
    ]);
    expect(mixed.display).toMatchObject({ label: 'ERROR', valueText: 'DIM Error' });
  });

  it('keeps exact stored Offset fields exact inside an approximate result cycle', () => {
    const first = run([
      '3', '6', 'feet', 'divide', '7', 'equals', 'run',
      '4', 'feet', 'rise',
      '2', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    const states = cycle(first, 'left', 8);
    expect(states[0].current?.approximate).toBe(true);
    expect(states[5].current?.approximate).toBe(true);
    expect(states[6].current?.approximate).toBeUndefined();
    expect(states[7].current?.approximate).toBeUndefined();
  });

  it('cycles Law of Cosines angles, area, and all three stored sides', () => {
    const first = run([
      '3', '8', 'feet', '5', 'inch', 'conv', '4',
      '2', '3', 'feet', '4', 'inch', '9', 'fraction', '1', '6', 'conv', '5',
      '2', '6', 'feet', '1', 'inch', '1', '3', 'fraction', '1', '6', 'conv', '6',
      'conv', '9',
    ]);
    const states = cycle(first, '9', 7);
    expect(states.map((state) => state.display.label))
      .toEqual(['∠A', '∠B', '∠C', 'AREA', 'a', 'b', 'c']);
    expect(states[0].current?.amount).toBeCloseTo(101.5734, 4);
    expect(states[1].current?.amount).toBeCloseTo(36.59978, 5);
    expect(states[2].current?.amount).toBeCloseTo(41.8268, 4);
    expect(states[3].current!.amount / 144).toBeCloseTo(299.4929, 4);
  });

  it('does not transfer one approximate Law-of-Cosines input onto exact stored sides', () => {
    const first = run([
      '1', '0', 'divide', '3', 'equals', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      'conv', '9',
    ]);
    const states = cycle(first, '9', 7);
    expect(states.slice(0, 5).every((state) => state.current?.approximate)).toBe(true);
    expect(states[5].current?.approximate).toBeUndefined();
    expect(states[6].current?.approximate).toBeUndefined();
  });

  it('matches every published forward and reverse Fan Law result', () => {
    const cases: Array<{ keys: KeyId[]; amount: number; precision: number; label: string }> = [
      {
        keys: [...digits('1250'), 'conv', '4', ...digits('1400'), 'conv', '7', ...digits('750'), 'conv', '5', 'conv', 'run'],
        amount: 840,
        precision: 2,
        label: 'RPMn FAN LAW 1',
      },
      {
        keys: [...digits('14000'), 'conv', '4', ...digits('855'), 'conv', '5', ...digits('1050'), 'conv', '8', 'conv', 'run'],
        amount: 17192.98,
        precision: 2,
        label: 'CFMn FAN LAW 1',
      },
      {
        keys: [...digits('15300'), 'conv', '4', ...digits('14000'), 'conv', '7', ...digits('3.2'), 'conv', '5', 'conv', 'rise'],
        amount: 2.679311,
        precision: 6,
        label: 'SPn FAN LAW 2',
      },
      {
        keys: [...digits('1850'), 'conv', '4', ...digits('1.2'), 'conv', '5', ...digits('.83'), 'conv', '8', 'conv', 'rise'],
        amount: 1538.58,
        precision: 2,
        label: 'CFMn FAN LAW 2',
      },
      {
        keys: [...digits('15800'), 'conv', '4', ...digits('20000'), 'conv', '7', ...digits('6.3'), 'conv', '5', 'conv', 'diag'],
        amount: 12.77789,
        precision: 5,
        label: 'BHPn FAN LAW 3',
      },
    ];

    for (const example of cases) {
      const state = run(example.keys);
      expect(state.display.label).toBe(example.label);
      expect(state.current?.amount).toBeCloseTo(example.amount, example.precision);
    }

    const reverseLaw3 = run([
      ...digits('15800'), 'conv', '4',
      ...digits('20000'), 'conv', '7',
      ...digits('6.3'), 'conv', '5',
      '0', 'conv', '7',
      '1', '0', 'conv', '8',
      'conv', 'diag',
    ]);
    expect(reverseLaw3.display.label).toBe('CFMn FAN LAW 3');
    expect(reverseLaw3.current?.amount).toBeCloseTo(18430.77, 2);
  });

  it('marks only the calculated Fan Law register, preserving exact known registers', () => {
    const solved = run([
      ...digits('1250'), 'conv', '4',
      ...digits('1400'), 'conv', '7',
      '1', 'divide', '7', 'equals', 'conv', '5',
      'conv', 'run',
    ]);
    expect(solved.current?.approximate).toBe(true);
    expect(run(['recall', '4'], solved).current?.approximate).toBeUndefined();
    expect(run(['recall', '7'], solved).current?.approximate).toBeUndefined();
    expect(run(['recall', '5'], solved).current?.approximate).toBe(true);
    expect(run(['recall', '8'], solved).current?.approximate).toBe(true);
  });

  it('keeps the directly entered Pitch angle exact while derived pitch forms are approximate', () => {
    const pitch = run(['3', '0', 'pitch']);
    expect(pitch.display.label).toBe('∠θ');
    expect(pitch.current?.approximate).toBeUndefined();
    expect(calculatorExpressionView(pitch).expressionText).toBe('30°');
    expect(pitch.sequence?.results[0].value.approximate).toBe(true);
    expect(pitch.sequence?.results[1].value.approximate).toBeUndefined();
  });

  it('cycles Column and Cone results and reports total cone surface area', () => {
    const first = run([
      '2', 'feet', '4', 'inch', 'circ',
      '4', 'feet', '6', 'inch', 'rise',
      'conv', 'right',
    ]);
    const states = cycle(first, 'right', 4);
    expect(states.map((state) => state.display.label))
      .toEqual(['COL', 'COL AREA', 'CONE', 'CONE AREA']);
    expect(states[0].current!.amount / 1728).toBeCloseTo(19.24226, 5);
    expect(states[3].current!.amount / 144)
      .toBeCloseTo((Math.PI * 14 * Math.hypot(14, 54) + Math.PI * 14 ** 2) / 144, 10);

    const values = columnConeResults(21, 60);
    expect(values[2].value.amount / 1728).toBeCloseTo(16.03521, 5);
    expect(values[3].value.amount / 144).toBeCloseTo(
      (Math.PI * 21 * Math.hypot(21, 60) + Math.PI * 21 ** 2) / 144,
      10,
    );
  });

  it('keeps a stored Circle diameter when Rise is calculated for Column and Arc', () => {
    const withCalculatedRise = run([
      '5', 'feet', 'circ',
      '4', 'feet', 'run',
      '3', '0', 'pitch',
      'rise',
    ]);
    const expectedRise = 48 * Math.tan(Math.PI / 6);
    expect(withCalculatedRise.circle.radius).toBeCloseTo(30, 10);
    expect(withCalculatedRise.circle.diameter).toBeCloseTo(60, 10);
    expect(withCalculatedRise.circle.height).toBeCloseTo(expectedRise, 10);

    const column = run(['conv', 'right'], withCalculatedRise);
    expect(column.display.label).toBe('COL');
    expect(column.current!.amount)
      .toBeCloseTo(Math.PI * 30 ** 2 * expectedRise, 10);

    const arc = run(['conv', 'circ'], withCalculatedRise);
    expect(arc.display.label).toBe('ARC');
    expect(arc.current?.amount).toBeCloseTo(
      2 * Math.acos((30 - expectedRise) / 30) * 180 / Math.PI,
      10,
    );
  });

  it('keeps the five-position VP/FPM cycle tied to its original entry', () => {
    const states = cycle(run(['5', '0', '0', 'conv', '0']), '0', 5);
    expect(states.map((state) => state.display.label))
      .toEqual(['FPM', 'VP', 'MPS', 'KPA', 'ENTRY']);
    expect(states.map((state) => state.current!.amount)).toEqual([
      expect.closeTo(89554.52, 2),
      expect.closeTo(0.015586, 6),
      expect.closeTo(29.06888, 5),
      expect.closeTo(147928.99, 2),
      500,
    ]);
  });

  it.each([
    ['Rise + Diag', ['3', 'feet', 'rise', '5', 'feet', 'diag'] as KeyId[]],
    ['Rise + Pitch', ['3', 'feet', 'rise', '3', '0', 'pitch'] as KeyId[]],
    ['Diag + Pitch', ['5', 'feet', 'diag', '3', '0', 'pitch'] as KeyId[]],
  ])('solves Hip and Jack from the valid %s triangle pair', (_name, pair) => {
    const hip = run([...pair, 'hip']);
    const jack = run([...pair, 'jack']);
    expect(hip.display.label).toBe('H/V');
    expect(hip.triangle.x).toBeGreaterThan(0);
    expect(jack.display.label).toBe('JKOC');
    expect(jack.triangle.x).toBeGreaterThan(0);
  });

  it('synchronizes a calculated Rise before Segment Radius and Column calculations', () => {
    const calculatedRise = run([
      '2', 'feet', 'rise',
      '1', '0', 'feet', 'run',
      '3', '0', 'pitch',
      'rise',
    ]);
    const expectedRise = 120 * Math.tan(Math.PI / 6);
    expect(calculatedRise.current?.amount).toBeCloseTo(expectedRise, 10);
    expect(calculatedRise.circle.rise).toBeCloseTo(expectedRise, 10);
    expect(calculatedRise.circle.height).toBeCloseTo(expectedRise, 10);

    const radius = run(['conv', 'pitch'], calculatedRise);
    const expectedRadius = (120 ** 2 + 4 * expectedRise ** 2) / (8 * expectedRise);
    expect(radius.display.label).toBe('RAD');
    expect(radius.current?.amount).toBeCloseTo(expectedRadius, 10);

    const column = run(['3', 'feet', 'circ', 'conv', 'right'], calculatedRise);
    expect(column.display.label).toBe('COL');
    expect(column.current!.amount / 1728)
      .toBeCloseTo(Math.PI * 18 ** 2 * expectedRise / 1728, 10);
  });

  it('prefers a fresh triangle pair over an older Segment Radius', () => {
    const oldRadius = run(['2', '4', 'inch', 'conv', 'pitch']);
    const freshChordAndRise = run([
      '3', 'feet', 'rise',
      '4', 'feet', 'run',
    ], oldRadius);
    expect(freshChordAndRise.circle.radius).toBe(24);

    const recalculatedRadius = run(['conv', 'pitch'], freshChordAndRise);
    expect(recalculatedRadius.current?.amount).toBeCloseTo(26, 10);
  });

  it('keeps a newly entered Circle diameter authoritative over an older Run/Rise pair', () => {
    const oldPair = run([
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
    ]);
    const newDiameter = run(['1', '0', 'feet', 'circ'], oldPair);
    const recalledRadius = run(['conv', 'pitch'], newDiameter);

    expect(recalledRadius.display.label).toBe('RAD');
    expect(recalledRadius.current?.amount).toBeCloseTo(60, 10);
    expect(recalledRadius.display.unitText).toBe('FEET        INCH');
  });

  it('keeps a new dimensional Circle radius dimensional after an older raw pair', () => {
    const oldRawPair = run(['3', '0', 'run', '1', '0', 'rise']);
    const newDiameter = run(['1', '0', 'feet', 'circ'], oldRawPair);
    const recalledRadius = run(['conv', 'pitch'], newDiameter);

    expect(recalledRadius.display).toMatchObject({
      label: 'RAD',
      unitText: 'FEET        INCH',
    });
    expect(recalledRadius.current).toMatchObject({ amount: 60, power: 1 });
    expect(newDiameter.triangle).toEqual({});
    expect(newDiameter.triangleUnitless).toBeUndefined();

    const missingChord = run(['rise'], newDiameter);
    expect(missingChord.display.label).toBe('ERROR');
  });

  it('keeps a raw Run/Rise Segment Radius unitless instead of inventing feet', () => {
    const radius = run([
      '3', '0', 'run',
      '1', '0', 'rise',
      'conv', 'pitch',
    ]);

    expect(radius.display).toMatchObject({ label: 'RAD', unitText: '' });
    expect(radius.current).toMatchObject({ amount: 16.25, power: 0 });

    const recalled = run(['conv', 'pitch'], radius);
    expect(recalled.display).toMatchObject({ label: 'RAD', unitText: '' });
    expect(recalled.current).toMatchObject({ amount: 16.25, power: 0 });

    const replacedByFreshPair = run([
      '4', '0', 'run',
      '1', '0', 'rise',
      'conv', 'pitch',
    ], recalled);
    expect(replacedByFreshPair.display).toMatchObject({ label: 'RAD', unitText: '' });
    expect(replacedByFreshPair.current).toMatchObject({ amount: 25, power: 0 });

    const circle = cycle(run(['circ'], radius), 'circ', 3);
    expect(circle.map((state) => state.display.label)).toEqual(['DIA', 'CIRC', 'AREA']);
    expect(circle.map((state) => state.current?.power)).toEqual([0, 0, 0]);
    expect(circle.every((state) => state.display.unitText === '')).toBe(true);

    for (const key of ['run', 'rise'] as KeyId[]) {
      const segment = run([key], radius);
      expect(segment.current?.power).toBe(0);
      expect(segment.display.unitText).toBe('');
    }
  });

  it.each([
    ['Circle', ['1', '0', 'feet', 'circ'] as KeyId[]],
    ['Segment Radius', ['1', '0', 'feet', 'conv', 'pitch'] as KeyId[]],
  ])('keeps the independent right-triangle registers after entering %s', (_name, entry) => {
    const triangle = run([
      '7', 'inch', 'pitch',
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
    ]);
    const withCircleValue = run(entry, triangle);

    expect(withCircleValue.triangleInputs).toEqual(['x', 'y']);
    expect(withCircleValue.segmentInputs).toEqual([]);

    const pitch = run(['pitch'], withCircleValue);
    const angle = run(['pitch'], pitch);
    expect(pitch.display.label).toBe('PTCH');
    expect(pitch.current?.amount).toBeCloseTo(16, 10);
    expect(angle.display.label).toBe('∠θ');
    expect(angle.current?.amount).toBeCloseTo(Math.atan2(48, 36) * 180 / Math.PI, 10);

    const hip = run(['hip'], withCircleValue);
    expect(hip.display.label).toBe('H/V');
    expect(hip.triangle).toMatchObject({ x: 36, y: 48, r: 60 });
  });

  it.each(['hip', 'pitch'] as KeyId[])(
    'does not let a read-only %s cycle revive an older Run/Rise pair over a new Radius',
    (inspectionKey) => {
      const oldPair = run([
        '3', 'feet', 'run',
        '4', 'feet', 'rise',
      ]);
      const newRadius = run(['1', '0', 'feet', 'conv', 'pitch'], oldPair);
      const inspected = run([inspectionKey], newRadius);
      const recalledRadius = run(['conv', 'pitch'], inspected);

      expect(recalledRadius.display.label).toBe('RAD');
      expect(recalledRadius.current?.amount).toBeCloseTo(120, 10);
      expect(recalledRadius.segmentPairReady).toBe(false);
    },
  );

  it.each([
    {
      name: 'Chord',
      entry: ['8', 'feet', 'run'] as KeyId[],
      expected: 2 * Math.asin(96 / 240) * 180 / Math.PI,
    },
    {
      name: 'Rise',
      entry: ['2', 'feet', 'rise'] as KeyId[],
      expected: 2 * Math.acos((120 - 24) / 120) * 180 / Math.PI,
    },
  ])('uses the fresh $name instead of the stale other side when deriving Arc', ({ entry, expected }) => {
    const oldPair = run([
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
    ]);
    const newRadius = run(['1', '0', 'feet', 'conv', 'pitch'], oldPair);
    const freshSide = run(entry, newRadius);
    const arc = run(['conv', 'circ'], freshSide);

    expect(arc.display.label).toBe('ARC');
    expect(arc.current?.amount).toBeCloseTo(expected, 10);
  });

  it('replaces stale Pitch geometry after a Segment Run/Rise calculation', () => {
    const segment = run([
      '7', 'inch', 'pitch',
      '1', '0', 'feet', 'conv', 'pitch',
      '3', 'feet', 'run',
      'rise',
    ]);
    const expectedRise = segmentRise(120, 36);
    const expectedTheta = Math.atan2(expectedRise, 36) * 180 / Math.PI;
    expect(segment.triangle).toMatchObject({ x: 36, y: expectedRise, theta: expectedTheta });
    expect(segment.triangleInputs).toEqual(['x']);

    const pitchStates = cycle(run(['pitch'], segment), 'pitch', 4);
    const [pitchAngle, pitchGrade, pitchSlope, pitchInches] = pitchStates;
    const hip = run(['hip'], segment);
    const jack = run(['jack'], segment);
    expect(pitchStates.map((state) => state.display.label))
      .toEqual(['∠θ', '%GRD', 'SLP', 'PTCH']);
    expect(pitchAngle.current?.amount).toBeCloseTo(expectedTheta, 10);
    expect(pitchGrade.current?.amount).toBeCloseTo(expectedRise / 36 * 100, 10);
    expect(pitchSlope.current?.amount).toBeCloseTo(expectedRise / 36, 10);
    expect(pitchInches.display.label).toBe('PTCH');
    expect(pitchInches.current?.amount).toBeCloseTo(expectedRise / 3, 10);
    expect(hip.display.label).toBe('H/V');
    expect(jack.display.label).toBe('JKOC');
  });

  it('uses only authoritative operands for geometry approximation marks', () => {
    const exactRadiusFromFreshPair = run([
      '1', 'feet', 'divide', '7', 'equals', 'circ',
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
      'conv', 'pitch',
    ]);
    expect(exactRadiusFromFreshPair.current?.amount).toBeCloseTo(27.375, 10);
    expect(exactRadiusFromFreshPair.current?.approximate).toBeUndefined();

    const exactCircle = run([
      '4', 'feet', 'run',
      '3', '0', 'pitch',
      'rise',
      '1', '0', 'feet', 'conv', 'pitch',
      'circ',
    ]);
    expect(exactCircle.display.label).toBe('DIA');
    expect(exactCircle.current?.approximate).toBeUndefined();
    expect(run(['circ'], exactCircle).current?.approximate).toBeUndefined();

    const exactColumnAfterApproximateArc = run([
      '1', '0', 'feet', 'circ',
      '3', 'feet', 'rise',
      '1', 'divide', '3', 'equals', 'conv', 'circ',
      'conv', 'right',
    ]);
    expect(exactColumnAfterApproximateArc.display.label).toBe('COL');
    expect(exactColumnAfterApproximateArc.current?.approximate).toBeUndefined();

    const exactPairAfterReplacingApproximateRise = run([
      '3', 'feet', 'run',
      '1', 'feet', 'divide', '7', 'equals', 'rise',
      'diag',
      '4', 'feet', 'rise',
      'diag',
    ]);
    expect(exactPairAfterReplacingApproximateRise.current?.amount).toBeCloseTo(60, 10);
    expect(exactPairAfterReplacingApproximateRise.current?.approximate).toBeUndefined();
  });

  it.each(['rise', 'pitch', 'hip', 'jack'] as KeyId[])(
    'uses the current solved Chord/Rise after %s instead of an older Radius',
    (solveKey) => {
      const solved = run([
        '1', '0', 'feet', 'conv', 'pitch',
        '3', 'feet', 'run',
        '5', 'feet', 'diag',
        solveKey,
      ]);
      expect(solved.circle).toMatchObject({
        radius: 120,
        chord: 36,
        rise: 48,
        height: 48,
      });

      const recalculatedRadius = run(['conv', 'pitch'], solved);
      expect(recalculatedRadius.display.label).toBe('RAD');
      expect(recalculatedRadius.current?.amount).toBeCloseTo(27.375, 10);
    },
  );

  it('lets a newly entered Radius take priority for Segment Run and Rise', () => {
    const segmentRiseState = run([
      '3', 'feet', 'run',
      '5', 'feet', 'diag',
      '1', '0', 'feet', 'conv', 'pitch',
      'rise',
    ]);
    expect(segmentRiseState.display.label).toBe('RISE');
    expect(segmentRiseState.current?.amount).toBeCloseTo(segmentRise(120, 36), 10);

    const segmentChordState = run([
      '2', 'feet', 'rise',
      '5', 'feet', 'diag',
      '1', '0', 'feet', 'conv', 'pitch',
      'run',
    ]);
    expect(segmentChordState.display.label).toBe('CORD');
    expect(segmentChordState.current?.amount).toBeCloseTo(
      2 * Math.sqrt(2 * 120 * 24 - 24 ** 2),
      10,
    );
  });

  it('generates the official smallest-to-largest JAC-JAC ascending sizes', () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      jackOrder: 'ascending' as const,
      irregularJackMode: 'mate' as const,
    };
    const results = jackRafterResults(48, 7 / 12, preferences, 8 / 12, true);
    const relevant = results.filter((result) => /^(?:IJOC(?: STORED)?|JKOC(?: STORED)?|IJ\d+|JK\d+)$/.test(result.label));
    expect(relevant.map((result) => result.label)).toEqual([
      'IJOC STORED', 'IJ1', 'IJ2', 'IJ3',
      'JKOC', 'JK1', 'JK2', 'JK3',
    ]);
    expect(relevant.map((result) => result.value.amount)).toEqual([
      16,
      expect.closeTo(14 * Math.sqrt(1 + (8 / 12) ** 2), 10),
      expect.closeTo(28 * Math.sqrt(1 + (8 / 12) ** 2), 10),
      expect.closeTo(42 * Math.sqrt(1 + (8 / 12) ** 2), 10),
      14,
      expect.closeTo(16 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(32 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(48 * Math.sqrt(1 + (7 / 12) ** 2), 10),
    ]);
  });

  it('generates regular ascending Jacks from the short end to the full endpoint', () => {
    const ascending = jackRafterResults(
      101,
      7 / 12,
      { ...DEFAULT_PREFERENCES, jackOrder: 'ascending' },
    ).filter((result) => /^JK\d+$/.test(result.label));

    expect(ascending.map((result) => result.value.amount)).toEqual([
      expect.closeTo(16 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(32 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(48 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(64 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(80 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(96 * Math.sqrt(1 + (7 / 12) ** 2), 10),
      expect.closeTo(101 * Math.sqrt(1 + (7 / 12) ** 2), 10),
    ]);
  });

  it('synchronizes a triangle solved by Pitch before Segment Radius and Column', () => {
    const solvedPitch = run([
      '4', '0', 'feet', 'rise',
      '3', 'feet', 'run',
      '5', 'feet', 'diag',
      'pitch',
    ]);
    expect(solvedPitch.triangle).toMatchObject({ x: 36, y: 48, r: 60 });
    expect(solvedPitch.circle).toMatchObject({ chord: 36, rise: 48, height: 48 });

    const radius = run(['conv', 'pitch'], solvedPitch);
    expect(radius.display.label).toBe('RAD');
    expect(radius.current?.amount).toBeCloseTo(27.375, 10);

    const column = run(['2', 'feet', 'circ', 'conv', 'right'], solvedPitch);
    expect(column.display.label).toBe('COL');
    expect(column.current!.amount / 1728).toBeCloseTo(4 * Math.PI, 10);
  });

  it('preserves cumulative M+ through double On/C and clears it only on Off', () => {
    const stored = run(['1', '0', '0', 'mplus']);
    const afterDoubleOn = run(['on', 'on', 'recall', 'mplus'], stored);
    expect(afterDoubleOn.current?.amount).toBe(100);

    const afterOff = run(['off', 'on', 'recall', 'mplus'], stored);
    expect(afterOff.current?.amount).toBe(0);
  });

  it('clears a prior unitless-triangle mode on full On/C and Off resets', () => {
    const unitlessTriangle = run(['3', 'run', '4', 'rise']);
    expect(unitlessTriangle.triangleUnitless).toBe(true);

    const afterDoubleOn = run(['on', 'on', 'stair'], unitlessTriangle);
    expect(afterDoubleOn.triangleUnitless).toBeUndefined();
    expect(afterDoubleOn.display).toMatchObject({ label: 'ERROR', valueText: 'ERROR' });

    const afterOff = run(['off', 'on', 'stair'], unitlessTriangle);
    expect(afterOff.triangleUnitless).toBeUndefined();
    expect(afterOff.display).toMatchObject({ label: 'ERROR', valueText: 'ERROR' });
  });

  it('marks recalled memory and entered Stair registers as stored', () => {
    const recalled = run(['4', '2', 'conv', '1', 'on', 'recall', '1']);
    expect(recalled.display.label).toBe('M-1 STORED');

    const stairs = cycle(run([
      '9', 'feet', '1', '1', 'inch', 'rise', 'stair',
    ]), 'stair', 11);
    expect(stairs[9].display.label).toBe('RUN');
    expect(stairs[10].display.label).toBe('RISE (Y) STORED');

    const calculatedRun = cycle(run([
      '3', 'feet', 'rise',
      '3', '0', 'pitch',
      'run',
      'stair',
    ]), 'stair', 11);
    expect(calculatedRun[9].display.label).toBe('RUN');
    expect(calculatedRun[10].display.label).toBe('RISE (Y) STORED');

    const calculatedRise = cycle(run([
      '4', 'feet', 'run',
      '3', '0', 'pitch',
      'rise',
      'stair',
    ]), 'stair', 11);
    expect(calculatedRise[9].display.label).toBe('RUN (X) STORED');
    expect(calculatedRise[10].display.label).toBe('RISE');
  });

  it('keeps exact stored Stair preferences exact inside an approximate layout cycle', () => {
    const stairs = cycle(run([
      '1', '0', 'feet', 'divide', '7', 'equals', 'rise',
      'stair',
    ]), 'stair', 12);
    expect(stairs[0].current?.approximate).toBe(true);
    expect(stairs[10].current?.approximate).toBe(true);
    expect(stairs[11].display.label).toBe('R-HT STORED');
    expect(stairs[11].current?.approximate).toBeUndefined();
  });

  it('distinguishes default, stored, and derived Jack on-center values', () => {
    const defaultJack = run([
      '4', 'feet', 'run',
      '7', 'inch', 'pitch',
      'jack',
    ]);
    expect(defaultJack.display.label).toBe('JKOC');

    const storedOc = run(['1', '6', 'inch', 'jack']);
    const storedJack = run([
      '4', 'feet', 'run',
      '7', 'inch', 'pitch',
      'jack',
    ], storedOc);
    expect(storedJack.display.label).toBe('JKOC STORED');
    expect(storedJack.onCenterStored).toBe(true);
  });

  it('does not taint exact Jack on-center or Diagonal inputs with derived approximation', () => {
    const jack = run([
      '3', '6', 'feet', 'divide', '7', 'equals', 'run',
      '7', 'inch', 'pitch',
      'jack',
    ]);
    expect(jack.display.label).toBe('JKOC');
    expect(jack.current?.approximate).toBeUndefined();
    expect(run(['jack'], jack).current?.approximate).toBe(true);

    const diagonal = run([
      '5', 'feet', 'diag',
      '3', 'feet', 'divide', '7', 'equals', 'run',
      'diag',
    ]);
    expect(diagonal.sequence?.results[0].value.approximate).toBeUndefined();
    expect(diagonal.current?.approximate).toBe(true);
  });

  it('ends a consumed special-result cycle at Equals before the next digit', () => {
    const result = run([
      '3', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      '1', '8', '0', 'subtract',
      'conv', '9',
      'equals',
    ]);
    expect(result.current?.amount).toBeCloseTo(143.13010235, 8);
    expect(result.sequence).toBeUndefined();

    const nextEntry = run(['9'], result);
    expect(nextEntry.display).toMatchObject({ label: 'ENTRY', valueText: '9' });
    expect(nextEntry.entry).toBe('9');
  });

  it('shows actionable prerequisites while preserving the On/C error lock', () => {
    const circleError = run(['circ']);
    expect(circleError.display).toMatchObject({
      label: 'ERROR',
      note: expect.stringContaining('enter a diameter'),
    });
    const stillLocked = run(['stair'], circleError);
    expect(stillLocked.display.note).toBe(circleError.display.note);

    const offsetError = run(['conv', 'left']);
    expect(offsetError.display.note).toContain('store X with Run, Y with Rise, and end A with Conv+4');
  });

  it('retains tiny non-cardinal trig results and stable segment rises', () => {
    const tinySine = run([
      '1', 'divide', ...digits('100000000000'), 'equals', 'sin',
    ]);
    expect(tinySine.current?.amount).toBeCloseTo(Math.sin(1e-11 * Math.PI / 180), 25);
    expect(tinySine.current?.amount).not.toBe(0);
    expect(segmentRise(1e15, 2e7)).toBeCloseTo(0.05, 12);
  });
});
