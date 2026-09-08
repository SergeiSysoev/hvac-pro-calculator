import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DuctFlowDiagram, {
  buildDuctDiagramView,
} from '@/components/calculator/DuctFlowDiagram';
import { formatInput } from '@/components/calculator/DuctCalculator';
import {
  MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
  rectangularEquivalents,
  solveRoundDuct,
} from '@/lib/calculator/duct';

describe('duct flow visualization', () => {
  it('shows every unknown relationship as expected before entry', () => {
    const view = buildDuctDiagramView({
      manualOrder: [],
      rawValues: {},
      unitSystem: 'imperial',
    });

    expect(view.progressText).toBe('0/2 inputs · choose any two');
    expect(Object.values(view.metrics).map((metric) => metric.status))
      .toEqual(['expected', 'expected', 'expected', 'expected']);
    expect(view.rectangle).toMatchObject({
      status: 'expected',
      value: undefined,
      width: undefined,
      height: undefined,
      frictionDifferencePercent: undefined,
      frictionTolerancePercent: MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
    });
    expect(view.ariaText).toContain('Equivalent rectangular size will appear');
  });

  it('distinguishes entered values from calculated values in a solved round duct', () => {
    const solution = solveRoundDuct({ airflowCfm: 1000, diameterIn: 14 });
    const view = buildDuctDiagramView({
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '1,000', diameterIn: '14' },
      solution,
      unitSystem: 'imperial',
    });

    expect(view.progressText).toBe('2/2 inputs · solved');
    expect(view.metrics.airflowCfm).toMatchObject({
      symbol: 'Q',
      status: 'entered',
      value: '1,000',
      unit: 'CFM',
    });
    expect(view.metrics.diameterIn).toMatchObject({
      symbol: 'ØD',
      status: 'entered',
      value: '14',
      unit: 'in',
    });
    expect(view.metrics.velocityFpm.status).toBe('calculated');
    expect(view.metrics.frictionRate.status).toBe('calculated');
    expect(view.rectangle.status).toBe('calculated');
    expect(view.rectangle.value).toMatch(/ × .* in$/);
    const expectedEquivalent = rectangularEquivalents(
      solution.diameterIn,
      solution.airflowCfm,
    )[0];
    expect(view.rectangle).toMatchObject({
      width: expectedEquivalent.widthIn,
      height: expectedEquivalent.heightIn,
      unit: 'in',
      aspectRatio: expectedEquivalent.aspectRatio,
      frictionDifferencePercent: expectedEquivalent.frictionDifferencePercent,
      frictionTolerancePercent: MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
    });
    expect(view.rectangle.frictionDeltaText).toMatch(/^[+−]\d/);
    expect(Math.abs(view.rectangle.frictionDifferencePercent!)).toBeLessThanOrEqual(10);
    expect(view.ariaText).toContain('Air flow, Q: 1,000 CFM, entered.');
    expect(view.ariaText).toContain('Velocity, V:');
    expect(view.ariaText).toContain('calculated.');
    expect(view.ariaText).toContain('same airflow');
    expect(view.ariaText).toContain('within ±10%');
  });

  it('converts calculated diagram values and labels together in SI mode', () => {
    const solution = solveRoundDuct({ airflowCfm: 1000, diameterIn: 14 });
    const view = buildDuctDiagramView({
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '471.947', diameterIn: '355.6' },
      solution,
      unitSystem: 'si',
    });

    expect(view.metrics.airflowCfm.unit).toBe('L/s');
    expect(view.metrics.velocityFpm.unit).toBe('m/s');
    expect(view.metrics.diameterIn.unit).toBe('mm');
    expect(view.metrics.frictionRate.unit).toBe('Pa/m');
    expect(view.rectangle.value).toMatch(/ mm$/);
    const imperialEquivalent = rectangularEquivalents(
      solution.diameterIn,
      solution.airflowCfm,
    )[0];
    expect(view.rectangle.width).toBeCloseTo(imperialEquivalent.widthIn * 25.4, 8);
    expect(view.rectangle.height).toBeCloseTo(imperialEquivalent.heightIn * 25.4, 8);
    expect(view.rectangle.unit).toBe('mm');
    expect(view.ariaText).not.toContain(' FPM');
    expect(view.ariaText).not.toContain(' in,');
  });

  it('renders a compact semantic figure with visible non-color status symbols', () => {
    const solution = solveRoundDuct({ airflowCfm: 1000, diameterIn: 14 });
    const markup = renderToStaticMarkup(createElement(DuctFlowDiagram, {
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '1,000', diameterIn: '14' },
      solution,
      unitSystem: 'imperial',
    }));

    expect(markup).toContain('<figure');
    expect(markup).toContain('data-duct-diagram="round-to-rectangular"');
    expect(markup).toContain('data-field="airflowCfm" data-status="entered"');
    expect(markup).toContain('data-field="velocityFpm" data-status="calculated"');
    expect(markup).toContain('data-shape="equivalent-rectangle"');
    expect(markup).toContain('● Q 1,000 CFM');
    expect(markup).toContain('✓ V');
    expect(markup).toContain('same airflow');
    expect(markup).toContain(`ΔP ${viewFrictionDelta(solution)} · within ±10%`);
    expect(markup).not.toContain('same friction');
    expect(markup).toContain('Round duct flow diagram.');
    expect(markup).toContain('aria-describedby=');

    const aspectRatioMatch = markup.match(/data-rendered-aspect-ratio="([^"]+)"/);
    expect(aspectRatioMatch).not.toBeNull();
    expect(Number(aspectRatioMatch![1])).toBeCloseTo(
      rectangularEquivalents(solution.diameterIn, solution.airflowCfm)[0].aspectRatio,
      8,
    );
  });

  it('bounds long raw values in the SVG while preserving the full accessible value', () => {
    const longRawValue = '12345678901234567890.123456789';
    const view = buildDuctDiagramView({
      manualOrder: ['airflowCfm'],
      rawValues: { airflowCfm: longRawValue },
      unitSystem: 'imperial',
    });
    const markup = renderToStaticMarkup(createElement(DuctFlowDiagram, {
      manualOrder: ['airflowCfm'],
      rawValues: { airflowCfm: longRawValue },
      unitSystem: 'imperial',
    }));

    expect(view.metrics.airflowCfm.value).toBe(longRawValue);
    expect(view.metrics.airflowCfm.displayValue).toBe('12345678…');
    expect(markup).toContain('● Q 12345678… CFM');
    expect(markup).toContain('data-display-truncated="true"');
    expect(markup).toContain('data-text-fit="true"');
    expect(markup).toContain(`Air flow, Q: ${longRawValue} CFM, entered.`);
    expect(markup).not.toContain(`● Q ${longRawValue} CFM`);
  });

  it('keeps an invalid two-input state explicit without inventing solved values', () => {
    const view = buildDuctDiagramView({
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '1000', diameterIn: '-2' },
      unitSystem: 'imperial',
      error: 'Use positive numbers in both input fields.',
    });

    expect(view.progressText).toBe('Check the two entered values');
    expect(view.metrics.airflowCfm.status).toBe('entered');
    expect(view.metrics.diameterIn.status).toBe('entered');
    expect(view.metrics.velocityFpm.status).toBe('expected');
    expect(view.metrics.frictionRate.status).toBe('expected');
    expect(view.ariaText).toContain('Use positive numbers in both input fields.');
  });

  it('does not present a low-flow surrogate as a verified rectangular equivalent', () => {
    const solution = solveRoundDuct({ airflowCfm: 0.1, diameterIn: 5.8 });
    const view = buildDuctDiagramView({
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '0.1', diameterIn: '5.8' },
      solution,
      unitSystem: 'imperial',
    });
    const markup = renderToStaticMarkup(createElement(DuctFlowDiagram, {
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '0.1', diameterIn: '5.8' },
      solution,
      unitSystem: 'imperial',
    }));

    expect(view.rectangle).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'low-flow',
      value: undefined,
    });
    expect(view.metrics.frictionRate.value).not.toBe('0');
    expect(view.metrics.frictionRate.displayValue).toMatch(/e−\d+$/);
    expect(formatInput(solution.frictionRate)).toMatch(/e-\d+$/);
    expect(formatInput(solution.frictionRate)).not.toBe('0');
    expect(view.ariaText).toContain('not shown for laminar or transitional flow');
    expect(markup).toContain('— NO EQUIVALENT');
    expect(markup).toContain('LOW-FLOW RANGE');
    expect(markup).toContain('laminar / transition');
    expect(markup).not.toContain('W × H');
    expect(markup).not.toContain('same airflow');
  });

  it('distinguishes a solved no-catalog-match state from an expected input', () => {
    const solution = solveRoundDuct({ airflowCfm: 100, diameterIn: 1 });
    const view = buildDuctDiagramView({
      manualOrder: ['airflowCfm', 'diameterIn'],
      rawValues: { airflowCfm: '100', diameterIn: '1' },
      solution,
      unitSystem: 'imperial',
    });

    expect(view.rectangle).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'catalog',
      value: undefined,
    });
    expect(view.ariaText).toContain('No built-in standard rectangular match');
  });
});

function viewFrictionDelta(solution: ReturnType<typeof solveRoundDuct>): string {
  const difference = rectangularEquivalents(
    solution.diameterIn,
    solution.airflowCfm,
  )[0].frictionDifferencePercent;
  const sign = difference < 0 ? '−' : '+';
  const magnitude = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    useGrouping: true,
  }).format(Math.abs(difference));
  return `${sign}${magnitude}%`;
}
