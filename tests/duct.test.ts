import { describe, expect, it } from 'vitest';
import {
  DuctField,
  MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
  displayToImperialValue,
  ductFrictionRate,
  ductReynolds,
  equivalentRoundDiameter,
  imperialToDisplayValue,
  parseDuctEntry,
  promoteDuctInput,
  rectangularEquivalents,
  solveRoundDuct,
  velocityFromAirflowAndDiameter,
} from '@/lib/calculator/duct';

describe('ASHRAE round duct solver', () => {
  const airflowCfm = 1000;
  const diameterIn = 10;
  const velocityFpm = velocityFromAirflowAndDiameter(airflowCfm, diameterIn);
  const frictionRate = ductFrictionRate(velocityFpm, diameterIn);

  it('matches a standard-air Darcy/Colebrook reference case', () => {
    const result = solveRoundDuct({ airflowCfm, diameterIn });
    expect(result.velocityFpm).toBeCloseTo(1833.465, 3);
    expect(result.reynolds).toBeCloseTo(155844.5, 1);
    expect(result.frictionFactor).toBeCloseTo(0.0185943, 6);
    expect(result.frictionRate).toBeCloseTo(0.46747, 5);
  });

  it('matches independent ASHRAE friction-chart field points', () => {
    const chartPoint = solveRoundDuct({ airflowCfm: 1000, frictionRate: 0.1 });
    expect(chartPoint.diameterIn).toBeCloseTo(13.66, 1);
    expect(chartPoint.velocityFpm).toBeCloseTo(982.8, 0);

    const handbookPoint = solveRoundDuct({ diameterIn: 10, velocityFpm: 2000 });
    expect(handbookPoint.airflowCfm).toBeCloseTo(1091, 0);
    expect(handbookPoint.reynolds).toBeCloseTo(170_000, 0);
  });

  it.each([
    [{ airflowCfm, diameterIn }],
    [{ airflowCfm, velocityFpm }],
    [{ velocityFpm, diameterIn }],
    [{ airflowCfm, frictionRate }],
    [{ velocityFpm, frictionRate }],
    [{ diameterIn, frictionRate }],
  ])('solves the same duct from any two values: %o', (inputs) => {
    const result = solveRoundDuct(inputs);
    expect(result.airflowCfm).toBeCloseTo(airflowCfm, 5);
    expect(result.diameterIn).toBeCloseTo(diameterIn, 5);
    expect(result.velocityFpm).toBeCloseTo(velocityFpm, 5);
    expect(result.frictionRate).toBeCloseTo(frictionRate, 7);
  });

  it('rejects missing, extra, zero and negative constraints', () => {
    expect(() => solveRoundDuct({ airflowCfm })).toThrow('exactly two');
    expect(() => solveRoundDuct({ airflowCfm, diameterIn, velocityFpm })).toThrow('exactly two');
    expect(() => solveRoundDuct({ airflowCfm: 0, diameterIn })).toThrow('positive');
    expect(() => solveRoundDuct({ airflowCfm: -1, diameterIn })).toThrow('positive');
  });

  it('keeps custom-density Reynolds and friction calculations consistent', () => {
    const standardReynolds = ductReynolds(1000, 12);
    const denseReynolds = ductReynolds(1000, 12, 0.15);
    expect(denseReynolds).toBeCloseTo(standardReynolds * 2, 10);
    expect(ductFrictionRate(1000, 12, { densityLbFt3: 0.15, roughnessFt: 0.0003 }))
      .toBeGreaterThan(ductFrictionRate(1000, 12));
  });

  it('rejects inverse targets inside the discontinuous flow-transition range', () => {
    expect(() => solveRoundDuct({ diameterIn: 10, frictionRate: 0.0002 }))
      .toThrow('flow-transition');
    expect(() => solveRoundDuct({ diameterIn: 10, frictionRate: 0.00025 }))
      .toThrow('flow-transition');
  });
});

describe('duct unit and shape helpers', () => {
  it('matches independent NIST SI conversion fixtures', () => {
    expect(imperialToDisplayValue('diameterIn', 1, 'si')).toBe(25.4);
    expect(imperialToDisplayValue('velocityFpm', 1, 'si')).toBe(0.00508);
    expect(imperialToDisplayValue('airflowCfm', 1, 'si')).toBeCloseTo(0.4719474432, 9);
    expect(imperialToDisplayValue('frictionRate', 1, 'si')).toBeCloseTo(8.1722083333, 9);
  });

  it('parses English thousands separators without corrupting decimal commas', () => {
    expect(parseDuctEntry('1,000')).toBe(1000);
    expect(parseDuctEntry('1,234.5')).toBe(1234.5);
    expect(parseDuctEntry('0,10')).toBeCloseTo(0.1, 10);
    expect(parseDuctEntry('1,2,3')).toBeUndefined();
  });

  it.each<DuctField>(['airflowCfm', 'frictionRate', 'velocityFpm', 'diameterIn'])(
    'round-trips %s through SI display units',
    (field) => {
      const displayed = imperialToDisplayValue(field, 123.456, 'si');
      expect(displayToImperialValue(field, displayed, 'si')).toBeCloseTo(123.456, 10);
    },
  );

  it('matches the published 12 x 8 equivalent round example', () => {
    expect(equivalentRoundDiameter(12, 8)).toBeCloseTo(10.66, 2);
    expect(equivalentRoundDiameter(8, 12)).toBeCloseTo(10.66, 2);
  });

  it('returns practical rectangular equivalents with actual velocities', () => {
    const suggestions = rectangularEquivalents(14, 1000, 6);
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    expect(suggestions.length).toBeLessThanOrEqual(6);
    expect(suggestions.every((item) => item.aspectRatio <= 4)).toBe(true);
    expect(suggestions.every((item) => item.velocityFpm > 0)).toBe(true);
    expect(suggestions.every(
      (item) => Math.abs(item.frictionDifferencePercent) <= MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
    )).toBe(true);
  });

  it('does not recommend out-of-range catalog sizes', () => {
    expect(rectangularEquivalents(1, 100, 6)).toEqual([]);
    expect(rectangularEquivalents(120, 10000, 6)).toEqual([]);
  });

  it('keeps the two most recently edited input fields', () => {
    const first = promoteDuctInput(['airflowCfm', 'frictionRate'], 'airflowCfm');
    expect(first).toEqual(['frictionRate', 'airflowCfm']);
    expect(promoteDuctInput(first, 'velocityFpm')).toEqual(['airflowCfm', 'velocityFpm']);
  });
});
