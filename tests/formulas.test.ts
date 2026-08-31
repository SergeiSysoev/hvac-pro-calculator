import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, evaluateExpression, formatValue, measurement, nearlyEqual, scalar } from '@/lib/calculator/core';
import {
  arcResults,
  hipValleyResults,
  jackRafterResults,
  lawOfCosines,
  offsetResults,
  solveFanLaw,
  solveRightTriangle,
  stairResults,
  velocityPressureResults,
} from '@/lib/calculator/formulas';

describe('4090 dimensional math', () => {
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
    expect(() => formatValue(scalar(20_000_000), { ...DEFAULT_PREFERENCES, exponent: false }))
      .toThrow('0-fL0');
  });

  it('honors standard and forced area formats for square millimeters', () => {
    const squareMillimeters = measurement(5, 'mm', 2);
    expect(formatValue(squareMillimeters, DEFAULT_PREFERENCES).unitText).toBe('SQ MM');
    expect(formatValue(squareMillimeters, { ...DEFAULT_PREFERENCES, areaFormat: 'sq-m' }).unitText).toBe('SQ M');
    expect(formatValue(squareMillimeters, { ...DEFAULT_PREFERENCES, areaFormat: 'sq-ft' }).unitText).toBe('SQ FEET');
  });
});

describe('official 4090 guide examples', () => {
  it('solves a 9-by-12 right triangle', () => {
    const solved = solveRightTriangle({ x: 144, y: 108 });
    expect(solved.r).toBe(180);
    expect(solved.theta).toBeCloseTo(36.86989765, 7);
  });

  it('solves Law of Cosines and Heron area', () => {
    const results = lawOfCosines(60, 72, 84);
    const angles = results.slice(0, 3).map((result) => result.value.amount);
    expect(angles.reduce((sum, value) => sum + value, 0)).toBeCloseTo(180, 8);
    expect(results[3].value.amount).toBeCloseTo(2116.35914, 4);
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

  it('matches velocity pressure constants', () => {
    expect(velocityPressureResults(0.049)[0].value.amount).toBeCloseTo(886.5445, 4);
    expect(velocityPressureResults(0.123)[0].value.amount).toBeCloseTo(1404.608, 3);
    expect(velocityPressureResults(500)[1].value.amount).toBeCloseTo(0.015586, 6);
  });

  it('matches the documented arc example', () => {
    const results = arcResults({ radius: 30, arcLength: 39 });
    expect(results[0].value.amount).toBeCloseTo(74.48451, 5);
    expect(results[1].value.amount).toBeCloseTo(36.31118, 5);
    expect(results[2].value.amount / 144).toBeCloseTo(1.051381, 5);
    expect(results[3].value.amount / 144).toBeCloseTo(4.0625, 6);
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

  it('matches regular jack lengths at 16 inches on center', () => {
    const results = jackRafterResults(101, 7 / 12, DEFAULT_PREFERENCES);
    const jack1 = results.find((result) => result.label === 'JK1')!;
    const jack6 = results.find((result) => result.label === 'JK6')!;
    expect(jack1.value.amount).toBeCloseTo(98.36, 1);
    expect(jack6.value.amount).toBeCloseTo(5.7885, 3);
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
});
