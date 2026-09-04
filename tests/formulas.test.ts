import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, degrees, evaluateExpression, formatValue, measurement, nearlyEqual, operate, scalar } from '@/lib/calculator/core';
import {
  arcResults,
  columnConeResults,
  convertDms,
  hipValleyResults,
  jackRafterResults,
  lawOfCosines,
  offsetResults,
  solveFanLaw,
  solveRightTriangle,
  stairResults,
  velocityPressureResults,
} from '@/lib/calculator/formulas';

describe('professional HVAC dimensional math', () => {
  it('uses order of operations by default', () => {
    const value = evaluateExpression([
      { type: 'value', value: scalar(10) },
      { type: 'operator', operator: '+' },
      { type: 'value', value: scalar(4) },
      { type: 'operator', operator: '*' },
      { type: 'value', value: scalar(5) },
    ], 'order');
    expect(value.amount).toBe(30);
  });

  it('tracks dimensional powers through multiplication', () => {
    const value = evaluateExpression([
      { type: 'value', value: measurement(5.25, 'ft') },
      { type: 'operator', operator: '*' },
      { type: 'value', value: measurement(11 + 6.5 / 12, 'ft') },
    ]);
    expect(value.power).toBe(2);
    expect(value.amount / 144).toBeCloseTo(60.59375, 8);
  });

  it('honors the exponential display preference', () => {
    expect(formatValue(scalar(20_000_000), DEFAULT_PREFERENCES).valueText).toContain('e');
    expect(formatValue(scalar(1e-9), DEFAULT_PREFERENCES).valueText).toContain('e');
    expect(() => formatValue(scalar(20_000_000), { ...DEFAULT_PREFERENCES, exponent: false }))
      .toThrow('0-fL0');
    expect(() => formatValue(scalar(1e-9), { ...DEFAULT_PREFERENCES, exponent: false }))
      .toThrow('0-fL0');
    expect(formatValue(scalar(1e-7), { ...DEFAULT_PREFERENCES, exponent: false }).valueText)
      .toBe('0.0000001');
    expect(formatValue(scalar(1e-8), { ...DEFAULT_PREFERENCES, exponent: false }).valueText)
      .toBe('0.00000001');
  });

  it('fits scalar and angle results to the physical display digit budget', () => {
    expect(formatValue(scalar((500 / 1.3) ** 2), DEFAULT_PREFERENCES, {
      scalarMaxDecimals: 8,
      scalarSignificantDigits: 8,
    }).valueText)
      .toBe('147928.99');
    expect(formatValue(degrees(101.568715462), DEFAULT_PREFERENCES).valueText)
      .toBe('101.5687');
  });

  it('fits powered and fixed-meter results to the physical display digit budget', () => {
    const squareFeetAsMillimeters = { ...measurement(14, 'ft', 2), unit: 'sq-mm' as const };
    expect(formatValue(squareFeetAsMillimeters, DEFAULT_PREFERENCES).valueText)
      .toBe('1300642.56');
    expect(formatValue({
      amount: 19_999_999.99,
      power: 2,
      unit: 'sq-in',
      system: 'imperial',
    }, DEFAULT_PREFERENCES).valueText).toBe('19999999.99');
    expect(formatValue(measurement(123456.789, 'm'), {
      ...DEFAULT_PREFERENCES,
      meterDecimals: 'fixed-3',
    }).valueText).toBe('123456.79');
  });

  it('preserves dimensional unit provenance across chained arithmetic', () => {
    const sum = operate(measurement(2, 'in'), '+', measurement(3, 'in'));
    const area = operate(sum, '*', measurement(4, 'in'));
    expect(area.power).toBe(2);
    expect(area.unit).toBe('sq-in');
    expect(area.source).toEqual({ amount: 20, unit: 'in', power: 2 });
  });

  it('promotes mixed imperial addition to standard feet-and-inches', () => {
    const sum = operate(measurement(11, 'in'), '+', measurement(25, 'in'));
    const mixed = operate(measurement(11, 'in'), '+', measurement(2 + 1 / 12, 'ft'));
    expect(formatValue(sum, DEFAULT_PREFERENCES).unitText).toBe('INCH');
    expect(formatValue(mixed, DEFAULT_PREFERENCES)).toMatchObject({
      valueText: '3 - 0',
      unitText: 'FEET        INCH',
    });
  });

  it('auto-ranges overflowing dimensional values to the next larger unit', () => {
    const millimeters = measurement(20_000_000, 'mm');
    const metric = formatValue(millimeters, { ...DEFAULT_PREFERENCES, exponent: false });
    expect(metric.valueText).toBe('20000.000');
    expect(metric.unitText).toBe('M');

    const inches = formatValue(measurement(20_000_000, 'in'), {
      ...DEFAULT_PREFERENCES,
      exponent: false,
    });
    expect(inches.valueText).toBe('1666667');
    expect(inches.unitText).toBe('FEET');
  });

  it('honors standard and forced area formats for square millimeters', () => {
    const squareMillimeters = measurement(5, 'mm', 2);
    expect(formatValue(squareMillimeters, DEFAULT_PREFERENCES).unitText).toBe('SQ MM');
    expect(formatValue(squareMillimeters, { ...DEFAULT_PREFERENCES, areaFormat: 'sq-m' }).unitText).toBe('SQ M');
    expect(formatValue(squareMillimeters, { ...DEFAULT_PREFERENCES, areaFormat: 'sq-ft' }).unitText).toBe('SQ FEET');
  });

  it('does not render a rounded dimensional zero with a negative sign', () => {
    expect(formatValue(measurement(-0.01, 'in'), DEFAULT_PREFERENCES).valueText).toBe('0');
  });
});

describe('published field-calculator guide examples', () => {
  it('solves a 9-by-12 right triangle', () => {
    const solved = solveRightTriangle({ x: 144, y: 108 });
    expect(solved.r).toBe(180);
    expect(solved.theta).toBeCloseTo(36.86989765, 7);
  });

  it('solves valid side-angle and hypotenuse-angle right triangles', () => {
    expect(solveRightTriangle({ x: 12, theta: 45 })).toMatchObject({
      x: 12,
      y: expect.closeTo(12, 10),
      r: expect.closeTo(12 * Math.SQRT2, 10),
      theta: 45,
    });
    expect(solveRightTriangle({ r: 10, theta: 30 })).toMatchObject({
      x: expect.closeTo(5 * Math.sqrt(3), 10),
      y: expect.closeTo(5, 10),
      r: 10,
      theta: 30,
    });
  });

  it('accepts consistent overdetermined right-triangle values', () => {
    const theta = Math.atan2(4, 3) * 180 / Math.PI;
    expect(solveRightTriangle({ x: 3, y: 4, r: 5, theta })).toEqual({
      x: 3,
      y: 4,
      r: 5,
      theta,
    });
  });

  it.each([
    { x: 0, y: 12 },
    { x: -3, theta: 30 },
    { y: 4, r: 0 },
    { y: Number.POSITIVE_INFINITY, r: 10 },
  ])('rejects non-positive or non-finite sides: %o', (values) => {
    expect(() => solveRightTriangle(values)).toThrow('ENT Error');
  });

  it.each([0, -1, 90, 120, Number.NaN])('rejects singular or invalid angle %s', (theta) => {
    expect(() => solveRightTriangle({ x: 12, theta })).toThrow('ENT Error');
  });

  it.each([
    { x: 3, y: 4, r: 6 },
    { x: 3, y: 4, theta: 45 },
    { x: 3, r: 5, theta: 60 },
    { y: 4, r: 5, theta: 45 },
  ])('rejects contradictory overdetermined geometry: %o', (values) => {
    expect(() => solveRightTriangle(values)).toThrow('ENT Error');
  });

  it('solves Law of Cosines and Heron area', () => {
    const results = lawOfCosines(38 * 12 + 5, 23 * 12 + 4 + 9 / 16, 26 * 12 + 1 + 13 / 16);
    const angles = results.slice(0, 3).map((result) => result.value.amount);
    expect(results.map((result) => result.label)).toEqual(['∠A', '∠B', '∠C', 'AREA', 'a', 'b', 'c']);
    expect(angles).toEqual([
      expect.closeTo(101.5734, 4),
      expect.closeTo(36.59978, 5),
      expect.closeTo(41.8268, 4),
    ]);
    expect(angles.reduce((sum, value) => sum + value, 0)).toBeCloseTo(180, 8);
    expect(results[3].value.amount / 144).toBeCloseTo(299.4929, 4);
  });

  it('rejects impossible and non-finite Law of Cosines triangles', () => {
    expect(() => lawOfCosines(3, 4, 7)).toThrow('ENT Error');
    expect(() => lawOfCosines(Number.NaN, 4, 5)).toThrow('ENT Error');
    expect(() => lawOfCosines(3, Number.POSITIVE_INFINITY, 5)).toThrow('ENT Error');
  });

  it('matches the documented basic offset', () => {
    const [radius, wrapper, heel, throat, theta] = offsetResults(120, 60, 84);
    expect(radius.value.amount).toBeCloseTo(75, 10);
    expect(wrapper.value.amount).toBeCloseTo(139.094283, 6);
    expect(heel.value.amount).toBeCloseTo(117, 10);
    expect(throat.value.amount).toBeCloseTo(33, 10);
    expect(theta.value.amount).toBeCloseTo(26.565051, 6);
  });

  it('matches all three documented fan-law cases', () => {
    const fan1 = solveFanLaw(1, { a: 1250, aNew: 1400, b: 750 });
    const fan2 = solveFanLaw(2, { a: 15300, aNew: 14000, b: 3.2 });
    const fan3 = solveFanLaw(3, { a: 15800, aNew: 20000, b: 6.3 });
    expect(fan1.registers.bNew).toBeCloseTo(840, 8);
    expect(fan2.registers.bNew).toBeCloseTo(2.679311, 6);
    expect(fan3.registers.bNew).toBeCloseTo(12.77789, 5);
  });

  it('rejects non-positive physical Fan Law inputs', () => {
    expect(() => solveFanLaw(1, { a: -1250, aNew: 1400, b: 750 })).toThrow('ENT Error');
  });

  it('matches velocity pressure constants', () => {
    expect(velocityPressureResults(0.049).map((result) => result.label))
      .toEqual(['FPM', 'VP', 'MPS', 'KPA', 'ENTRY']);
    expect(velocityPressureResults(0.049)[0].value.amount).toBeCloseTo(886.5445, 4);
    expect(velocityPressureResults(0.123)[0].value.amount).toBeCloseTo(1404.608, 3);
    const from500 = velocityPressureResults(500);
    expect(from500[0].value.amount).toBeCloseTo(89554.52, 2);
    expect(from500[1].value.amount).toBeCloseTo(0.015586, 6);
    expect(from500[2].value.amount).toBeCloseTo(29.06888, 5);
    expect(from500[3].value.amount).toBeCloseTo(147928.99, 2);
  });

  it('rejects negative and non-finite velocity-pressure entries', () => {
    expect(() => velocityPressureResults(-1)).toThrow('ENT Error');
    expect(() => velocityPressureResults(Number.NaN)).toThrow('ENT Error');
    expect(() => velocityPressureResults(Number.POSITIVE_INFINITY)).toThrow('ENT Error');
  });

  it('matches the documented arc example', () => {
    const results = arcResults({ radius: 30, arcLength: 39 });
    expect(results.slice(0, 6).map((result) => result.label))
      .toEqual(['ARC', 'CORD', 'SEG', 'PIE', 'RISE', 'OC']);
    expect(results[0].value.amount).toBeCloseTo(74.48451, 5);
    expect(results[1].value.amount).toBeCloseTo(36.31118, 5);
    expect(results[2].value.amount / 144).toBeCloseTo(1.051381, 5);
    expect(results[3].value.amount / 144).toBeCloseTo(4.0625, 6);
    expect(results[4].value.amount).toBeCloseTo(6.117486, 6);
  });

  it('rejects invalid arc sweeps and returns every documented wall station', () => {
    expect(() => arcResults({ radius: 30, arcDegrees: 0 })).toThrow('ENT Error');
    expect(() => arcResults({ radius: 30, arcDegrees: 361 })).toThrow('ENT Error');
    const wallStations = arcResults({ radius: 2400, arcDegrees: 180 }, 16)
      .filter((result) => /^AW\d+$/.test(result.label));
    expect(wallStations).toHaveLength(149);
    expect(wallStations.at(-1)?.label).toBe('AW149');
  });

  it('rejects unsafe arc-wall enumerations before allocating the result list', () => {
    expect(() => arcResults({ radius: 160_032, arcDegrees: 180 }, 16)).toThrow('0-fL0');
  });

  it('matches the documented column and cone examples with physical display labels', () => {
    const column = columnConeResults(14, 54);
    expect(column.map((result) => result.label))
      .toEqual(['COL', 'COL AREA', 'CONE', 'CONE AREA']);
    expect(column[0].value.amount / 1728).toBeCloseTo(19.24226, 5);

    const cone = columnConeResults(21, 60);
    expect(cone[2].value.amount / 1728).toBeCloseTo(16.03521, 5);
  });

  it('rejects non-positive and non-finite column/cone dimensions', () => {
    expect(() => columnConeResults(0, 60)).toThrow('ENT Error');
    expect(() => columnConeResults(21, -1)).toThrow('ENT Error');
    expect(() => columnConeResults(Number.NaN, 60)).toThrow('ENT Error');
    expect(() => columnConeResults(21, Number.POSITIVE_INFINITY)).toThrow('ENT Error');
  });

  it('matches regular and irregular hip geometry', () => {
    const regular = hipValleyResults(101, 7 / 12);
    expect(regular[0].value.amount).toBeCloseTo(154.48, 1);
    expect(regular[1].value.amount).toBeCloseTo(22.41512, 5);

    const irregular = hipValleyResults(48, 7 / 12, 8 / 12);
    expect(irregular[0].value.amount).toBeCloseTo(69.6563, 3);
    expect(irregular[1].value.amount).toBeCloseTo(23.70162, 5);
    expect(irregular[3].value.amount).toBeCloseTo(41.185925, 6);
    expect(irregular[4].value.amount).toBeCloseTo(48.814075, 6);
  });

  it('rejects invalid regular and irregular hip geometry', () => {
    expect(() => hipValleyResults(0, 7 / 12)).toThrow('ENT Error');
    expect(() => hipValleyResults(48, -7 / 12)).toThrow('ENT Error');
    expect(() => hipValleyResults(48, 7 / 12, 0)).toThrow('ENT Error');
    expect(() => hipValleyResults(48, 7 / 12, Number.NaN)).toThrow('ENT Error');
  });

  it('matches regular jack lengths at 16 inches on center', () => {
    const results = jackRafterResults(101, 7 / 12, DEFAULT_PREFERENCES);
    const jack1 = results.find((result) => result.label === 'JK1')!;
    const jack6 = results.find((result) => result.label === 'JK6')!;
    expect(jack1.value.amount).toBeCloseTo(98.36, 1);
    expect(jack6.value.amount).toBeCloseTo(5.7885, 3);
  });

  it('returns every Jack through the terminal zero beyond two display digits', () => {
    const jacks = jackRafterResults(2400, 7 / 12, DEFAULT_PREFERENCES)
      .filter((result) => /^JK\d+$/.test(result.label));
    expect(jacks).toHaveLength(150);
    expect(jacks.at(-1)).toMatchObject({ label: 'JK150', value: { amount: 0 } });
  });

  it('rejects unsafe Jack enumerations before allocating the result list', () => {
    expect(() => jackRafterResults(160_016, 7 / 12, DEFAULT_PREFERENCES)).toThrow('0-fL0');
  });

  it('rejects invalid Jack geometry and spacing', () => {
    expect(() => jackRafterResults(0, 7 / 12, DEFAULT_PREFERENCES)).toThrow('ENT Error');
    expect(() => jackRafterResults(48, -7 / 12, DEFAULT_PREFERENCES)).toThrow('ENT Error');
    expect(() => jackRafterResults(48, 7 / 12, {
      ...DEFAULT_PREFERENCES,
      onCenter: 0,
    })).toThrow('ENT Error');
    expect(() => jackRafterResults(48, 7 / 12, DEFAULT_PREFERENCES, Number.NaN))
      .toThrow('ENT Error');
  });

  it('mates irregular jack pairs at the same hip position', () => {
    const preferences = { ...DEFAULT_PREFERENCES, irregularJackMode: 'mate' as const };
    const results = jackRafterResults(48, 7 / 12, preferences, 8 / 12);
    const regular = results.find((result) => result.label === 'JK1')!.value.amount;
    const irregular = results.find((result) => result.label === 'IJ1')!.value.amount;
    const regularPlan = regular / Math.sqrt(1 + (7 / 12) ** 2);
    const irregularPlan = irregular / Math.sqrt(1 + (8 / 12) ** 2);
    expect(regularPlan / 48).toBeCloseTo(irregularPlan / 42, 10);
  });

  it('places the matching on-center marker before each irregular jack side', () => {
    const jackLabels = (irregularFirst: boolean) => jackRafterResults(
      48,
      7 / 12,
      DEFAULT_PREFERENCES,
      8 / 12,
      irregularFirst,
    )
      .map((result) => result.label)
      .filter((label) => /^(?:JKOC|IJOC|JK\d+|IJ\d+)$/.test(label));

    expect(jackLabels(false)).toEqual([
      'JKOC', 'JK1', 'JK2', 'JK3',
      'IJOC', 'IJ1', 'IJ2', 'IJ3',
    ]);
    expect(jackLabels(true)).toEqual([
      'IJOC', 'IJ1', 'IJ2', 'IJ3',
      'JKOC', 'JK1', 'JK2', 'JK3',
    ]);
  });

  it('keeps fixed on-center, riser, and tread dimensions in their documented units', () => {
    const jacks = jackRafterResults(48, 7 / 12, DEFAULT_PREFERENCES, 8 / 12);
    expect(jacks.filter((result) => result.label.endsWith('OC')).map((result) => result.value.unit))
      .toEqual(['in', 'in']);
    expect(arcResults({ radius: 30, arcLength: 39 }).find((result) => result.label === 'OC')?.value.unit)
      .toBe('in');

    const stairs = stairResults(119, undefined, DEFAULT_PREFERENCES);
    const unit = (label: string) => stairs.find((result) => result.label === label)?.value.unit;
    expect(['R-HT', 'R+/−', 'T-WD', 'T+/−', 'R-HT STORED', 'T-WD STORED', 'FLOR STORED'].map(unit))
      .toEqual(['in', 'in', 'in', 'in', 'in', 'in', 'in']);
    expect(unit('HDRM STORED')).toBe('ft-in');
    expect(['OPEN', 'STRG', 'RUN', 'RISE'].map(unit)).toEqual(['auto', 'auto', 'auto', 'auto']);
  });

  it('matches the rise-only stair example', () => {
    const results = stairResults(119, undefined, DEFAULT_PREFERENCES);
    const find = (label: string) => results.find((result) => result.label === label)!.value.amount;
    expect(find('RSRS')).toBe(16);
    expect(find('R-HT')).toBe(7.4375);
    expect(find('TRDS')).toBe(15);
    expect(find('RUN')).toBe(150);
    expect(nearlyEqual(find('STRG'), 186.94, 0.001)).toBe(true);
    expect(find('INCL')).toBeCloseTo(36.64003, 5);
  });

  it('rejects a degenerate one-riser stair instead of returning contradictory geometry', () => {
    expect(() => stairResults(1, undefined, DEFAULT_PREFERENCES)).toThrow('DIM Error');
  });

  it('keeps an atypical stair-ratio warning on every result in the cycle', () => {
    const atypical = stairResults(60, 20, DEFAULT_PREFERENCES);
    expect(atypical).toHaveLength(15);
    expect(atypical.every((result) => result.note === 'Steep/atypical stair ratio')).toBe(true);

    const proportional = stairResults(24, 12, {
      ...DEFAULT_PREFERENCES,
      desiredRiser: 10,
      treadWidth: 10,
    });
    expect(proportional.every((result) => result.note === undefined)).toBe(true);

    const overThreshold = stairResults(20, 9, {
      ...DEFAULT_PREFERENCES,
      desiredRiser: 10,
      treadWidth: 10,
    });
    expect(overThreshold.every((result) => result.note === 'Steep/atypical stair ratio')).toBe(true);

    const normal = stairResults(119, undefined, DEFAULT_PREFERENCES);
    expect(normal.every((result) => result.note === undefined)).toBe(true);
  });

  it('normalizes D:M:S rounding across degree boundaries', () => {
    expect(convertDms(23.999999, false)).toBe(24);
    expect(convertDms(-23.999999, false)).toBe(-24);
  });

  it('rejects non-positive stair geometry', () => {
    expect(() => stairResults(-60, undefined, DEFAULT_PREFERENCES)).toThrow('DIM Error');
    expect(() => stairResults(undefined, 0, DEFAULT_PREFERENCES)).toThrow('DIM Error');
  });
});
