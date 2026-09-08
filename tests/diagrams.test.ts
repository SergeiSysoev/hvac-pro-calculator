import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  calculatorDiagramView,
  calculatorExpressionView,
  readableMeasurement,
  type CalculatorDiagramMetric,
  type CalculatorDiagramView,
} from '@/lib/calculator/presentation';
import {
  type CalculatorState,
  type KeyId,
  calculatorReducer,
  initialCalculatorState,
} from '@/lib/calculator/engine';
import { formatValue } from '@/lib/calculator/core';
import CalculatorDiagram, { buildSegmentSvgGeometry } from '@/components/calculator/CalculatorDiagram';

function run(keys: KeyId[], initial = initialCalculatorState()): CalculatorState {
  return keys.reduce((state, key) => calculatorReducer(state, { type: 'press', key }), initial);
}

function diagram(keys: KeyId[], initial?: CalculatorState): CalculatorDiagramView {
  const result = calculatorDiagramView(run(keys, initial));
  expect(result).toBeDefined();
  return result!;
}

function metric(view: CalculatorDiagramView, id: string): CalculatorDiagramMetric {
  const result = view.metrics.find((item) => item.id === id);
  expect(result, `missing diagram metric ${id}`).toBeDefined();
  return result!;
}

function advanceToLabel(
  initial: CalculatorState,
  trigger: KeyId,
  label: string,
  occurrence = 1,
): CalculatorState {
  let state = initial;
  let seen = 0;
  const resultCount = state.sequence?.results.length ?? 0;

  for (let step = 0; step <= resultCount; step += 1) {
    if (state.display.label === label) {
      seen += 1;
      if (seen === occurrence) return state;
    }
    state = run([trigger], state);
  }

  throw new Error(`Could not reach ${label} occurrence ${occurrence}`);
}

function taggedPath(markup: string, attribute: string, value: string): string {
  const result = markup.match(new RegExp(`<path[^>]*${attribute}="${value}"[^>]*>`))?.[0];
  expect(result, `missing path ${attribute}=${value}`).toBeDefined();
  return result!;
}

function metricLabelX(markup: string, id: string): number {
  const value = markup.match(new RegExp(`<g[^>]+data-metric="${id}"[^>]*><text x="([^"]+)"`))?.[1];
  expect(value, `missing label position for ${id}`).toBeDefined();
  return Number(value);
}

describe('calculation diagrams', () => {
  it('maps stored, expected, and solved right-triangle values without guessing', () => {
    const storedRun = run(['8', 'feet', 'run']);
    const staged = calculatorDiagramView(storedRun)!;

    expect(staged.kind).toBe('right-triangle');
    expect(metric(staged, 'x')).toMatchObject({ status: 'entered', value: '8′ 0″' });
    expect(metric(staged, 'y')).toMatchObject({ status: 'expected', value: undefined });
    expect(metric(staged, 'r')).toMatchObject({ status: 'expected', value: undefined });
    expect(metric(staged, 'theta')).toMatchObject({ status: 'expected', value: undefined });

    const typing = calculatorDiagramView(run(['2'], storedRun))!;
    expect(typing.pendingEntry).toBe(true);
    expect(metric(typing, 'y').value).toBeUndefined();
    expect(typing.ariaText).toContain('not assigned until a geometry key is pressed');

    const solved = diagram([
      '8', 'feet', 'run',
      '6', 'feet', 'rise',
      'diag',
    ]);
    expect(metric(solved, 'x').status).toBe('entered');
    expect(metric(solved, 'y').status).toBe('entered');
    expect(metric(solved, 'r')).toMatchObject({ status: 'calculated', active: true });
    expect(metric(solved, 'theta').status).toBe('calculated');
  });

  it('keeps Run/Rise guidance aligned with the visible right-triangle drawing', () => {
    const state = run([
      '8', 'feet', 'run',
      '6', 'feet', 'rise',
    ]);
    const view = calculatorDiagramView(state)!;
    const expression = calculatorExpressionView(state);

    expect(view.kind).toBe('right-triangle');
    expect(expression.guidanceText).toContain('Run and Rise are ready');
    expect(expression.guidanceText).toContain('Diagonal or Pitch');
    expect(expression.guidanceText).toContain('Conv + Pitch for the segment radius');
  });

  it('tracks the current result while Circle cycles through diameter, circumference, and area', () => {
    const diameter = diagram(['6', 'inch', 'circ']);
    const circumference = diagram(['circ'], run(['6', 'inch', 'circ']));
    const area = diagram(['circ', 'circ'], run(['6', 'inch', 'circ']));

    expect(diameter.kind).toBe('circle');
    expect(metric(diameter, 'diameter')).toMatchObject({ status: 'entered', active: true });
    expect(metric(circumference, 'circumference')).toMatchObject({ status: 'calculated', active: true });
    expect(metric(area, 'area')).toMatchObject({ status: 'calculated', active: true });
  });

  it('keeps the entered resolution on the Circle drawing for tiny diameters', () => {
    const tiny = diagram(['1', 'fraction', '6', '4', 'circ']);

    expect(metric(tiny, 'diameter')).toMatchObject({
      value: '1/64″',
      status: 'entered',
      active: true,
    });
    expect(metric(tiny, 'radius')).toMatchObject({
      value: '0.007813″',
      status: 'calculated',
    });
  });

  it('keeps exact entered fractions in Triangle and Arc diagrams', () => {
    const runState = run(['3', 'fraction', '6', '4', 'run']);
    const arcState = run([
      '1', '0', 'conv', 'pitch',
      '3', 'fraction', '6', '4', 'conv', 'circ',
    ]);

    expect(metric(calculatorDiagramView(runState)!, 'x')).toMatchObject({
      value: '3/64″',
      status: 'entered',
      active: true,
    });
    expect(metric(calculatorDiagramView(arcState)!, 'arc')).toMatchObject({
      symbol: 's',
      value: '3/64″',
      status: 'entered',
      active: true,
    });
  });

  it('keeps the initial entered Arc angle identical on the screen and drawing', () => {
    const state = run([
      '1', '0', 'inch', 'conv', 'pitch',
      '6', '0', 'conv', 'circ',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(state.display).toMatchObject({ label: 'ARC', valueText: '60.00', unitText: 'DEG' });
    expect(metric(view, 'arc')).toMatchObject({ value: '60.00°', status: 'entered', active: true });
  });

  it('keeps exact decimal inputs aligned between the screen and every geometry drawing', () => {
    const runState = run([...['0', 'decimal', '0', '4'] as KeyId[], 'inch', 'run']);
    expect(metric(calculatorDiagramView(runState)!, 'x')).toMatchObject({
      value: '0.04″',
      status: 'entered',
    });

    const offset = run([
      '0', 'decimal', '0', '3', 'inch', 'run',
      '0', 'decimal', '0', '4', 'inch', 'rise',
      '0', 'decimal', '0', '1', 'inch', 'conv', '4',
      'conv', 'left',
    ]);
    const offsetX = run(['left', 'left', 'left', 'left', 'left'], offset);
    const offsetView = calculatorDiagramView(offsetX)!;
    expect(offsetX.display.valueText).toBe('0.03');
    expect(metric(offsetView, 'x')).toMatchObject({ value: '0.03″', status: 'entered', active: true });
    expect(metric(offsetView, 'y')).toMatchObject({ value: '0.04″', status: 'entered' });
    expect(metric(offsetView, 'a')).toMatchObject({ value: '0.01″', status: 'entered' });

    const lawCos = run([
      '0', 'decimal', '0', '3', 'conv', '4',
      '0', 'decimal', '0', '4', 'conv', '5',
      '0', 'decimal', '0', '5', 'conv', '6',
    ]);
    const lawView = calculatorDiagramView(lawCos)!;
    expect(metric(lawView, 'a').value).toBe('0.03″');
    expect(metric(lawView, 'b').value).toBe('0.04″');
    expect(metric(lawView, 'c').value).toBe('0.05″');

    const mixed = run(['8', 'feet', '2', 'decimal', '0', '3', 'inch', 'run']);
    expect(mixed.display.plainText).toBe('8′ 2.03″');
    expect(metric(calculatorDiagramView(mixed)!, 'x')).toMatchObject({
      value: '8′ 2.03″', status: 'entered', active: true,
    });
  });

  it('shows exact stored Jack and Stair settings in their synchronized drawings', () => {
    const pitch = run(['7', 'inch', '3', 'fraction', '6', '4', 'pitch']);
    const recalledPitch = run(['on', 'recall', 'pitch'], pitch);
    expect(metric(calculatorDiagramView(recalledPitch)!, 'theta')).toMatchObject({
      label: 'Stored pitch',
      value: '7 3/64″',
      status: 'entered',
      active: true,
    });

    const storedJack = run(['1', '5', 'inch', '3', 'fraction', '6', '4', 'jack']);
    expect(metric(calculatorDiagramView(storedJack)!, 'spacing')).toMatchObject({
      value: '15 3/64″',
      status: 'entered',
      active: true,
    });

    const storedRiser = run(['7', 'inch', '3', 'fraction', '6', '4', 'conv', 'stair']);
    expect(metric(calculatorDiagramView(storedRiser)!, 'riser')).toMatchObject({
      value: '7 3/64″',
      status: 'entered',
      active: true,
    });
  });

  it('keeps decimal settings exact in Stair and Arc drawings', () => {
    let stairs = run(['1', '0', 'feet', 'rise', '1', '2', 'feet', 'run', 'stair']);
    stairs = calculatorReducer(stairs, { type: 'set-preference', key: 'treadWidth', value: 10.03 });
    stairs = calculatorReducer(stairs, { type: 'set-preference', key: 'headroom', value: 80.03 });
    stairs = calculatorReducer(stairs, { type: 'set-preference', key: 'floorThickness', value: 11.03 });

    const tread = advanceToLabel(stairs, 'stair', 'T-WD STORED');
    expect(metric(calculatorDiagramView(tread)!, 'tread')).toMatchObject({
      value: '10.03″', status: 'entered', active: true,
    });
    const headroom = advanceToLabel(stairs, 'stair', 'HDRM STORED');
    expect(metric(calculatorDiagramView(headroom)!, 'headroom')).toMatchObject({
      value: '80.03″', status: 'entered', active: true,
    });
    const floor = advanceToLabel(stairs, 'stair', 'FLOR STORED');
    expect(metric(calculatorDiagramView(floor)!, 'floor')).toMatchObject({
      value: '11.03″', status: 'entered', active: true,
    });

    const spaced = calculatorReducer(initialCalculatorState(), {
      type: 'set-preference', key: 'onCenter', value: 15.03,
    });
    const arc = run([
      '2', '0', 'inch', 'conv', 'pitch',
      '6', '0', 'conv', 'circ',
    ], spaced);
    const oc = advanceToLabel(arc, 'circ', 'OC');
    expect(metric(calculatorDiagramView(oc)!, 'spacing')).toMatchObject({
      value: '15.03″', status: 'entered', active: true,
    });
  });

  it('does not show stale geometry behind an unrelated committed operand', () => {
    const triangle = run(['8', 'feet', 'run']);
    const recalled = run(['4', '2', 'conv', '1', 'on', 'recall', '1'], triangle);
    const constant = run(['conv', 'pi'], triangle);
    const metricValue = run(['2', 'meter'], triangle);
    const stored = run(['4', '2', 'conv', '1'], triangle);

    expect(recalled.display.label).toBe('M-1 STORED');
    expect(calculatorDiagramView(recalled)).toBeUndefined();
    expect(calculatorDiagramView(constant)).toBeUndefined();
    expect(calculatorDiagramView(metricValue)).toBeUndefined();
    expect(calculatorDiagramView(stored)).toBeUndefined();

    const rawEntry = run(['4', '2'], triangle);
    expect(calculatorDiagramView(rawEntry)?.kind).toBe('right-triangle');
    expect(calculatorDiagramView(rawEntry)?.pendingEntry).toBe(true);
  });

  it('removes stale Segment and Fan Law drawings when a constant becomes current', () => {
    const segment = run([
      '1', '0', 'inch', 'conv', 'pitch',
      '8', 'inch', 'run',
    ]);
    expect(calculatorDiagramView(segment)?.kind).toBe('segment');
    expect(calculatorDiagramView(run(['pi'], segment))).toBeUndefined();

    const fan = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);
    expect(calculatorDiagramView(fan)?.kind).toBe('fan-law');
    expect(calculatorDiagramView(run(['pi'], fan))).toBeUndefined();
  });

  it('keeps Offset and Law-of-Cosines drawings on their immutable result snapshots', () => {
    const offset = run([
      '1', '0', 'inch', 'run',
      '5', 'inch', 'rise',
      '2', 'inch', 'conv', '4',
      'conv', 'left',
    ]);
    const storageOverlay = run(['conv', '4'], offset);
    const storageView = calculatorDiagramView(storageOverlay)!;
    expect(storageOverlay.display.label).toBe('A STORED');
    expect(metric(storageView, 'a')).toMatchObject({
      value: readableMeasurement(storageOverlay.display.plainText),
      status: 'entered',
      active: true,
    });
    for (const id of ['radius', 'wrapper', 'heel', 'throat', 'theta']) {
      expect(metric(storageView, id).value).toBeUndefined();
    }

    const resumedOffset = run(['conv', '4', 'left'], offset);
    const offsetView = calculatorDiagramView(resumedOffset)!;
    expect(resumedOffset.display.label).toBe('WL');
    expect(metric(offsetView, 'a').value).toBe('2″');
    expect(resumedOffset.registers.a?.amount).not.toBe(2);

    const law = run([
      '3', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      'conv', '9',
    ]);
    const resumedLaw = run(['conv', '4', '9'], law);
    const lawView = calculatorDiagramView(resumedLaw)!;
    expect(resumedLaw.display.label).toBe('∠B');
    expect(metric(lawView, 'a').value).toBe('3″');
    expect(metric(lawView, 'b').value).toBe('4″');
    expect(metric(lawView, 'c').value).toBe('5″');
    expect(resumedLaw.registers.a?.angle).toBe(true);
  });

  it('never attempts to draw non-finite Stair geometry after an invalid tiny setting', () => {
    const tinyRiser = run(['0', 'decimal', '0', '3', 'inch', 'conv', 'stair']);
    const errored = run(['1', '0', 'feet', 'rise', '1', '2', 'feet', 'run', 'stair'], tinyRiser);
    expect(errored.display).toMatchObject({ label: 'ERROR', valueText: 'DIM Error' });
    expect(() => calculatorDiagramView(errored)).not.toThrow();
    expect(calculatorDiagramView(errored)).toBeUndefined();
  });

  it('shows circular-segment inputs and upgrades to the arched-wall drawing', () => {
    const segment = run([
      '1', '0', 'feet', 'conv', 'pitch',
      '3', 'feet', 'run',
    ]);
    const segmentView = calculatorDiagramView(segment)!;
    expect(segmentView).toMatchObject({ kind: 'segment', variant: 'segment' });
    expect(metric(segmentView, 'radius').status).toBe('entered');
    expect(metric(segmentView, 'chord').status).toBe('entered');
    expect(metric(segmentView, 'rise').status).toBe('expected');

    const arcView = diagram(['conv', 'circ'], segment);
    expect(arcView).toMatchObject({ kind: 'segment', variant: 'arc' });
    expect(metric(arcView, 'arc')).toMatchObject({ status: 'calculated', active: true });
  });

  it('retires a stale explicit Arc when a new chord is entered', () => {
    const state = run([
      '1', '0', 'conv', 'pitch',
      '6', '0', 'conv', 'circ',
      '8', 'run',
    ]);
    const view = calculatorDiagramView(state)!;
    const expectedTheta = 2 * Math.asin(8 / 20) * 180 / Math.PI;

    expect(view).toMatchObject({ kind: 'segment', variant: 'segment' });
    expect(view.geometry?.theta).toBeCloseTo(expectedTheta, 8);
    expect(view.geometry?.theta).not.toBeCloseTo(60, 8);
    expect(metric(view, 'chord')).toMatchObject({ value: '8″', status: 'entered' });
    expect(metric(view, 'arc')).toMatchObject({ value: undefined, status: 'expected' });
  });

  it('keeps a fresh Triangle workflow ahead of an older stored segment radius', () => {
    const state = run([
      '1', '0', 'conv', 'pitch',
      '8', 'run',
      '3', '0', 'pitch',
      'rise',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view).toMatchObject({ kind: 'right-triangle', variant: 'triangle' });
    expect(metric(view, 'x').status).toBe('entered');
    expect(metric(view, 'theta').status).toBe('entered');
    expect(metric(view, 'y')).toMatchObject({ status: 'calculated', active: true });
  });

  it('switches an older Triangle drawing to a newly stored Segment radius', () => {
    const state = run([
      '8', 'feet', 'run',
      '1', '0', 'inch', 'conv', 'pitch',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('RAD');
    expect(view).toMatchObject({ kind: 'segment', variant: 'segment' });
    expect(metric(view, 'radius')).toMatchObject({ value: '10″', status: 'entered', active: true });
  });

  it('draws a newly stored Ir/Pitch on the irregular roof, not on the regular Pitch triangle', () => {
    const state = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('IPCH');
    expect(view).toMatchObject({ kind: 'roof', variant: 'ir-hip' });
    expect(view.geometry?.memberSide).toBe('irregular');
    expect(metric(view, 'irregular-pitch')).toMatchObject({
      status: 'entered',
      active: true,
      value: readableMeasurement(formatValue(state.current!, state.preferences).plainText),
    });
    // The regular pitch stays on the drawing as the other roof plane, but it is
    // never the value the operator is entering.
    expect(metric(view, 'pitch')).toMatchObject({ status: 'entered', active: false });
  });

  it('keeps the Ir/Pitch guidance describing the roof that is drawn', () => {
    const stored = run(['7', 'inch', 'pitch', '8', 'inch', 'conv', 'hip']);
    const recalled = run(['recall', 'conv', 'hip'], run(['on'], stored));

    expect(calculatorDiagramView(stored)).toMatchObject({ kind: 'roof', variant: 'ir-hip' });
    const storedGuidance = calculatorExpressionView(stored).guidanceText!;
    expect(storedGuidance).toContain('Hip/V');
    // Diagonal belongs to the plain right triangle, not to the roof on screen.
    expect(storedGuidance).not.toContain('Diagonal');

    expect(recalled.display.label).toBe('IPCH STORED');
    expect(calculatorExpressionView(recalled).guidanceText).toContain('irregular pitch');
  });

  it('never marks a pitch solved from other geometry as the entered one', () => {
    // A pitch is stored, but the slope that follows is solved from a segment
    // chord, so every step of the cycle describes a calculated angle.
    let state = run([
      '6', 'inch', 'pitch',
      '1', '0', 'inch', 'rise',
      '1', '0', '0', 'inch', 'conv', 'pitch',
      'run',
      'pitch',
    ]);
    for (let step = 0; step < state.sequence!.results.length; step += 1) {
      const active = calculatorDiagramView(state)!.metrics.filter((item) => item.active);
      expect(active, `${state.display.label} must identify one element`).toHaveLength(1);
      expect(active[0].status, `${state.display.label} is not an entered value`).toBe('calculated');
      state = run(['pitch'], state);
    }
  });

  it('keeps a stored pitch entered - and exact - however the triangle was cleared', () => {
    // Entering any side mirrors the stored pitch into the triangle, so these
    // paths differ only in whether theta stays listed as an input. The operator
    // entered 7-3/64" in every one of them, and must see that, not 7-1/16".
    const paths: KeyId[][] = [
      ['7', 'inch', '3', 'fraction', '6', '4', 'pitch', 'on', '4', 'feet', 'run', 'pitch'],
      ['7', 'inch', '3', 'fraction', '6', '4', 'pitch', 'off', 'on', '4', 'feet', 'run', 'pitch'],
      ['7', 'inch', '3', 'fraction', '6', '4', 'pitch', 'off', 'on', '4', 'feet', 'rise', 'pitch'],
      ['7', 'inch', '3', 'fraction', '6', '4', 'pitch', 'off', 'on', '4', 'feet', 'diag', 'pitch'],
    ];
    for (const keys of paths) {
      let state = run(keys);
      for (let step = 0; step < state.sequence!.results.length; step += 1) {
        if (state.display.label.trim() === 'PTCH') break;
        state = run(['pitch'], state);
      }
      const active = calculatorDiagramView(state)!.metrics.filter((item) => item.active);
      expect(state.display.label.trim(), keys.join(' ')).toBe('PTCH');
      expect(state.display.plainText, keys.join(' ')).toContain('3/64');
      expect(active[0].status, keys.join(' ')).toBe('entered');
    }
  });

  it('keeps the Ir/Pitch drawing equal to the Ir/Pitch screen in every notation', () => {
    // irregularPitch() normalizes the screen to rise-per-12, so a pitch typed as
    // degrees or percent must not stay in that notation on the drawing.
    for (const keys of [
      ['8', 'inch', 'conv', 'hip'],
      ['8', 'conv', 'hip'],
      ['3', '0', 'conv', 'hip'],
    ] as KeyId[][]) {
      const state = run(['7', 'inch', 'pitch', ...keys]);
      const view = calculatorDiagramView(state)!;
      expect(metric(view, 'irregular-pitch').value, keys.join(' '))
        .toBe(readableMeasurement(state.display.plainText));
    }
  });

  it('keeps a stored irregular pitch from shadowing other stored-value drawings', () => {
    const base = run(['7', 'inch', 'pitch', '8', 'inch', 'conv', 'hip']);

    expect(calculatorDiagramView(run(['recall', 'pitch'], base)))
      .toMatchObject({ kind: 'right-triangle' });
    expect(calculatorDiagramView(run(['recall', 'jack'], base)))
      .toMatchObject({ kind: 'roof', variant: 'jacks' });
    expect(calculatorDiagramView(run(['recall', 'stair'], base)))
      .toMatchObject({ kind: 'stairs' });
    expect(calculatorDiagramView(run(['1', '6', 'inch', 'jack'], base)))
      .toMatchObject({ kind: 'roof', variant: 'jacks' });
    expect(calculatorDiagramView(run(['7', 'inch', 'conv', 'stair'], base)))
      .toMatchObject({ kind: 'stairs' });

    // An unrelated committed operand carries no roof, exactly as it carries no
    // triangle in the regular Pitch workflow.
    expect(calculatorDiagramView(run(['5', 'mplus'], base))).toBeUndefined();
    expect(calculatorDiagramView(run(['pi'], base))).toBeUndefined();
    expect(calculatorDiagramView(run(['5', 'mplus'], run(['7', 'inch', 'pitch'])))).toBeUndefined();
  });

  it('labels both roof planes on the Ir/Pitch drawing and only there', () => {
    const irregular = run(['7', 'inch', 'pitch', '8', 'inch', 'conv', 'hip']);
    const irregularMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: calculatorDiagramView(irregular)!,
    }));

    // Both slopes are named, and the one being entered is the highlighted side.
    expect(irregularMarkup).toContain('data-metric="pitch"');
    expect(irregularMarkup).toContain('data-metric="irregular-pitch"');
    expect(irregularMarkup).toMatch(/class="[^"]*is-current[^"]*" data-metric="irregular-pitch"/);
    expect(irregularMarkup).not.toMatch(/class="[^"]*is-current[^"]*" data-metric="pitch"/);

    // An ordinary hip roof has a single pitch, so it must not grow these labels.
    const regular = run(['7', 'inch', 'pitch', '1', '0', 'feet', 'run', 'hip']);
    const regularMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: calculatorDiagramView(regular)!,
    }));
    expect(regularMarkup).not.toContain('data-metric="irregular-pitch"');

    // The shared roof canvas always draws run/rise/hip, so the irregular view
    // has to name them the way every other roof view does.
    const view = calculatorDiagramView(irregular)!;
    expect(metric(view, 'run').symbol).toBe('x');
    expect(metric(view, 'rise').symbol).toBe('y');
    expect(metric(view, 'hip').symbol).toBe('H/V');
    expect(view.ariaText).toContain('Roof run');
  });

  it('keeps a recalled or edited Ir/Pitch on the irregular roof drawing', () => {
    const stored = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
      'on',
    ]);
    const recalled = run(['recall', 'conv', 'hip'], stored);
    const typing = run(['3'], recalled);
    const recalledView = calculatorDiagramView(recalled)!;
    const typingView = calculatorDiagramView(typing)!;

    expect(recalled.display.label).toBe('IPCH STORED');
    expect(recalledView).toMatchObject({ kind: 'roof', variant: 'ir-hip' });
    expect(metric(recalledView, 'irregular-pitch')).toMatchObject({
      status: 'entered',
      active: true,
    });
    // A number being typed is not assigned to the roof until a key stores it.
    expect(typingView).toMatchObject({ kind: 'roof', variant: 'ir-hip', pendingEntry: true });
  });

  it('keeps explicit Arc provenance and every calculated Arc step synchronized', () => {
    const oldTriangle = run([
      '3', 'feet', 'run',
      '4', 'feet', 'rise',
      '1', '0', 'feet', 'conv', 'pitch',
      '8', 'feet', 'run',
      '6', '0', 'conv', 'circ',
    ]);
    const entered = calculatorDiagramView(oldTriangle)!;
    expect(metric(entered, 'arc')).toMatchObject({ status: 'entered', active: true, value: '60.00°' });
    expect(metric(entered, 'chord').status).toBe('calculated');
    expect(metric(entered, 'rise').status).toBe('calculated');

    let state = oldTriangle;
    for (let step = 0; step < state.sequence!.results.length; step += 1) {
      state = run(['circ'], state);
      const view = calculatorDiagramView(state)!;
      const current = state.sequence!.results[state.sequence!.index];
      const active = view.metrics.filter((item) => item.active);
      expect(active, `Arc ${current.label} must identify one drawing element`).toHaveLength(1);
      expect(active[0].value).toBe(
        readableMeasurement(formatValue(current.value, state.preferences).plainText),
      );
      expect(active[0].status).toBe(current.label === 'OC' && state.onCenterStored
        ? 'entered'
        : 'calculated');
    }
  });

  it('labels an explicitly entered dimensional Arc value as arc length', () => {
    const state = run([
      '5', 'feet', 'circ',
      '3', 'feet', '3', 'inch', 'conv', 'circ',
    ]);
    const arc = metric(calculatorDiagramView(state)!, 'arc');

    expect(arc).toMatchObject({
      symbol: 's',
      label: 'Arc length',
      value: '3′ 3″',
      status: 'entered',
      active: true,
    });
  });

  it('does not relabel an entered chord as calculated when Arc cycles back to it', () => {
    const chordStep = run([
      '1', '0', 'feet', 'conv', 'pitch',
      '3', 'feet', 'run',
      'rise',
      'conv', 'circ',
      'circ',
      'circ',
    ]);
    const view = calculatorDiagramView(chordStep)!;

    expect(chordStep.display.label).toBe('CORD');
    expect(metric(view, 'chord')).toMatchObject({
      status: 'entered',
      active: true,
      value: '3′ 0″',
    });
  });

  it('synchronizes the calculated opposite segment side before drawing an Arc', () => {
    const chordDriven = run([
      '3', 'feet', 'run', '4', 'feet', 'rise',
      '1', '0', 'feet', 'conv', 'pitch',
      '8', 'feet', 'run',
      'conv', 'circ',
    ]);
    const chordView = calculatorDiagramView(chordDriven)!;
    // Segment rise is measured from the chord's midpoint, so the leg of the
    // right triangle is the half-chord, not the whole chord.
    const expectedRise = 120 - Math.sqrt(120 ** 2 - (96 / 2) ** 2);
    expect(metric(chordView, 'chord')).toMatchObject({ value: '8′ 0″', status: 'entered' });
    expect(metric(chordView, 'rise')).toMatchObject({
      value: readableMeasurement(formatValue({
        amount: expectedRise, power: 1, unit: 'ft-in', system: 'imperial',
      }, chordDriven.preferences).plainText),
      status: 'calculated',
    });
    expect(chordDriven.circle.rise).toBeCloseTo(expectedRise, 10);

    const riseDriven = run([
      '3', 'feet', 'run', '4', 'feet', 'rise',
      '1', '0', 'feet', 'conv', 'pitch',
      '2', 'feet', 'rise',
      'conv', 'circ',
    ]);
    const riseView = calculatorDiagramView(riseDriven)!;
    const expectedChord = 2 * Math.sqrt(24 * (240 - 24));
    expect(metric(riseView, 'rise')).toMatchObject({ value: '2′ 0″', status: 'entered' });
    expect(metric(riseView, 'chord').status).toBe('calculated');
    expect(riseDriven.circle.chord).toBeCloseTo(expectedChord, 10);
  });

  it('shows only the authoritative segment input when a stored Radius conflicts with a pair', () => {
    const state = run([
      '2', '0', 'inch', 'conv', 'pitch',
      '1', '0', 'decimal', '0', '3', 'inch', 'run',
      '2', 'decimal', '0', '3', 'inch', 'rise',
      'conv', 'circ',
    ]);
    const view = calculatorDiagramView(state)!;
    const expectedChord = 2 * Math.sqrt(2.03 * (40 - 2.03));

    expect(state.circle.radius).toBe(20);
    expect(state.circle.chord).toBeCloseTo(expectedChord, 10);
    expect(metric(view, 'rise')).toMatchObject({ value: '2.03″', status: 'entered' });
    expect(metric(view, 'chord').status).toBe('calculated');
    expect(metric(view, 'chord').value).not.toBe('10.03″');
  });

  it('keeps the Segment drawing while the first post-radius operand is being typed', () => {
    const radius = run(['1', '0', 'inch', 'conv', 'pitch']);
    const typing = run(['3'], radius);
    const view = calculatorDiagramView(typing)!;
    expect(view).toMatchObject({ kind: 'segment', variant: 'segment', pendingEntry: true });
    expect(metric(view, 'chord').status).toBe('expected');
    expect(metric(view, 'rise').status).toBe('expected');
  });

  it('does not resurrect an old Triangle while typing after a fresh Circle', () => {
    const state = run([
      '8', 'feet', 'run',
      '6', 'feet', 'rise',
      '6', 'inch', 'circ',
      '3',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view.kind).toBe('segment');
    expect(view.pendingEntry).toBe(true);
    expect(metric(view, 'radius').value).toBe('3″');
  });

  it('builds a mathematically consistent minor and major circular-segment schematic', () => {
    for (const theta of [60, 240]) {
      const shape = buildSegmentSvgGeometry({ radius: 10, theta });
      const distance = (point: { x: number; y: number }) => Math.hypot(
        point.x - shape.center.x,
        point.y - shape.center.y,
      );
      expect(distance(shape.left)).toBeCloseTo(shape.radius, 1);
      expect(distance(shape.right)).toBeCloseTo(shape.radius, 1);
      expect(distance(shape.apex)).toBeCloseTo(shape.radius, 8);
      expect(shape.left.y).toBeCloseTo(shape.right.y, 8);
      expect(shape.apex.x).toBe(shape.center.x);
      expect(shape.largeArc).toBe(theta > 180 ? 1 : 0);
    }

    const shallowFieldSegment = buildSegmentSvgGeometry({ radius: 120, chord: 36 });
    expect(shallowFieldSegment.right.x - shallowFieldSegment.left.x).toBeGreaterThan(55);
    expect(shallowFieldSegment.chordY - shallowFieldSegment.apex.y).toBeGreaterThan(8);
  });

  it('draws SEG as a circular segment and PIE as a sector to the center', () => {
    const arc = run([
      '1', '0', 'feet', 'conv', 'pitch',
      '6', '0', 'conv', 'circ',
    ]);
    const segment = run(['circ', 'circ', 'circ'], arc);
    const sector = run(['circ'], segment);
    const segmentView = calculatorDiagramView(segment)!;
    const sectorView = calculatorDiagramView(sector)!;
    const segmentMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: segmentView }));
    const sectorMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: sectorView }));

    expect(metric(segmentView, 'segment-area')).toMatchObject({ active: true, status: 'calculated' });
    expect(metric(sectorView, 'sector-area')).toMatchObject({ active: true, status: 'calculated' });
    expect(segmentMarkup).toContain('data-area-kind="segment"');
    expect(segmentMarkup).not.toContain('data-area-kind="sector"');
    expect(sectorMarkup).toContain('data-area-kind="sector"');
    expect(sectorMarkup).not.toContain('data-area-kind="segment"');
    expect(segmentMarkup).toMatch(/data-area-kind="segment"[^>]+L[^>]+Z/);
    expect(sectorMarkup).toMatch(/data-area-kind="sector"[^>]+L90 91 Z/);
  });

  it('moves the highlighted arched-wall member as AW results advance', () => {
    const arc = run([
      '1', '0', 'feet', 'conv', 'pitch',
      '6', '0', 'conv', 'circ',
    ]);
    const aw1 = run(['circ', 'circ', 'circ', 'circ', 'circ', 'circ', 'circ'], arc);
    const aw2 = run(['circ'], aw1);
    const firstView = calculatorDiagramView(aw1)!;
    const secondView = calculatorDiagramView(aw2)!;
    const firstMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: firstView }));
    const secondMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: secondView }));

    expect(aw1.display.label).toBe('AW1');
    expect(aw2.display.label).toBe('AW2');
    expect(firstView.geometry?.memberIndex).toBe(1);
    expect(secondView.geometry?.memberIndex).toBe(2);
    expect(metric(firstView, 'member')).toMatchObject({ active: true, status: 'calculated' });
    expect(firstMarkup).toMatch(/data-arc-member="AW1" class="[^"]*is-current[^"]*"/);
    expect(secondMarkup).toMatch(/data-arc-member="AW2" class="[^"]*is-current[^"]*"/);
    expect(firstMarkup.match(/data-arc-member="AW1"[^>]+d="([^"]+)"/)?.[1])
      .not.toBe(secondMarkup.match(/data-arc-member="AW2"[^>]+d="([^"]+)"/)?.[1]);
  });

  it('shows one AW member label without duplicating the stored spacing label', () => {
    const storedOnCenter = run(['1', '6', 'jack', 'on']);
    const arc = run([
      '1', '0', 'feet', 'conv', 'pitch',
      '6', '0', 'conv', 'circ',
    ], storedOnCenter);
    const aw1 = run(['circ', 'circ', 'circ', 'circ', 'circ', 'circ', 'circ'], arc);
    const view = calculatorDiagramView(aw1)!;
    const markup = renderToStaticMarkup(createElement(CalculatorDiagram, { view }));

    expect(aw1.display.label).toBe('AW1');
    expect(metric(view, 'spacing').status).toBe('entered');
    expect(metric(view, 'member')).toMatchObject({ active: true, status: 'calculated' });
    expect(markup).toContain('data-metric="member"');
    expect(markup).not.toContain('data-metric="spacing"');
  });

  it('provides dedicated views for Offset and Law of Cosines', () => {
    const offset = diagram([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    expect(offset.kind).toBe('offset');
    expect(metric(offset, 'x').status).toBe('entered');
    expect(metric(offset, 'y').status).toBe('entered');
    expect(metric(offset, 'a').status).toBe('entered');
    expect(metric(offset, 'radius')).toMatchObject({ status: 'calculated', active: true });

    const lawCosines = diagram([
      '3', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      'conv', '9',
    ]);
    expect(lawCosines.kind).toBe('law-cosines');
    expect(['a', 'b', 'c'].map((id) => metric(lawCosines, id).status))
      .toEqual(['entered', 'entered', 'entered']);
    expect(metric(lawCosines, 'angle-a')).toMatchObject({ status: 'calculated', active: true });
  });

  it('keeps a calculated Offset leg calculated while cycling through results', () => {
    const staged = run([
      '8', 'feet', 'run',
      '3', '0', 'pitch',
      'rise',
      '7', 'feet', 'conv', '4',
      'conv', 'left',
    ]);
    const riseResult = advanceToLabel(staged, 'left', 'Y');
    const view = calculatorDiagramView(riseResult)!;

    expect(view.kind).toBe('offset');
    expect(metric(view, 'x').status).toBe('entered');
    expect(metric(view, 'y')).toMatchObject({ status: 'calculated', active: true });
  });

  it('places Law-of-Cosines angles at their opposite-side vertices', () => {
    const angleA = run([
      '3', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      'conv', '9',
    ]);
    const angleB = run(['9'], angleA);
    const angleC = run(['9'], angleB);
    const angleBMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: calculatorDiagramView(angleB)!,
    }));
    const angleCMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: calculatorDiagramView(angleC)!,
    }));

    expect(angleBMarkup).toMatch(
      /data-law-angle="B" class="[^"]*is-current[^"]*" d="M145 77/,
    );
    expect(angleCMarkup).toMatch(
      /data-law-angle="C" class="[^"]*is-current[^"]*" d="M79 28/,
    );
  });

  it('shows new Law-of-Cosines staging instead of stale triangle geometry', () => {
    const state = run([
      '8', 'feet', 'run',
      '6', 'feet', 'rise',
      '3', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view.kind).toBe('law-cosines');
    expect(metric(view, 'a').value).toBe('3″');
    expect(metric(view, 'b').value).toBe('4″');
    expect(metric(view, 'c')).toMatchObject({ value: '5″', active: true });
    expect(calculatorExpressionView(state).guidanceText).toContain('A, B, and C are ready');
  });

  it('shows new Fan Law staging even when a stale C register exists', () => {
    const state = run([
      '9', 'conv', '6',
      '1', '2', '5', '0', 'conv', '7',
      '7', '5', '0', 'conv', '8',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view.kind).toBe('fan-law');
    expect(metric(view, 'b-new')).toMatchObject({ value: '750', active: true });
  });

  it('keeps shared A and B registers in Fan Law staging once An is stored', () => {
    const state = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('B STORED');
    expect(view.kind).toBe('fan-law');
    expect(metric(view, 'a')).toMatchObject({ value: '1250', status: 'entered' });
    expect(metric(view, 'a-new')).toMatchObject({ value: '1400', status: 'entered' });
    expect(metric(view, 'b')).toMatchObject({ value: '750', status: 'entered', active: true });
    expect(calculatorExpressionView(state).guidanceText).toContain('Three Fan Law values are ready');
  });

  it('retains calculated Fan Law provenance after On/C', () => {
    const solved = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);
    const cleared = run(['on'], solved);
    const view = calculatorDiagramView(cleared)!;

    expect(view.kind).toBe('fan-law');
    expect(metric(view, 'b-new').status).toBe('calculated');
  });

  it('shows a bare Offset End-A input as inches and highlights each distinct curve', () => {
    let state = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'conv', '4',
      'conv', 'left',
    ]);
    const curveSteps = [
      ['RAD', 'radius'],
      ['WL', 'wrapper'],
      ['HEEL', 'heel'],
      ['THRT', 'throat'],
    ] as const;

    for (const [label, id] of curveSteps) {
      const view = calculatorDiagramView(state)!;
      expect(state.display.label).toBe(label);
      expect(metric(view, id).active).toBe(true);
      expect(metric(view, 'a').value).toBe('7″');
      const markup = renderToStaticMarkup(createElement(CalculatorDiagram, { view }));
      const renderedPath = markup.match(new RegExp(`<path[^>]*data-offset-element="${id}"[^>]*>`))?.[0];
      expect(renderedPath).toContain('is-current');
      state = run(['left'], state);
    }
  });

  it('switches from stale Law-of-Cosines registers to a newly entered Run drawing', () => {
    const state = run([
      '3', 'conv', '4',
      '4', 'conv', '5',
      '5', 'conv', '6',
      '8', 'feet', 'run',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view.kind).toBe('right-triangle');
    expect(metric(view, 'x')).toMatchObject({ value: '8′ 0″', status: 'entered' });
    expect(calculatorExpressionView(state).guidanceText).toContain('Run is stored');
  });

  it('switches from a completed Fan Law to a newly entered Run drawing', () => {
    const state = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
      '8', 'feet', 'run',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view.kind).toBe('right-triangle');
    expect(metric(view, 'x')).toMatchObject({ value: '8′ 0″', status: 'entered', active: true });
    expect(calculatorExpressionView(state).guidanceText).toContain('Run is stored');
  });

  it('prefers a freshly calculated missing triangle leg over old Fan Law registers', () => {
    const fan = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);
    const calculatedRun = run([
      '3', 'feet', 'rise',
      '5', 'feet', 'diag',
      'run',
    ], fan);
    const calculatedRise = run([
      '4', 'feet', 'run',
      '5', 'feet', 'diag',
      'rise',
    ], fan);

    for (const [state, activeId] of [
      [calculatedRun, 'x'],
      [calculatedRise, 'y'],
    ] as const) {
      const view = calculatorDiagramView(state)!;
      expect(view.kind).toBe('right-triangle');
      expect(metric(view, activeId)).toMatchObject({ status: 'calculated', active: true });
    }
  });

  it('uses the Offset drawing and guidance while End A is staged', () => {
    const state = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '7', 'conv', '4',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(view.kind).toBe('offset');
    expect(metric(view, 'a')).toMatchObject({ value: '7″', status: 'entered', active: true });
    expect(calculatorExpressionView(state).guidanceText)
      .toBe('Run, Rise, and End A are ready. Tap Conv + ( to calculate the Offset.');
  });

  it('does not stage Offset for an invalid End A power or impossible throat geometry', () => {
    const wrongPower = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '2', 'feet', 'feet', 'conv', '4',
    ]);
    const impossibleThroat = run([
      '1', '0', 'feet', 'run',
      '5', 'feet', 'rise',
      '2', '0', '0', 'inch', 'conv', '4',
    ]);

    for (const state of [wrongPower, impossibleThroat]) {
      expect(state.display.label).toBe('A STORED');
      expect(calculatorDiagramView(state)?.kind).not.toBe('offset');
      expect(calculatorExpressionView(state).guidanceText).not.toContain('End A are ready');
    }
  });

  it('does not infer Offset from a cleared solved triangle followed by A storage', () => {
    const solvedTriangle = run([
      '8', 'feet', 'run',
      '6', 'feet', 'rise',
      'diag',
    ]);
    const storedA = run(['on', '3', 'conv', '4'], solvedTriangle);
    const view = calculatorDiagramView(storedA);
    const guidance = calculatorExpressionView(storedA).guidanceText;

    expect(storedA.display.label).toBe('A STORED');
    expect(view?.kind).not.toBe('offset');
    expect(guidance).not.toContain('End A are ready');
    expect(guidance).not.toContain('calculate the Offset');
  });

  it('switches the roof drawing between hip/valley and jack-rafter workflows', () => {
    const base = run(['7', 'inch', 'pitch', '4', 'feet', 'run']);
    const hip = diagram(['hip'], base);
    const jacks = diagram(['jack'], base);

    expect(hip).toMatchObject({ kind: 'roof', variant: 'hip' });
    expect(metric(hip, 'hip')).toMatchObject({ status: 'calculated', active: true });
    expect(jacks).toMatchObject({ kind: 'roof', variant: 'jacks' });
    expect(metric(jacks, 'spacing')).toBeDefined();
  });

  it('moves the highlighted jack rafter as the member index advances', () => {
    const base = run(['7', 'inch', 'pitch', '8', 'feet', 'run']);
    const jack1 = run(['jack', 'jack'], base);
    const jack2 = run(['jack'], jack1);
    const firstView = calculatorDiagramView(jack1)!;
    const secondView = calculatorDiagramView(jack2)!;
    const firstMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: firstView }));
    const secondMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: secondView }));

    expect(jack1.display.label).toBe('JK1');
    expect(jack2.display.label).toBe('JK2');
    expect(firstView.geometry).toMatchObject({ memberIndex: 1, memberSide: 'regular' });
    expect(secondView.geometry).toMatchObject({ memberIndex: 2, memberSide: 'regular' });
    expect(firstMarkup).toMatch(/data-jack-member="JK1"[^>]+class="[^"]*is-current[^"]*"/);
    expect(secondMarkup).toMatch(/data-jack-member="JK2"[^>]+class="[^"]*is-current[^"]*"/);
    expect(firstMarkup.match(/data-jack-member="JK1"[^>]+d="([^"]+)"/)?.[1])
      .not.toBe(secondMarkup.match(/data-jack-member="JK2"[^>]+d="([^"]+)"/)?.[1]);
  });

  it('moves JK1 to the opposite end of the roof plan when Jack order changes', () => {
    const base = run(['7', 'inch', 'pitch', '8', 'feet', 'run']);
    const ascendingBase = calculatorReducer(base, {
      type: 'set-preference',
      key: 'jackOrder',
      value: 'ascending',
    });
    const descending = run(['jack', 'jack'], base);
    const ascending = run(['jack', 'jack'], ascendingBase);
    const descendingView = calculatorDiagramView(descending)!;
    const ascendingView = calculatorDiagramView(ascending)!;
    const descendingMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: descendingView,
    }));
    const ascendingMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: ascendingView,
    }));
    const descendingPath = taggedPath(descendingMarkup, 'data-jack-member', 'JK1');
    const ascendingPath = taggedPath(ascendingMarkup, 'data-jack-member', 'JK1');

    expect(descending.display.label).toBe('JK1');
    expect(ascending.display.label).toBe('JK1');
    expect(descendingView.geometry?.memberProgress)
      .toBeGreaterThan(ascendingView.geometry?.memberProgress ?? Number.POSITIVE_INFINITY);
    expect(descendingPath.match(/ d="([^"]+)"/)?.[1])
      .not.toBe(ascendingPath.match(/ d="([^"]+)"/)?.[1]);
  });

  it('highlights each duplicated irregular/regular Jack cut on its own roof side', () => {
    const jacks = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
      'on', 'on',
      '4', 'feet', 'run',
      'conv', 'jack',
    ]);

    for (const [label, cut] of [
      ['PLMB', 'plumb'],
      ['LEVL', 'level'],
      ['CHK1', 'cheek'],
    ] as const) {
      const irregular = advanceToLabel(jacks, 'jack', label, 1);
      const regular = advanceToLabel(jacks, 'jack', label, 2);
      const irregularView = calculatorDiagramView(irregular)!;
      const regularView = calculatorDiagramView(regular)!;
      const irregularMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
        view: irregularView,
      }));
      const regularMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
        view: regularView,
      }));

      expect(irregularView.geometry?.memberSide).toBe('irregular');
      expect(regularView.geometry?.memberSide).toBe('regular');
      expect(taggedPath(irregularMarkup, 'data-roof-cut', `${cut}-irregular`))
        .toContain('is-current');
      expect(taggedPath(irregularMarkup, 'data-roof-cut', `${cut}-regular`))
        .not.toContain('is-current');
      expect(taggedPath(regularMarkup, 'data-roof-cut', `${cut}-regular`))
        .toContain('is-current');
      expect(taggedPath(regularMarkup, 'data-roof-cut', `${cut}-irregular`))
        .not.toContain('is-current');

      if (cut !== 'cheek') {
        expect(metricLabelX(irregularMarkup, cut)).toBeGreaterThan(90);
        expect(metricLabelX(regularMarkup, cut)).toBeLessThan(90);
      }
    }
  });

  it('places each active Jack label beside its actual roof side', () => {
    const jacks = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
      'on', 'on',
      '4', 'feet', 'run',
      'conv', 'jack',
    ]);
    const irregularLabel = jacks.sequence?.results.find((result) => /^IJ\d+$/.test(result.label))?.label;
    expect(irregularLabel).toBeDefined();
    const regular = advanceToLabel(jacks, 'jack', 'JK1');
    const irregular = advanceToLabel(jacks, 'jack', irregularLabel!);
    const regularMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: calculatorDiagramView(regular)!,
    }));
    const irregularMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: calculatorDiagramView(irregular)!,
    }));

    expect(metricLabelX(regularMarkup, 'jack')).toBeLessThan(90);
    expect(metricLabelX(irregularMarkup, 'jack')).toBeGreaterThan(90);
  });

  it('keeps the second IJ cut block irregular when ordinary Jack uses a stored irregular pitch', () => {
    const jacks = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
      'on', 'on',
      '4', 'feet', 'run',
      'jack',
    ]);

    expect(jacks.sequence?.id).toBe('jacks');
    expect(jacks.sequence?.results.some((result) => /^IJ\d+$/.test(result.label))).toBe(true);

    for (const [label, cut] of [
      ['PLMB', 'plumb'],
      ['LEVL', 'level'],
      ['CHK1', 'cheek'],
    ] as const) {
      const irregular = advanceToLabel(jacks, 'jack', label, 2);
      const view = calculatorDiagramView(irregular)!;
      const markup = renderToStaticMarkup(createElement(CalculatorDiagram, { view }));

      expect(view.variant).toBe('ir-jacks');
      expect(view.geometry?.memberSide).toBe('irregular');
      expect(taggedPath(markup, 'data-roof-cut', `${cut}-irregular`))
        .toContain('is-current');
      expect(taggedPath(markup, 'data-roof-cut', `${cut}-regular`))
        .not.toContain('is-current');
    }
  });

  it('highlights irregular Hip CHK1 and CHK2 on different roof sides', () => {
    const hip = run([
      '7', 'inch', 'pitch',
      '8', 'inch', 'conv', 'hip',
      'on', 'on',
      '4', 'feet', 'run',
      'hip',
    ]);
    const cheek1 = advanceToLabel(hip, 'hip', 'CHK1');
    const cheek2 = advanceToLabel(hip, 'hip', 'CHK2');
    const cheek1View = calculatorDiagramView(cheek1)!;
    const cheek2View = calculatorDiagramView(cheek2)!;
    const cheek1Markup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: cheek1View,
    }));
    const cheek2Markup = renderToStaticMarkup(createElement(CalculatorDiagram, {
      view: cheek2View,
    }));
    const regularCut = taggedPath(cheek1Markup, 'data-roof-cut', 'cheek-regular');
    const irregularCut = taggedPath(cheek2Markup, 'data-roof-cut', 'cheek-irregular');

    expect(cheek1View.geometry?.memberSide).toBe('regular');
    expect(cheek2View.geometry?.memberSide).toBe('irregular');
    expect(regularCut).toContain('is-current');
    expect(irregularCut).toContain('is-current');
    expect(regularCut.match(/ d="([^"]+)"/)?.[1])
      .not.toBe(irregularCut.match(/ d="([^"]+)"/)?.[1]);
  });

  it('routes standalone Jack spacing and desired riser storage to their diagrams', () => {
    const spacingState = run(['1', '6', 'jack']);
    const riserState = run(['7', 'decimal', '5', 'conv', 'stair']);
    const spacingView = calculatorDiagramView(spacingState)!;
    const riserView = calculatorDiagramView(riserState)!;

    expect(spacingState.display.label).toBe('JKOC STORED');
    expect(spacingView).toMatchObject({ kind: 'roof', variant: 'jacks' });
    expect(metric(spacingView, 'spacing')).toMatchObject({ status: 'entered', active: true });
    expect(riserState.display.label).toBe('R-HT STORED');
    expect(riserView.kind).toBe('stairs');
  });

  it('marks only the originally entered representation in the Pitch cycle', () => {
    let state = run(['7', 'inch', 'pitch']);
    const inputIndex = state.sequence!.inputIndex;
    const resultCount = state.sequence!.results.length;

    for (let step = 0; step < resultCount; step += 1) {
      const view = calculatorDiagramView(state)!;
      const active = view.metrics.filter((item) => item.active);
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe(state.sequence!.index === inputIndex ? 'entered' : 'calculated');
      state = run(['pitch'], state);
    }
  });

  it('keeps percent-grade notation synchronized between the Pitch screen and diagram', () => {
    const state = run([
      '8', 'inch', '1', 'fraction', '6', '4', 'run',
      '6', 'inch', 'rise',
      'pitch', 'pitch', 'pitch',
    ]);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('%GRD');
    expect(state.display.plainText).toContain('%');
    expect(metric(view, 'theta')).toMatchObject({
      value: state.display.plainText,
      status: 'calculated',
      active: true,
    });
  });

  it('marks the recalled stored Pitch representation entered and its conversions calculated', () => {
    const stored = run(['7', 'decimal', '0', '3', 'inch', 'pitch', 'on']);
    let state = run(['4', 'feet', 'run', 'pitch'], stored);
    const resultCount = state.sequence!.results.length;

    for (let step = 0; step < resultCount; step += 1) {
      const active = calculatorDiagramView(state)!.metrics.filter((item) => item.active);
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe(state.display.label === 'PTCH' ? 'entered' : 'calculated');
      state = run(['pitch'], state);
    }
  });

  it('adds workflow-specific stair and column/cone drawings', () => {
    const stairs = diagram([
      '1', '0', 'feet', '1', 'inch', 'rise',
      '1', '5', 'feet', '5', 'inch', 'run',
      'stair',
    ]);
    expect(stairs.kind).toBe('stairs');
    expect(metric(stairs, 'riser')).toMatchObject({ status: 'calculated', active: true });

    const column = diagram([
      '2', 'feet', '4', 'inch', 'circ',
      '4', 'feet', '6', 'inch', 'rise',
      'conv', 'right',
    ]);
    expect(column).toMatchObject({ kind: 'solids', variant: 'column' });
    expect(metric(column, 'diameter').status).toBe('entered');
    expect(metric(column, 'radius').status).toBe('calculated');
    expect(metric(column, 'height').status).toBe('entered');
    expect(metric(column, 'column')).toMatchObject({ status: 'calculated', active: true });
  });

  it('shows old-to-new Fan Law fields with the calculated field identified', () => {
    const fan = diagram([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);

    expect(fan).toMatchObject({ kind: 'fan-law', variant: '1' });
    expect(metric(fan, 'a').status).toBe('entered');
    expect(metric(fan, 'a-new').status).toBe('entered');
    expect(metric(fan, 'b').status).toBe('entered');
    expect(metric(fan, 'b-new')).toMatchObject({ status: 'calculated', active: true });
  });

  it('shows a Fan Law zero placeholder as an expected field, not a calculated zero', () => {
    const staged = run([
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      '0', 'conv', '8',
    ]);
    const view = calculatorDiagramView(staged)!;

    expect(staged.display.label).toBe('Bn STORED');
    expect(view.kind).toBe('fan-law');
    expect(metric(view, 'b-new')).toMatchObject({
      value: undefined,
      status: 'expected',
      active: true,
    });
  });

  it('marks newly entered An and Bn Fan Law registers as active entered values', () => {
    const anState = run(['1', '4', '0', '0', 'conv', '7']);
    const bnState = run(['7', '5', '0', 'conv', '8'], anState);
    const anView = calculatorDiagramView(anState)!;
    const bnView = calculatorDiagramView(bnState)!;

    expect(anState.display.label).toBe('An STORED');
    expect(metric(anView, 'a-new')).toMatchObject({
      value: '1400',
      status: 'entered',
      active: true,
    });
    expect(bnState.display.label).toBe('Bn STORED');
    expect(metric(bnView, 'b-new')).toMatchObject({
      value: '750',
      status: 'entered',
      active: true,
    });
  });

  it('does not let a shared stale C register hide an explicit Fan Law result', () => {
    const fan = diagram([
      '9', 'conv', '6',
      '1', '2', '5', '0', 'conv', '4',
      '1', '4', '0', '0', 'conv', '7',
      '7', '5', '0', 'conv', '5',
      'conv', 'run',
    ]);

    expect(fan).toMatchObject({ kind: 'fan-law', variant: '1' });
    expect(metric(fan, 'b-new')).toMatchObject({ status: 'calculated', active: true });
  });

  it('does not decorate ordinary arithmetic, preferences, or unit entry', () => {
    expect(calculatorDiagramView(initialCalculatorState())).toBeUndefined();
    expect(calculatorDiagramView(run(['2', 'add', '3', 'equals']))).toBeUndefined();
    expect(calculatorDiagramView(run(['conv', 'equals']))).toBeUndefined();
    expect(calculatorDiagramView(run(['5', 'feet']))).toBeUndefined();
    expect(calculatorDiagramView(run(['5', '0', 'conv', 'add']))).toBeUndefined();
    expect(calculatorDiagramView(run(['4', 'conv', 'divide']))).toBeUndefined();
  });

  it('draws the right triangle behind each trigonometric function', () => {
    // The entered angle solves a ratio; the drawing highlights the two sides
    // that ratio is made of.
    const cases: Array<{ keys: KeyId[]; label: string; pair: string }> = [
      { keys: ['3', '0', 'sin'], label: 'SIN', pair: 'opp-hyp' },
      { keys: ['3', '0', 'cos'], label: 'COS', pair: 'adj-hyp' },
      { keys: ['3', '0', 'tan'], label: 'TAN', pair: 'opp-adj' },
    ];
    for (const sample of cases) {
      const state = run(sample.keys);
      const view = calculatorDiagramView(state)!;
      expect(state.display.label, sample.label).toBe(sample.label);
      expect(view).toMatchObject({ kind: 'trig', variant: sample.pair });
      expect(view.geometry?.theta).toBeCloseTo(30, 10);
      expect(metric(view, 'theta')).toMatchObject({ status: 'entered', active: false });
      expect(metric(view, 'ratio')).toMatchObject({ status: 'calculated', active: true });
      expect(metric(view, 'ratio').value).toBe(readableMeasurement(state.display.plainText));
    }
  });

  it('reverses entered and calculated for the arc functions', () => {
    const state = run(['decimal', '5', 'conv', 'sin']);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('ASIN');
    expect(view).toMatchObject({ kind: 'trig', variant: 'opp-hyp' });
    // The ratio was typed, the angle came out of it.
    expect(metric(view, 'ratio')).toMatchObject({ status: 'entered', active: false });
    expect(metric(view, 'theta')).toMatchObject({ status: 'calculated', active: true });
    expect(view.geometry?.theta).toBeCloseTo(30, 6);
    expect(metric(view, 'theta').value).toBe(readableMeasurement(state.display.plainText));
  });

  it('highlights only the sides the ratio is made of', () => {
    const sides = (keys: KeyId[]) => {
      const markup = renderToStaticMarkup(createElement(CalculatorDiagram, {
        view: calculatorDiagramView(run(keys))!,
      }));
      return ['adjacent', 'opposite', 'hypotenuse'].filter((name) => (
        new RegExp(`data-trig-side="${name}" class="diagram-line`).test(markup)
      ));
    };
    expect(sides(['3', '0', 'sin'])).toEqual(['opposite', 'hypotenuse']);
    expect(sides(['3', '0', 'cos'])).toEqual(['adjacent', 'hypotenuse']);
    expect(sides(['3', '0', 'tan'])).toEqual(['adjacent', 'opposite']);
  });

  it('draws a square or cube for the power and root keys', () => {
    const square = calculatorDiagramView(run(['4', 'square']))!;
    expect(square).toMatchObject({ kind: 'power', variant: 'square' });
    expect(metric(square, 'side')).toMatchObject({ status: 'entered', value: '4' });
    expect(metric(square, 'area')).toMatchObject({ status: 'calculated', active: true });

    // A root enters the area and solves the side, so the marks swap.
    const root = calculatorDiagramView(run(['9', 'sqrt']))!;
    expect(root).toMatchObject({ kind: 'power', variant: 'square' });
    expect(metric(root, 'area')).toMatchObject({ status: 'entered', value: '9' });
    expect(metric(root, 'side')).toMatchObject({ status: 'calculated', active: true, value: '3' });

    const cube = calculatorDiagramView(run(['3', 'conv', 'square']))!;
    expect(cube).toMatchObject({ kind: 'power', variant: 'cube' });
    expect(metric(cube, 'volume')).toMatchObject({ status: 'calculated', active: true });

    const cubeRoot = calculatorDiagramView(run(['2', '7', 'conv', 'sqrt']))!;
    expect(cubeRoot).toMatchObject({ kind: 'power', variant: 'cube' });
    expect(metric(cubeRoot, 'side')).toMatchObject({ status: 'calculated', active: true, value: '3' });
  });

  it('never draws a figure over a live arithmetic expression', () => {
    // Mid-expression the number on screen belongs to the arithmetic, and the
    // written expression holds the OTHER operand - drawing from it invented a
    // triangle at 2 degrees for "2 + 30 SIN".
    const inExpression: KeyId[][] = [
      ['2', 'add', '3', '0', 'sin'],
      ['2', 'add', '3', 'sqrt'],
      ['5', 'multiply', '4', 'square'],
      ['left', '2', 'add', '3', 'right', 'sqrt'],
      ['2', 'add', '3', 'equals', 'square'],
      ['0', 'subtract', '3', '0', 'equals', 'sin'],
    ];
    for (const keys of inExpression) {
      expect(calculatorDiagramView(run(keys)), keys.join(' ')).toBeUndefined();
    }
  });

  it('uses the argument the unary key actually consumed, not the written one', () => {
    // A second unary leaves the first one's argument in the expression, which
    // is why the square after a root claimed a side of 9 for an area of 9.
    const chained = calculatorDiagramView(run(['9', 'sqrt', 'square']))!;
    expect(metric(chained, 'side').value).toBe('3');
    expect(metric(chained, 'area').value).toBe('9');

    const twice = calculatorDiagramView(run(['1', '6', 'sqrt', 'sqrt']))!;
    expect(metric(twice, 'area').value).toBe('4');
    expect(metric(twice, 'side').value).toBe('2');

    const afterSine = calculatorDiagramView(run(['3', '0', 'sin', 'square']))!;
    expect(metric(afterSine, 'side').value).toBe('0.5');

    // A dimensional square keeps its own units on both rows.
    const dimensional = calculatorDiagramView(run(['4', 'feet', 'square']))!;
    expect(metric(dimensional, 'side').value).toBe('4′');
    expect(metric(dimensional, 'area').value).toContain('ft²');
  });

  it('separates a calculated argument from a typed, stored or recalled one', () => {
    const typed = calculatorDiagramView(run(['9', 'sqrt']))!;
    expect(metric(typed, 'area')).toMatchObject({ status: 'entered' });

    // "Entered or stored": a recalled number and a constant are the operator's
    // own, exactly as the triangle treats a recalled pitch one key press earlier.
    const recalled = calculatorDiagramView(run([
      '6', 'inch', 'pitch', 'on', 'recall', 'pitch', 'square',
    ]))!;
    expect(metric(recalled, 'side')).toMatchObject({ status: 'entered' });
    const constant = calculatorDiagramView(run(['pi', 'square']))!;
    expect(metric(constant, 'side')).toMatchObject({ status: 'entered' });

    // A metric conversion restates a number without authoring it: a velocity
    // the calculator solved stays calculated after Conv + Meter.
    const converted = calculatorDiagramView(run([
      '0', 'decimal', '0', '4', '9', 'conv', '0', 'conv', 'meter', 'square',
    ]))!;
    expect(metric(converted, 'side')).toMatchObject({ status: 'calculated' });
    // ... while a typed dimension keeps its origin through the same conversion.
    const typedFeet = calculatorDiagramView(run(['4', 'feet', 'square']))!;
    expect(metric(typedFeet, 'side')).toMatchObject({ status: 'entered' });

    // Both figures answer the same question the same way for the same number.
    const constantAngle = calculatorDiagramView(run(['pi', 'conv', 'decimal']))!;
    expect(metric(constantAngle, 'source')).toMatchObject({ status: 'entered' });

    // The same figure, but the 9 came out of an earlier calculation.
    const computed = calculatorDiagramView(run(['3', 'square', 'sqrt']))!;
    expect(metric(computed, 'area')).toMatchObject({ status: 'calculated' });

    const recalledAngle = calculatorDiagramView(run(['3', '0', 'sin', 'square']))!;
    expect(metric(recalledAngle, 'side')).toMatchObject({ status: 'calculated' });
  });

  it('drops a stale unit meaning when a number is reused as an angle', () => {
    // 886.5445 was a velocity a moment ago; Sine reads it as degrees, and the
    // drawing must say degrees rather than reprinting FPM.
    const state = run(['0', 'decimal', '0', '4', '9', 'conv', '0', 'sin']);
    const view = calculatorDiagramView(state)!;
    expect(view.kind).toBe('trig');
    expect(metric(view, 'theta').value).toBe('886.5445°');
    expect(metric(view, 'theta').status).toBe('calculated');
  });

  it('draws the air stream for the velocity-pressure cycle', () => {
    let state = run(['0', 'decimal', '0', '4', '9', 'conv', '0']);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('FPM');
    expect(view.kind).toBe('velocity');
    // The reading the operator typed stays marked as theirs through the cycle.
    expect(metric(view, 'entry')).toMatchObject({ status: 'entered', value: '0.049' });
    expect(metric(view, 'speed')).toMatchObject({ active: true, status: 'calculated' });
    // The entry is the pressure that produced this velocity, so it belongs in
    // the pressure row - never paired against the opposite conversion of itself.
    expect(metric(view, 'pressure')).toMatchObject({ status: 'entered', value: '0.049' });

    const asPressure = run(['conv', '0'], state);
    const pressureView = calculatorDiagramView(asPressure)!;
    expect(asPressure.display.label).toBe('VP');
    expect(metric(pressureView, 'pressure')).toMatchObject({ active: true, status: 'calculated' });
    expect(metric(pressureView, 'speed')).toMatchObject({ status: 'entered', value: '0.049' });

    const labels: string[] = [];
    for (let step = 0; step < 4; step += 1) {
      state = run(['conv', '0'], state);
      const stepView = calculatorDiagramView(state)!;
      labels.push(state.display.label.trim());
      const active = stepView.metrics.filter((item) => item.active);
      expect(active, state.display.label).toHaveLength(1);
    }
    expect(labels).toEqual(['VP', 'MPS', 'KPA', 'ENTRY']);
    // Back on the operator's own reading, it is entered rather than solved.
    expect(metric(calculatorDiagramView(state)!, 'entry'))
      .toMatchObject({ status: 'entered', active: true });
  });

  it('draws one angle for both notations of the dms conversion', () => {
    const state = run(['3', '0', 'decimal', '3', '0', 'conv', 'decimal']);
    const view = calculatorDiagramView(state)!;

    expect(state.display.label).toBe('DMS');
    expect(view).toMatchObject({ kind: 'angle', variant: 'dms' });
    expect(view.geometry?.theta).toBeCloseTo(30.3, 10);
    expect(metric(view, 'shown')).toMatchObject({ active: true, value: '30.18.00' });
    expect(metric(view, 'source')).toMatchObject({ status: 'entered', value: '30.3°' });

    // The other direction: a DMS source is kept verbatim, because formatting it
    // would print the decimal notation already on screen.
    const back = run(['3', '0', 'decimal', '1', '8', 'decimal', '0', '0', 'conv', 'decimal']);
    const backView = calculatorDiagramView(back)!;
    expect(back.display.label).toBe('DEG');
    expect(metric(backView, 'shown').value).toBe('30.3°');
    expect(metric(backView, 'source').value).toBe('30.18.00');

    // A computed angle still shows both notations; only its provenance differs.
    const computed = calculatorDiagramView(run([
      '3', 'run', '4', 'rise', 'diag', 'diag', 'conv', 'decimal',
    ]))!;
    expect(metric(computed, 'source')).toMatchObject({ status: 'calculated', value: '53.1301°' });
    const computedMarkup = renderToStaticMarkup(createElement(CalculatorDiagram, { view: computed }));
    expect(computedMarkup).toContain('53.1301°');
  });

  it('shows the exact current value at every mapped special-function cycle step', () => {
    const workflows: Array<{ state: CalculatorState; trigger: KeyId; name: string }> = [
      { state: run(['9', 'inch', 'pitch']), trigger: 'pitch', name: 'Pitch' },
      {
        state: run(['3', 'feet', 'run', '4', 'feet', 'rise', 'diag']),
        trigger: 'diag',
        name: 'Diagonal',
      },
      { state: run(['6', 'inch', 'circ']), trigger: 'circ', name: 'Circle' },
      {
        state: run([
          '1', '0', 'feet', 'run',
          '5', 'feet', 'rise',
          '7', 'feet', 'conv', '4',
          'conv', 'left',
        ]),
        trigger: 'left',
        name: 'Offset',
      },
      {
        state: run([
          '3', 'conv', '4',
          '4', 'conv', '5',
          '5', 'conv', '6',
          'conv', '9',
        ]),
        trigger: '9',
        name: 'Law of Cosines',
      },
      {
        state: run(['7', 'inch', 'pitch', '4', 'feet', 'run', 'hip']),
        trigger: 'hip',
        name: 'Hip / valley',
      },
      {
        state: run(['7', 'inch', 'pitch', '4', 'feet', 'run', 'jack']),
        trigger: 'jack',
        name: 'Jacks',
      },
      {
        state: run([
          '1', '0', 'feet', '1', 'inch', 'rise',
          '1', '5', 'feet', '5', 'inch', 'run',
          'stair',
        ]),
        trigger: 'stair',
        name: 'Stairs',
      },
      {
        state: run([
          '2', 'feet', '4', 'inch', 'circ',
          '4', 'feet', '6', 'inch', 'rise',
          'conv', 'right',
        ]),
        trigger: 'right',
        name: 'Column / cone',
      },
    ];

    for (const workflow of workflows) {
      let state = workflow.state;
      const resultCount = state.sequence!.results.length;
      for (let step = 0; step < resultCount; step += 1) {
        const view = calculatorDiagramView(state)!;
        const result = state.sequence!.results[state.sequence!.index];
        const active = view.metrics.filter((item) => item.active);
        expect(active, `${workflow.name} ${result.label} must identify one drawing element`)
          .toHaveLength(1);
        expect(active[0].value, `${workflow.name} ${result.label}`)
          .toBe(readableMeasurement(formatValue(result.value, state.preferences).plainText));
        state = run([workflow.trigger], state);
      }
    }
  });
});
