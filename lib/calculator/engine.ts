import {
  CalcError,
  CalcValue,
  DEFAULT_PREFERENCES,
  ExpressionToken,
  FormattedValue,
  Operator,
  Preferences,
  cloneValue,
  cube,
  cubeRoot,
  degrees,
  evaluateExpression,
  formatValue,
  measurement,
  operate,
  percentValue,
  scalar,
  square,
  squareRoot,
  withUnit,
} from './core';
import {
  CircleValues,
  NamedResult,
  TriangleValues,
  arcResults,
  circleResults,
  columnConeResults,
  convertDms,
  diagonalCycle,
  hipValleyResults,
  jackRafterResults,
  lawOfCosines,
  offsetResults,
  pitchCycle,
  segmentChord,
  segmentRadius,
  segmentRise,
  solveFanLaw,
  solveRightTriangle,
  stairResults,
  velocityPressureResults,
} from './formulas';

export type KeyId =
  | 'off' | 'on'
  | 'run' | 'rise' | 'diag' | 'pitch' | 'hip'
  | 'square' | 'sqrt' | 'circ' | 'stair' | 'jack'
  | 'sin' | 'cos' | 'tan' | 'left' | 'right'
  | 'meter' | 'feet' | 'inch' | 'fraction' | 'backspace'
  | 'conv' | '7' | '8' | '9' | 'divide'
  | 'recall' | '4' | '5' | '6' | 'multiply'
  | 'mplus' | '1' | '2' | '3' | 'subtract'
  | 'pi' | '0' | 'decimal' | 'equals' | 'add';

export interface DisplayState extends FormattedValue {
  label: string;
  note?: string;
}

export interface SharedRegisters {
  a?: CalcValue;
  b?: CalcValue;
  c?: CalcValue;
  aNew?: CalcValue;
  bNew?: CalcValue;
}

export interface MemoryState {
  cumulative?: CalcValue;
  m1?: CalcValue;
  m2?: CalcValue;
  m3?: CalcValue;
}

export interface SequenceState {
  id: string;
  results: NamedResult[];
  index: number;
  trigger: KeyId;
}

export interface HistoryItem {
  id: number;
  label: string;
  result: string;
}

export interface CalculatorState {
  powered: boolean;
  preferences: Preferences;
  preferencesOpen: boolean;
  entry: string;
  fractionNumerator?: number;
  composedInches?: number;
  current?: CalcValue;
  inputActive: boolean;
  inputKind?: 'percent' | 'dms' | 'decimal-degree' | 'recalled';
  expression: ExpressionToken[];
  parenthesisDepth: number;
  modifier?: 'convert' | 'recall';
  exponentBase?: CalcValue;
  display: DisplayState;
  memory: MemoryState;
  registers: SharedRegisters;
  triangle: TriangleValues;
  triangleInputs: Array<keyof TriangleValues>;
  permanentPitchSlope?: number;
  irregularPitchSlope?: number;
  circle: CircleValues;
  sequence?: SequenceState;
  velocityCycleIndex: number;
  lastKey?: KeyId;
  history: HistoryItem[];
}

export interface PersistedCalculatorState {
  preferences: Preferences;
  permanentPitchSlope?: number;
  irregularPitchSlope?: number;
  memory: Pick<MemoryState, 'm1' | 'm2' | 'm3'>;
}

export type CalculatorAction =
  | { type: 'press'; key: KeyId }
  | { type: 'set-preference'; key: keyof Preferences; value: Preferences[keyof Preferences] }
  | { type: 'reset-preferences' }
  | { type: 'toggle-preferences'; open?: boolean }
  | { type: 'hydrate'; payload: unknown };

const ZERO_DISPLAY: DisplayState = {
  label: 'READY',
  valueText: '0.',
  unitText: '',
  plainText: '0',
};

export function initialCalculatorState(): CalculatorState {
  return {
    powered: true,
    preferences: { ...DEFAULT_PREFERENCES },
    preferencesOpen: false,
    entry: '',
    inputActive: false,
    expression: [],
    parenthesisDepth: 0,
    display: { ...ZERO_DISPLAY },
    memory: {},
    registers: {},
    triangle: {},
    triangleInputs: [],
    circle: {},
    velocityCycleIndex: 0,
    history: [],
  };
}

export function persistedState(state: CalculatorState): PersistedCalculatorState {
  return {
    preferences: state.preferences,
    permanentPitchSlope: state.permanentPitchSlope,
    irregularPitchSlope: state.irregularPitchSlope,
    memory: { m1: state.memory.m1, m2: state.memory.m2, m3: state.memory.m3 },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOption<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function sanitizeStoredValue(value: unknown): CalcValue | undefined {
  if (!isRecord(value)) return undefined;
  const unitOptions: CalcValue['unit'][] = [
    'auto', 'ft-in', 'decimal-ft', 'decimal-in', 'in', 'm', 'mm',
    'sq-ft', 'sq-in', 'sq-m', 'sq-mm', 'cu-ft', 'cu-in', 'cu-m', 'cu-mm',
  ];
  const systemOptions: CalcValue['system'][] = ['neutral', 'imperial', 'metric'];
  if (
    typeof value.amount !== 'number' || !Number.isFinite(value.amount) ||
    typeof value.power !== 'number' || !Number.isFinite(value.power) ||
    !isOption(value.unit, unitOptions) || !isOption(value.system, systemOptions)
  ) return undefined;

  const sanitized: CalcValue = {
    amount: value.amount,
    power: value.power,
    unit: value.unit,
    system: value.system,
  };
  if (typeof value.angle === 'boolean') sanitized.angle = value.angle;

  if (isRecord(value.source)) {
    const sourceUnits = ['ft', 'in', 'm', 'mm'] as const;
    if (
      typeof value.source.amount === 'number' && Number.isFinite(value.source.amount) &&
      typeof value.source.power === 'number' && Number.isFinite(value.source.power) &&
      isOption(value.source.unit, sourceUnits)
    ) {
      sanitized.source = {
        amount: value.source.amount,
        power: value.source.power,
        unit: value.source.unit,
      };
    }
  }
  return sanitized;
}

export function sanitizePersistedState(value: unknown): PersistedCalculatorState {
  const stored = isRecord(value) ? value : {};
  const rawPreferences = isRecord(stored.preferences) ? stored.preferences : {};
  const preferences: Preferences = { ...DEFAULT_PREFERENCES };
  const fractionOptions = [2, 4, 8, 16, 32, 64] as const;
  if (
    typeof rawPreferences.fractionDenominator === 'number' &&
    fractionOptions.includes(rawPreferences.fractionDenominator as typeof fractionOptions[number])
  ) preferences.fractionDenominator = rawPreferences.fractionDenominator as typeof fractionOptions[number];

  const numericPreferences = [
    'treadWidth', 'headroom', 'floorThickness', 'desiredRiser', 'onCenter',
  ] as const;
  for (const key of numericPreferences) {
    const candidate = rawPreferences[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      preferences[key] = candidate;
    }
  }
  for (const key of ['constantFraction', 'exponent'] as const) {
    if (typeof rawPreferences[key] === 'boolean') preferences[key] = rawPreferences[key];
  }
  if (isOption(rawPreferences.areaFormat, ['standard', 'sq-ft', 'sq-m'] as const)) preferences.areaFormat = rawPreferences.areaFormat;
  if (isOption(rawPreferences.volumeFormat, ['standard', 'cu-ft', 'cu-m'] as const)) preferences.volumeFormat = rawPreferences.volumeFormat;
  if (isOption(rawPreferences.jackOrder, ['descending', 'ascending'] as const)) preferences.jackOrder = rawPreferences.jackOrder;
  if (isOption(rawPreferences.irregularJackMode, ['oc-oc', 'mate'] as const)) preferences.irregularJackMode = rawPreferences.irregularJackMode;
  if (isOption(rawPreferences.meterDecimals, ['fixed-3', 'float'] as const)) preferences.meterDecimals = rawPreferences.meterDecimals;
  if (isOption(rawPreferences.degreeDecimals, ['float', 'fixed-2'] as const)) preferences.degreeDecimals = rawPreferences.degreeDecimals;
  if (isOption(rawPreferences.mathMode, ['order', 'chain'] as const)) preferences.mathMode = rawPreferences.mathMode;

  const rawMemory = isRecord(stored.memory) ? stored.memory : {};
  const memory: PersistedCalculatorState['memory'] = {};
  for (const slot of ['m1', 'm2', 'm3'] as const) {
    const sanitized = sanitizeStoredValue(rawMemory[slot]);
    if (sanitized) memory[slot] = sanitized;
  }

  const result: PersistedCalculatorState = { preferences, memory };
  if (typeof stored.permanentPitchSlope === 'number' && Number.isFinite(stored.permanentPitchSlope)) {
    result.permanentPitchSlope = stored.permanentPitchSlope;
  }
  if (typeof stored.irregularPitchSlope === 'number' && Number.isFinite(stored.irregularPitchSlope)) {
    result.irregularPitchSlope = stored.irregularPitchSlope;
  }
  return result;
}

function displayFor(value: CalcValue, preferences: Preferences, label = '', note?: string): DisplayState {
  return { label, ...formatValue(value, preferences), note };
}

function pendingDisplay(state: CalculatorState): DisplayState {
  if (state.fractionNumerator !== undefined) {
    const denominator = state.entry || String(state.preferences.fractionDenominator);
    const text = `${state.fractionNumerator}/${denominator}`;
    const prefix = state.composedInches === undefined ? '' : `${formatValue({ amount: state.composedInches, power: 1, unit: 'ft-in', system: 'imperial' }, state.preferences).plainText} + `;
    return { label: 'ENTRY', valueText: text, unitText: prefix ? 'INCH FRACTION' : '', plainText: `${prefix}${text}` };
  }
  return {
    label: state.inputKind === 'percent' ? '% ENTRY' : 'ENTRY',
    valueText: state.entry || '0.',
    unitText: state.composedInches === undefined ? '' : 'ADD INCH',
    plainText: state.entry || '0',
  };
}

function clearSequence(state: CalculatorState): CalculatorState {
  return state.sequence ? { ...state, sequence: undefined } : state;
}

function numericEntry(state: CalculatorState): number | undefined {
  if (state.fractionNumerator !== undefined) {
    const denominator = state.entry ? Number(state.entry) : state.preferences.fractionDenominator;
    if (!denominator) throw new CalcError('DIV Error');
    return state.fractionNumerator / denominator;
  }
  if (!state.entry) return undefined;
  const parts = state.entry.split('.');
  const normalized = parts.length > 2
    ? `${parts[0] || '0'}.${(parts[1] || '0').padStart(2, '0').slice(0, 2)}${(parts[2] || '0').padStart(2, '0').slice(0, 2)}`
    : state.entry;
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new CalcError('ENT Error');
  return value;
}

function finalizeInput(state: CalculatorState): { state: CalculatorState; value?: CalcValue } {
  const number = numericEntry(state);
  let value = state.current;
  let composed = state.composedInches;

  if (number !== undefined) {
    if (composed !== undefined) {
      composed += number;
      value = { amount: composed, power: 1, unit: 'ft-in', system: 'imperial' };
    } else {
      value = scalar(number);
    }
  } else if (composed !== undefined) {
    value = state.current?.source && state.current.amount === composed
      ? state.current
      : { amount: composed, power: 1, unit: 'ft-in', system: 'imperial' };
  }

  const next = {
    ...state,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    current: value,
    inputActive: Boolean(value && state.inputActive),
  };
  return { state: next, value };
}

function requireInput(state: CalculatorState): { state: CalculatorState; value: CalcValue } {
  const finalized = finalizeInput(state);
  if (!finalized.value) throw new CalcError('ENT Error');
  return finalized as { state: CalculatorState; value: CalcValue };
}

function pushHistory(state: CalculatorState, display: DisplayState): CalculatorState {
  if (!display.plainText || display.label === 'ENTRY') return state;
  const item: HistoryItem = {
    id: Date.now() + Math.random(),
    label: display.label || 'RESULT',
    result: display.plainText,
  };
  return { ...state, history: [item, ...state.history].slice(0, 8) };
}

function showValue(state: CalculatorState, value: CalcValue, label = '', note?: string): CalculatorState {
  const display = displayFor(value, state.preferences, label, note);
  return pushHistory({ ...state, current: cloneValue(value), display, inputActive: false }, display);
}

function showError(state: CalculatorState, error: unknown): CalculatorState {
  const code = error instanceof CalcError ? error.code : 'ERROR';
  return {
    ...state,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    modifier: undefined,
    sequence: undefined,
    inputActive: false,
    display: { label: 'ERROR', valueText: code, unitText: '', plainText: code },
  };
}

function setSequence(
  state: CalculatorState,
  id: string,
  results: NamedResult[],
  trigger: KeyId,
  initialIndex = 0,
): CalculatorState {
  if (!results.length) throw new CalcError('ENT Error');
  const index = Math.max(0, Math.min(initialIndex, results.length - 1));
  const result = results[index];
  return showValue(
    { ...state, sequence: { id, results, index, trigger } },
    result.value,
    result.label,
    result.note,
  );
}

function advanceSequence(state: CalculatorState): CalculatorState {
  const sequence = state.sequence;
  if (!sequence) return state;
  const index = (sequence.index + 1) % sequence.results.length;
  const result = sequence.results[index];
  return showValue(
    { ...state, sequence: { ...sequence, index } },
    result.value,
    result.label,
    result.note,
  );
}

function addDigit(state: CalculatorState, digit: string): CalculatorState {
  let next = clearSequence(state);
  if (!next.inputActive && (next.current || next.expression.length === 0)) {
    next = {
      ...next,
      current: undefined,
      inputKind: undefined,
      expression: next.lastKey === 'equals' ? [] : next.expression,
    };
  }
  const entry = next.entry === '0' && digit !== '0' && next.fractionNumerator === undefined
    ? digit
    : `${next.entry}${digit}`.slice(0, 12);
  const withEntry = { ...next, entry, inputActive: true, modifier: undefined };
  return { ...withEntry, display: pendingDisplay(withEntry) };
}

function addDecimal(state: CalculatorState): CalculatorState {
  if (state.fractionNumerator !== undefined) throw new CalcError('ENT Error');
  let next = clearSequence(state);
  if (!next.inputActive) next = { ...next, current: undefined, inputKind: undefined };
  const separators = (next.entry.match(/\./g) ?? []).length;
  if (separators >= 2 || next.entry.endsWith('.')) return next;
  next = { ...next, entry: next.entry ? `${next.entry}.` : '0.', inputActive: true, modifier: undefined };
  return { ...next, display: pendingDisplay(next) };
}

function unitHintFor(unit: 'ft' | 'in' | 'm' | 'mm', power: number): CalcValue['unit'] {
  const hints = {
    ft: ['auto', 'ft-in', 'sq-ft', 'cu-ft'],
    in: ['auto', 'in', 'sq-in', 'cu-in'],
    m: ['auto', 'm', 'sq-m', 'cu-m'],
    mm: ['auto', 'mm', 'sq-mm', 'cu-mm'],
  } as const;
  if (power < 1 || power > 3) throw new CalcError('DIM Error');
  return hints[unit][power];
}

function enterUnit(state: CalculatorState, unit: 'ft' | 'in' | 'm' | 'mm'): CalculatorState {
  const number = numericEntry(state);
  if (number === undefined) {
    const source = state.current?.source;
    const repeatedUnit = source?.unit === unit || (source?.unit === 'mm' && unit === 'm');
    if (source && repeatedUnit && source.power < 3) {
      const value = measurement(source.amount, source.unit, source.power + 1);
      return showValue(
        { ...state, entry: '', fractionNumerator: undefined, composedInches: undefined },
        value,
        source.power + 1 === 2 ? 'AREA' : 'VOL',
      );
    }
    if (state.current && state.current.power > 0) {
      return showValue(
        { ...state, composedInches: undefined },
        withUnit(state.current, unitHintFor(unit, state.current.power)),
        'CONV',
      );
    }
    throw new CalcError('ENT Error');
  }

  if (unit === 'ft' || unit === 'in') {
    const composed = (state.composedInches ?? 0) + number * (unit === 'ft' ? 12 : 1);
    const value: CalcValue = {
      amount: composed,
      power: 1,
      unit: unit === 'in' && state.composedInches === undefined ? 'in' : 'ft-in',
      system: 'imperial',
      source: state.composedInches === undefined ? { amount: number, unit, power: 1 } : undefined,
    };
    const next = {
      ...state,
      entry: '',
      fractionNumerator: undefined,
      composedInches: composed,
      current: value,
      inputActive: true,
      modifier: undefined,
      display: displayFor(value, state.preferences, unit === 'ft' ? 'FEET' : 'INCH'),
    };
    return next;
  }

  const value = measurement(number, unit);
  const shown = showValue(
    { ...state, entry: '', fractionNumerator: undefined, composedInches: undefined, inputActive: true },
    value,
    unit.toUpperCase(),
  );
  return { ...shown, inputActive: true };
}

function commitOperator(state: CalculatorState, operator: Operator): CalculatorState {
  const finalized = finalizeInput(state);
  const tokens = [...finalized.state.expression];
  if (finalized.value && (tokens.at(-1)?.type !== 'value')) {
    tokens.push({ type: 'value', value: cloneValue(finalized.value) });
  }
  if (!tokens.length) throw new CalcError('ENT Error');
  if (tokens.at(-1)?.type === 'operator') tokens[tokens.length - 1] = { type: 'operator', operator };
  else tokens.push({ type: 'operator', operator });
  return {
    ...finalized.state,
    expression: tokens,
    current: undefined,
    inputActive: false,
    inputKind: undefined,
    sequence: undefined,
    display: { ...finalized.state.display, label: operator },
  };
}

function calculateEquals(state: CalculatorState): CalculatorState {
  const finalized = finalizeInput(state);
  if (finalized.state.exponentBase) {
    const exponent = finalized.value?.amount;
    if (exponent === undefined || finalized.value?.power !== 0 || finalized.value.angle) throw new CalcError('EXP Error');
    const base = finalized.state.exponentBase;
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 99) throw new CalcError('EXP Error');
    const result: CalcValue = {
      amount: base.amount * 10 ** exponent,
      power: base.power,
      unit: 'auto',
      system: base.system,
    };
    return showValue({ ...finalized.state, exponentBase: undefined, expression: [], lastKey: 'equals' }, result, 'RESULT');
  }

  const tokens = [...finalized.state.expression];
  if (!tokens.length && finalized.value) {
    const recalledInput = finalized.state.inputKind === 'recalled';
    const shown = showValue({ ...finalized.state, lastKey: 'equals' }, finalized.value, 'RESULT');
    return recalledInput ? { ...shown, inputActive: true, inputKind: 'recalled' } : shown;
  }
  if (finalized.value && tokens.at(-1)?.type !== 'value') tokens.push({ type: 'value', value: cloneValue(finalized.value) });
  if (!tokens.length || tokens.at(-1)?.type === 'operator') throw new CalcError('ENT Error');
  for (let index = 0; index < finalized.state.parenthesisDepth; index += 1) {
    tokens.push({ type: 'right' });
  }
  const result = evaluateExpression(tokens, finalized.state.preferences.mathMode);
  return showValue({ ...finalized.state, expression: [], parenthesisDepth: 0, lastKey: 'equals' }, result, 'RESULT');
}

function applyUnary(state: CalculatorState, fn: (value: CalcValue) => CalcValue, label: string): CalculatorState {
  const input = requireInput(state);
  const value = fn(input.value);
  return { ...showValue({ ...input.state, entry: '', fractionNumerator: undefined, composedInches: undefined }, value, label), inputActive: true };
}

function trig(state: CalculatorState, mode: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'): CalculatorState {
  const input = requireInput(state);
  if (input.value.power !== 0) throw new CalcError('TRIG Error');
  const inverse = mode.startsWith('a');
  const numeric = input.value.amount;
  if (inverse && (mode === 'asin' || mode === 'acos') && Math.abs(numeric) > 1) throw new CalcError('TRIG Error');
  const normalizedDegrees = ((numeric % 180) + 180) % 180;
  if (mode === 'tan' && Math.abs(normalizedDegrees - 90) < 1e-10) throw new CalcError('TRIG Error');
  const functions = {
    sin: () => Math.sin(numeric * Math.PI / 180),
    cos: () => Math.cos(numeric * Math.PI / 180),
    tan: () => Math.tan(numeric * Math.PI / 180),
    asin: () => Math.asin(numeric) * 180 / Math.PI,
    acos: () => Math.acos(numeric) * 180 / Math.PI,
    atan: () => Math.atan(numeric) * 180 / Math.PI,
  };
  const value = inverse ? degrees(functions[mode]()) : scalar(functions[mode]());
  return { ...showValue(input.state, value, mode.toUpperCase()), inputActive: true };
}

function recordTriangleInput(
  state: CalculatorState,
  key: keyof TriangleValues,
  value: number,
): Pick<CalculatorState, 'triangle' | 'triangleInputs'> {
  const triangleInputs = [...state.triangleInputs.filter((input) => input !== key), key].slice(-2);
  const triangle: TriangleValues = {};

  for (const input of triangleInputs) {
    const stored = input === key ? value : state.triangle[input];
    if (stored !== undefined) triangle[input] = stored;
  }

  if (
    triangleInputs.length < 2 &&
    key !== 'theta' &&
    state.permanentPitchSlope !== undefined
  ) {
    triangle.theta = Math.atan(state.permanentPitchSlope) * 180 / Math.PI;
  }

  return { triangle, triangleInputs };
}

function enterTriangle(state: CalculatorState, key: 'x' | 'y' | 'r'): CalculatorState {
  if (state.sequence?.trigger === (key === 'x' ? 'run' : key === 'y' ? 'rise' : 'diag')) return advanceSequence(state);
  if (state.inputActive) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const recorded = recordTriangleInput(state, key, input.value.amount);
    const circle = key === 'x'
      ? { ...state.circle, chord: input.value.amount }
      : key === 'y'
        ? { ...state.circle, rise: input.value.amount, height: input.value.amount }
        : state.circle;
    return showValue({ ...input.state, ...recorded, circle }, input.value, key === 'r' ? 'R' : key.toUpperCase());
  }

  if (state.circle.radius && key === 'x' && (state.circle.rise ?? state.triangle.y) !== undefined) {
    const chord = segmentChord(state.circle.radius, state.circle.rise ?? state.triangle.y!);
    const value = { amount: chord, power: 1, unit: 'ft-in', system: 'imperial' } as CalcValue;
    return showValue({ ...state, circle: { ...state.circle, chord }, triangle: { ...state.triangle, x: chord } }, value, 'CHORD');
  }
  if (state.circle.radius && key === 'y' && (state.circle.chord ?? state.triangle.x) !== undefined) {
    const rise = segmentRise(state.circle.radius, state.circle.chord ?? state.triangle.x!);
    const value = { amount: rise, power: 1, unit: 'ft-in', system: 'imperial' } as CalcValue;
    return showValue({ ...state, circle: { ...state.circle, rise }, triangle: { ...state.triangle, y: rise } }, value, 'SEG RISE');
  }

  const withPitch = { ...state.triangle };
  if (withPitch.theta === undefined && state.permanentPitchSlope !== undefined) {
    withPitch.theta = Math.atan(state.permanentPitchSlope) * 180 / Math.PI;
  }
  const solved = solveRightTriangle(withPitch);
  const triangle = solved;
  if (key === 'r') return setSequence({ ...state, triangle }, 'diag', diagonalCycle(solved), 'diag');
  const value = { amount: solved[key], power: 1, unit: 'ft-in', system: 'imperial' } as CalcValue;
  return showValue({ ...state, triangle }, value, key.toUpperCase());
}

function enterPitch(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'pitch') return advanceSequence(state);
  if (state.inputActive) {
    const input = requireInput(state);
    let slope: number;
    let startIndex: number;
    if (input.value.power === 1) {
      slope = input.value.amount / 12;
      startIndex = 0;
    } else if (input.value.power === 0 && !input.value.angle) {
      if (state.inputKind === 'percent') {
        slope = input.value.amount / 100;
        startIndex = 2;
      } else {
        slope = Math.tan(input.value.amount * Math.PI / 180);
        startIndex = 1;
      }
    } else {
      throw new CalcError('TYP Error');
    }
    const theta = Math.atan(slope) * 180 / Math.PI;
    const recorded = recordTriangleInput(input.state, 'theta', theta);
    const results = pitchCycle({ x: 12, y: slope * 12 });
    return setSequence(
      { ...input.state, ...recorded, permanentPitchSlope: slope, inputKind: undefined },
      'pitch',
      results,
      'pitch',
      startIndex,
    );
  }
  const values = { ...state.triangle };
  if (values.theta === undefined && state.permanentPitchSlope !== undefined) {
    values.theta = Math.atan(state.permanentPitchSlope) * 180 / Math.PI;
  }
  const solved = solveRightTriangle(values);
  return setSequence({ ...state, triangle: solved }, 'pitch', pitchCycle(solved), 'pitch');
}

function sharedRegister(state: CalculatorState, key: keyof SharedRegisters, label: string): CalculatorState {
  const input = requireInput(state);
  const registers = { ...state.registers, [key]: cloneValue(input.value) };
  return showValue({ ...input.state, registers }, input.value, `${label} STORED`);
}

function fanLaw(state: CalculatorState, law: 1 | 2 | 3): CalculatorState {
  const values = Object.fromEntries(
    (['a', 'aNew', 'b', 'bNew'] as const).map((key) => [key, state.registers[key]?.amount]),
  );
  const solved = solveFanLaw(law, values);
  const registers = {
    ...state.registers,
    a: scalar(solved.registers.a),
    aNew: scalar(solved.registers.aNew),
    b: scalar(solved.registers.b),
    bNew: scalar(solved.registers.bNew),
  };
  return showValue({ ...state, registers }, solved.result.value, solved.result.label);
}

function offset(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'offset') return advanceSequence(state);
  const { x, y } = state.triangle;
  const a = state.registers.a;
  if (x === undefined || y === undefined || !a || a.power !== 1) throw new CalcError('ENT Error');
  return setSequence(state, 'offset', offsetResults(x, y, a.amount), 'left');
}

function lawCos(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'lawcos') return advanceSequence(state);
  const { a, b, c } = state.registers;
  if (!a || !b || !c || [a, b, c].some((value) => value.power !== 1)) throw new CalcError('ENT Error');
  return setSequence(state, 'lawcos', lawOfCosines(a.amount, b.amount, c.amount), '9');
}

function circle(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'arc' || state.sequence?.id === 'circle') return advanceSequence(state);
  if (state.inputActive) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const values = { ...state.circle, diameter: input.value.amount, radius: input.value.amount / 2 };
    return setSequence({ ...input.state, circle: values }, 'circle', circleResults(values, state.preferences.onCenter), 'circ');
  }
  return setSequence(state, 'circle', circleResults(state.circle, state.preferences.onCenter), 'circ');
}

function enterArc(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'arc') return advanceSequence(state);
  const input = requireInput(state);
  const circleValues = { ...state.circle };
  let entered: NamedResult;
  if (input.value.power === 0) {
    circleValues.arcDegrees = input.value.amount;
    circleValues.arcLength = undefined;
    entered = { label: 'ARC', value: degrees(input.value.amount) };
  } else if (input.value.power === 1) {
    circleValues.arcLength = input.value.amount;
    circleValues.arcDegrees = undefined;
    entered = { label: 'ARC', value: input.value };
  } else {
    throw new CalcError('DIM Error');
  }
  const results = arcResults(circleValues, state.preferences.onCenter);
  const shown = showValue({ ...input.state, circle: circleValues, sequence: { id: 'arc', results, index: -1, trigger: 'circ' } }, entered.value, entered.label);
  return { ...shown, sequence: { id: 'arc', results, index: -1, trigger: 'circ' } };
}

function segRadius(state: CalculatorState): CalculatorState {
  if (state.inputActive) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const circleValues = { ...state.circle, radius: input.value.amount, diameter: input.value.amount * 2 };
    return showValue({ ...input.state, circle: circleValues }, input.value, 'RAD');
  }
  const chord = state.circle.chord ?? state.triangle.x;
  const rise = state.circle.rise ?? state.triangle.y;
  let radius = state.circle.radius;
  if (radius === undefined && chord !== undefined && rise !== undefined) radius = segmentRadius(chord, rise);
  if (!radius) throw new CalcError('ENT Error');
  const circleValues = { ...state.circle, radius, diameter: radius * 2, chord, rise };
  return showValue({ ...state, circle: circleValues }, { amount: radius, power: 1, unit: 'ft-in', system: 'imperial' }, 'RAD');
}

function hip(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'hip') return advanceSequence(state);
  const run = state.triangle.x;
  const slope = state.permanentPitchSlope ?? (state.triangle.theta === undefined ? undefined : Math.tan(state.triangle.theta * Math.PI / 180));
  if (!run || !slope) throw new CalcError('ENT Error');
  return setSequence(state, 'hip', hipValleyResults(run, slope, state.irregularPitchSlope), 'hip');
}

function irregularPitch(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  let slope: number;
  if (input.value.power === 1) slope = input.value.amount / 12;
  else if (input.value.power === 0) slope = state.inputKind === 'percent'
    ? input.value.amount / 100
    : Math.tan(input.value.amount * Math.PI / 180);
  else throw new CalcError('DIM Error');
  return showValue(
    { ...input.state, irregularPitchSlope: slope, inputKind: undefined },
    { amount: slope * 12, power: 1, unit: 'in', system: 'imperial' },
    'IPCH',
  );
}

function jacks(state: CalculatorState, irregularFirst: boolean): CalculatorState {
  const id = irregularFirst ? 'ir-jacks' : 'jacks';
  if (state.sequence?.id === id) return advanceSequence(state);
  if (!irregularFirst && state.inputActive) {
    const input = requireInput(state);
    if (input.value.power !== 1 || input.value.amount <= 0) throw new CalcError('DIM Error');
    const preferences = { ...state.preferences, onCenter: input.value.amount };
    return showValue({ ...input.state, preferences }, input.value, 'JKOC STORED');
  }
  const run = state.triangle.x;
  const slope = state.permanentPitchSlope ?? (state.triangle.theta === undefined ? undefined : Math.tan(state.triangle.theta * Math.PI / 180));
  if (!run || !slope) throw new CalcError('ENT Error');
  const results = jackRafterResults(run, slope, state.preferences, state.irregularPitchSlope, irregularFirst);
  return setSequence(state, id, results, irregularFirst ? 'jack' : 'jack');
}

function stairs(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'stairs') return advanceSequence(state);
  return setSequence(state, 'stairs', stairResults(state.triangle.y, state.triangle.x, state.preferences), 'stair');
}

function storeRiser(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  if (input.value.power !== 1 || input.value.amount <= 0) throw new CalcError('DIM Error');
  const preferences = { ...state.preferences, desiredRiser: input.value.amount };
  return showValue({ ...input.state, preferences }, input.value, 'R-HT STORED');
}

function columnCone(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'column-cone') return advanceSequence(state);
  const radius = state.circle.radius ?? (state.circle.diameter === undefined ? undefined : state.circle.diameter / 2);
  const height = state.circle.height ?? state.triangle.y;
  if (!radius || !height) throw new CalcError('ENT Error');
  return setSequence(state, 'column-cone', columnConeResults(radius, height), 'right');
}

function memoryStore(state: CalculatorState, slot: 'm1' | 'm2' | 'm3'): CalculatorState {
  const input = requireInput(state);
  return showValue({ ...input.state, memory: { ...state.memory, [slot]: cloneValue(input.value) } }, input.value, slot.toUpperCase());
}

function memoryRecall(state: CalculatorState, slot: keyof MemoryState): CalculatorState {
  const value = state.memory[slot] ?? scalar(0);
  return {
    ...showValue({ ...state, modifier: undefined, inputKind: 'recalled' }, value, slot.toUpperCase()),
    inputActive: true,
    inputKind: 'recalled',
  };
}

function negateValue(value: CalcValue): CalcValue {
  return {
    ...value,
    amount: -value.amount,
    source: value.source ? { ...value.source, amount: -value.source.amount } : undefined,
  };
}

function memoryPlus(state: CalculatorState, subtract = false): CalculatorState {
  const input = requireInput(state);
  const current = state.memory.cumulative;
  const value = current
    ? operate(current, subtract ? '-' : '+', input.value)
    : subtract ? negateValue(input.value) : cloneValue(input.value);
  return showValue({ ...input.state, memory: { ...state.memory, cumulative: value } }, value, subtract ? 'M−' : 'M+');
}

function percent(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  if (input.value.power !== 0) throw new CalcError('DIM Error');
  const tokens = input.state.expression;
  const lastOperator = [...tokens].reverse().find((token): token is Extract<ExpressionToken, { type: 'operator' }> => token.type === 'operator');
  const lastValue = [...tokens].reverse().find((token): token is Extract<ExpressionToken, { type: 'value' }> => token.type === 'value');
  if (lastOperator && lastValue) {
    const value = percentValue(lastValue.value, lastOperator.operator, input.value.amount);
    return calculateEquals({
      ...input.state,
      current: value,
      entry: '',
      fractionNumerator: undefined,
      composedInches: undefined,
      inputActive: true,
      inputKind: 'percent',
    });
  }
  return { ...showValue({ ...input.state, inputKind: 'percent' }, input.value, '%'), inputActive: true, inputKind: 'percent' };
}

function velocity(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'velocity') return advanceSequence(state);
  const input = requireInput(state);
  if (input.value.power !== 0) throw new CalcError('DIM Error');
  const results = velocityPressureResults(input.value.amount);
  return setSequence({ ...input.state, velocityCycleIndex: 0 }, 'velocity', results, '0');
}

function dms(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  if (input.value.power !== 0) throw new CalcError('DIM Error');
  const toDecimal = state.inputKind !== 'decimal-degree';
  const converted = convertDms(input.value.amount, toDecimal);
  const shown = showValue(
    { ...input.state, inputKind: toDecimal ? 'decimal-degree' : 'dms', inputActive: true },
    toDecimal ? degrees(converted) : scalar(converted),
    toDecimal ? 'DEG' : 'D:M:S',
  );
  return { ...shown, inputActive: true, inputKind: toDecimal ? 'decimal-degree' : 'dms' };
}

function convertCurrentUnit(state: CalculatorState, unit: 'feet' | 'inch' | 'meter' | 'millimeter'): CalculatorState {
  const input = requireInput(state);
  if (input.value.power === 0) {
    if (unit !== 'millimeter') throw new CalcError('DIM Error');
    const entered = measurement(input.value.amount, 'mm');
    return { ...showValue(input.state, entered, 'MM'), inputActive: true };
  }
  let hint: CalcValue['unit'];
  if (input.value.power === 1 && unit === 'feet') hint = input.value.unit === 'decimal-ft' ? 'ft-in' : 'decimal-ft';
  else if (input.value.power === 1 && unit === 'inch') hint = input.value.unit === 'decimal-in' ? 'in' : 'decimal-in';
  else {
    const baseUnit = unit === 'feet' ? 'ft' : unit === 'inch' ? 'in' : unit === 'millimeter' ? 'mm' : 'm';
    hint = unitHintFor(baseUnit, input.value.power);
  }
  return { ...showValue(input.state, withUnit(input.value, hint), 'CONV'), inputActive: true };
}

function reciprocal(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  if (input.value.amount === 0) throw new CalcError('DIV Error');
  if (input.value.power !== 0 || input.value.angle) throw new CalcError('DIM Error');
  return { ...showValue(input.state, scalar(1 / input.value.amount), '1/x'), inputActive: true };
}

function changeSign(state: CalculatorState): CalculatorState {
  if (state.entry) {
    const entry = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`;
    const next = { ...state, entry };
    return { ...next, display: pendingDisplay(next) };
  }
  const input = requireInput(state);
  return { ...showValue(input.state, negateValue(input.value), '+/−'), inputActive: true };
}

function clearAll(state: CalculatorState): CalculatorState {
  return {
    ...initialCalculatorState(),
    preferences: {
      ...state.preferences,
      onCenter: DEFAULT_PREFERENCES.onCenter,
      desiredRiser: DEFAULT_PREFERENCES.desiredRiser,
    },
    powered: true,
  };
}

function recallSharedRegister(state: CalculatorState, key: keyof SharedRegisters, label: string): CalculatorState {
  const value = state.registers[key] ?? scalar(0);
  return {
    ...showValue({ ...state, modifier: undefined, inputKind: 'recalled' }, value, `${label} STORED`),
    inputActive: true,
    inputKind: 'recalled',
  };
}

function handleRecall(state: CalculatorState, key: KeyId): CalculatorState {
  if (key === 'recall') {
    const value = state.memory.cumulative ?? scalar(0);
    return showValue({ ...state, memory: { ...state.memory, cumulative: undefined }, modifier: undefined }, value, 'M+ CLR');
  }
  if (key === 'mplus') return memoryRecall({ ...state, modifier: undefined }, 'cumulative');
  if (key === '1' || key === '2' || key === '3') return memoryRecall({ ...state, modifier: undefined }, `m${key}` as 'm1' | 'm2' | 'm3');
  if (key === '4') return recallSharedRegister(state, 'a', 'A');
  if (key === '5') return recallSharedRegister(state, 'b', 'B');
  if (key === '6') return recallSharedRegister(state, 'c', 'C');
  if (key === '7') return recallSharedRegister(state, 'aNew', 'An');
  if (key === '8') return recallSharedRegister(state, 'bNew', 'Bn');
  if (key === 'fraction') {
    return {
      ...showValue(
        { ...state, modifier: undefined, inputKind: 'recalled' },
        { amount: 1 / state.preferences.fractionDenominator, power: 1, unit: 'in', system: 'imperial' },
        state.preferences.constantFraction ? 'CONST' : 'STD',
      ),
      inputActive: true,
      inputKind: 'recalled',
    };
  }
  if (key === 'equals') return { ...state, modifier: undefined, preferencesOpen: true, display: { ...state.display, label: 'PREFS' } };
  if (key === 'jack') return showValue({ ...state, modifier: undefined }, { amount: state.preferences.onCenter, power: 1, unit: 'in', system: 'imperial' }, 'JKOC');
  if (key === 'pitch') {
    if (state.permanentPitchSlope === undefined) throw new CalcError('ENT Error');
    return {
      ...showValue(
      { ...state, modifier: undefined, inputKind: 'recalled' },
      { amount: state.permanentPitchSlope * 12, power: 1, unit: 'in', system: 'imperial' },
      'PTCH STORED',
      ),
      inputActive: true,
      inputKind: 'recalled',
    };
  }
  if (key === 'hip') {
    if (state.irregularPitchSlope === undefined) throw new CalcError('ENT Error');
    return {
      ...showValue(
      { ...state, modifier: undefined, inputKind: 'recalled' },
      { amount: state.irregularPitchSlope * 12, power: 1, unit: 'in', system: 'imperial' },
      'IPCH STORED',
      ),
      inputActive: true,
      inputKind: 'recalled',
    };
  }
  if (key === 'stair') {
    return setSequence(
      { ...state, modifier: undefined },
      'stairs',
      [
        { label: 'R-HT STORED', value: { amount: state.preferences.desiredRiser, power: 1, unit: 'in', system: 'imperial' } },
        { label: 'T-WD STORED', value: { amount: state.preferences.treadWidth, power: 1, unit: 'in', system: 'imperial' } },
        { label: 'HDRM STORED', value: { amount: state.preferences.headroom, power: 1, unit: 'ft-in', system: 'imperial' } },
        { label: 'FLOR STORED', value: { amount: state.preferences.floorThickness, power: 1, unit: 'in', system: 'imperial' } },
      ],
      'stair',
    );
  }
  throw new CalcError('ENT Error');
}

function handleSecondary(state: CalculatorState, key: KeyId): CalculatorState {
  const next = { ...state, modifier: undefined };
  switch (key) {
    case 'run': return fanLaw(next, 1);
    case 'rise': return fanLaw(next, 2);
    case 'diag': return fanLaw(next, 3);
    case 'pitch': return segRadius(next);
    case 'hip': return irregularPitch(next);
    case 'square': return applyUnary(next, cube, 'x³');
    case 'sqrt': return applyUnary(next, cubeRoot, '³√x');
    case 'circ': return enterArc(next);
    case 'stair': return storeRiser(next);
    case 'jack': return jacks(next, true);
    case 'sin': return trig(next, 'asin');
    case 'cos': return trig(next, 'acos');
    case 'tan': return trig(next, 'atan');
    case 'left': return offset(next);
    case 'right': return columnCone(next);
    case 'meter': return convertCurrentUnit(next, 'millimeter');
    case 'feet': return convertCurrentUnit(next, 'feet');
    case 'inch': return convertCurrentUnit(next, 'inch');
    case 'fraction': {
      const input = requireInput(next);
      return { ...input.state, exponentBase: input.value, current: undefined, inputActive: false, display: { ...input.state.display, label: 'x10ʸ' } };
    }
    case '7': return sharedRegister(next, 'aNew', 'An');
    case '8': return sharedRegister(next, 'bNew', 'Bn');
    case '9': return lawCos(next);
    case 'divide': return reciprocal(next);
    case 'recall': {
      const input = requireInput(next);
      const old = state.memory.cumulative;
      return showValue({ ...input.state, memory: { ...state.memory, cumulative: cloneValue(input.value) } }, old ?? scalar(0), 'SWAP M+');
    }
    case '4': return sharedRegister(next, 'a', 'A');
    case '5': return sharedRegister(next, 'b', 'B');
    case '6': return sharedRegister(next, 'c', 'C');
    case 'multiply': return clearAll(next);
    case 'mplus': return memoryPlus(next, true);
    case '1': return memoryStore(next, 'm1');
    case '2': return memoryStore(next, 'm2');
    case '3': return memoryStore(next, 'm3');
    case 'subtract': return changeSign(next);
    case 'pi': return showValue(next, scalar(Math.PI / 180), 'ArcK');
    case '0': return velocity(next);
    case 'decimal': return dms(next);
    case 'equals': return { ...next, preferencesOpen: true, display: { ...next.display, label: 'PREFS' } };
    case 'add': return percent(next);
    default: throw new CalcError('ENT Error');
  }
}

function primaryPress(state: CalculatorState, key: KeyId): CalculatorState {
  if (key === '0' && state.sequence?.id === 'velocity') return advanceSequence(state);
  if (/^[0-9]$/.test(key)) return addDigit(state, key);
  switch (key) {
    case 'decimal': return addDecimal(state);
    case 'fraction': {
      if (state.fractionNumerator !== undefined || !state.entry || state.entry.includes('.')) throw new CalcError('ENT Error');
      const next = { ...state, fractionNumerator: Number(state.entry), entry: '', inputActive: true };
      return { ...next, display: pendingDisplay(next) };
    }
    case 'backspace': {
      if (state.entry) {
        const next = { ...state, entry: state.entry.slice(0, -1) };
        return { ...next, display: pendingDisplay(next) };
      }
      if (state.fractionNumerator !== undefined) {
        const next = { ...state, entry: String(state.fractionNumerator), fractionNumerator: undefined };
        return { ...next, display: pendingDisplay(next) };
      }
      return state;
    }
    case 'feet': return enterUnit(state, 'ft');
    case 'inch': return enterUnit(state, 'in');
    case 'meter': return enterUnit(state, 'm');
    case 'run': return enterTriangle(state, 'x');
    case 'rise': return enterTriangle(state, 'y');
    case 'diag': return enterTriangle(state, 'r');
    case 'pitch': return enterPitch(state);
    case 'hip': return hip(state);
    case 'square': return applyUnary(state, square, 'x²');
    case 'sqrt': return applyUnary(state, squareRoot, '√x');
    case 'circ': return circle(state);
    case 'stair': return stairs(state);
    case 'jack': return jacks(state, false);
    case 'sin': return trig(state, 'sin');
    case 'cos': return trig(state, 'cos');
    case 'tan': return trig(state, 'tan');
    case 'left': {
      if (state.parenthesisDepth >= 4) throw new CalcError('ENT Error');
      return {
        ...state,
        expression: [...state.expression, { type: 'left' }],
        parenthesisDepth: state.parenthesisDepth + 1,
        current: undefined,
        inputActive: false,
        display: { label: `(${state.parenthesisDepth + 1}`, valueText: '0.', unitText: '', plainText: '(' },
      };
    }
    case 'right': {
      if (!state.parenthesisDepth) throw new CalcError('ENT Error');
      if (state.expression.at(-1)?.type === 'right') {
        return {
          ...state,
          expression: [...state.expression, { type: 'right' }],
          parenthesisDepth: state.parenthesisDepth - 1,
          display: { ...state.display, label: ')' },
        };
      }
      const input = requireInput(state);
      const expression = [...input.state.expression];
      if (expression.at(-1)?.type !== 'value') expression.push({ type: 'value', value: input.value });
      expression.push({ type: 'right' });
      return { ...input.state, expression, parenthesisDepth: state.parenthesisDepth - 1, current: undefined, inputActive: false, display: { ...state.display, label: ')' } };
    }
    case 'divide': return commitOperator(state, '/');
    case 'multiply': return commitOperator(state, '*');
    case 'subtract': return commitOperator(state, '-');
    case 'add': return commitOperator(state, '+');
    case 'equals': return calculateEquals(state);
    case 'pi': return { ...showValue(state, scalar(Math.PI), 'π'), inputActive: true };
    case 'mplus': return memoryPlus(state);
    default: return state;
  }
}

function clearRuntime(state: CalculatorState, fullTemporary = false): CalculatorState {
  return {
    ...state,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    current: undefined,
    inputActive: false,
    inputKind: undefined,
    expression: [],
    parenthesisDepth: 0,
    modifier: undefined,
    exponentBase: undefined,
    sequence: undefined,
    registers: fullTemporary ? {} : state.registers,
    triangle: fullTemporary ? {} : state.triangle,
    triangleInputs: fullTemporary ? [] : state.triangleInputs,
    circle: fullTemporary ? {} : state.circle,
    memory: fullTemporary ? { ...state.memory, cumulative: undefined } : state.memory,
    display: { ...ZERO_DISPLAY },
  };
}

function press(state: CalculatorState, key: KeyId): CalculatorState {
  if (!state.powered && key !== 'on') return state;
  if (key === 'off') {
    const cleared = clearRuntime(state, true);
    return { ...cleared, powered: false, display: { label: '', valueText: '', unitText: '', plainText: '' }, lastKey: key };
  }
  if (key === 'on') {
    const cleared = clearRuntime({ ...state, powered: true }, state.lastKey === 'on');
    return { ...cleared, powered: true, lastKey: key };
  }
  if (state.display.label === 'ERROR') throw new CalcError('PRESS On/C');
  if (key === 'conv') {
    return { ...state, modifier: state.modifier === 'convert' ? undefined : 'convert', lastKey: key, display: { ...state.display, label: 'CONV' } };
  }
  if (key === 'recall') {
    if (state.modifier === 'recall') return { ...handleRecall(state, key), lastKey: key };
    if (state.modifier === 'convert') return { ...handleSecondary(state, key), lastKey: key };
    return { ...state, modifier: 'recall', lastKey: key, display: { ...state.display, label: 'RCL' } };
  }

  const next = state.modifier === 'convert'
    ? handleSecondary(state, key)
    : state.modifier === 'recall'
      ? handleRecall(state, key)
      : primaryPress(state, key);
  return { ...next, lastKey: key };
}

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  try {
    if (action.type === 'hydrate') {
      const payload = sanitizePersistedState(action.payload);
      return {
        ...state,
        preferences: payload.preferences,
        memory: { ...state.memory, ...payload.memory },
        permanentPitchSlope: payload.permanentPitchSlope,
        irregularPitchSlope: payload.irregularPitchSlope,
      };
    }
    if (action.type === 'toggle-preferences') {
      return { ...state, preferencesOpen: action.open ?? !state.preferencesOpen };
    }
    if (action.type === 'reset-preferences') {
      return {
        ...state,
        preferences: { ...DEFAULT_PREFERENCES },
        display: state.current ? displayFor(state.current, DEFAULT_PREFERENCES, state.display.label) : state.display,
      };
    }
    if (action.type === 'set-preference') {
      const current = state.preferences[action.key];
      if (typeof current === 'number' && (typeof action.value !== 'number' || !Number.isFinite(action.value) || action.value <= 0)) {
        return state;
      }
      return {
        ...state,
        preferences: { ...state.preferences, [action.key]: action.value },
        display: state.current ? displayFor(state.current, { ...state.preferences, [action.key]: action.value } as Preferences, state.display.label) : state.display,
      };
    }
    return press(state, action.key);
  } catch (error) {
    return showError(state, error);
  }
}

export function activeGuide(state: CalculatorState): { title: string; steps: string[] } {
  if (state.modifier === 'convert') {
    return { title: 'CONV is active', steps: ['Press a key to use its yellow label.', 'Examples: CONV + x = Fan Law 1; CONV + ( = Offset.'] };
  }
  if (state.modifier === 'recall') {
    return { title: 'Recall is active', steps: ['Press M+, 1, 2 or 3 to recall memory.', 'Press Rcl again to recall and clear M+.'] };
  }
  if (state.sequence?.id === 'offset') return { title: 'Offset results', steps: ['Keep pressing ( to cycle radius, wrapper, heel, throat and angle.'] };
  if (state.sequence?.id === 'pitch') return { title: 'Pitch formats', steps: ['Keep pressing θ to cycle pitch, degrees, percent grade and slope.'] };
  if (state.sequence?.id.includes('jack')) return { title: 'Jack rafters', steps: ['Keep pressing Jack to step through every rafter and cut angle.'] };
  if (state.sequence?.id === 'stairs') return { title: 'Stair layout', steps: ['Keep pressing Stair to cycle all 15 layout results.'] };
  return {
    title: 'HVAC field workflow',
    steps: [
      'Enter a value, then press its unit or function key.',
      'Press Conv before a key to use the yellow function.',
      'Use x, y, r and θ to store or solve a right triangle.',
    ],
  };
}
