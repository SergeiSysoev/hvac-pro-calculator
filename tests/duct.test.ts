import { describe, expect, it } from 'vitest';
import {
  DuctField,
  MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
  airflowFromVelocityAndDiameter,
  displayToImperialValue,
  ductEntryCommaMode,
  ductFlowRegimeNotice,
  ductFrictionRate,
  ductReynolds,
  equivalentRoundDiameter,
  formatDuctConvertedInput,
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

  it('does not select a false turbulent root for a laminar velocity/friction pair', () => {
    const laminarVelocity = 40;
    const laminarDiameter = 6;
    const laminarFriction = ductFrictionRate(laminarVelocity, laminarDiameter);

    expect(() => solveRoundDuct({
      velocityFpm: laminarVelocity,
      frictionRate: laminarFriction,
    })).toThrow(/multiple valid|supported|flow-transition/);
  });

  it('solves a unique laminar velocity/friction pair', () => {
    const laminarVelocity = 40;
    const laminarDiameter = 1;
    const laminarFriction = ductFrictionRate(laminarVelocity, laminarDiameter);
    const result = solveRoundDuct({
      velocityFpm: laminarVelocity,
      frictionRate: laminarFriction,
    });

    expect(result.diameterIn).toBeCloseTo(laminarDiameter, 7);
    expect(result.reynolds).toBeCloseTo(340, 7);
  });

  it('solves unique laminar airflow/friction and diameter/friction pairs', () => {
    const laminarAirflow = 100;
    const laminarDiameter = 100;
    const laminarVelocity = velocityFromAirflowAndDiameter(laminarAirflow, laminarDiameter);
    const laminarFriction = ductFrictionRate(laminarVelocity, laminarDiameter);

    const fromAirflow = solveRoundDuct({
      airflowCfm: laminarAirflow,
      frictionRate: laminarFriction,
    });
    const fromDiameter = solveRoundDuct({
      diameterIn: laminarDiameter,
      frictionRate: laminarFriction,
    });

    expect(fromAirflow.diameterIn).toBeCloseTo(laminarDiameter, 6);
    expect(fromAirflow.reynolds).toBeLessThanOrEqual(2300);
    expect(fromDiameter.velocityFpm).toBeCloseTo(laminarVelocity, 6);
    expect(fromDiameter.reynolds).toBeLessThanOrEqual(2300);
  });

  it('solves the laminar boundary when the inverse pair has one physical root', () => {
    const boundaryDiameter = 10;
    const boundaryVelocity = 2300 / (8.5 * boundaryDiameter);
    const boundaryAirflow = airflowFromVelocityAndDiameter(boundaryVelocity, boundaryDiameter);
    const boundaryFriction = ductFrictionRate(boundaryVelocity, boundaryDiameter);

    const fromAirflow = solveRoundDuct({
      airflowCfm: boundaryAirflow,
      frictionRate: boundaryFriction,
    });
    const fromDiameter = solveRoundDuct({
      diameterIn: boundaryDiameter,
      frictionRate: boundaryFriction,
    });

    expect(fromAirflow.reynolds).toBeCloseTo(2300, 5);
    expect(fromAirflow.diameterIn).toBeCloseTo(boundaryDiameter, 7);
    expect(fromAirflow.frictionRate).toBeCloseTo(boundaryFriction, 12);
    expect(fromDiameter.reynolds).toBeCloseTo(2300, 5);
    expect(fromDiameter.velocityFpm).toBeCloseTo(boundaryVelocity, 7);
    expect(fromDiameter.frictionRate).toBeCloseTo(boundaryFriction, 12);
    expect(() => solveRoundDuct({
      velocityFpm: boundaryVelocity,
      frictionRate: boundaryFriction,
    })).toThrow('multiple valid');
  });

  it.each([2299.99885, 2300.00115])(
    'accepts valid inverse roots immediately beside the flow boundary at Re=%s',
    (reynolds) => {
      const diameter = 10;
      const velocity = reynolds / (8.5 * diameter);
      const airflow = airflowFromVelocityAndDiameter(velocity, diameter);
      const friction = ductFrictionRate(velocity, diameter);

      const fromAirflow = solveRoundDuct({ airflowCfm: airflow, frictionRate: friction });
      const fromDiameter = solveRoundDuct({ diameterIn: diameter, frictionRate: friction });

      expect(fromAirflow.reynolds).toBeCloseTo(reynolds, 5);
      expect(fromAirflow.frictionRate).toBeCloseTo(friction, 12);
      expect(fromDiameter.reynolds).toBeCloseTo(reynolds, 5);
      expect(fromDiameter.frictionRate).toBeCloseTo(friction, 12);
    },
  );

  it.each([
    'airflow-friction',
    'velocity-friction',
    'diameter-friction',
  ] as const)('solves a turbulent Reynolds 5,000 reference for %s', (pair) => {
    const boundaryAirflow = 1000;
    const boundaryDiameter = 8.5 * (576 / Math.PI) * boundaryAirflow / 5_000;
    const boundaryVelocity = velocityFromAirflowAndDiameter(boundaryAirflow, boundaryDiameter);
    const boundaryFriction = ductFrictionRate(boundaryVelocity, boundaryDiameter);
    const inputs = pair === 'airflow-friction'
      ? { airflowCfm: boundaryAirflow, frictionRate: boundaryFriction }
      : pair === 'velocity-friction'
        ? { velocityFpm: boundaryVelocity, frictionRate: boundaryFriction }
        : { diameterIn: boundaryDiameter, frictionRate: boundaryFriction };
    const result = solveRoundDuct(inputs);

    expect(result.reynolds).toBeCloseTo(5_000, 5);
    expect(result.airflowCfm).toBeCloseTo(boundaryAirflow, 5);
    expect(result.diameterIn).toBeCloseTo(boundaryDiameter, 7);
    expect(result.velocityFpm).toBeCloseTo(boundaryVelocity, 7);
  });

  it('keeps inverse branches correct with custom air density', () => {
    const conditions = { densityLbFt3: 0.06, roughnessFt: 0.0005 };
    const diameter = 12;
    const velocity = 5_000 / (8.5 * diameter * (conditions.densityLbFt3 / 0.075));
    const airflow = airflowFromVelocityAndDiameter(velocity, diameter);
    const friction = ductFrictionRate(velocity, diameter, conditions);

    for (const inputs of [
      { airflowCfm: airflow, frictionRate: friction },
      { velocityFpm: velocity, frictionRate: friction },
      { diameterIn: diameter, frictionRate: friction },
    ]) {
      const result = solveRoundDuct(inputs, conditions);
      expect(result.reynolds).toBeCloseTo(5_000, 5);
      expect(result.diameterIn).toBeCloseTo(diameter, 7);
      expect(result.velocityFpm).toBeCloseTo(velocity, 7);
    }
  });
});

describe('duct unit and shape helpers', () => {
  it('matches independent NIST SI conversion fixtures', () => {
    expect(imperialToDisplayValue('diameterIn', 1, 'si')).toBe(25.4);
    expect(imperialToDisplayValue('velocityFpm', 1, 'si')).toBe(0.00508);
    expect(imperialToDisplayValue('airflowCfm', 1, 'si')).toBeCloseTo(0.4719474432, 9);
    expect(imperialToDisplayValue('frictionRate', 1, 'si')).toBeCloseTo(8.1722083333, 9);
  });

  it('rejects an ambiguous lone comma unless the field context resolves it', () => {
    expect(parseDuctEntry('1,000')).toBeUndefined();
    expect(parseDuctEntry('1,234', 'decimal')).toBeCloseTo(1.234, 10);
    expect(parseDuctEntry('1,234', 'grouping')).toBe(1234);
    expect(parseDuctEntry('1,234.5')).toBe(1234.5);
    expect(parseDuctEntry('1,234,567')).toBe(1234567);
    expect(parseDuctEntry('1 000')).toBe(1000);
    expect(parseDuctEntry('0,10')).toBeCloseTo(0.1, 10);
    expect(parseDuctEntry('1,2,3')).toBeUndefined();
    expect(ductEntryCommaMode('frictionRate', 'imperial')).toBe('decimal');
    expect(ductEntryCommaMode('velocityFpm', 'si')).toBe('decimal');
    expect(ductEntryCommaMode('airflowCfm', 'imperial')).toBe('grouping');
    expect(ductEntryCommaMode('diameterIn', 'si')).toBe('grouping');
  });

  it('describes laminar and transitional flow without mislabeling either regime', () => {
    expect(ductFlowRegimeNotice(340)).toContain('Laminar flow');
    expect(ductFlowRegimeNotice(2300)).toContain('Laminar flow');
    expect(ductFlowRegimeNotice(2300.1)).toContain('Transitional flow');
    expect(ductFlowRegimeNotice(9999)).toContain('Transitional flow');
    expect(ductFlowRegimeNotice(10_000)).toBeUndefined();
  });

  it.each<DuctField>(['airflowCfm', 'frictionRate', 'velocityFpm', 'diameterIn'])(
    'round-trips %s through SI display units',
    (field) => {
      const displayed = imperialToDisplayValue(field, 123.456, 'si');
      expect(displayToImperialValue(field, displayed, 'si')).toBeCloseTo(123.456, 10);
    },
  );

  it.each<DuctField>(['airflowCfm', 'frictionRate', 'velocityFpm', 'diameterIn'])(
    'does not lose a manual %s value through repeated unit-system toggles',
    (field) => {
      const original = 100.049;
      const siText = formatDuctConvertedInput(
        imperialToDisplayValue(field, original, 'si'),
      );
      const returnedText = formatDuctConvertedInput(
        displayToImperialValue(field, Number(siText), 'si'),
      );
      expect(Number(returnedText)).toBeCloseTo(original, 9);
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
