import {
  CalcError,
  CalcValue,
  DEFAULT_PREFERENCES,
  DISPLAY_MAX,
  ExpressionToken,
  FractionResolution,
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

export type DisplayValueProvenance =
  | 'raw-entry'
  | 'unit-source'
  | 'constant'
  | 'symbolic-expression'
  | 'computed'
  | 'recalled'
  | 'hvac'
  | 'derived-dms';

export interface DisplayValueMetadata {
  provenance: DisplayValueProvenance;
  exactness: 'exact' | 'approximate';
}

export interface ImperialEntryComponent {
  /** Exact text entered before the unit key, without the unit mark. */
  text: string;
  amountInches: number;
  unit: 'ft' | 'in';
}

/** Raw entry details retained only so the written formula mirrors what the operator entered. */
export interface DisplayDraftSnapshot {
  entry: string;
  fractionNumerator?: number;
  composedInches?: number;
  /** Exact feet/inches notation already committed by the operator (for example, 8′ 2″). */
  imperialEntryText?: string;
  current?: CalcValue;
  /** Already formatted screen value used when a calculated result starts the next expression. */
  committedText?: string;
  inputKind?: 'percent' | 'dms' | 'decimal-degree' | 'recalled';
  angleDisplayMode?: 'decimal' | 'dms';
  exponentBase?: CalcValue;
  /** Whether the visible operand is an exact value or a rounded screen representation. */
  metadata?: DisplayValueMetadata;
  /** Exact written source retained across a display-only unit or angle conversion. */
  sourceExpression?: DisplayExpressionToken[];
}

interface UnitEntryUndoState {
  entry: string;
  fractionNumerator?: number;
  composedInches?: number;
  imperialEntryText?: string;
  imperialEntryComponents?: ImperialEntryComponent[];
  current?: CalcValue;
  currentDisplayMetadata?: DisplayValueMetadata;
  currentSourceExpression?: DisplayExpressionToken[];
  displayExpression: DisplayExpressionToken[];
  display: DisplayState;
  inputActive: boolean;
}

export type DisplayFunction =
  | 'sqrt' | 'cuberoot' | 'reciprocal' | 'negate'
  | 'sin' | 'cos' | 'tan'
  | 'asin' | 'acos' | 'atan';

export type DisplayExpressionToken =
  | { type: 'value'; value: CalcValue; draft?: DisplayDraftSnapshot }
  | { type: 'operator'; operator: Operator }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'function-open'; function: DisplayFunction }
  | { type: 'function-close' }
  | { type: 'postfix'; symbol: string };

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

type LinearResultUnit = 'ft-in' | 'in' | 'm' | 'mm';

export interface CalculatorState {
  powered: boolean;
  preferences: Preferences;
  preferencesOpen: boolean;
  entry: string;
  fractionNumerator?: number;
  composedInches?: number;
  /** Exact feet/inches notation already committed by the operator. */
  imperialEntryText?: string;
  /** Structured unit-key history keeps Backspace and signs mathematically honest. */
  imperialEntryComponents?: ImperialEntryComponent[];
  current?: CalcValue;
  inputActive: boolean;
  inputKind?: 'percent' | 'dms' | 'decimal-degree' | 'recalled';
  angleDisplayMode?: 'decimal' | 'dms';
  expression: ExpressionToken[];
  /** Uncollapsed tokens used by the modern expression display. */
  displayExpression: DisplayExpressionToken[];
  /** Last completed expression, retained after Equals for user context. */
  completedExpression: DisplayExpressionToken[];
  /** Source value retained while a unit or angle conversion is shown as source → result. */
  transformationSource?: DisplayDraftSnapshot;
  /** Exactness of the rendered conversion target; source exactness remains separate. */
  transformationResultMetadata?: DisplayValueMetadata;
  /** One-step edit snapshot when a unit key commits a mixed-unit draft. */
  unitEntryUndo?: UnitEntryUndoState;
  /** Provenance for the current screen value when it later becomes an operand. */
  currentDisplayMetadata?: DisplayValueMetadata;
  /** Exact/annotated formula that produced the current value, when retaining it prevents lying. */
  currentSourceExpression?: DisplayExpressionToken[];
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
  triangleUnits: Partial<Record<keyof TriangleValues, LinearResultUnit>>;
  /** Approximation provenance for numeric geometry fields retained outside CalcValue. */
  triangleApproximate: Partial<Record<keyof TriangleValues, boolean>>;
  triangleUnitless?: boolean;
  permanentPitchSlope?: number;
  permanentPitchApproximate?: boolean;
  irregularPitchSlope?: number;
  irregularPitchApproximate?: boolean;
  circle: CircleValues;
  /** Approximation provenance for numeric circle fields retained outside CalcValue. */
  circleApproximate: Partial<Record<keyof CircleValues, boolean>>;
  circleResultUnit?: LinearResultUnit;
  circleRadiusUnit?: LinearResultUnit;
  onCenterApproximate?: boolean;
  desiredRiserApproximate?: boolean;
  sequence?: SequenceState;
  resultUnit?: LinearResultUnit;
  velocityCycleIndex: number;
  lastKey?: KeyId;
  history: HistoryItem[];
}

export interface PersistedCalculatorState {
  preferences: Preferences;
  permanentPitchSlope?: number;
  permanentPitchApproximate?: boolean;
  irregularPitchSlope?: number;
  irregularPitchApproximate?: boolean;
  onCenterApproximate?: boolean;
  desiredRiserApproximate?: boolean;
  memory: Pick<MemoryState, 'm1' | 'm2' | 'm3'>;
}

export type CalculatorAction =
  | { type: 'press'; key: KeyId }
  | { type: 'press-converted'; key: KeyId }
  | { type: 'set-preference'; key: keyof Preferences; value: Preferences[keyof Preferences] }
  | { type: 'reset-preferences' }
  | { type: 'factory-reset' }
  | { type: 'toggle-preferences'; open?: boolean }
  | { type: 'hydrate'; payload: unknown };

const ZERO_DISPLAY: DisplayState = {
  label: 'READY',
  valueText: '0.',
  unitText: '',
  plainText: '0',
};

const FRACTION_RESOLUTIONS = [2, 4, 8, 16, 32, 64] as const;

export function initialCalculatorState(): CalculatorState {
  return {
    powered: true,
    preferences: { ...DEFAULT_PREFERENCES },
    preferencesOpen: false,
    entry: '',
    inputActive: false,
    expression: [],
    displayExpression: [],
    completedExpression: [],
    parenthesisDepth: 0,
    display: { ...ZERO_DISPLAY },
    memory: {},
    registers: {},
    triangle: {},
    triangleInputs: [],
    triangleUnits: {},
    triangleApproximate: {},
    circle: {},
    circleApproximate: {},
    velocityCycleIndex: 0,
    history: [],
  };
}

function cloneDisplayExpression(
  items: DisplayExpressionToken[] | undefined,
): DisplayExpressionToken[] | undefined {
  return items?.map((item) => {
    if (item.type !== 'value') return { ...item };
    return {
      ...item,
      value: cloneValue(item.value),
      draft: item.draft
        ? {
            ...item.draft,
            current: item.draft.current ? cloneValue(item.draft.current) : undefined,
            exponentBase: item.draft.exponentBase
              ? cloneValue(item.draft.exponentBase)
              : undefined,
            metadata: item.draft.metadata ? { ...item.draft.metadata } : undefined,
            sourceExpression: cloneDisplayExpression(item.draft.sourceExpression),
          }
        : undefined,
    };
  });
}

function snapshotDisplayDraft(state: CalculatorState): DisplayDraftSnapshot {
  const hasRawEntry = Boolean(
    state.entry
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.imperialEntryText
    || state.exponentBase,
  );
  if (
    !hasRawEntry
    && state.transformationSource
    && (
      !state.current?.angle
      || Boolean(state.transformationSource.sourceExpression?.length)
    )
  ) {
    return {
      ...state.transformationSource,
      current: state.transformationSource.current
        ? cloneValue(state.transformationSource.current)
        : undefined,
      exponentBase: state.transformationSource.exponentBase
        ? cloneValue(state.transformationSource.exponentBase)
        : undefined,
      metadata: state.transformationSource.metadata
        ? { ...state.transformationSource.metadata }
        : undefined,
      sourceExpression: cloneDisplayExpression(state.transformationSource.sourceExpression),
    };
  }
  const directUnitSource = state.current?.source
    && state.display.label !== 'CONV'
    && (state.lastKey === 'feet' || state.lastKey === 'inch' || state.lastKey === 'meter');
  return {
    entry: state.entry,
    fractionNumerator: state.fractionNumerator,
    composedInches: state.composedInches,
    imperialEntryText: state.imperialEntryText,
    current: state.current ? cloneValue(state.current) : undefined,
    committedText: !hasRawEntry && state.current ? state.display.plainText : undefined,
    inputKind: state.inputKind,
    angleDisplayMode: state.angleDisplayMode,
    exponentBase: state.exponentBase ? cloneValue(state.exponentBase) : undefined,
    metadata: hasRawEntry
      ? { provenance: 'raw-entry', exactness: 'exact' }
      : state.currentDisplayMetadata
        ? { ...state.currentDisplayMetadata }
        : state.current
          ? {
              provenance: directUnitSource ? 'unit-source' : 'computed',
              exactness: displayRepresentsValueExactly(
                state.current,
                state.display,
                state.angleDisplayMode,
              ) ? 'exact' : 'approximate',
            }
          : undefined,
    sourceExpression: cloneDisplayExpression(state.currentSourceExpression),
  };
}

function displayValueToken(
  sourceState: CalculatorState,
  value: CalcValue,
): Extract<DisplayExpressionToken, { type: 'value' }> {
  const draft = snapshotDisplayDraft(sourceState);
  if (draft.fractionNumerator !== undefined && !draft.entry) {
    draft.entry = String(sourceState.preferences.fractionDenominator);
  }
  return {
    type: 'value',
    value: cloneValue(value),
    draft,
  };
}

function appendDisplayLiteral(
  state: CalculatorState,
  value: CalcValue,
  text: string,
): DisplayExpressionToken[] {
  const items = withoutDisplayedCurrentOperand(state);
  items.push({
    type: 'value',
    value: cloneValue(value),
    draft: {
      entry: '',
      current: cloneValue(value),
      committedText: text,
      metadata: { provenance: 'constant', exactness: 'exact' },
    },
  });
  return items;
}

function displayCompletesValue(item: DisplayExpressionToken | undefined): boolean {
  return item?.type === 'value'
    || item?.type === 'right'
    || item?.type === 'function-close'
    || item?.type === 'postfix';
}

function matchingDisplayOperandStart(items: DisplayExpressionToken[]): number {
  let end = items.length - 1;
  while (end >= 0 && items[end].type === 'postfix') end -= 1;
  if (end < 0) return 0;
  if (items[end].type === 'value') return end;
  if (items[end].type !== 'right' && items[end].type !== 'function-close') return end;

  let depth = 0;
  for (let index = end; index >= 0; index -= 1) {
    const part = items[index];
    if (part.type === 'right' || part.type === 'function-close') depth += 1;
    if (part.type === 'left' || part.type === 'function-open') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return end;
}

function withoutDisplayedCurrentOperand(state: CalculatorState): DisplayExpressionToken[] {
  if (!state.current || !displayCompletesValue(state.displayExpression.at(-1))) {
    return [...state.displayExpression];
  }
  return state.displayExpression.slice(0, matchingDisplayOperandStart(state.displayExpression));
}

function hasTopLevelDisplayOperator(items: DisplayExpressionToken[]): boolean {
  let depth = 0;
  for (const item of items) {
    if (item.type === 'left' || item.type === 'function-open') depth += 1;
    else if (item.type === 'right' || item.type === 'function-close') depth -= 1;
    else if (item.type === 'operator' && depth === 0) return true;
  }
  return false;
}

function trailingDisplayOperand(items: DisplayExpressionToken[]): DisplayExpressionToken[] {
  return items.slice(matchingDisplayOperandStart(items));
}

function appendReusableDisplayOperand(
  items: DisplayExpressionToken[],
  sourceState: CalculatorState,
  inputValue: CalcValue,
): void {
  const sourceExpression = cloneDisplayExpression(sourceState.currentSourceExpression);
  if (!sourceExpression?.length) {
    items.push(displayValueToken(sourceState, inputValue));
    return;
  }
  if (hasTopLevelDisplayOperator(sourceExpression)) items.push({ type: 'left' });
  items.push(...sourceExpression);
  if (hasTopLevelDisplayOperator(sourceExpression)) items.push({ type: 'right' });
}

function appendUnaryDisplay(
  sourceState: CalculatorState,
  finalizedState: CalculatorState,
  inputValue: CalcValue,
  operation: { type: 'postfix'; symbol: '²' | '³' } | { type: 'function'; function: DisplayFunction },
): DisplayExpressionToken[] {
  const items = [...finalizedState.displayExpression];
  if (!displayCompletesValue(items.at(-1))) {
    appendReusableDisplayOperand(items, sourceState, inputValue);
  }
  if (operation.type === 'postfix') {
    const start = matchingDisplayOperandStart(items);
    const startsWithNegation = items[start]?.type === 'function-open'
      && items[start].function === 'negate';
    const alreadyHasPostfix = items.at(-1)?.type === 'postfix';
    const alreadyParenthesized = items[start]?.type === 'left' && items.at(-1)?.type === 'right';
    const alreadyRenderedParenthesized = items[start]?.type === 'value'
      && Boolean(
        items[start].draft?.committedText?.startsWith('(')
        && items[start].draft?.committedText?.endsWith(')'),
      );
    if (
      !alreadyParenthesized
      && !alreadyRenderedParenthesized
      && (inputValue.power > 0 || inputValue.amount < 0 || startsWithNegation || alreadyHasPostfix)
    ) {
      items.splice(start, 0, { type: 'left' });
      items.push({ type: 'right' });
    }
    items.push({ type: 'postfix', symbol: operation.symbol });
    return items;
  }

  const start = matchingDisplayOperandStart(items);
  const end = items.length - 1;
  if (items[start]?.type === 'left' && items[end]?.type === 'right') {
    items[start] = { type: 'function-open', function: operation.function };
    items[end] = { type: 'function-close' };
  } else {
    items.splice(start, 0, { type: 'function-open', function: operation.function });
    items.push({ type: 'function-close' });
  }
  return items;
}

function preserveSymbolicResult(
  shownState: CalculatorState,
  displayExpression: DisplayExpressionToken[],
): CalculatorState {
  const exactness = shownState.currentDisplayMetadata?.exactness ?? 'approximate';
  const current = shownState.current
    ? {
        ...cloneValue(shownState.current),
        approximate: Boolean(shownState.current.approximate || exactness === 'approximate')
          || undefined,
      }
    : undefined;
  return {
    ...shownState,
    current,
    displayExpression,
    currentDisplayMetadata: {
      provenance: 'symbolic-expression',
      exactness,
    },
    currentSourceExpression: cloneDisplayExpression(trailingDisplayOperand(displayExpression)),
    inputActive: true,
  };
}

function standaloneTransformationSource(state: CalculatorState): DisplayDraftSnapshot | undefined {
  return state.expression.length
    ? undefined
    : snapshotDisplayDraft(state);
}

function showStandaloneTransformation(
  sourceState: CalculatorState,
  shownState: CalculatorState,
): CalculatorState {
  const transformationSource = standaloneTransformationSource(sourceState);
  const sourceMetadata = sourceState.currentDisplayMetadata ?? transformationSource?.metadata;
  const transformationResultMetadata = shownState.currentDisplayMetadata
    ? { ...shownState.currentDisplayMetadata }
    : undefined;
  const currentSourceExpression = cloneDisplayExpression(sourceState.currentSourceExpression)
    ?? (sourceState.current && sourceMetadata?.exactness === 'exact'
      ? [displayValueToken(sourceState, sourceState.current)]
      : undefined);
  return {
    ...shownState,
    completedExpression: transformationSource ? [] : shownState.completedExpression,
    transformationSource,
    transformationResultMetadata,
    currentDisplayMetadata: currentSourceExpression && sourceMetadata
      ? { ...sourceMetadata }
        : shownState.currentDisplayMetadata,
    currentSourceExpression,
  };
}

export function persistedState(state: CalculatorState): PersistedCalculatorState {
  return {
    preferences: state.preferences,
    permanentPitchSlope: state.permanentPitchSlope,
    permanentPitchApproximate: state.permanentPitchApproximate,
    irregularPitchSlope: state.irregularPitchSlope,
    irregularPitchApproximate: state.irregularPitchApproximate,
    onCenterApproximate: state.onCenterApproximate,
    desiredRiserApproximate: state.desiredRiserApproximate,
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
  if (value.approximate === true) sanitized.approximate = true;
  if (
    value.power === 1 && value.system === 'imperial' &&
    typeof value.fractionDenominator === 'number' &&
    FRACTION_RESOLUTIONS.includes(value.fractionDenominator as FractionResolution)
  ) {
    sanitized.fractionDenominator = value.fractionDenominator as FractionResolution;
  }

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
      if (
        typeof value.source.entryText === 'string'
        && value.source.entryText.length <= 32
        && /^-?(?:\d+(?:\.\d*)?|\d+\/\d+)$/.test(value.source.entryText)
      ) {
        sanitized.source.entryText = value.source.entryText;
      }
    }
  }
  return sanitized;
}

export function sanitizePersistedState(value: unknown): PersistedCalculatorState {
  const stored = isRecord(value) ? value : {};
  const rawPreferences = isRecord(stored.preferences) ? stored.preferences : {};
  const preferences: Preferences = { ...DEFAULT_PREFERENCES };
  if (
    typeof rawPreferences.fractionDenominator === 'number' &&
    FRACTION_RESOLUTIONS.includes(rawPreferences.fractionDenominator as FractionResolution)
  ) preferences.fractionDenominator = rawPreferences.fractionDenominator as FractionResolution;

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
    if (sanitized && sanitized.amount !== 0) memory[slot] = sanitized;
  }

  const result: PersistedCalculatorState = { preferences, memory };
  if (typeof stored.permanentPitchSlope === 'number' && Number.isFinite(stored.permanentPitchSlope) && stored.permanentPitchSlope > 0) {
    result.permanentPitchSlope = stored.permanentPitchSlope;
  }
  if (typeof stored.irregularPitchSlope === 'number' && Number.isFinite(stored.irregularPitchSlope) && stored.irregularPitchSlope > 0) {
    result.irregularPitchSlope = stored.irregularPitchSlope;
  }
  for (const key of [
    'permanentPitchApproximate',
    'irregularPitchApproximate',
    'onCenterApproximate',
    'desiredRiserApproximate',
  ] as const) {
    if (stored[key] === true) result[key] = true;
  }
  return result;
}

function displayFor(value: CalcValue, preferences: Preferences, label = '', note?: string): DisplayState {
  const precision = label === 'PA'
    ? { scalarMaxDecimals: 8, scalarSignificantDigits: 8 }
    : undefined;
  return { label, ...formatValue(value, preferences, precision), note };
}

function parseDisplayedMixedNumber(text: string): number | undefined {
  const normalized = text.trim().replace('−', '-');
  const mixed = normalized.match(/^(-?\d+)-(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const fraction = Number(mixed[2]) / Number(mixed[3]);
    return whole < 0 ? whole - fraction : whole + fraction;
  }
  const fraction = normalized.match(/^(-?)(\d+)\/(\d+)$/);
  if (fraction) {
    const amount = Number(fraction[2]) / Number(fraction[3]);
    return fraction[1] ? -amount : amount;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function parseDisplayedImperialLength(text: string): number | undefined {
  const normalized = text.trim().replace(/−/g, '-');
  const sign = normalized.startsWith('-') ? -1 : 1;
  const unsigned = normalized.replace(/^-/, '');
  const feetAndInches = unsigned.match(/^(\d+)′(?:\s+(.+)″)?$/);
  if (feetAndInches) {
    const inches = feetAndInches[2]
      ? parseDisplayedMixedNumber(feetAndInches[2])
      : 0;
    return inches === undefined ? undefined : sign * (Number(feetAndInches[1]) * 12 + inches);
  }
  const inchesOnly = unsigned.match(/^(.+)″$/);
  if (!inchesOnly) return undefined;
  const inches = parseDisplayedMixedNumber(inchesOnly[1]);
  return inches === undefined ? undefined : sign * inches;
}

function displayNumbersMatch(actual: number, displayed: number): boolean {
  // Exactness is a truth claim, so use a strict numeric round-trip. Even a
  // one-ULP tolerance can conceal several visible units near 1e16.
  return actual === displayed;
}

function displayRepresentsValueExactly(
  value: CalcValue,
  display: DisplayState,
  angleDisplayMode?: 'decimal' | 'dms',
): boolean {
  const plainText = display.plainText.trim().replace(/−/g, '-');
  if (value.angle) {
    if (angleDisplayMode === 'dms' || /^-?\d+\.\d{2}\.\d{2}$/.test(plainText)) {
      const match = plainText.match(/^(-?)(\d+)\.(\d{2})\.(\d{2})$/);
      if (!match) return false;
      const sign = match[1] ? -1 : 1;
      const displayed = sign * (
        Number(match[2]) + Number(match[3]) / 60 + Number(match[4]) / 3600
      );
      return displayNumbersMatch(value.amount, displayed);
    }
    const displayed = Number(plainText.replace(/°$/, ''));
    return Number.isFinite(displayed) && displayNumbersMatch(value.amount, displayed);
  }

  if (value.power === 0) {
    const displayed = Number(plainText);
    return Number.isFinite(displayed) && displayNumbersMatch(value.amount, displayed);
  }

  if (value.power === 1 && (plainText.includes('′') || plainText.includes('″'))) {
    const displayed = parseDisplayedImperialLength(plainText);
    return displayed !== undefined && displayNumbersMatch(value.amount, displayed);
  }

  const displayedNumber = Number.parseFloat(plainText);
  if (!Number.isFinite(displayedNumber)) return false;
  const unit = display.unitText.replace(/\s+/g, ' ').trim().toUpperCase();
  const factor = value.power === 1
    ? unit === 'M' ? 1 / 0.0254
      : unit === 'MM' ? 1 / 25.4
        : unit === 'FEET' ? 12
          : unit === 'INCH' ? 1
            : unit === 'YARDS' ? 36
              : unit === 'KM' ? 1000 / 0.0254
                : undefined
    : unit === 'SQ M' || unit === 'CU M' ? 1 / 0.0254 ** value.power
      : unit === 'SQ MM' || unit === 'CU MM' ? 1 / 25.4 ** value.power
        : unit === 'SQ FEET' || unit === 'CU FEET' ? 12 ** value.power
          : unit === 'SQ INCH' || unit === 'CU INCH' ? 1
            : undefined;
  return factor !== undefined && displayNumbersMatch(value.amount, displayedNumber * factor);
}

function displayMetadata(
  value: CalcValue,
  display: DisplayState,
  provenance: DisplayValueProvenance,
  angleDisplayMode?: 'decimal' | 'dms',
): DisplayValueMetadata {
  return {
    provenance,
    exactness: !value.approximate && displayRepresentsValueExactly(value, display, angleDisplayMode)
      ? 'exact'
      : 'approximate',
  };
}

function dmsDisplayText(encoded: number): string {
  const normalized = Number(encoded.toFixed(4));
  const sign = normalized < 0 ? '−' : '';
  const [whole, fraction = ''] = Math.abs(normalized).toFixed(4).split('.');
  return `${sign}${whole}.${fraction.slice(0, 2)}.${fraction.slice(2, 4)}`;
}

function pendingDisplay(state: CalculatorState): DisplayState {
  if (state.fractionNumerator !== undefined) {
    const denominator = state.entry || String(state.preferences.fractionDenominator);
    const text = `${state.fractionNumerator}/${denominator}`;
    if (state.composedInches !== undefined && Number(denominator) > 0) {
      const unit = state.current?.unit === 'in' || state.current?.unit === 'decimal-in'
        ? 'in'
        : 'ft-in';
      const exactFractionPreferences: Preferences = {
        ...state.preferences,
        fractionDenominator: Number(denominator) as Preferences['fractionDenominator'],
        constantFraction: false,
      };
      const formatted = formatValue({
        amount: state.composedInches + state.fractionNumerator / Number(denominator),
        power: 1,
        unit,
        system: 'imperial',
      }, exactFractionPreferences);
      return { label: 'ENTRY', ...formatted };
    }
    if (state.composedInches !== undefined) {
      const base = formatValue({
        amount: state.composedInches,
        power: 1,
        unit: state.current?.unit === 'in' || state.current?.unit === 'decimal-in' ? 'in' : 'ft-in',
        system: 'imperial',
      }, state.preferences);
      return {
        label: 'ENTRY',
        valueText: `${base.valueText}+${text}`,
        unitText: base.unitText,
        plainText: `${base.plainText} + ${text}\u2033`,
      };
    }
    return { label: 'ENTRY', valueText: text, unitText: 'INCH', plainText: `${text}\u2033` };
  }
  if (!state.entry && state.composedInches !== undefined && state.current) {
    return { label: 'ENTRY', ...formatValue(state.current, state.preferences) };
  }
  const dmsEntry = (state.entry.match(/\./g) ?? []).length >= 2;
  return {
    label: dmsEntry ? 'DMS' : state.inputKind === 'percent' ? '% ENTRY' : 'ENTRY',
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
  let normalized = state.entry;
  if (parts.length > 2) {
    if (state.composedInches !== undefined) throw new CalcError('ENT Error');
    if (parts.length > 3) throw new CalcError('ENT Error');
    const minutes = parts[1] || '0';
    const seconds = parts[2] || '0';
    if (minutes.length > 2 || seconds.length > 2) throw new CalcError('ENT Error');
    normalized = `${parts[0] || '0'}.${minutes.padStart(2, '0')}${seconds.padStart(2, '0')}`;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new CalcError('ENT Error');
  return value;
}

function enteredFractionResolution(state: CalculatorState): FractionResolution | undefined {
  if (state.fractionNumerator === undefined) return undefined;
  const denominator = Number(state.entry || state.preferences.fractionDenominator);
  return FRACTION_RESOLUTIONS.includes(denominator as FractionResolution)
    ? denominator as FractionResolution
    : undefined;
}

function enteredNumberText(state: CalculatorState, fallback: number): string {
  if (state.fractionNumerator !== undefined) {
    return `${state.fractionNumerator}/${state.entry || state.preferences.fractionDenominator}`;
  }
  const raw = state.entry || String(fallback);
  if (raw.startsWith('-.')) return `-0${raw.slice(1)}`;
  if (raw.startsWith('.')) return `0${raw}`;
  return raw;
}

function renderImperialComponents(components: ImperialEntryComponent[]): string | undefined {
  let written = '';
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const negative = component.amountInches < 0 || component.text.startsWith('-');
    const magnitude = component.text.replace(/^-/, '');
    const marked = `${magnitude}${component.unit === 'ft' ? '′' : '″'}`;
    if (!written) {
      written = `${negative ? '−' : ''}${marked}`;
      continue;
    }

    const previous = components[index - 1];
    const previousNegative = previous.amountInches < 0 || previous.text.startsWith('-');
    const combinesPositiveFraction = !negative
      && !previousNegative
      && component.unit === 'in'
      && previous.unit === 'in'
      && /^\d+\/\d+$/.test(component.text)
      && /^\d+$/.test(previous.text)
      && written.endsWith('″');
    if (combinesPositiveFraction) {
      written = `${written.slice(0, -1)} ${marked}`;
      continue;
    }

    const conventionalFeetInches = !negative
      && !previousNegative
      && component.unit === 'in'
      && previous.unit === 'ft';
    if (conventionalFeetInches) {
      written = `${written} ${marked}`;
      continue;
    }
    written = `${written}${negative ? ' − ' : ' + '}${marked}`;
  }
  return written || undefined;
}

function imperialValueFromComponents(components: ImperialEntryComponent[]): CalcValue {
  const amount = components.reduce((sum, component) => sum + component.amountInches, 0);
  const hasFeet = components.some((component) => component.unit === 'ft');
  const single = components.length === 1 ? components[0] : undefined;
  return {
    amount,
    power: 1,
    unit: hasFeet ? (single ? 'decimal-ft' : 'ft-in') : (single ? 'decimal-in' : 'in'),
    system: 'imperial',
    source: single
      ? {
          amount: single.amountInches / (single.unit === 'ft' ? 12 : 1),
          unit: single.unit,
          power: 1,
          entryText: single.text,
        }
      : undefined,
  };
}

function exactUnitEntryText(
  entryText: string,
  unit: 'ft' | 'in' | 'm' | 'mm',
  power: number,
): string {
  const coefficient = entryText.replace(/^-/, '−');
  if (power === 1 && (unit === 'ft' || unit === 'in')) {
    return `${coefficient}${unit === 'ft' ? '′' : '″'}`;
  }
  const exponent = power === 2 ? '²' : power === 3 ? '³' : '';
  return `${coefficient} ${unit}${exponent}`;
}

function unitSourceSymbol(
  unit: 'ft' | 'in' | 'm' | 'mm',
  power: number,
): string {
  if (power === 1) {
    if (unit === 'ft') return '′';
    if (unit === 'in') return '″';
    return unit;
  }
  return `${unit}${power === 2 ? '²' : '³'}`;
}

function sourceExpressionWithAssignedUnit(
  source: DisplayExpressionToken[] | undefined,
  unit: 'ft' | 'in' | 'm' | 'mm',
  power = 1,
): DisplayExpressionToken[] | undefined {
  const expression = cloneDisplayExpression(source);
  if (!expression?.length) return undefined;
  if (hasTopLevelDisplayOperator(expression)) {
    expression.unshift({ type: 'left' });
    expression.push({ type: 'right' });
  }
  expression.push({ type: 'postfix', symbol: unitSourceSymbol(unit, power) });
  return expression;
}

function cycledUnitSourceExpression(
  state: CalculatorState,
  source: NonNullable<CalcValue['source']>,
  nextPower: number,
  value: CalcValue,
  entryText: string,
): DisplayExpressionToken[] {
  const expression = cloneDisplayExpression(state.currentSourceExpression);
  const last = expression?.at(-1);
  if (
    expression?.length
    && last?.type === 'postfix'
    && last.symbol === unitSourceSymbol(source.unit, source.power)
  ) {
    expression[expression.length - 1] = {
      type: 'postfix',
      symbol: unitSourceSymbol(source.unit, nextPower),
    };
    return expression;
  }
  return exactWrittenOperand(value, exactUnitEntryText(entryText, source.unit, nextPower));
}

function exactWrittenOperand(value: CalcValue, text: string): DisplayExpressionToken[] {
  const committedText = text.includes(' + ') || text.includes(' − ')
    ? `(${text})`
    : text;
  return [{
    type: 'value',
    value: cloneValue(value),
    draft: {
      entry: '',
      current: cloneValue(value),
      committedText,
      metadata: {
        provenance: 'raw-entry',
        exactness: value.approximate ? 'approximate' : 'exact',
      },
    },
  }];
}

function finalizeInput(state: CalculatorState): { state: CalculatorState; value?: CalcValue } {
  const number = numericEntry(state);
  const fractionDenominator = enteredFractionResolution(state);
  const dmsEntry = state.composedInches === undefined
    && state.fractionNumerator === undefined
    && (state.entry.match(/\./g) ?? []).length >= 2;
  const standaloneFraction = state.fractionNumerator !== undefined && state.composedInches === undefined;
  const hasEnteredValue = number !== undefined || state.composedInches !== undefined;
  let value = state.current;
  let composed = state.composedInches;
  let imperialEntryText = state.imperialEntryText;
  let imperialEntryComponents = state.imperialEntryComponents
    ? state.imperialEntryComponents.map((component) => ({ ...component }))
    : undefined;

  if (number !== undefined) {
    if (composed !== undefined) {
      composed += number;
      const unit = state.current?.unit === 'in' || state.current?.unit === 'decimal-in' ? 'in' : 'ft-in';
      value = { amount: composed, power: 1, unit, system: 'imperial' };
      value.fractionDenominator = fractionDenominator;
      const component: ImperialEntryComponent = {
        text: enteredNumberText(state, number),
        amountInches: number,
        unit: 'in',
      };
      imperialEntryComponents = [...(imperialEntryComponents ?? []), component];
      imperialEntryText = renderImperialComponents(imperialEntryComponents);
    } else {
      value = dmsEntry
        ? degrees(convertDms(number, true))
        : standaloneFraction ? measurement(number, 'in', 1, fractionDenominator) : scalar(number);
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

  const next: CalculatorState = {
    ...state,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    imperialEntryText: undefined,
    imperialEntryComponents: undefined,
    current: value,
    currentDisplayMetadata: hasEnteredValue
      ? { provenance: 'raw-entry', exactness: 'exact' }
      : state.currentDisplayMetadata,
    currentSourceExpression: imperialEntryText && value
      ? exactWrittenOperand(value, imperialEntryText)
      : hasEnteredValue ? undefined : state.currentSourceExpression,
    inputActive: Boolean(value && state.inputActive),
    inputKind: dmsEntry ? 'dms' : state.inputKind,
    angleDisplayMode: dmsEntry ? 'dms' : state.angleDisplayMode,
    display: dmsEntry && value
      ? {
          label: 'DMS',
          valueText: dmsDisplayText(convertDms(value.amount, false)),
          unitText: '',
          plainText: dmsDisplayText(convertDms(value.amount, false)),
        }
      : state.display,
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
  const exponentIsApproximate = Boolean(
    finalized.value.approximate
    || finalized.state.currentDisplayMetadata?.exactness === 'approximate',
  );
  const factor = scalar(10 ** exponent);
  factor.approximate = exponentIsApproximate || undefined;
  const value = operate(base, '*', factor);
  const displayExpression = [...finalized.state.displayExpression];
  if (!displayCompletesValue(displayExpression.at(-1))) {
    appendReusableDisplayOperand(displayExpression, finalized.state, base);
  }
  const exponentText = String(exponent).replace('-', '−');
  displayExpression.push({
    type: 'postfix',
    symbol: `× 10^${exponentIsApproximate ? `≈${exponentText}` : exponentText}`,
  });
  const resultDisplay = displayFor(value, finalized.state.preferences, 'RESULT');
  return {
    state: {
      ...finalized.state,
      exponentBase: undefined,
      current: value,
      displayExpression,
      currentDisplayMetadata: displayMetadata(
        value,
        resultDisplay,
        'symbolic-expression',
        finalized.state.angleDisplayMode,
      ),
      currentSourceExpression: cloneDisplayExpression(trailingDisplayOperand(displayExpression)),
      inputActive: true,
    },
    value,
  };
}

function requireInput(state: CalculatorState): { state: CalculatorState; value: CalcValue } {
  const finalized = finalizeExponent(finalizeInput(state));
  if (!finalized.value) throw new CalcError('ENT Error');
  const approximate = Boolean(
    finalized.value.approximate
    || finalized.state.currentDisplayMetadata?.exactness === 'approximate',
  );
  if (!approximate) return finalized as { state: CalculatorState; value: CalcValue };
  const value = { ...cloneValue(finalized.value), approximate: true };
  return {
    state: { ...finalized.state, current: cloneValue(value) },
    value,
  };
}

function markValueApproximate(value: CalcValue, approximate: boolean): CalcValue {
  const next = cloneValue(value);
  if (approximate) next.approximate = true;
  return next;
}

function markResultsApproximate(results: NamedResult[], approximate: boolean): NamedResult[] {
  if (!approximate) return results;
  return results.map((result) => ({
    ...result,
    value: markValueApproximate(result.value, true),
  }));
}

function approximationMapHasValue<T extends string>(
  values: Partial<Record<T, boolean>>,
): boolean {
  return Object.values(values).some(Boolean);
}

function hasPendingInput(state: CalculatorState): boolean {
  return state.inputActive
    || Boolean(state.entry)
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.exponentBase !== undefined;
}

function rejectUnusedInput(state: CalculatorState): void {
  const hasUnfinishedDraft = Boolean(state.entry)
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.exponentBase !== undefined;
  if (!hasUnfinishedDraft) return;
  requireInput(state);
  throw new CalcError('ENT Error');
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

function showValue(
  state: CalculatorState,
  value: CalcValue,
  label = '',
  note?: string,
  provenance: DisplayValueProvenance = 'computed',
): CalculatorState {
  const display = displayFor(value, state.preferences, label, note);
  return pushHistory({
    ...state,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    imperialEntryText: undefined,
    imperialEntryComponents: undefined,
    exponentBase: undefined,
    current: cloneValue(value),
    displayExpression: withoutDisplayedCurrentOperand(state),
    completedExpression: [],
    transformationSource: undefined,
    transformationResultMetadata: undefined,
    unitEntryUndo: undefined,
    currentDisplayMetadata: displayMetadata(value, display, provenance, state.angleDisplayMode),
    currentSourceExpression: undefined,
    display,
    inputActive: false,
  }, display);
}

function showEnteredArcAngle(state: CalculatorState, value: CalcValue): CalculatorState {
  const rounded = value.amount.toFixed(2);
  const text = Number(rounded) === 0 ? '0.00' : rounded.replace('-', '−');
  const display: DisplayState = {
    label: 'ARC',
    valueText: text,
    unitText: 'DEG',
    plainText: `${text}°`,
  };
  return pushHistory({
    ...state,
    current: cloneValue(value),
    displayExpression: withoutDisplayedCurrentOperand(state),
    completedExpression: [],
    transformationSource: undefined,
    transformationResultMetadata: undefined,
    currentDisplayMetadata: displayMetadata(value, display, 'hvac', state.angleDisplayMode),
    currentSourceExpression: undefined,
    display,
    inputActive: false,
  }, display);
}

function showDmsValue(state: CalculatorState, value: CalcValue, label = 'DMS'): CalculatorState {
  const encoded = convertDms(value.amount, false);
  const dmsText = dmsDisplayText(encoded);
  const display = {
    ...formatValue(scalar(encoded), state.preferences),
    label,
    valueText: dmsText,
    plainText: dmsText,
  };
  return pushHistory({
    ...state,
    current: cloneValue(value),
    displayExpression: withoutDisplayedCurrentOperand(state),
    completedExpression: [],
    transformationSource: undefined,
    currentDisplayMetadata: displayMetadata(value, display, 'derived-dms', 'dms'),
    currentSourceExpression: undefined,
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
    modifier: undefined,
    sequence: undefined,
    inputActive: false,
    transformationSource: undefined,
    transformationResultMetadata: undefined,
    display: { label: 'ERROR', valueText: code, unitText: '', plainText: code },
  };
}

function setSequence(
  state: CalculatorState,
  id: string,
  results: NamedResult[],
  trigger: KeyId,
  initialIndex = 0,
  approximate = false,
): CalculatorState {
  const shownResults = markResultsApproximate(results, approximate);
  if (!shownResults.length) throw new CalcError('ENT Error');
  const index = Math.max(0, Math.min(initialIndex, shownResults.length - 1));
  const result = shownResults[index];
  return showValue(
    { ...state, sequence: { id, results: shownResults, index, trigger } },
    result.value,
    result.label,
    result.note,
    'hvac',
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
    'hvac',
  );
}

function prepareNumericEntry(state: CalculatorState): CalculatorState {
  let next = clearSequence(state);
  const startsFreshValue = !next.entry
    && next.fractionNumerator === undefined
    && next.composedInches === undefined
    && next.exponentBase === undefined;
  if (startsFreshValue) {
    const displayExpression = next.lastKey === 'equals'
      ? []
      : withoutDisplayedCurrentOperand(next);
    next = {
      ...next,
      current: undefined,
      inputKind: undefined,
      angleDisplayMode: next.expression.length ? next.angleDisplayMode : undefined,
      expression: next.lastKey === 'equals' ? [] : next.expression,
      displayExpression,
      completedExpression: [],
      transformationSource: undefined,
      transformationResultMetadata: undefined,
      unitEntryUndo: undefined,
      currentDisplayMetadata: undefined,
      currentSourceExpression: undefined,
      imperialEntryText: undefined,
      imperialEntryComponents: undefined,
    };
  }
  return next;
}

function addDigit(state: CalculatorState, digit: string): CalculatorState {
  const next = prepareNumericEntry(state);
  const entryParts = next.entry.split('.');
  if (entryParts.length >= 3 && (entryParts.at(-1)?.length ?? 0) >= 2) return next;
  const entry = next.entry === '0' && digit !== '0' && next.fractionNumerator === undefined
    ? digit
    : `${next.entry}${digit}`.slice(0, 12);
  const withEntry = { ...next, entry, inputActive: true, modifier: undefined };
  return { ...withEntry, display: pendingDisplay(withEntry) };
}

function addDecimal(state: CalculatorState): CalculatorState {
  if (state.fractionNumerator !== undefined) throw new CalcError('ENT Error');
  let next = prepareNumericEntry(state);
  const separators = (next.entry.match(/\./g) ?? []).length;
  if (next.composedInches !== undefined && separators >= 1) return next;
  if (separators >= 2 || next.entry.endsWith('.')) return next;
  if (separators === 1) {
    const minutes = next.entry.split('.')[1] || '0';
    if (minutes.length > 2) throw new CalcError('ENT Error');
  }
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

function combinedLinearResultUnit(units: Array<LinearResultUnit | undefined>): LinearResultUnit | undefined {
  const defined = units.filter((unit): unit is LinearResultUnit => unit !== undefined);
  if (!defined.length) return undefined;
  if (defined.every((unit) => unit === defined[0])) return defined[0];
  const metric = (unit: LinearResultUnit) => unit === 'm' || unit === 'mm';
  if (defined.every(metric)) return 'm';
  return 'ft-in';
}

function resultUnitForValues(values: CalcValue[]): LinearResultUnit | undefined {
  return combinedLinearResultUnit(values.map(linearResultUnit));
}

function forceResultUnit(value: CalcValue, unit: LinearResultUnit | undefined): CalcValue {
  if (!unit || value.angle || value.power < 1 || value.power > 3) return value;
  const baseUnit = unit === 'ft-in' ? 'ft' : unit;
  return withUnit(value, unitHintFor(baseUnit, value.power));
}

function resultsInUnit(results: NamedResult[], unit: LinearResultUnit | undefined): NamedResult[] {
  return results.map((result) => ({ ...result, value: forceResultUnit(result.value, unit) }));
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
  if (state.exponentBase) {
    const finalized = finalizeExponent(finalizeInput(state));
    if (!finalized.value || finalized.value.angle) throw new CalcError('TYP Error');
    const assignsUnit = finalized.value.power === 0;
    const value = assignsUnit
      ? measurement(finalized.value.amount, unit)
      : withUnit(finalized.value, unitHintFor(unit, finalized.value.power));
    value.approximate = Boolean(
      finalized.value.approximate
      || finalized.state.currentDisplayMetadata?.exactness === 'approximate',
    ) || undefined;
    const shown = showValue(
      finalized.state,
      value,
      unit.toUpperCase(),
      undefined,
      'symbolic-expression',
    );
    const currentSourceExpression = assignsUnit
      ? sourceExpressionWithAssignedUnit(finalized.state.currentSourceExpression, unit)
      : cloneDisplayExpression(finalized.state.currentSourceExpression);
    const presented = assignsUnit
      ? shown
      : showStandaloneTransformation(finalized.state, shown);
    return {
      ...presented,
      currentSourceExpression,
      currentDisplayMetadata: currentSourceExpression?.length
        ? {
            provenance: 'symbolic-expression',
            exactness: value.approximate ? 'approximate' : 'exact',
          }
        : presented.currentDisplayMetadata,
      inputActive: true,
    };
  }
  if ((state.entry.match(/\./g) ?? []).length >= 2) {
    throw new CalcError('TYP Error');
  }
  const number = numericEntry(state);
  if (number === undefined) {
    const source = state.current?.source;
    const unitKey: KeyId = unit === 'ft' ? 'feet' : unit === 'in' ? 'inch' : 'meter';
    const repeatedUnit = (
      state.lastKey === unitKey
      || (state.lastKey === 'backspace' && state.display.label !== 'ENTRY')
    ) && (
      source?.unit === unit || (source?.unit === 'mm' && unit === 'm')
    );
    if (source && repeatedUnit) {
      const nextPower = source.power === 3 ? 1 : source.power + 1;
      const entryText = source.entryText
        ?? (state.imperialEntryComponents?.length === 1
          ? state.imperialEntryComponents[0].text
          : String(source.amount));
      const value = measurement(source.amount, source.unit, nextPower);
      value.approximate = Boolean(
        state.current?.approximate
        || state.currentDisplayMetadata?.exactness === 'approximate',
      ) || undefined;
      if (value.source) value.source.entryText = entryText;
      const shown = showValue(
        { ...state, entry: '', fractionNumerator: undefined, composedInches: undefined },
        value,
        nextPower === 1 ? unit.toUpperCase() : nextPower === 2 ? 'AREA' : 'VOL',
        undefined,
        'unit-source',
      );
      return {
        ...shown,
        currentSourceExpression: cycledUnitSourceExpression(
          state,
          source,
          nextPower,
          value,
          entryText,
        ),
        currentDisplayMetadata: {
          provenance: state.currentSourceExpression?.at(-1)?.type === 'postfix'
            ? 'symbolic-expression'
            : 'unit-source',
          exactness: value.approximate ? 'approximate' : 'exact',
        },
        inputActive: true,
      };
    }
    if (state.current?.power === 1 && unit === 'ft') {
      const hint = state.current.unit === 'decimal-ft'
        ? 'ft-in'
        : state.current.unit === 'in' ? 'ft-in' : 'decimal-ft';
      return showStandaloneTransformation(
        state,
        showValue({ ...state, composedInches: undefined }, withUnit(state.current, hint), 'CONV'),
      );
    }
    if (state.current?.power === 1 && unit === 'in') {
      const hint = state.current.unit === 'decimal-in' ? 'in' : 'decimal-in';
      return showStandaloneTransformation(
        state,
        showValue({ ...state, composedInches: undefined }, withUnit(state.current, hint), 'CONV'),
      );
    }
    if (state.current && state.current.power > 0) {
      return showStandaloneTransformation(
        state,
        showValue(
          { ...state, composedInches: undefined },
          withUnit(state.current, unitHintFor(unit, state.current.power)),
          'CONV',
        ),
      );
    }
    if (
      state.current?.power === 0
      && state.currentSourceExpression?.length
      && state.lastKey === 'backspace'
      && state.display.label === 'ENTRY'
    ) {
      const value = measurement(state.current.amount, unit);
      value.approximate = state.current.approximate || undefined;
      const shown = showValue(state, value, unit.toUpperCase(), undefined, 'symbolic-expression');
      return {
        ...shown,
        currentSourceExpression: sourceExpressionWithAssignedUnit(
          state.currentSourceExpression,
          unit,
        ),
        currentDisplayMetadata: {
          provenance: 'symbolic-expression',
          exactness: value.approximate ? 'approximate' : 'exact',
        },
        inputActive: true,
      };
    }
    throw new CalcError('ENT Error');
  }

  if (unit === 'ft' || unit === 'in') {
    const fractionDenominator = enteredFractionResolution(state);
    const amountInches = number * (unit === 'ft' ? 12 : 1);
    const composed = (state.composedInches ?? 0) + amountInches;
    const imperialEntryComponents = [
      ...(state.imperialEntryComponents ?? []),
      { text: enteredNumberText(state, number), amountInches, unit },
    ];
    const imperialEntryText = renderImperialComponents(imperialEntryComponents);
    const hasFeet = unit === 'ft'
      || state.current?.unit === 'ft-in'
      || state.current?.unit === 'decimal-ft';
    const value: CalcValue = {
      amount: composed,
      power: 1,
      unit: hasFeet ? 'decimal-ft' : 'decimal-in',
      system: 'imperial',
      fractionDenominator,
      source: state.composedInches === undefined
        ? { amount: number, unit, power: 1, entryText: enteredNumberText(state, number) }
        : undefined,
    };
    if (state.composedInches !== undefined) value.unit = hasFeet ? 'ft-in' : 'in';
    const next: CalculatorState = {
      ...state,
      entry: '',
      fractionNumerator: undefined,
      composedInches: composed,
      imperialEntryText,
      imperialEntryComponents,
      current: value,
      currentDisplayMetadata: { provenance: 'unit-source', exactness: 'exact' },
      currentSourceExpression: undefined,
      inputActive: true,
      modifier: undefined,
      display: displayFor(value, state.preferences, unit === 'ft' ? 'FEET' : 'INCH'),
    };
    return next;
  }

  const entryText = enteredNumberText(state, number);
  if (state.composedInches !== undefined && state.current) {
    const metricComponent = measurement(number, unit);
    if (metricComponent.source) metricComponent.source.entryText = entryText;
    const combined = operate(state.current, '+', metricComponent);
    const value = withUnit(combined, unitHintFor(unit, 1));
    const baseText = state.imperialEntryText
      ?? renderImperialComponents(state.imperialEntryComponents ?? [])
      ?? `${state.composedInches}″`;
    const written = `${baseText} + ${exactUnitEntryText(entryText, unit, 1)}`;
    const unitEntryUndo: UnitEntryUndoState = {
      entry: state.entry,
      fractionNumerator: state.fractionNumerator,
      composedInches: state.composedInches,
      imperialEntryText: state.imperialEntryText,
      imperialEntryComponents: state.imperialEntryComponents?.map((component) => ({ ...component })),
      current: state.current ? cloneValue(state.current) : undefined,
      currentDisplayMetadata: state.currentDisplayMetadata
        ? { ...state.currentDisplayMetadata }
        : undefined,
      currentSourceExpression: cloneDisplayExpression(state.currentSourceExpression),
      displayExpression: cloneDisplayExpression(state.displayExpression) ?? [],
      display: { ...state.display },
      inputActive: state.inputActive,
    };
    const shown = showValue(
      {
        ...state,
        entry: '',
        fractionNumerator: undefined,
        composedInches: undefined,
        imperialEntryText: undefined,
        imperialEntryComponents: undefined,
        inputActive: true,
      },
      value,
      unit.toUpperCase(),
      undefined,
      'symbolic-expression',
    );
    return {
      ...shown,
      currentSourceExpression: exactWrittenOperand(value, written),
      unitEntryUndo,
      inputActive: true,
    };
  }

  const value = measurement(number, unit);
  if (value.source) value.source.entryText = entryText;
  if (
    unit === 'm' &&
    state.fractionNumerator === undefined &&
    state.composedInches === undefined &&
    Math.abs(number) <= DISPLAY_MAX
  ) {
    const rawText = state.entry || String(number);
    const valueText = rawText.replace('-', '−');
    const display: DisplayState = {
      label: 'M',
      valueText,
      unitText: 'M',
      plainText: `${valueText} m`,
    };
    return pushHistory({
      ...state,
      entry: '',
      fractionNumerator: undefined,
      composedInches: undefined,
      imperialEntryText: undefined,
      imperialEntryComponents: undefined,
      current: value,
      currentDisplayMetadata: { provenance: 'unit-source', exactness: 'exact' },
      currentSourceExpression: exactWrittenOperand(
        value,
        exactUnitEntryText(entryText, unit, 1),
      ),
      inputActive: true,
      modifier: undefined,
      display,
    }, display);
  }
  const shown = showValue(
    {
      ...state,
      entry: '',
      fractionNumerator: undefined,
      composedInches: undefined,
      imperialEntryText: undefined,
      imperialEntryComponents: undefined,
      inputActive: true,
    },
    value,
    unit.toUpperCase(),
    undefined,
    'unit-source',
  );
  return {
    ...shown,
    currentSourceExpression: exactWrittenOperand(
      value,
      exactUnitEntryText(entryText, unit, 1),
    ),
    currentDisplayMetadata: { provenance: 'unit-source', exactness: 'exact' },
    inputActive: true,
  };
}

function commitOperator(state: CalculatorState, operator: Operator): CalculatorState {
  const finalized = finalizeExponent(finalizeInput(state));
  const tokens = [...finalized.state.expression];
  if (finalized.value && (tokens.at(-1)?.type !== 'value')) {
    tokens.push({ type: 'value', value: cloneValue(finalized.value) });
  }
  if (!tokens.length || tokens.at(-1)?.type === 'left') throw new CalcError('ENT Error');
  if (tokens.at(-1)?.type === 'operator') tokens[tokens.length - 1] = { type: 'operator', operator };
  else tokens.push({ type: 'operator', operator });
  const displayExpression = [...finalized.state.displayExpression];
  if (
    finalized.value
    && !displayCompletesValue(displayExpression.at(-1))
  ) {
    appendReusableDisplayOperand(displayExpression, finalized.state, finalized.value);
  }
  if (displayExpression.at(-1)?.type === 'operator') {
    displayExpression[displayExpression.length - 1] = { type: 'operator', operator };
  } else {
    displayExpression.push({ type: 'operator', operator });
  }
  let display: DisplayState = { ...finalized.state.display, label: operator };
  const completedPrefix = tokens.slice(0, -1);
  if (finalized.state.parenthesisDepth === 0 && completedPrefix.at(-1)?.type === 'value') {
    try {
      const preview = evaluateExpression(completedPrefix, finalized.state.preferences.mathMode);
      display = displayFor(preview, finalized.state.preferences, operator);
    } catch (error) {
      // A higher-precedence operand can make an otherwise incompatible prefix valid,
      // for example: 1 Feet + 2 × 3 Feet. Keep accepting the expression and let
      // Equals validate the completed token stream.
      if (!(error instanceof CalcError)) throw error;
    }
  }
  return {
    ...finalized.state,
    expression: tokens,
    displayExpression,
    completedExpression: [],
    transformationSource: undefined,
    transformationResultMetadata: undefined,
    unitEntryUndo: undefined,
    currentDisplayMetadata: undefined,
    currentSourceExpression: undefined,
    current: undefined,
    inputActive: false,
    inputKind: undefined,
    sequence: undefined,
    display,
  };
}

function calculateEquals(state: CalculatorState): CalculatorState {
  const finalized = finalizeExponent(finalizeInput(state));

  const tokens = [...finalized.state.expression];
  if (
    !tokens.length
    && state.completedExpression.length
    && (state.lastKey === 'equals' || state.display.label === 'RESULT')
  ) {
    return state;
  }
  if (!tokens.length && finalized.value) {
    const recalledInput = finalized.state.inputKind === 'recalled';
    const shown = finalized.value.angle && finalized.state.angleDisplayMode === 'dms'
      ? showDmsValue({ ...finalized.state, lastKey: 'equals' }, finalized.value)
      : showValue({ ...finalized.state, lastKey: 'equals' }, finalized.value, 'RESULT');
    const completedExpression = finalized.state.displayExpression.length
      ? cloneDisplayExpression(finalized.state.displayExpression) ?? []
      : (() => {
          const items: DisplayExpressionToken[] = [];
          appendReusableDisplayOperand(items, finalized.state, finalized.value!);
          return items;
        })();
    return {
      ...shown,
      displayExpression: [],
      completedExpression,
      transformationSource: undefined,
      currentSourceExpression: cloneDisplayExpression(completedExpression),
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
  const completedExpression = [...finalized.state.displayExpression];
  if (
    finalized.value
    && !displayCompletesValue(completedExpression.at(-1))
  ) {
    appendReusableDisplayOperand(completedExpression, finalized.state, finalized.value);
  }
  for (let index = 0; index < finalized.state.parenthesisDepth; index += 1) {
    completedExpression.push({ type: 'right' });
  }
  const result = evaluateExpression(tokens, finalized.state.preferences.mathMode);
  const resultState = {
    ...finalized.state,
    expression: [],
    displayExpression: [],
    completedExpression,
    transformationSource: undefined,
    parenthesisDepth: 0,
    lastKey: 'equals' as KeyId,
  };
  const shown = result.angle && finalized.state.angleDisplayMode === 'dms'
    ? showDmsValue(resultState, result)
    : showValue(resultState, result, 'RESULT');
  return {
    ...shown,
    completedExpression,
    currentSourceExpression: cloneDisplayExpression(completedExpression),
    inputActive: true,
    inputKind: result.angle && finalized.state.angleDisplayMode === 'dms' ? 'dms' : undefined,
  };
}

function applyUnary(
  state: CalculatorState,
  fn: (value: CalcValue) => CalcValue,
  label: string,
  operation: { type: 'postfix'; symbol: '²' | '³' } | { type: 'function'; function: DisplayFunction },
): CalculatorState {
  const input = requireInput(state);
  const displayExpression = appendUnaryDisplay(input.state, input.state, input.value, operation);
  try {
    const value = fn(input.value);
    const shown = showValue(
      { ...input.state, entry: '', fractionNumerator: undefined, composedInches: undefined },
      value,
      label,
    );
    return preserveSymbolicResult(shown, displayExpression);
  } catch (error) {
    return showError({
      ...input.state,
      displayExpression,
      completedExpression: [],
      transformationSource: undefined,
    }, error);
  }
}

function trig(state: CalculatorState, mode: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'): CalculatorState {
  const input = requireInput(state);
  const displayExpression = appendUnaryDisplay(
    input.state,
    input.state,
    input.value,
    { type: 'function', function: mode },
  );
  try {
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
    const rawResult = functions[mode]();
    const normalizedResult = !inverse && Math.abs(rawResult) < 1e-12
      ? 0
      : !inverse && Math.abs(Math.abs(rawResult) - 1) < 1e-12
        ? Math.sign(rawResult)
        : rawResult;
    const value = inverse ? degrees(normalizedResult) : scalar(normalizedResult);
    const directSpecial = Number.isFinite(numeric) && numeric % 90 === 0;
    const inverseSpecial = mode === 'asin' || mode === 'acos'
      ? numeric === -1 || numeric === 0 || numeric === 1
      : mode === 'atan' && (numeric === -1 || numeric === 0 || numeric === 1);
    const canonicalRoundedResult = inverse
      ? Math.abs(normalizedResult) === 90 || Math.abs(normalizedResult) === 180
      : normalizedResult === 0 || Math.abs(normalizedResult) === 1;
    value.approximate = Boolean(
      input.value.approximate
      || (canonicalRoundedResult && !(inverse ? inverseSpecial : directSpecial)),
    ) || undefined;
    const shown = showValue(input.state, value, mode.toUpperCase());
    return preserveSymbolicResult(shown, displayExpression);
  } catch (error) {
    return showError({
      ...input.state,
      displayExpression,
      completedExpression: [],
      transformationSource: undefined,
    }, error);
  }
}

function recordTriangleInput(
  state: CalculatorState,
  key: keyof TriangleValues,
  value: number,
  unit?: LinearResultUnit,
  approximate = false,
): Pick<CalculatorState, 'triangle' | 'triangleInputs' | 'triangleUnits' | 'triangleApproximate'> {
  const triangleInputs = [...state.triangleInputs.filter((input) => input !== key), key].slice(-2);
  const triangle: TriangleValues = {};
  const triangleUnits: CalculatorState['triangleUnits'] = {};
  const triangleApproximate: CalculatorState['triangleApproximate'] = {};

  for (const input of triangleInputs) {
    const stored = input === key ? value : state.triangle[input];
    if (stored !== undefined) triangle[input] = stored;
    const storedUnit = input === key ? unit : state.triangleUnits[input];
    if (storedUnit !== undefined) triangleUnits[input] = storedUnit;
    const storedApproximate = input === key ? approximate : state.triangleApproximate[input];
    if (storedApproximate) triangleApproximate[input] = true;
  }

  if (
    triangleInputs.length < 2 &&
    key !== 'theta' &&
    state.permanentPitchSlope !== undefined
  ) {
    triangle.theta = Math.atan(state.permanentPitchSlope) * 180 / Math.PI;
    if (state.permanentPitchApproximate) triangleApproximate.theta = true;
  }

  return { triangle, triangleInputs, triangleUnits, triangleApproximate };
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

function triangleSolveIsApproximate(state: CalculatorState): boolean {
  const currentInputCount = new Set(
    state.triangleInputs.filter((input) => state.triangle[input] !== undefined),
  ).size;
  const usesPermanentPitch = currentInputCount < 2
    && state.triangle.theta === undefined
    && state.permanentPitchSlope !== undefined;
  return approximationMapHasValue(state.triangleApproximate)
    || Boolean(usesPermanentPitch && state.permanentPitchApproximate);
}

function enterTriangle(state: CalculatorState, key: 'x' | 'y' | 'r'): CalculatorState {
  if (
    state.sequence?.trigger === (key === 'x' ? 'run' : key === 'y' ? 'rise' : 'diag')
    && !hasPendingInput(state)
  ) return advanceSequence(state);
  if (hasPendingInput(state)) {
    const input = requireInput(state);
    const value = input.value;
    if (value.angle) throw new CalcError('TYP Error');
    if (value.power !== 0 && value.power !== 1) throw new CalcError('DIM Error');
    const unitless = value.power === 0;
    const hasStoredSide = state.triangleInputs.some((entry) => entry === 'x' || entry === 'y' || entry === 'r');
    const switchesDimensionMode = (
      hasStoredSide &&
      state.triangleUnitless !== undefined &&
      state.triangleUnitless !== unitless
    ) || (unitless && state.circleResultUnit !== undefined);
    const geometryState = switchesDimensionMode
      ? {
          ...state,
          triangle: {},
          triangleInputs: [],
          triangleUnits: {},
          triangleApproximate: {},
          circle: {},
          circleApproximate: {},
          circleResultUnit: undefined,
          circleRadiusUnit: undefined,
        }
      : state;
    const enteredUnit = unitless ? undefined : linearResultUnit(value);
    const recorded = recordTriangleInput(
      geometryState,
      key,
      value.amount,
      enteredUnit,
      Boolean(value.approximate),
    );
    const circle = key === 'x'
      ? { ...geometryState.circle, chord: value.amount }
      : key === 'y'
        ? { ...geometryState.circle, rise: value.amount, height: value.amount }
        : geometryState.circle;
    const circleResultUnit = key === 'x' || key === 'y'
      ? enteredUnit ?? geometryState.circleResultUnit
      : geometryState.circleResultUnit;
    const circleApproximate = key === 'x'
      ? { ...geometryState.circleApproximate, chord: Boolean(value.approximate) }
      : key === 'y'
        ? {
            ...geometryState.circleApproximate,
            rise: Boolean(value.approximate),
            height: Boolean(value.approximate),
          }
        : geometryState.circleApproximate;
    return showValue(
      {
        ...input.state,
        ...recorded,
        circle,
        circleApproximate,
        circleResultUnit,
        resultUnit: unitless ? undefined : enteredUnit,
        triangleUnitless: unitless,
      },
      value,
      key === 'r' ? 'R' : key.toUpperCase(),
    );
  }

  if (state.circle.radius && key === 'x' && (state.circle.rise ?? state.triangle.y) !== undefined) {
    const chord = segmentChord(state.circle.radius, state.circle.rise ?? state.triangle.y!);
    const context = { ...state, resultUnit: state.circleResultUnit ?? state.resultUnit };
    const approximate = Boolean(
      state.circleApproximate.radius
      || (state.circle.rise !== undefined
        ? state.circleApproximate.rise
        : state.triangleApproximate.y),
    );
    const value = markValueApproximate(
      contextualValue(context, { amount: chord, power: 1, unit: 'ft-in', system: 'imperial' }),
      approximate,
    );
    return showValue({
      ...state,
      circle: { ...state.circle, chord },
      circleApproximate: { ...state.circleApproximate, chord: approximate },
      triangle: { ...state.triangle, x: chord },
      triangleApproximate: { ...state.triangleApproximate, x: approximate },
    }, value, 'CORD');
  }
  if (state.circle.radius && key === 'y' && (state.circle.chord ?? state.triangle.x) !== undefined) {
    const rise = segmentRise(state.circle.radius, state.circle.chord ?? state.triangle.x!);
    const context = { ...state, resultUnit: state.circleResultUnit ?? state.resultUnit };
    const approximate = Boolean(
      state.circleApproximate.radius
      || (state.circle.chord !== undefined
        ? state.circleApproximate.chord
        : state.triangleApproximate.x),
    );
    const value = markValueApproximate(
      contextualValue(context, { amount: rise, power: 1, unit: 'ft-in', system: 'imperial' }),
      approximate,
    );
    return showValue({
      ...state,
      circle: { ...state.circle, rise },
      circleApproximate: { ...state.circleApproximate, rise: approximate },
      triangle: { ...state.triangle, y: rise },
      triangleApproximate: { ...state.triangleApproximate, y: approximate },
    }, value, 'RISE');
  }

  const solved = solveRightTriangle(triangleForSolve(state));
  const triangle = solved;
  const approximate = triangleSolveIsApproximate(state);
  const triangleApproximate: CalculatorState['triangleApproximate'] = {};
  if (approximate) {
    for (const field of ['x', 'y', 'r', 'theta'] as const) {
      if (solved[field] !== undefined) triangleApproximate[field] = true;
    }
  }
  if (key === 'r') return setSequence(
    { ...state, triangle, triangleApproximate },
    'diag',
    contextualOrUnitlessResults(state, diagonalCycle(solved)),
    'diag',
    state.triangleInputs.includes('r') ? 1 : 0,
    approximate,
  );
  const value = markValueApproximate(state.triangleUnitless
    ? scalar(solved[key])
    : contextualValue(state, { amount: solved[key], power: 1, unit: 'ft-in', system: 'imperial' }),
  approximate);
  return showValue({ ...state, triangle, triangleApproximate }, value, key.toUpperCase());
}

function enterPitch(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'pitch' && !hasPendingInput(state)) return advanceSequence(state);
  if (hasPendingInput(state) || (state.current && state.lastKey === 'equals')) {
    const input = requireInput(state);
    let slope: number;
    let startIndex: number;
    if (input.value.power === 1) {
      if (!Number.isFinite(input.value.amount) || input.value.amount <= 0) throw new CalcError('ENT Error');
      slope = input.value.amount / 12;
      startIndex = 0;
    } else if (input.value.power === 0) {
      if (state.inputKind === 'percent') {
        if (!Number.isFinite(input.value.amount) || input.value.amount <= 0) throw new CalcError('ENT Error');
        slope = input.value.amount;
        startIndex = 2;
      } else {
        if (!Number.isFinite(input.value.amount) || input.value.amount <= 0 || input.value.amount >= 90) {
          throw new CalcError('ENT Error');
        }
        slope = Math.tan(input.value.amount * Math.PI / 180);
        startIndex = 1;
      }
    } else {
      throw new CalcError('TYP Error');
    }
    const theta = Math.atan(slope) * 180 / Math.PI;
    const slopeApproximate = Boolean(
      input.value.approximate
      || (input.value.power === 0 && state.inputKind !== 'percent'),
    );
    const recorded = recordTriangleInput(input.state, 'theta', theta, undefined, slopeApproximate);
    const results = pitchCycle({ x: 12, y: slope * 12 });
    const permanentPitchSlope = state.lastKey === 'equals'
      ? state.permanentPitchSlope
      : slope;
    const permanentPitchApproximate = state.lastKey === 'equals'
      ? state.permanentPitchApproximate
      : slopeApproximate || undefined;
    return setSequence(
      {
        ...input.state,
        ...recorded,
        permanentPitchSlope,
        permanentPitchApproximate,
        inputKind: undefined,
      },
      'pitch',
      results,
      'pitch',
      startIndex,
      slopeApproximate,
    );
  }
  const solved = solveRightTriangle(triangleForSolve(state));
  const startsWithSlope = state.triangleInputs.includes('x') && state.triangleInputs.includes('y');
  const approximate = triangleSolveIsApproximate(state);
  return setSequence(
    { ...state, triangle: solved },
    'pitch',
    pitchCycle(solved),
    'pitch',
    startsWithSlope ? 0 : 1,
    approximate,
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
  rejectUnusedInput(state);
  const storedValues = (['a', 'aNew', 'b', 'bNew'] as const)
    .map((key) => state.registers[key])
    .filter((value): value is CalcValue => value !== undefined);
  if (storedValues.some((value) => value.angle)) throw new CalcError('TYP Error');
  if (storedValues.some((value) => value.power !== 0)) throw new CalcError('DIM Error');
  const values = Object.fromEntries(
    (['a', 'aNew', 'b', 'bNew'] as const).map((key) => [key, state.registers[key]?.amount]),
  );
  const solved = solveFanLaw(law, values);
  const approximate = storedValues.some((value) => Boolean(value.approximate));
  const registers = {
    ...state.registers,
    a: markValueApproximate(scalar(solved.registers.a), approximate),
    aNew: markValueApproximate(scalar(solved.registers.aNew), approximate),
    b: markValueApproximate(scalar(solved.registers.b), approximate),
    bNew: markValueApproximate(scalar(solved.registers.bNew), approximate),
  };
  return showValue(
    { ...state, registers },
    markValueApproximate(solved.result.value, approximate),
    solved.result.label,
  );
}

function offset(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'offset' && !hasPendingInput(state)) return advanceSequence(state);
  rejectUnusedInput(state);
  const { x, y } = state.triangle;
  const a = state.registers.a;
  if (x === undefined || y === undefined || !a) throw new CalcError('ENT Error');
  if (a.angle) throw new CalcError('TYP Error');
  if (state.triangleUnitless && a.power !== 0) throw new CalcError('DIM Error');
  let fittingHeight: number;
  if (a.power === 1) fittingHeight = a.amount;
  else if (a.power === 0 && state.triangleUnitless === true) fittingHeight = a.amount;
  else if (a.power === 0 && state.resultUnit) fittingHeight = inheritedLinearInput(state, a).amount;
  else throw new CalcError('ENT Error');
  const approximate = triangleSolveIsApproximate(state) || Boolean(a.approximate);
  return setSequence(
    state,
    'offset',
    contextualOrUnitlessResults(state, offsetResults(x, y, fittingHeight)),
    'left',
    0,
    approximate,
  );
}

function lawCos(state: CalculatorState): CalculatorState {
  rejectUnusedInput(state);
  const { a, b, c } = state.registers;
  if (!a || !b || !c) throw new CalcError('ENT Error');
  if (a.angle || b.angle || c.angle) throw new CalcError('TYP Error');
  const powers = new Set([a.power, b.power, c.power]);
  if (powers.size !== 1 || (a.power !== 0 && a.power !== 1)) throw new CalcError('DIM Error');
  const results = lawOfCosines(a.amount, b.amount, c.amount);
  const resultUnit = a.power === 1 ? resultUnitForValues([a, b, c]) : undefined;
  const displayResults = a.power === 0
    ? results.map((result) => ({
        ...result,
        value: result.value.angle ? result.value : scalar(result.value.amount),
      }))
    : resultsInUnit(results, resultUnit);
  const approximate = [a, b, c].some((value) => Boolean(value.approximate));
  return setSequence({ ...state, resultUnit }, 'lawcos', displayResults, '9', 0, approximate);
}

function circle(state: CalculatorState): CalculatorState {
  if (
    (state.sequence?.id === 'arc' || state.sequence?.id === 'circle')
    && !hasPendingInput(state)
  ) return advanceSequence(state);
  if (hasPendingInput(state)) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const enteredUnit = linearResultUnit(input.value);
    const retainedHeight = state.triangleUnitless ? undefined : state.circle.height;
    const values = {
      diameter: input.value.amount,
      radius: input.value.amount / 2,
      height: retainedHeight,
    };
    const circleApproximate: CalculatorState['circleApproximate'] = {
      diameter: Boolean(input.value.approximate),
      radius: Boolean(input.value.approximate),
    };
    if (retainedHeight !== undefined && state.circleApproximate.height) {
      circleApproximate.height = true;
    }
    const circleResultUnit = enteredUnit;
    const next = {
      ...input.state,
      circle: values,
      circleApproximate,
      circleResultUnit,
      circleRadiusUnit: enteredUnit,
      resultUnit: circleResultUnit,
    };
    return setSequence(
      next,
      'circle',
      contextualResults(next, circleResults(values)),
      'circ',
      0,
      approximationMapHasValue(circleApproximate),
    );
  }
  const next = { ...state, resultUnit: state.circleResultUnit ?? state.resultUnit };
  return setSequence(
    next,
    'circle',
    contextualResults(next, circleResults(state.circle)),
    'circ',
    0,
    approximationMapHasValue(state.circleApproximate),
  );
}

function enterArc(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'arc' && !hasPendingInput(state)) return advanceSequence(state);
  if (!hasPendingInput(state)) {
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
    const approximate = approximationMapHasValue(state.circleApproximate)
      || triangleSolveIsApproximate(state)
      || Boolean(state.onCenterApproximate);
    const circleApproximate = { ...state.circleApproximate };
    if (approximate) {
      for (const field of ['radius', 'diameter', 'arcDegrees'] as const) {
        circleApproximate[field] = true;
      }
      if (chord !== undefined) circleApproximate.chord = true;
      if (rise !== undefined) circleApproximate.rise = true;
    }
    delete circleApproximate.arcLength;
    const next = {
      ...state,
      circle: circleValues,
      circleApproximate,
      resultUnit: state.circleResultUnit ?? state.resultUnit,
    };
    const results = markResultsApproximate(
      contextualResults(next, arcResults(circleValues, state.preferences.onCenter)),
      approximate,
    );
    const sequence = { id: 'arc', results, index: -1, trigger: 'circ' as KeyId };
    const shown = showValue(
      { ...next, sequence },
      markValueApproximate(degrees(theta), approximate),
      'ARC',
    );
    return { ...shown, sequence };
  }
  const input = requireInput(state);
  const circleValues = { ...state.circle };
  const circleApproximate = { ...state.circleApproximate };
  let entered: NamedResult;
  if (input.value.power === 0) {
    circleValues.arcDegrees = input.value.amount;
    circleValues.arcLength = undefined;
    circleApproximate.arcDegrees = Boolean(input.value.approximate);
    delete circleApproximate.arcLength;
    entered = { label: 'ARC', value: degrees(input.value.amount) };
  } else if (input.value.power === 1) {
    circleValues.arcLength = input.value.amount;
    circleValues.arcDegrees = undefined;
    circleApproximate.arcLength = Boolean(input.value.approximate);
    delete circleApproximate.arcDegrees;
    entered = { label: 'ARC', value: input.value };
  } else {
    throw new CalcError('DIM Error');
  }
  const next = {
    ...input.state,
    circle: circleValues,
    circleApproximate,
    circleResultUnit: input.value.power === 1
      ? linearResultUnit(input.value) ?? state.circleResultUnit
      : state.circleResultUnit,
  };
  next.resultUnit = next.circleResultUnit ?? state.resultUnit;
  const approximate = approximationMapHasValue(circleApproximate)
    || Boolean(state.onCenterApproximate);
  const results = markResultsApproximate(
    contextualResults(next, arcResults(circleValues, state.preferences.onCenter)),
    approximate,
  );
  const sequence = { id: 'arc', results, index: -1, trigger: 'circ' as KeyId };
  const sequenceState = { ...next, sequence };
  const shown = input.value.power === 0
    ? showEnteredArcAngle(
        sequenceState,
        markValueApproximate(entered.value, Boolean(input.value.approximate)),
      )
    : showValue(sequenceState, entered.value, entered.label);
  return { ...shown, sequence };
}

function segRadius(state: CalculatorState): CalculatorState {
  if (hasPendingInput(state)) {
    const input = requireInput(state);
    if (input.value.power !== 1) throw new CalcError('DIM Error');
    const switchesDimensionMode = state.triangleUnitless === true;
    const circleValues = {
      ...(switchesDimensionMode ? {} : state.circle),
      radius: input.value.amount,
      diameter: input.value.amount * 2,
    };
    const circleApproximate = {
      ...(switchesDimensionMode ? {} : state.circleApproximate),
      radius: Boolean(input.value.approximate),
      diameter: Boolean(input.value.approximate),
    };
    const circleResultUnit = linearResultUnit(input.value);
    return showValue(
      {
        ...input.state,
        circle: circleValues,
        circleApproximate,
        circleResultUnit,
        circleRadiusUnit: circleResultUnit,
        resultUnit: circleResultUnit,
        triangle: switchesDimensionMode ? {} : state.triangle,
        triangleInputs: switchesDimensionMode ? [] : state.triangleInputs,
        triangleUnits: switchesDimensionMode ? {} : state.triangleUnits,
        triangleApproximate: switchesDimensionMode ? {} : state.triangleApproximate,
        triangleUnitless: switchesDimensionMode ? undefined : state.triangleUnitless,
      },
      input.value,
      'RAD',
    );
  }
  const chord = state.circle.chord ?? state.triangle.x;
  const rise = state.circle.rise ?? state.triangle.y;
  let radius = state.circle.radius;
  const freshChordAndRise = state.triangleInputs.includes('x') && state.triangleInputs.includes('y');
  if ((radius === undefined || freshChordAndRise) && chord !== undefined && rise !== undefined) {
    radius = segmentRadius(chord, rise);
  }
  if (!radius) throw new CalcError('ENT Error');
  const circleValues = { ...state.circle, radius, diameter: radius * 2, chord, rise };
  const derivedRadius = state.circle.radius === undefined || freshChordAndRise;
  const approximate = derivedRadius
    ? approximationMapHasValue(state.circleApproximate)
      || triangleSolveIsApproximate(state)
    : Boolean(state.circleApproximate.radius);
  const circleApproximate = {
    ...state.circleApproximate,
    radius: approximate,
    diameter: approximate,
  };
  const latestTriangleInput = state.triangleInputs.at(-1);
  const circleResultUnit = latestTriangleInput === undefined
    ? state.circleResultUnit ?? state.resultUnit
    : state.triangleUnits[latestTriangleInput] ?? state.circleResultUnit ?? state.resultUnit;
  const next = {
    ...state,
    circle: circleValues,
    circleApproximate,
    circleResultUnit,
    circleRadiusUnit: circleResultUnit,
    resultUnit: circleResultUnit,
  };
  return showValue(
    next,
    markValueApproximate(
      contextualValue(next, { amount: radius, power: 1, unit: 'ft-in', system: 'imperial' }),
      approximate,
    ),
    'RAD',
  );
}

function hip(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'hip' && !hasPendingInput(state)) return advanceSequence(state);
  rejectUnusedInput(state);
  const run = state.triangle.x;
  if (!run) throw new CalcError('ENT Error');
  const solved = solveRightTriangle(triangleForSolve(state));
  const slope = solved.y / solved.x;
  const approximate = triangleSolveIsApproximate(state)
    || Boolean(state.irregularPitchSlope !== undefined && state.irregularPitchApproximate);
  return setSequence(
    state,
    'hip',
    contextualOrUnitlessResults(state, hipValleyResults(run, slope, state.irregularPitchSlope)),
    'hip',
    0,
    approximate,
  );
}

function irregularPitch(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  let slope: number;
  if (input.value.power === 1) {
    if (!Number.isFinite(input.value.amount) || input.value.amount <= 0) throw new CalcError('ENT Error');
    slope = input.value.amount / 12;
  } else if (input.value.power === 0 && state.inputKind === 'percent') {
    if (!Number.isFinite(input.value.amount) || input.value.amount <= 0) throw new CalcError('ENT Error');
    slope = input.value.amount;
  } else if (input.value.power === 0) {
    if (!Number.isFinite(input.value.amount) || input.value.amount <= 0 || input.value.amount >= 90) {
      throw new CalcError('ENT Error');
    }
    slope = Math.tan(input.value.amount * Math.PI / 180);
  }
  else throw new CalcError('DIM Error');
  const approximate = Boolean(
    input.value.approximate
    || (input.value.power === 0 && state.inputKind !== 'percent'),
  );
  return showValue(
    {
      ...input.state,
      irregularPitchSlope: slope,
      irregularPitchApproximate: approximate || undefined,
      inputKind: undefined,
    },
    markValueApproximate(
      { amount: slope * 12, power: 1, unit: 'in', system: 'imperial' },
      approximate,
    ),
    'IPCH',
  );
}

function jacks(state: CalculatorState, irregularFirst: boolean): CalculatorState {
  const id = irregularFirst ? 'ir-jacks' : 'jacks';
  if (state.sequence?.id === id && !hasPendingInput(state)) return advanceSequence(state);
  if (!irregularFirst && hasPendingInput(state)) {
    const input = requireInput(state);
    if (input.value.power !== 1 || input.value.amount <= 0) throw new CalcError('DIM Error');
    const preferences = { ...state.preferences, onCenter: input.value.amount };
    return showValue({
      ...input.state,
      preferences,
      onCenterApproximate: Boolean(input.value.approximate) || undefined,
    }, input.value, 'JKOC STORED');
  }
  rejectUnusedInput(state);
  if (state.triangleUnitless) throw new CalcError('DIM Error');
  const run = state.triangle.x;
  if (!run) throw new CalcError('ENT Error');
  const solved = solveRightTriangle(triangleForSolve(state));
  const slope = solved.y / solved.x;
  const results = contextualResults(state, jackRafterResults(run, slope, state.preferences, state.irregularPitchSlope, irregularFirst));
  const approximate = triangleSolveIsApproximate(state)
    || Boolean(state.onCenterApproximate)
    || Boolean(state.irregularPitchSlope !== undefined && state.irregularPitchApproximate);
  return setSequence(state, id, results, irregularFirst ? 'jack' : 'jack', 0, approximate);
}

function stairs(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'stairs' && !hasPendingInput(state)) return advanceSequence(state);
  rejectUnusedInput(state);
  if (state.triangleUnitless) throw new CalcError('DIM Error');
  return setSequence(
    state,
    'stairs',
    contextualResults(state, stairResults(state.triangle.y, state.triangle.x, state.preferences)),
    'stair',
    0,
    triangleSolveIsApproximate(state) || Boolean(state.desiredRiserApproximate),
  );
}

function storeRiser(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  if (input.value.power !== 1 || input.value.amount <= 0) throw new CalcError('DIM Error');
  const preferences = { ...state.preferences, desiredRiser: input.value.amount };
  return showValue({
    ...input.state,
    preferences,
    desiredRiserApproximate: Boolean(input.value.approximate) || undefined,
  }, input.value, 'R-HT STORED');
}

function columnCone(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'column-cone' && !hasPendingInput(state)) return advanceSequence(state);
  rejectUnusedInput(state);
  if (state.triangleUnitless && state.triangle.y !== undefined) throw new CalcError('DIM Error');
  const radius = state.circle.radius ?? (state.circle.diameter === undefined ? undefined : state.circle.diameter / 2);
  const height = state.circle.height ?? state.triangle.y;
  if (!radius || !height) throw new CalcError('ENT Error');
  const resultUnit = combinedLinearResultUnit([
    state.circleRadiusUnit ?? state.circleResultUnit,
    state.triangleUnits.y,
  ]) ?? state.resultUnit;
  const approximate = approximationMapHasValue(state.circleApproximate)
    || triangleSolveIsApproximate(state);
  return setSequence(
    { ...state, resultUnit },
    'column-cone',
    resultsInUnit(columnConeResults(radius, height), resultUnit),
    'right',
    0,
    approximate,
  );
}

function memoryStore(state: CalculatorState, slot: 'm1' | 'm2' | 'm3'): CalculatorState {
  const input = requireInput(state);
  const memory = { ...state.memory };
  if (input.value.amount === 0) delete memory[slot];
  else memory[slot] = cloneValue(input.value);
  return showValue({ ...input.state, memory }, input.value, `M-${slot.slice(1)}`);
}

function showRecalledValue(
  state: CalculatorState,
  value: CalcValue,
  label: string,
  inputActive = true,
): CalculatorState {
  const exponentBase = state.exponentBase;
  const shown = showValue(
    { ...state, modifier: undefined, inputKind: 'recalled', angleDisplayMode: undefined },
    value,
    label,
    undefined,
    'recalled',
  );
  const exactSourceExpression = !exponentBase
    && value.source?.entryText
    && !value.approximate
      ? exactWrittenOperand(
          value,
          exactUnitEntryText(
            value.source.entryText,
            value.source.unit,
            value.source.power,
          ),
        )
      : undefined;
  return {
    ...shown,
    exponentBase,
    currentSourceExpression: exactSourceExpression,
    currentDisplayMetadata: exactSourceExpression
      ? { provenance: 'recalled', exactness: 'exact' }
      : shown.currentDisplayMetadata,
    inputActive: inputActive || exponentBase !== undefined,
    inputKind: inputActive || exponentBase !== undefined ? 'recalled' : undefined,
  };
}

function memoryRecall(state: CalculatorState, slot: keyof MemoryState): CalculatorState {
  const value = state.memory[slot] ?? scalar(0);
  const label = slot === 'cumulative' ? 'M+' : `M-${slot.slice(1)}`;
  return showRecalledValue(state, value, label);
}

function negateValue(value: CalcValue): CalcValue {
  return {
    ...value,
    amount: -value.amount,
    source: value.source
      ? {
          ...value.source,
          amount: -value.source.amount,
          entryText: value.source.entryText
            ? value.source.entryText.startsWith('-')
              ? value.source.entryText.slice(1)
              : `-${value.source.entryText}`
            : undefined,
        }
      : undefined,
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
  if (input.value.angle) throw new CalcError('TYP Error');
  if (input.value.power !== 0) throw new CalcError('DIM Error');
  const tokens = input.state.expression;
  const lastOperator = [...tokens].reverse().find((token): token is Extract<ExpressionToken, { type: 'operator' }> => token.type === 'operator');
  const lastValue = [...tokens].reverse().find((token): token is Extract<ExpressionToken, { type: 'value' }> => token.type === 'value');
  if (lastOperator && lastValue) {
    const value = percentValue(lastValue.value, lastOperator.operator, input.value.amount);
    value.approximate = Boolean(
      value.approximate
      || input.value.approximate
      || input.state.currentDisplayMetadata?.exactness === 'approximate',
    ) || undefined;
    const displayExpression = withoutDisplayedCurrentOperand(input.state);
    displayExpression.push({
      type: 'value',
      value: cloneValue(value),
      draft: { ...snapshotDisplayDraft(state), inputKind: 'percent' },
    });
    return calculateEquals({
      ...input.state,
      current: value,
      entry: '',
      fractionNumerator: undefined,
      composedInches: undefined,
      inputActive: true,
      inputKind: 'percent',
      displayExpression,
    });
  }
  const value = scalar(input.value.amount / 100);
  value.approximate = Boolean(
    input.value.approximate
    || input.state.currentDisplayMetadata?.exactness === 'approximate'
    || (input.value.amount !== 0 && value.amount === 0),
  ) || undefined;
  const displayExpression = withoutDisplayedCurrentOperand(input.state);
  displayExpression.push({
    type: 'value',
    value: cloneValue(value),
    draft: { ...snapshotDisplayDraft(state), inputKind: 'percent' },
  });
  return {
    ...showValue({ ...input.state, inputKind: 'percent' }, value, '%'),
    displayExpression,
    inputActive: true,
    inputKind: 'percent',
  };
}

function velocity(state: CalculatorState): CalculatorState {
  if (state.sequence?.id === 'velocity' && !hasPendingInput(state)) return advanceSequence(state);
  const input = requireInput(state);
  if (input.value.angle) throw new CalcError('TYP Error');
  if (input.value.power !== 0) throw new CalcError('DIM Error');
  const results = velocityPressureResults(input.value.amount);
  const initialIndex = state.velocityCycleIndex % results.length;
  return setSequence(
    { ...input.state, velocityCycleIndex: initialIndex },
    'velocity',
    results,
    '0',
    initialIndex,
    Boolean(input.value.approximate),
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
  const reusableAngleSource: DisplayExpressionToken[] = [];
  if (input.state.currentSourceExpression?.length) {
    appendReusableDisplayOperand(reusableAngleSource, input.state, input.value);
  } else {
    reusableAngleSource.push({
      type: 'value',
      value: cloneValue(input.value),
      draft: {
        entry: '',
        current: cloneValue(input.value),
        committedText: input.state.display.plainText,
        inputKind: input.state.inputKind,
        angleDisplayMode: input.state.angleDisplayMode,
        metadata: input.state.currentDisplayMetadata
          ? { ...input.state.currentDisplayMetadata }
          : undefined,
      },
    });
  }
  if (!input.value.angle) {
    const alreadyGrouped = reusableAngleSource.at(0)?.type === 'left'
      && reusableAngleSource.at(-1)?.type === 'right';
    if (!alreadyGrouped && reusableAngleSource.some((item) => (
      item.type === 'postfix' && item.symbol.startsWith('× 10^')
    ))) {
      reusableAngleSource.unshift({ type: 'left' });
      reusableAngleSource.push({ type: 'right' });
    }
    reusableAngleSource.push({ type: 'postfix', symbol: '°' });
  }
  if (toDecimal) {
    const value = degrees(decimalDegrees);
    value.approximate = Boolean(
      input.value.approximate
      || input.state.currentDisplayMetadata?.exactness === 'approximate',
    ) || undefined;
    const shown = showValue(
      { ...input.state, inputKind: 'decimal-degree', angleDisplayMode: 'decimal' },
      value,
      'DEG',
    );
    return {
      ...showStandaloneTransformation(input.state, shown),
      currentSourceExpression: cloneDisplayExpression(reusableAngleSource),
      inputActive: true,
      inputKind: 'decimal-degree',
      angleDisplayMode: 'decimal',
    };
  }
  const value = degrees(decimalDegrees);
  value.approximate = Boolean(
    input.value.approximate
    || input.state.currentDisplayMetadata?.exactness === 'approximate',
  ) || undefined;
  const shown = showDmsValue(
    { ...input.state, inputKind: 'dms', angleDisplayMode: 'dms' },
    value,
  );
  return {
    ...showStandaloneTransformation(input.state, shown),
    currentSourceExpression: cloneDisplayExpression(reusableAngleSource),
    inputActive: true,
    inputKind: 'dms',
    angleDisplayMode: 'dms',
  };
}

function convertCurrentUnit(state: CalculatorState, unit: 'feet' | 'inch' | 'meter' | 'millimeter'): CalculatorState {
  const input = requireInput(state);
  if (input.value.power === 0) {
    if (unit !== 'millimeter') throw new CalcError('DIM Error');
    const entered = measurement(input.value.amount, 'mm');
    entered.approximate = Boolean(
      input.value.approximate
      || input.state.currentDisplayMetadata?.exactness === 'approximate',
    ) || undefined;
    const sourceExpression = sourceExpressionWithAssignedUnit(
      input.state.currentSourceExpression,
      'mm',
    ) ?? exactWrittenOperand(
      entered,
      exactUnitEntryText(enteredNumberText(state, input.value.amount), 'mm', 1),
    );
    return {
      ...showValue(input.state, entered, 'MM', undefined, 'unit-source'),
      currentSourceExpression: sourceExpression,
      currentDisplayMetadata: {
        provenance: input.state.currentSourceExpression?.length
          ? 'symbolic-expression'
          : 'unit-source',
        exactness: entered.approximate ? 'approximate' : 'exact',
      },
      inputActive: true,
    };
  }
  let hint: CalcValue['unit'];
  if (input.value.power === 1 && unit === 'feet') hint = input.value.unit === 'decimal-ft' ? 'ft-in' : 'decimal-ft';
  else if (input.value.power === 1 && unit === 'inch') hint = input.value.unit === 'decimal-in' ? 'in' : 'decimal-in';
  else {
    const baseUnit = unit === 'feet' ? 'ft' : unit === 'inch' ? 'in' : unit === 'millimeter' ? 'mm' : 'm';
    hint = unitHintFor(baseUnit, input.value.power);
  }
  const shown = showValue(input.state, withUnit(input.value, hint), 'CONV');
  return { ...showStandaloneTransformation(input.state, shown), inputActive: true };
}

function convertMetricKey(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  if (input.value.angle) throw new CalcError('TYP Error');
  if (input.value.power === 0) {
    const entered = measurement(input.value.amount, 'mm');
    entered.approximate = Boolean(
      input.value.approximate
      || input.state.currentDisplayMetadata?.exactness === 'approximate',
    ) || undefined;
    const sourceExpression = sourceExpressionWithAssignedUnit(
      input.state.currentSourceExpression,
      'mm',
    ) ?? exactWrittenOperand(
      entered,
      exactUnitEntryText(enteredNumberText(state, input.value.amount), 'mm', 1),
    );
    return {
      ...showValue(input.state, entered, 'MM', undefined, 'unit-source'),
      currentSourceExpression: sourceExpression,
      currentDisplayMetadata: {
        provenance: input.state.currentSourceExpression?.length
          ? 'symbolic-expression'
          : 'unit-source',
        exactness: entered.approximate ? 'approximate' : 'exact',
      },
      inputActive: true,
    };
  }
  const meterUnits: CalcValue['unit'][] = ['m', 'sq-m', 'cu-m'];
  const target = meterUnits.includes(input.value.unit) ? 'mm' : 'm';
  const value = withUnit(input.value, unitHintFor(target, input.value.power));
  const shown = showValue(input.state, value, 'CONV');
  return { ...showStandaloneTransformation(input.state, shown), inputActive: true };
}

function reciprocal(state: CalculatorState): CalculatorState {
  const input = requireInput(state);
  const displayExpression = appendUnaryDisplay(
    input.state,
    input.state,
    input.value,
    { type: 'function', function: 'reciprocal' },
  );
  try {
    if (input.value.amount === 0) throw new CalcError('DIV Error');
    if (input.value.power !== 0 || input.value.angle) throw new CalcError('DIM Error');
    const shown = showValue(input.state, operate(scalar(1), '/', input.value), '1/x');
    return preserveSymbolicResult(shown, displayExpression);
  } catch (error) {
    return showError({
      ...input.state,
      displayExpression,
      completedExpression: [],
      transformationSource: undefined,
    }, error);
  }
}

function changeSign(state: CalculatorState): CalculatorState {
  if (state.exponentBase && state.current) {
    return showRecalledValue(state, negateValue(state.current), '+/−');
  }
  if (state.fractionNumerator !== undefined || state.composedInches !== undefined) {
    const input = requireInput(state);
    const displayExpression = appendUnaryDisplay(
      input.state,
      input.state,
      input.value,
      { type: 'function', function: 'negate' },
    );
    return preserveSymbolicResult(
      showValue(input.state, negateValue(input.value), '+/−'),
      displayExpression,
    );
  }
  if (state.entry) {
    const entry = state.entry.startsWith('-') ? state.entry.slice(1) : `-${state.entry}`;
    const next = { ...state, entry };
    return { ...next, display: pendingDisplay(next) };
  }
  const input = requireInput(state);
  const displayExpression = appendUnaryDisplay(
    input.state,
    input.state,
    input.value,
    { type: 'function', function: 'negate' },
  );
  return preserveSymbolicResult(
    showValue(input.state, negateValue(input.value), '+/−'),
    displayExpression,
  );
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
  if (state.exponentBase) {
    return showError(state, new CalcError('EXP Error'));
  }
  const normalizedIndex = (index + PREFERENCE_COUNT) % PREFERENCE_COUNT;
  return {
    ...state,
    modifier: undefined,
    preferenceMode: mode,
    preferenceIndex: normalizedIndex,
    entry: '',
    fractionNumerator: undefined,
    composedInches: undefined,
    imperialEntryText: undefined,
    imperialEntryComponents: undefined,
    current: undefined,
    inputActive: false,
    expression: [],
    displayExpression: [],
    completedExpression: [],
    transformationSource: undefined,
    transformationResultMetadata: undefined,
    unitEntryUndo: undefined,
    currentDisplayMetadata: undefined,
    currentSourceExpression: undefined,
    exponentBase: undefined,
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
  return showRecalledValue(state, value, `${label} STORED`);
}

function handleRecall(state: CalculatorState, key: KeyId): CalculatorState {
  if (key === 'recall') {
    const value = state.memory.cumulative ?? scalar(0);
    return showRecalledValue(
      { ...state, memory: { ...state.memory, cumulative: undefined } },
      value,
      'M+',
      false,
    );
  }
  if (key === 'mplus') return memoryRecall({ ...state, modifier: undefined }, 'cumulative');
  if (key === '1' || key === '2' || key === '3') return memoryRecall({ ...state, modifier: undefined }, `m${key}` as 'm1' | 'm2' | 'm3');
  if (key === '4') return recallSharedRegister(state, 'a', 'A');
  if (key === '5') return recallSharedRegister(state, 'b', 'B');
  if (key === '6') return recallSharedRegister(state, 'c', 'C');
  if (key === '7') return recallSharedRegister(state, 'aNew', 'An');
  if (key === '8') return recallSharedRegister(state, 'bNew', 'Bn');
  if (key === 'fraction') {
    return showRecalledValue(
      state,
      { amount: 1 / state.preferences.fractionDenominator, power: 1, unit: 'in', system: 'imperial' },
      state.preferences.constantFraction ? 'CONST' : 'STD',
    );
  }
  if (key === 'equals') return showPreference(state, 0, 'review');
  if (key === 'jack') {
    return showRecalledValue(
      state,
      markValueApproximate(
        { amount: state.preferences.onCenter, power: 1, unit: 'in', system: 'imperial' },
        Boolean(state.onCenterApproximate),
      ),
      'JKOC',
    );
  }
  if (key === 'pitch') {
    if (state.permanentPitchSlope === undefined) throw new CalcError('ENT Error');
    return showRecalledValue(
      state,
      markValueApproximate(
        { amount: state.permanentPitchSlope * 12, power: 1, unit: 'in', system: 'imperial' },
        Boolean(state.permanentPitchApproximate),
      ),
      'PTCH STORED',
    );
  }
  if (key === 'hip') {
    if (state.irregularPitchSlope === undefined) throw new CalcError('ENT Error');
    return showRecalledValue(
      state,
      markValueApproximate(
        { amount: state.irregularPitchSlope * 12, power: 1, unit: 'in', system: 'imperial' },
        Boolean(state.irregularPitchApproximate),
      ),
      'IPCH STORED',
    );
  }
  if (key === 'stair') {
    return showRecalledValue(
      { ...state, sequence: undefined },
      markValueApproximate(
        { amount: state.preferences.desiredRiser, power: 1, unit: 'in', system: 'imperial' },
        Boolean(state.desiredRiserApproximate),
      ),
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
    case 'square': return applyUnary(next, cube, 'x³', { type: 'postfix', symbol: '³' });
    case 'sqrt': return applyUnary(next, cubeRoot, '³√x', { type: 'function', function: 'cuberoot' });
    case 'circ': return enterArc(next);
    case 'stair': return storeRiser(next);
    case 'jack': return jacks(next, true);
    case 'sin': return trig(next, 'asin');
    case 'cos': return trig(next, 'acos');
    case 'tan': return trig(next, 'atan');
    case 'left': return offset(next);
    case 'right': return columnCone(next);
    case 'meter': return convertMetricKey(next);
    case 'feet': return convertCurrentUnit(next, 'feet');
    case 'inch': return convertCurrentUnit(next, 'inch');
    case 'fraction': {
      const input = requireInput(next);
      const displayExpression = [...input.state.displayExpression];
      if (!displayCompletesValue(displayExpression.at(-1))) {
        appendReusableDisplayOperand(displayExpression, input.state, input.value);
      }
      return {
        ...input.state,
        exponentBase: input.value,
        current: undefined,
        displayExpression,
        completedExpression: [],
        transformationSource: undefined,
        inputActive: false,
        display: { ...input.state.display, label: 'x10ʸ' },
      };
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
    case 'pi': {
      if (next.exponentBase) {
        return showError(
          { ...next, entry: `${next.entry}π` },
          new CalcError('EXP Error'),
        );
      }
      const value = scalar(Math.PI / 180);
      const displayExpression = appendDisplayLiteral(next, value, 'π ÷ 180');
      return {
        ...showValue(
          { ...clearSequence(next), inputKind: undefined, angleDisplayMode: undefined },
          value,
          'ArcK',
          undefined,
          'constant',
        ),
        displayExpression,
        currentSourceExpression: cloneDisplayExpression(trailingDisplayOperand(displayExpression)),
        inputActive: true,
      };
    }
    case '0': return velocity(next);
    case 'decimal': return dms(next);
    case 'equals': return showPreference(next, 0, 'edit');
    case 'add': return percent(next);
    default: throw new CalcError('ENT Error');
  }
}

function primaryPress(state: CalculatorState, key: KeyId): CalculatorState {
  const freshInput = hasPendingInput(state);
  if (state.sequence?.trigger === key && !freshInput) return advanceSequence(state);
  if (/^[0-9]$/.test(key)) return addDigit(state, key);
  switch (key) {
    case 'decimal': return addDecimal(state);
    case 'fraction': {
      if (state.exponentBase) return showError(state, new CalcError('EXP Error'));
      if (state.fractionNumerator !== undefined || !state.entry || state.entry.includes('.')) throw new CalcError('ENT Error');
      const next = { ...state, fractionNumerator: Number(state.entry), entry: '', inputActive: true };
      return { ...next, display: pendingDisplay(next) };
    }
    case 'backspace': {
      if (state.entry) {
        const shortened = state.entry.slice(0, -1);
        const next = { ...state, entry: shortened === '-' ? '' : shortened };
        return { ...next, display: pendingDisplay(next) };
      }
      if (state.exponentBase) {
        const current = cloneValue(state.exponentBase);
        return {
          ...state,
          exponentBase: undefined,
          current,
          completedExpression: [],
          transformationSource: undefined,
          inputActive: true,
          display: displayFor(current, state.preferences, 'ENTRY'),
        };
      }
      if (state.fractionNumerator !== undefined) {
        const next = { ...state, entry: String(state.fractionNumerator), fractionNumerator: undefined };
        return { ...next, display: pendingDisplay(next) };
      }
      if (state.unitEntryUndo) {
        const undo = state.unitEntryUndo;
        const restored: CalculatorState = {
          ...state,
          entry: undo.entry,
          fractionNumerator: undo.fractionNumerator,
          composedInches: undo.composedInches,
          imperialEntryText: undo.imperialEntryText,
          imperialEntryComponents: undo.imperialEntryComponents?.map((component) => ({ ...component })),
          current: undo.current ? cloneValue(undo.current) : undefined,
          currentDisplayMetadata: undo.currentDisplayMetadata
            ? { ...undo.currentDisplayMetadata }
            : undefined,
          currentSourceExpression: cloneDisplayExpression(undo.currentSourceExpression),
          displayExpression: cloneDisplayExpression(undo.displayExpression) ?? [],
          completedExpression: [],
          transformationSource: undefined,
          transformationResultMetadata: undefined,
          unitEntryUndo: undefined,
          inputActive: undo.inputActive,
          display: { ...undo.display },
        };
        return { ...restored, display: pendingDisplay(restored) };
      }
      if (state.composedInches !== undefined) {
        const components = state.imperialEntryComponents?.map((component) => ({ ...component }));
        if (components && components.length > 1) {
          const remaining = components.slice(0, -1);
          const current = imperialValueFromComponents(remaining);
          const next = {
            ...state,
            composedInches: current.amount,
            imperialEntryText: renderImperialComponents(remaining),
            imperialEntryComponents: remaining,
            current,
            currentDisplayMetadata: { provenance: 'unit-source', exactness: 'exact' } as const,
            currentSourceExpression: undefined,
            inputActive: true,
          };
          return { ...next, display: pendingDisplay(next) };
        }
        const sourceEntry = state.current?.source?.power === 1
          ? state.current.source.entryText ?? String(state.current.source.amount)
          : undefined;
        const rawValue = components?.[0]?.text ?? sourceEntry ?? String(state.composedInches);
        const rawFraction = rawValue.match(/^(-?\d+)\/(\d+)$/);
        const next = {
          ...state,
          entry: rawFraction ? rawFraction[2] : rawValue,
          fractionNumerator: rawFraction ? Number(rawFraction[1]) : undefined,
          composedInches: undefined,
          imperialEntryText: undefined,
          imperialEntryComponents: undefined,
          current: undefined,
          currentDisplayMetadata: undefined,
          currentSourceExpression: undefined,
          inputActive: true,
        };
        return { ...next, display: pendingDisplay(next) };
      }
      const source = state.current?.source;
      if (
        source
        && state.display.label !== 'CONV'
        && (
          state.lastKey === 'feet'
          || state.lastKey === 'inch'
          || state.lastKey === 'meter'
          || state.lastKey === 'backspace'
        )
      ) {
        if (source.power > 1) {
          const entryText = source.entryText ?? String(source.amount);
          const value = measurement(source.amount, source.unit, source.power - 1);
          value.approximate = Boolean(
            state.current?.approximate
            || state.currentDisplayMetadata?.exactness === 'approximate',
          ) || undefined;
          if (value.source) value.source.entryText = entryText;
          const symbolicSource = cloneDisplayExpression(state.currentSourceExpression);
          const symbolicLast = symbolicSource?.at(-1);
          const retainsSymbolicSource = Boolean(
            symbolicSource?.length
            && symbolicLast?.type === 'postfix'
            && symbolicLast.symbol === unitSourceSymbol(source.unit, source.power),
          );
          const composedInches = !retainsSymbolicSource
            && source.power === 2
            && (source.unit === 'ft' || source.unit === 'in')
            ? value.amount
            : undefined;
          const imperialUnit = source.unit === 'ft' || source.unit === 'in'
            ? source.unit
            : undefined;
          const imperialEntryComponents: ImperialEntryComponent[] | undefined = composedInches !== undefined && imperialUnit
            ? [{ text: entryText, amountInches: value.amount, unit: imperialUnit }]
            : undefined;
          const currentSourceExpression = retainsSymbolicSource
            ? cycledUnitSourceExpression(
                state,
                source,
                source.power - 1,
                value,
                entryText,
              )
            : imperialEntryComponents
              ? undefined
              : exactWrittenOperand(
                  value,
                  exactUnitEntryText(entryText, source.unit, source.power - 1),
                );
          const next = {
            ...state,
            current: value,
            composedInches,
            imperialEntryText: imperialEntryComponents
              ? renderImperialComponents(imperialEntryComponents)
              : undefined,
            imperialEntryComponents,
            displayExpression: withoutDisplayedCurrentOperand(state),
            currentDisplayMetadata: {
              provenance: retainsSymbolicSource ? 'symbolic-expression' : 'unit-source',
              exactness: value.approximate ? 'approximate' : 'exact',
            } as const,
            currentSourceExpression,
            inputActive: true,
            display: displayFor(
              value,
              state.preferences,
              source.power === 2 ? source.unit.toUpperCase() : 'AREA',
            ),
          };
          return next;
        }
        const symbolicSource = cloneDisplayExpression(state.currentSourceExpression);
        const assignedUnitSymbol = unitSourceSymbol(source.unit, 1);
        const assignedUnitToken = symbolicSource?.at(-1);
        if (
          symbolicSource
          && assignedUnitToken?.type === 'postfix'
          && assignedUnitToken.symbol === assignedUnitSymbol
        ) {
          symbolicSource.pop();
          const current = scalar(source.amount);
          current.approximate = Boolean(
            state.current?.approximate
            || state.currentDisplayMetadata?.exactness === 'approximate',
          ) || undefined;
          return {
            ...state,
            entry: '',
            current,
            displayExpression: withoutDisplayedCurrentOperand(state),
            completedExpression: [],
            transformationSource: undefined,
            currentDisplayMetadata: {
              provenance: 'symbolic-expression',
              exactness: current.approximate ? 'approximate' : 'exact',
            },
            currentSourceExpression: symbolicSource,
            inputActive: true,
            display: displayFor(current, state.preferences, 'ENTRY'),
          };
        }
        const rawValue = source.entryText ?? String(source.amount);
        const rawFraction = rawValue.match(/^(-?\d+)\/(\d+)$/);
        const next = {
          ...state,
          entry: rawFraction ? rawFraction[2] : rawValue,
          fractionNumerator: rawFraction ? Number(rawFraction[1]) : undefined,
          current: undefined,
          displayExpression: withoutDisplayedCurrentOperand(state),
          currentDisplayMetadata: undefined,
          currentSourceExpression: undefined,
          inputActive: true,
        };
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
    case 'square': return applyUnary(state, square, 'x²', { type: 'postfix', symbol: '²' });
    case 'sqrt': return applyUnary(state, squareRoot, '√x', { type: 'function', function: 'sqrt' });
    case 'circ': return circle(state);
    case 'stair': return stairs(state);
    case 'jack': return jacks(state, false);
    case 'sin': return trig(state, 'sin');
    case 'cos': return trig(state, 'cos');
    case 'tan': return trig(state, 'tan');
    case 'left': {
      if (state.parenthesisDepth >= 4) throw new CalcError('ENT Error');
      if (freshInput && state.lastKey !== 'equals') throw new CalcError('ENT Error');
      const startsFresh = state.lastKey === 'equals';
      return {
        ...state,
        expression: [...(startsFresh ? [] : state.expression), { type: 'left' }],
        displayExpression: [...(startsFresh ? [] : state.displayExpression), { type: 'left' }],
        completedExpression: [],
        transformationSource: undefined,
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
      const displayExpression = [...nextState.displayExpression];
      if (
        nextState.current
        && !displayCompletesValue(displayExpression.at(-1))
      ) {
        displayExpression.push(displayValueToken(nextState, nextState.current));
      }
      displayExpression.push({ type: 'right' });
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
      const display = displayFor(result, state.preferences, ')');
      const currentDisplayMetadata = displayMetadata(
        result,
        display,
        'symbolic-expression',
        nextState.angleDisplayMode,
      );
      return {
        ...nextState,
        expression: expression.slice(0, openIndex),
        displayExpression,
        completedExpression: [],
        transformationSource: undefined,
        parenthesisDepth: state.parenthesisDepth - 1,
        current: result,
        currentDisplayMetadata,
        currentSourceExpression: cloneDisplayExpression(trailingDisplayOperand(displayExpression)),
        inputActive: true,
        inputKind: undefined,
        display,
      };
    }
    case 'divide': return commitOperator(state, '/');
    case 'multiply': return commitOperator(state, '*');
    case 'subtract': return commitOperator(state, '-');
    case 'add': return commitOperator(state, '+');
    case 'equals': return calculateEquals(state);
    case 'pi': {
      if (state.exponentBase) {
        return showError(
          { ...state, entry: `${state.entry}π` },
          new CalcError('EXP Error'),
        );
      }
      const value = scalar(Math.PI);
      const displayExpression = appendDisplayLiteral(state, value, 'π');
      return {
        ...showValue(
          { ...clearSequence(state), inputKind: undefined, angleDisplayMode: undefined },
          value,
          'π',
          undefined,
          'constant',
        ),
        displayExpression,
        currentSourceExpression: cloneDisplayExpression(trailingDisplayOperand(displayExpression)),
        inputActive: true,
      };
    }
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
    imperialEntryText: undefined,
    imperialEntryComponents: undefined,
    current: undefined,
    inputActive: false,
    inputKind: undefined,
    angleDisplayMode: undefined,
    expression: [],
    displayExpression: [],
    completedExpression: [],
    transformationSource: undefined,
    transformationResultMetadata: undefined,
    unitEntryUndo: undefined,
    currentDisplayMetadata: undefined,
    currentSourceExpression: undefined,
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
    triangleUnits: fullTemporary ? {} : state.triangleUnits,
    triangleApproximate: fullTemporary ? {} : state.triangleApproximate,
    circle: fullTemporary ? {} : state.circle,
    circleApproximate: fullTemporary ? {} : state.circleApproximate,
    circleResultUnit: fullTemporary ? undefined : state.circleResultUnit,
    circleRadiusUnit: fullTemporary ? undefined : state.circleRadiusUnit,
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
    return {
      ...state,
      modifier: state.modifier === 'convert' ? undefined : 'convert',
      lastKey: key,
    };
  }
  if (key === 'recall') {
    if (state.modifier === 'recall') return { ...handleRecall({ ...state, sequence: undefined }, key), lastKey: key };
    if (state.modifier === 'convert') return { ...handleSecondary(state, key), lastKey: key };
    return { ...state, modifier: 'recall', lastKey: key, display: { ...state.display, label: 'RCL' } };
  }

  const next = state.modifier === 'convert'
    ? handleSecondary(state, key)
    : state.modifier === 'recall-convert'
      ? key === 'hip'
        ? handleRecall({ ...state, sequence: undefined }, key)
        : (() => { throw new CalcError('ENT Error'); })()
    : state.modifier === 'recall'
      ? handleRecall({ ...state, sequence: undefined }, key)
      : primaryPress(state, key);
  if (next === state) return state;
  return { ...next, lastKey: key };
}

function reformatForPreferences(
  state: CalculatorState,
  preferences: Preferences,
): CalculatorState {
  if (!state.current) return { ...state, preferences };

  const display = displayFor(state.current, preferences, state.display.label);
  const currentDisplayMetadata = displayMetadata(
    state.current,
    display,
    state.currentDisplayMetadata?.provenance ?? 'computed',
    state.angleDisplayMode,
  );
  let currentSourceExpression = cloneDisplayExpression(state.currentSourceExpression);
  if (!currentSourceExpression?.length && currentDisplayMetadata.exactness === 'approximate') {
    if (state.completedExpression.length) {
      currentSourceExpression = cloneDisplayExpression(state.completedExpression);
    } else if (displayCompletesValue(state.displayExpression.at(-1))) {
      currentSourceExpression = cloneDisplayExpression(
        trailingDisplayOperand(state.displayExpression),
      );
    } else {
      currentSourceExpression = [displayValueToken(state, state.current)];
    }
  }

  return {
    ...state,
    preferences,
    display,
    currentDisplayMetadata,
    currentSourceExpression,
  };
}

export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  try {
    if (action.type === 'factory-reset') {
      return {
        ...initialCalculatorState(),
        display: {
          label: '',
          valueText: 'ALL rESEt',
          unitText: '',
          plainText: 'ALL rESEt',
        },
      };
    }
    if (action.type === 'hydrate') {
      const payload = sanitizePersistedState(action.payload);
      return {
        ...state,
        preferences: payload.preferences,
        memory: { ...state.memory, ...payload.memory },
        permanentPitchSlope: payload.permanentPitchSlope,
        permanentPitchApproximate: payload.permanentPitchApproximate,
        irregularPitchSlope: payload.irregularPitchSlope,
        irregularPitchApproximate: payload.irregularPitchApproximate,
        onCenterApproximate: payload.onCenterApproximate,
        desiredRiserApproximate: payload.desiredRiserApproximate,
      };
    }
    if (action.type === 'toggle-preferences') {
      return { ...state, preferencesOpen: action.open ?? !state.preferencesOpen };
    }
    if (action.type === 'reset-preferences') {
      return reformatForPreferences(
        { ...state, onCenterApproximate: undefined, desiredRiserApproximate: undefined },
        { ...DEFAULT_PREFERENCES },
      );
    }
    if (action.type === 'set-preference') {
      const current = state.preferences[action.key];
      if (typeof current === 'number' && (typeof action.value !== 'number' || !Number.isFinite(action.value) || action.value <= 0)) {
        return state;
      }
      const exactPreferenceState = action.key === 'onCenter'
        ? { ...state, onCenterApproximate: undefined }
        : action.key === 'desiredRiser'
          ? { ...state, desiredRiserApproximate: undefined }
          : state;
      return reformatForPreferences(
        exactPreferenceState,
        { ...state.preferences, [action.key]: action.value } as Preferences,
      );
    }
    if (action.type === 'press-converted') {
      return press({ ...state, modifier: 'convert' }, action.key);
    }
    return press(state, action.key);
  } catch (error) {
    return showError(
      action.type === 'press' || action.type === 'press-converted'
        ? { ...state, lastKey: action.key }
        : state,
      error,
    );
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
