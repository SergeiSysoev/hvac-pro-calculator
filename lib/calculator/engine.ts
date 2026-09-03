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
  angleDisplayMode?: 'decimal' | 'dms';
  expression: ExpressionToken[];
  parenthesisDepth: number;
  modifier?: 'convert' | 'recall' | 'recall-convert';
  preferenceMode?: 'edit' | 'review';
  preferenceIndex?: number;
  exponentBase?: CalcValue;
  display: DisplayState;
  memory: MemoryState;
  registers: SharedRegisters;
  triangle: TriangleValues;
  triangleInputs: Array<keyof TriangleValues>;
  triangleUnitless?: boolean;
  permanentPitchSlope?: number;
  irregularPitchSlope?: number;
  circle: CircleValues;
  sequence?: SequenceState;
  resultUnit?: 'ft-in' | 'in' | 'm' | 'mm';
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
    typeof value.power !== 'number' || !Number.isInteger(value.power) || value.power < 0 || value.power > 3 ||
    !isOption(value.unit, unitOptions) || !isOption(value.system, systemOptions)
  ) return undefined;
  const unitsByPower: Record<number, CalcValue['unit'][]> = {
    0: ['auto'],
    1: ['auto', 'ft-in', 'decimal-ft', 'decimal-in', 'in', 'm', 'mm'],
    2: ['auto', 'sq-ft', 'sq-in', 'sq-m', 'sq-mm'],
    3: ['auto', 'cu-ft', 'cu-in', 'cu-m', 'cu-mm'],
  };
  if (!unitsByPower[value.power].includes(value.unit)) return undefined;
  if (value.angle === true && (value.power !== 0 || value.unit !== 'auto' || value.system !== 'neutral')) {
    return undefined;
  }

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
      typeof value.source.power === 'number' && Number.isInteger(value.source.power) &&
      value.source.power === value.power && value.source.power >= 1 && value.source.power <= 3 &&
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
  const standaloneFraction = state.fractionNumerator !== undefined && state.composedInches === undefined;
  let value = state.current;
  let composed = state.composedInches;

  if (number !== undefined) {
    if (composed !== undefined) {
      composed += number;
      const unit = state.current?.unit === 'in' || state.current?.unit === 'decimal-in' ? 'in' : 'ft-in';
      value = { amount: composed, power: 1, unit, system: 'imperial' };
    } else {
      value = standaloneFraction ? measurement(number, 'in') : scalar(number);
    }
  } else if (composed !== undefined) {
    value = state.current?.source && state.current.amount === composed
      ? state.current
      : {
          amount: composed,
          power: 1,
          unit: state.current?.unit === 'in' || state.current?.unit === 'decimal-in' ? 'in' : 'ft-in',
          system: 'imperial',
        };
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

function finalizeExponent(
  finalized: { state: CalculatorState; value?: CalcValue },
): { state: CalculatorState; value?: CalcValue } {
  const base = finalized.state.exponentBase;
  if (!base) return finalized;
  const exponent = finalized.value?.amount;
  if (exponent === undefined || finalized.value?.power !== 0 || finalized.value.angle) throw new CalcError('EXP Error');
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 99) throw new CalcError('EXP Error');
  const value: CalcValue = {
    amount: base.amount * 10 ** exponent,
    power: base.power,
    unit: base.unit,
    system: base.system,
  };
  return {
    state: { ...finalized.state, exponentBase: undefined, current: value, inputActive: true },
    value,
  };
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

function showDmsValue(state: CalculatorState, value: CalcValue, label = 'D:M:S'): CalculatorState {
  const encoded = convertDms(value.amount, false);
  const dmsText = encoded.toFixed(4);
  const display = {
    ...formatValue(scalar(encoded), state.preferences),
    label,
    valueText: dmsText,
    plainText: dmsText,
  };
  return pushHistory({
    ...state,
    current: cloneValue(value),
    display,
    inputActive: false,
    inputKind: 'dms',
    angleDisplayMode: 'dms',
  }, display);
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
    {
      ...state,
      sequence: { ...sequence, index },
      velocityCycleIndex: sequence.id === 'velocity' ? index : state.velocityCycleIndex,
    },
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
      angleDisplayMode: undefined,
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
  if (!next.entry && next.expression.length === 0) {
    next = { ...next, angleDisplayMode: undefined };
  }
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

function linearResultUnit(value: CalcValue): CalculatorState['resultUnit'] {
  const sourceUnit = value.source?.unit;
  if (sourceUnit === 'ft') return 'ft-in';
  if (sourceUnit === 'in') return 'in';
  if (sourceUnit === 'm') return 'm';
  if (sourceUnit === 'mm') return 'mm';
  if (value.unit === 'ft-in' || value.unit === 'decimal-ft' || value.unit === 'sq-ft' || value.unit === 'cu-ft') return 'ft-in';
  if (value.unit === 'in' || value.unit === 'decimal-in' || value.unit === 'sq-in' || value.unit === 'cu-in') return 'in';
  if (value.unit === 'm' || value.unit === 'sq-m' || value.unit === 'cu-m') return 'm';
  if (value.unit === 'mm' || value.unit === 'sq-mm' || value.unit === 'cu-mm') return 'mm';
  return undefined;
}

function contextualValue(state: CalculatorState, value: CalcValue): CalcValue {
  if (
    value.angle ||
    value.power < 1 ||
    value.power > 3 ||
    !state.resultUnit ||
    value.unit === 'in' ||
    value.unit === 'decimal-in' ||
    value.unit === 'm' ||
    value.unit === 'mm'
  ) return value;
  const hints = {
    'ft-in': ['auto', 'ft-in', 'sq-ft', 'cu-ft'],
    in: ['auto', 'in', 'sq-in', 'cu-in'],
    m: ['auto', 'm', 'sq-m', 'cu-m'],
    mm: ['auto', 'mm', 'sq-mm', 'cu-mm'],
  } as const;
  return withUnit(value, hints[state.resultUnit][value.power]);
}

function inheritedLinearInput(state: CalculatorState, value: CalcValue): CalcValue {
  if (value.power !== 0 || value.angle || !state.resultUnit) return value;
  const sourceUnit = state.resultUnit === 'ft-in' ? 'ft' : state.resultUnit;
  return measurement(value.amount, sourceUnit);
}

function contextualOrUnitlessResults(state: CalculatorState, results: NamedResult[]): NamedResult[] {
  if (!state.triangleUnitless) return contextualResults(state, results);
  return results.map((result) => ({
    ...result,
    value: result.value.power > 0 && !result.value.angle
      ? scalar(result.value.amount)
      : result.value,
  }));
}

function contextualResults(state: CalculatorState, results: NamedResult[]): NamedResult[] {
  return results.map((result) => ({ ...result, value: contextualValue(state, result.value) }));
}

function enterUnit(state: CalculatorState, unit: 'ft' | 'in' | 'm' | 'mm'): CalculatorState {
  const number = numericEntry(state);
  if (number === undefined) {
    const source = state.current?.source;
    const unitKey: KeyId = unit === 'ft' ? 'feet' : unit === 'in' ? 'inch' : 'meter';
    const repeatedUnit = state.lastKey === unitKey && (
      source?.unit === unit || (source?.unit === 'mm' && unit === 'm')
    );
    if (source && repeatedUnit) {
      const nextPower = source.power === 3 ? 1 : source.power + 1;
      const value = measurement(source.amount, source.unit, nextPower);
      return showValue(
        { ...state, entry: '', fractionNumerator: undefined, composedInches: undefined },
        value,
        nextPower === 1 ? unit.toUpperCase() : nextPower === 2 ? 'AREA' : 'VOL',
      );
    }
    if (state.current?.power === 1 && unit === 'ft') {
      const hint = state.current.unit === 'decimal-ft'
        ? 'ft-in'
        : state.current.unit === 'in' ? 'ft-in' : 'decimal-ft';
      return showValue({ ...state, composedInches: undefined }, withUnit(state.current, hint), 'CONV');
    }
    if (state.current?.power === 1 && unit === 'in') {
      const hint = state.current.unit === 'decimal-in' ? 'in' : 'decimal-in';
      return showValue({ ...state, composedInches: undefined }, withUnit(state.current, hint), 'CONV');
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
    const hasFeet = unit === 'ft'
      || state.current?.unit === 'ft-in'
      || state.current?.unit === 'decimal-ft';
    const value: CalcValue = {
      amount: composed,
      power: 1,
      unit: hasFeet ? 'decimal-ft' : 'decimal-in',
      system: 'imperial',
      source: state.composedInches === undefined ? { amount: number, unit, power: 1 } : undefined,
    };
    if (state.composedInches !== undefined) value.unit = hasFeet ? 'ft-in' : 'in';
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
  const finalized = finalizeExponent(finalizeInput(state));
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
  const finalized = finalizeExponent(finalizeInput(state));

  const tokens = [...finalized.state.expression];
  if (!tokens.length && finalized.value) {
    const recalledInput = finalized.state.inputKind === 'recalled';
    const shown = finalized.value.angle && finalized.state.angleDisplayMode === 'dms'
      ? showDmsValue({ ...finalized.state, lastKey: 'equals' }, finalized.value)
      : showValue({ ...finalized.state, lastKey: 'equals' }, finalized.value, 'RESULT');
    return {
      ...shown,
      inputActive: true,
      inputKind: finalized.state.angleDisplayMode === 'dms'
        ? 'dms'
        : recalledInput ? 'recalled' : undefined,
    };
  }
  if (finalized.value && tokens.at(-1)?.type !== 'value') tokens.push({ type: 'value', value: cloneValue(finalized.value) });
  if (!tokens.length || tokens.at(-1)?.type === 'operator') throw new CalcError('ENT Error');
  for (let index = 0; index < finalized.state.parenthesisDepth; index += 1) {
    tokens.push({ type: 'right' });
  }
  const result = evaluateExpression(tokens, finalized.state.preferences.mathMode);
  const resultState = { ...finalized.state, expression: [], parenthesisDepth: 0, lastKey: 'equals' as KeyId };
  const shown = result.angle && finalized.state.angleDisplayMode === 'dms'
    ? showDmsValue(resultState, result)
    : showValue(resultState, result, 'RESULT');
  return {
    ...shown,
    inputActive: true,
    inputKind: result.angle && finalized.state.angleDisplayMode === 'dms' ? 'dms' : undefined,
  };
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

function triangleForSolve(state: CalculatorState): TriangleValues {
  const values = { ...state.triangle };
  const currentInputCount = new Set(
    state.triangleInputs.filter((input) => values[input] !== undefined),
  ).size;
  if (
    currentInputCount < 2 &&
    values.theta === undefined &&
    state.permanentPitchSlope !== undefined
  ) {
    values.theta = Math.atan(state.permanentPitchSlope) * 180 / Math.PI;
  }
  return values;
}

function enterTriangle(state: CalculatorState, key: 'x' | 'y' | 'r'): CalculatorState {
  if (state.sequence?.trigger === (key === 'x' ? 'run' : key === 'y' ? 'rise' : 'diag')) return advanceSequence(state);
  if (state.inputActive) {
    const input = requireInput(state);
    const value = input.value;
    if (value.power !== 0 && value.power !== 1) throw new CalcError('DIM Error');
    const unitless = value.power === 0;
    const hasStoredSide = state.triangleInputs.some((entry) => entry === 'x' || entry === 'y' || entry === 'r');
    const switchesDimensionMode = hasStoredSide &&
      state.triangleUnitless !== undefined &&
      state.triangleUnitless !== unitless;
    const geometryState = switchesDimensionMode
      ? { ...state, triangle: {}, triangleInputs: [], circle: {} }
      : state;
    const recorded = recordTriangleInput(geometryState, key, value.amount);
    const circle = key === 'x'
      ? { ...geometryState.circle, chord: value.amount }
      : key === 'y'
        ? { ...geometryState.circle, rise: value.amount, height: value.amount }
        : geometryState.circle;
    return showValue(
      {
        ...input.state,
        ...recorded,
        circle,
        resultUnit: unitless ? undefined : linearResultUnit(value) ?? state.resultUnit,
        triangleUnitless: unitless,
      },
      value,
      key === 'r' ? 'R' : key.toUpperCase(),
    );
  }

  if (state.circle.radius && key === 'x' && (state.circle.rise ?? state.triangle.y) !== undefined) {
    const chord = segmentChord(state.circle.radius, state.circle.rise ?? state.triangle.y!);
    const value = contextualValue(state, { amount: chord, power: 1, unit: 'ft-in', system: 'imperial' });
    return showValue({ ...state, circle: { ...state.circle, chord }, triangle: { ...state.triangle, x: chord } }, value, 'CHORD');
  }
  if (state.circle.radius && key === 'y' && (state.circle.chord ?? state.triangle.x) !== undefined) {
    const rise = segmentRise(state.circle.radius, state.circle.chord ?? state.triangle.x!);
    const value = contextualValue(state, { amount: rise, power: 1, unit: 'ft-in', system: 'imperial' });
    return showValue({ ...state, circle: { ...state.circle, rise }, triangle: { ...state.triangle, y: rise } }, value, 'SEG RISE');
  }

  const solved = solveRightTriangle(triangleForSolve(state));
  const triangle = solved;
  if (key === 'r') return setSequence(
    { ...state, triangle },
    'diag',
    contextualOrUnitlessResults(state, diagonalCycle(solved)),
    'diag',
    state.triangleInputs.includes('r') ? 1 : 0,
  );
  const value = state.triangleUnitless
    ? scalar(solved[key])
    : contextualValue(state, { amount: solved[key], power: 1, unit: 'ft-in', system: 'imperial' });
  return showValue({ ...state, triangle }, value, key.toUpperCase());
}

function enterPitch(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'pitch') return advanceSequence(state);
  if (state.inputActive || (state.current && state.lastKey === 'equals')) {
    const input = requireInput(state);
    let slope: number;
    let startIndex: number;
    if (input.value.power === 1) {
      slope = input.value.amount / 12;
      startIndex = 0;
    } else if (input.value.power === 0) {
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
    const permanentPitchSlope = state.lastKey === 'equals'
      ? state.permanentPitchSlope
      : slope;
    return setSequence(
      { ...input.state, ...recorded, permanentPitchSlope, inputKind: undefined },
      'pitch',
      results,
      'pitch',
      startIndex,
    );
  }
  const solved = solveRightTriangle(triangleForSolve(state));
  const startsWithSlope = state.triangleInputs.includes('x') && state.triangleInputs.includes('y');
  return setSequence(
    { ...state, triangle: solved },
    'pitch',
    pitchCycle(solved),
    'pitch',
    startsWithSlope ? 0 : 1,
  );
}

function sharedRegister(state: CalculatorState, key: keyof SharedRegisters, label: string): CalculatorState {
  const input = requireInput(state);
  const value = input.value;
  const registers = { ...state.registers, [key]: cloneValue(value) };
  return showValue(
    {
      ...input.state,
      registers,
      resultUnit: value.power === 1 ? linearResultUnit(value) ?? state.resultUnit : state.resultUnit,
    },
    value,
    `${label} STORED`,
  );
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
  if (x === undefined || y === undefined || !a) throw new CalcError('ENT Error');
  let fittingHeight: number;
  if (a.power === 1) fittingHeight = a.amount;
  else if (a.power === 0 && state.triangleUnitless === true) fittingHeight = a.amount;
  else if (a.power === 0 && state.resultUnit) fittingHeight = inheritedLinearInput(state, a).amount;
  else throw new CalcError('ENT Error');
  return setSequence(
    state,
    'offset',
    contextualOrUnitlessResults(state, offsetResults(x, y, fittingHeight)),
    'left',
  );
}

function lawCos(state: CalculatorState): CalculatorState {
  const { a, b, c } = state.registers;
  if (!a || !b || !c || [a, b, c].some((value) => value.power !== 1)) throw new CalcError('ENT Error');
  return setSequence(state, 'lawcos', contextualResults(state, lawOfCosines(a.amount, b.amount, c.amount)), '9');
}

function circle(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'arc' || state.sequence?.id === 'circle') return advanceSequence(state);
  if (state.inputActive) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const values = { ...state.circle, diameter: input.value.amount, radius: input.value.amount / 2 };
    const next = { ...input.state, circle: values, resultUnit: linearResultUnit(input.value) ?? state.resultUnit };
    return setSequence(next, 'circle', contextualResults(next, circleResults(values)), 'circ');
  }
  return setSequence(state, 'circle', contextualResults(state, circleResults(state.circle)), 'circ');
}

function enterArc(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'arc') return advanceSequence(state);
  if (!state.inputActive) {
    const circleValues = { ...state.circle };
    const radius = circleValues.radius ?? (circleValues.diameter === undefined ? undefined : circleValues.diameter / 2);
    const chord = circleValues.chord ?? state.triangle.x;
    const rise = circleValues.rise ?? state.triangle.y;
    if (!radius || radius <= 0) throw new CalcError('ENT Error');
    let theta: number | undefined;
    if (rise !== undefined) {
      const cosine = (radius - rise) / radius;
      if (cosine >= -1 && cosine <= 1) theta = 2 * Math.acos(cosine) * 180 / Math.PI;
    }
    if (theta === undefined && chord !== undefined) {
      const sine = chord / (2 * radius);
      if (sine >= -1 && sine <= 1) theta = 2 * Math.asin(sine) * 180 / Math.PI;
    }
    if (theta === undefined || !Number.isFinite(theta) || theta <= 0) throw new CalcError('ENT Error');
    Object.assign(circleValues, { radius, diameter: radius * 2, chord, rise, arcDegrees: theta, arcLength: undefined });
    const next = { ...state, circle: circleValues };
    const results = contextualResults(next, arcResults(circleValues, state.preferences.onCenter));
    const sequence = { id: 'arc', results, index: -1, trigger: 'circ' as KeyId };
    const shown = showValue({ ...next, sequence }, degrees(theta), 'ARC');
    return { ...shown, sequence };
  }
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
  const next = {
    ...input.state,
    circle: circleValues,
    resultUnit: input.value.power === 1 ? linearResultUnit(input.value) ?? state.resultUnit : state.resultUnit,
  };
  const results = contextualResults(next, arcResults(circleValues, state.preferences.onCenter));
  const shown = showValue({ ...next, sequence: { id: 'arc', results, index: -1, trigger: 'circ' } }, entered.value, entered.label);
  return { ...shown, sequence: { id: 'arc', results, index: -1, trigger: 'circ' } };
}

function segRadius(state: CalculatorState): CalculatorState {
  if (state.inputActive) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const circleValues = { ...state.circle, radius: input.value.amount, diameter: input.value.amount * 2 };
    return showValue(
      { ...input.state, circle: circleValues, resultUnit: linearResultUnit(input.value) ?? state.resultUnit },
      input.value,
      'RAD',
    );
  }
  const chord = state.circle.chord ?? state.triangle.x;
  const rise = state.circle.rise ?? state.triangle.y;
  let radius = state.circle.radius;
  if (radius === undefined && chord !== undefined && rise !== undefined) radius = segmentRadius(chord, rise);
  if (!radius) throw new CalcError('ENT Error');
  const circleValues = { ...state.circle, radius, diameter: radius * 2, chord, rise };
  return showValue(
    { ...state, circle: circleValues },
    contextualValue(state, { amount: radius, power: 1, unit: 'ft-in', system: 'imperial' }),
    'RAD',
  );
}

function hip(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'hip') return advanceSequence(state);
  const run = state.triangle.x;
  if (!run) throw new CalcError('ENT Error');
  const solved = solveRightTriangle(triangleForSolve(state));
  const slope = solved.y / solved.x;
  return setSequence(state, 'hip', contextualResults(state, hipValleyResults(run, slope, state.irregularPitchSlope)), 'hip');
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
  if (!run) throw new CalcError('ENT Error');
  const solved = solveRightTriangle(triangleForSolve(state));
  const slope = solved.y / solved.x;
  const results = contextualResults(state, jackRafterResults(run, slope, state.preferences, state.irregularPitchSlope, irregularFirst));
  return setSequence(state, id, results, irregularFirst ? 'jack' : 'jack');
}

function stairs(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'stairs') return advanceSequence(state);
  return setSequence(state, 'stairs', contextualResults(state, stairResults(state.triangle.y, state.triangle.x, state.preferences)), 'stair');
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
  return setSequence(state, 'column-cone', contextualResults(state, columnConeResults(radius, height)), 'right');
}

function memoryStore(state: CalculatorState, slot: 'm1' | 'm2' | 'm3'): CalculatorState {
  const input = requireInput(state);
  return showValue({ ...input.state, memory: { ...state.memory, [slot]: cloneValue(input.value) } }, input.value, slot.toUpperCase());
}

function memoryRecall(state: CalculatorState, slot: keyof MemoryState): CalculatorState {
  const value = state.memory[slot] ?? scalar(0);
  return {
    ...showValue({ ...state, modifier: undefined, inputKind: 'recalled', angleDisplayMode: undefined }, value, slot.toUpperCase()),
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
  return showValue(
    { ...input.state, memory: { ...state.memory, cumulative: value } },
    input.value,
    subtract ? 'M−' : 'M+',
  );
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
  const initialIndex = state.velocityCycleIndex % results.length;
  return setSequence(
    { ...input.state, velocityCycleIndex: initialIndex },
    'velocity',
    results,
    '0',
    initialIndex,
  );
}

function dms(state: CalculatorState): CalculatorState {
  const decimalSeparators = (state.entry.match(/\./g) ?? []).length;
  const input = requireInput(state);
  if (input.value.power !== 0) throw new CalcError('DIM Error');
  const toDecimal = state.angleDisplayMode === 'dms'
    || (state.angleDisplayMode === undefined && Boolean(state.entry) && decimalSeparators >= 2);
  const decimalDegrees = input.value.angle
    ? input.value.amount
    : toDecimal ? convertDms(input.value.amount, true) : input.value.amount;
  if (toDecimal) {
    const shown = showValue(
      { ...input.state, inputKind: 'decimal-degree', angleDisplayMode: 'decimal' },
      degrees(decimalDegrees),
      'DEG',
    );
    return { ...shown, inputActive: true, inputKind: 'decimal-degree', angleDisplayMode: 'decimal' };
  }
  const shown = showDmsValue(
    { ...input.state, inputKind: 'dms', angleDisplayMode: 'dms' },
    degrees(decimalDegrees),
  );
  return { ...shown, inputActive: true, inputKind: 'dms', angleDisplayMode: 'dms' };
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

const PREFERENCE_COUNT = 13;

function optionStep<T>(options: readonly T[], current: T, direction: 1 | -1): T {
  const currentIndex = Math.max(0, options.indexOf(current));
  return options[(currentIndex + direction + options.length) % options.length];
}

function preferenceDisplay(state: CalculatorState, index: number): DisplayState {
  const preferences = state.preferences;
  switch (index) {
    case 0:
      return displayFor(measurement(1 / preferences.fractionDenominator, 'in'), preferences, 'FRAC');
    case 1:
      if (preferences.areaFormat === 'standard') return { label: 'AREA', valueText: 'Std.', unitText: '', plainText: 'AREA Std.' };
      return displayFor(measurement(0, preferences.areaFormat === 'sq-ft' ? 'ft' : 'm', 2), preferences, 'AREA');
    case 2:
      if (preferences.volumeFormat === 'standard') return { label: 'VOL', valueText: 'Std.', unitText: '', plainText: 'VOL Std.' };
      return displayFor(measurement(0, preferences.volumeFormat === 'cu-ft' ? 'ft' : 'm', 3), preferences, 'VOL');
    case 3:
      return displayFor(measurement(preferences.treadWidth, 'in'), preferences, 'T-WD');
    case 4:
      return displayFor({ amount: preferences.headroom, power: 1, unit: 'ft-in', system: 'imperial' }, preferences, 'HDRM');
    case 5:
      return displayFor(measurement(preferences.floorThickness, 'in'), preferences, 'FLOR');
    case 6:
      return { label: 'JACK', valueText: preferences.jackOrder === 'descending' ? 'dESCEnd' : 'ASCEnd', unitText: '', plainText: `JACK ${preferences.jackOrder}` };
    case 7:
      return { label: 'IRJK', valueText: preferences.irregularJackMode === 'oc-oc' ? 'OC-OC' : 'JAC-JAC', unitText: '', plainText: `IRJK ${preferences.irregularJackMode}` };
    case 8:
      return { label: 'EXP', valueText: preferences.exponent ? 'On' : 'OFF', unitText: '', plainText: `EXP ${preferences.exponent ? 'On' : 'OFF'}` };
    case 9:
      return { label: 'METR', valueText: preferences.meterDecimals === 'fixed-3' ? '0.000' : 'FLOAt', unitText: 'M', plainText: `METR ${preferences.meterDecimals}` };
    case 10:
      return { label: 'DEG', valueText: preferences.degreeDecimals === 'float' ? 'FLOAt' : '0.00°', unitText: '', plainText: `DEG ${preferences.degreeDecimals}` };
    case 11:
      return { label: 'MATH', valueText: preferences.mathMode === 'order' ? 'OrdEr' : 'CHAIn', unitText: '', plainText: `MATH ${preferences.mathMode}` };
    default:
      return { label: 'FRAC', valueText: preferences.constantFraction ? 'COnSt' : 'Std.', unitText: '', plainText: `FRAC ${preferences.constantFraction ? 'constant' : 'standard'}` };
  }
}

function showPreference(state: CalculatorState, index: number, mode: 'edit' | 'review'): CalculatorState {
  const normalizedIndex = (index + PREFERENCE_COUNT) % PREFERENCE_COUNT;
  return {
    ...state,
    modifier: undefined,
    preferenceMode: mode,
    preferenceIndex: normalizedIndex,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    current: undefined,
    inputActive: false,
    expression: [],
    parenthesisDepth: 0,
    sequence: undefined,
    display: preferenceDisplay(state, normalizedIndex),
  };
}

function adjustPreference(state: CalculatorState, direction: 1 | -1): CalculatorState {
  const index = state.preferenceIndex ?? 0;
  const preferences = { ...state.preferences };
  switch (index) {
    case 0:
      preferences.fractionDenominator = optionStep([16, 32, 64, 2, 4, 8] as const, preferences.fractionDenominator, direction);
      break;
    case 1:
      preferences.areaFormat = optionStep(['standard', 'sq-ft', 'sq-m'] as const, preferences.areaFormat, direction);
      break;
    case 2:
      preferences.volumeFormat = optionStep(['standard', 'cu-ft', 'cu-m'] as const, preferences.volumeFormat, direction);
      break;
    case 3:
      preferences.treadWidth = Math.max(0.25, preferences.treadWidth + direction * 0.25);
      break;
    case 4:
      preferences.headroom = Math.max(1, preferences.headroom + direction);
      break;
    case 5:
      preferences.floorThickness = Math.max(1, preferences.floorThickness + direction);
      break;
    case 6:
      preferences.jackOrder = optionStep(['descending', 'ascending'] as const, preferences.jackOrder, direction);
      break;
    case 7:
      preferences.irregularJackMode = optionStep(['oc-oc', 'mate'] as const, preferences.irregularJackMode, direction);
      break;
    case 8:
      preferences.exponent = !preferences.exponent;
      break;
    case 9:
      preferences.meterDecimals = optionStep(['fixed-3', 'float'] as const, preferences.meterDecimals, direction);
      break;
    case 10:
      preferences.degreeDecimals = optionStep(['float', 'fixed-2'] as const, preferences.degreeDecimals, direction);
      break;
    case 11:
      preferences.mathMode = optionStep(['order', 'chain'] as const, preferences.mathMode, direction);
      break;
    case 12:
      preferences.constantFraction = !preferences.constantFraction;
      break;
  }
  return showPreference({ ...state, preferences }, index, 'edit');
}

function recallSharedRegister(state: CalculatorState, key: keyof SharedRegisters, label: string): CalculatorState {
  const value = state.registers[key] ?? scalar(0);
  return {
    ...showValue({ ...state, modifier: undefined, inputKind: 'recalled', angleDisplayMode: undefined }, value, `${label} STORED`),
    inputActive: true,
    inputKind: 'recalled',
  };
}

function handleRecall(state: CalculatorState, key: KeyId): CalculatorState {
  if (key === 'recall') {
    const value = state.memory.cumulative ?? scalar(0);
    return showValue({ ...state, memory: { ...state.memory, cumulative: undefined }, modifier: undefined, inputKind: undefined, angleDisplayMode: undefined }, value, 'M+ CLR');
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
        { ...state, modifier: undefined, inputKind: 'recalled', angleDisplayMode: undefined },
        { amount: 1 / state.preferences.fractionDenominator, power: 1, unit: 'in', system: 'imperial' },
        state.preferences.constantFraction ? 'CONST' : 'STD',
      ),
      inputActive: true,
      inputKind: 'recalled',
    };
  }
  if (key === 'equals') return showPreference(state, 0, 'review');
  if (key === 'jack') return showValue({ ...state, modifier: undefined, inputKind: undefined, angleDisplayMode: undefined }, { amount: state.preferences.onCenter, power: 1, unit: 'in', system: 'imperial' }, 'JKOC');
  if (key === 'pitch') {
    if (state.permanentPitchSlope === undefined) throw new CalcError('ENT Error');
    return {
      ...showValue(
      { ...state, modifier: undefined, inputKind: 'recalled', angleDisplayMode: undefined },
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
      { ...state, modifier: undefined, inputKind: 'recalled', angleDisplayMode: undefined },
      { amount: state.irregularPitchSlope * 12, power: 1, unit: 'in', system: 'imperial' },
      'IPCH STORED',
      ),
      inputActive: true,
      inputKind: 'recalled',
    };
  }
  if (key === 'stair') {
    return showValue(
      { ...state, modifier: undefined, sequence: undefined, inputKind: undefined, angleDisplayMode: undefined },
      { amount: state.preferences.desiredRiser, power: 1, unit: 'in', system: 'imperial' },
      'R-HT STORED',
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
    case 'pi': return showValue({ ...next, inputKind: undefined, angleDisplayMode: undefined }, scalar(Math.PI / 180), 'ArcK');
    case '0': return velocity(next);
    case 'decimal': return dms(next);
    case 'equals': return showPreference(next, 0, 'edit');
    case 'add': return percent(next);
    default: throw new CalcError('ENT Error');
  }
}

function primaryPress(state: CalculatorState, key: KeyId): CalculatorState {
  if (state.sequence?.trigger === key) return advanceSequence(state);
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
      let expression: ExpressionToken[];
      let nextState: CalculatorState;
      if (state.expression.at(-1)?.type === 'right') {
        expression = [...state.expression, { type: 'right' }];
        nextState = state;
      } else {
        const input = requireInput(state);
        expression = [...input.state.expression];
        if (expression.at(-1)?.type !== 'value') expression.push({ type: 'value', value: input.value });
        expression.push({ type: 'right' });
        nextState = input.state;
      }
      let nesting = 0;
      let openIndex = -1;
      for (let index = expression.length - 1; index >= 0; index -= 1) {
        if (expression[index].type === 'right') nesting += 1;
        if (expression[index].type === 'left') {
          nesting -= 1;
          if (nesting === 0) {
            openIndex = index;
            break;
          }
        }
      }
      if (openIndex < 0) throw new CalcError('ENT Error');
      const result = evaluateExpression(expression.slice(openIndex), state.preferences.mathMode);
      return {
        ...nextState,
        expression: expression.slice(0, openIndex),
        parenthesisDepth: state.parenthesisDepth - 1,
        current: result,
        inputActive: true,
        inputKind: undefined,
        display: displayFor(result, state.preferences, ')'),
      };
    }
    case 'divide': return commitOperator(state, '/');
    case 'multiply': return commitOperator(state, '*');
    case 'subtract': return commitOperator(state, '-');
    case 'add': return commitOperator(state, '+');
    case 'equals': return calculateEquals(state);
    case 'pi': return {
      ...showValue({ ...state, inputKind: undefined, angleDisplayMode: undefined }, scalar(Math.PI), 'π'),
      inputActive: true,
    };
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
    angleDisplayMode: undefined,
    expression: [],
    parenthesisDepth: 0,
    modifier: undefined,
    preferenceMode: undefined,
    preferenceIndex: undefined,
    exponentBase: undefined,
    sequence: undefined,
    resultUnit: fullTemporary ? undefined : state.resultUnit,
    registers: fullTemporary ? {} : state.registers,
    triangle: fullTemporary ? {} : state.triangle,
    triangleInputs: fullTemporary ? [] : state.triangleInputs,
    circle: fullTemporary ? {} : state.circle,
    memory: fullTemporary ? { ...state.memory, cumulative: undefined } : state.memory,
    velocityCycleIndex: fullTemporary ? 0 : state.velocityCycleIndex,
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
  if (state.preferenceMode) {
    if (key === 'equals') {
      return { ...showPreference(state, (state.preferenceIndex ?? 0) + 1, state.preferenceMode), lastKey: key };
    }
    if (state.preferenceMode === 'edit' && (key === 'add' || key === 'subtract')) {
      return { ...adjustPreference(state, key === 'add' ? 1 : -1), lastKey: key };
    }
    return press({ ...state, preferenceMode: undefined, preferenceIndex: undefined }, key);
  }
  if (key === 'conv') {
    if (state.modifier === 'recall') {
      return { ...state, modifier: 'recall-convert', lastKey: key, display: { ...state.display, label: 'RCL CONV' } };
    }
    return { ...state, modifier: state.modifier === 'convert' ? undefined : 'convert', lastKey: key, display: { ...state.display, label: 'CONV' } };
  }
  if (key === 'recall') {
    if (state.modifier === 'recall') return { ...handleRecall(state, key), lastKey: key };
    if (state.modifier === 'convert') return { ...handleSecondary(state, key), lastKey: key };
    return { ...state, modifier: 'recall', lastKey: key, display: { ...state.display, label: 'RCL' } };
  }

  const next = state.modifier === 'convert'
    ? handleSecondary(state, key)
    : state.modifier === 'recall-convert'
      ? key === 'hip'
        ? handleRecall(state, key)
        : (() => { throw new CalcError('ENT Error'); })()
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
    return showError(action.type === 'press' ? { ...state, lastKey: action.key } : state, error);
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
