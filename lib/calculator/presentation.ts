import { formatValue } from './core';
import type { CalcValue, Operator, Preferences } from './core';
import { solveRightTriangle } from './formulas';
import { displayOperandText, provenanceIsOperandOwn, semanticValueSuffix } from './engine';
import type {
  CalculatorState,
  DisplayDraftSnapshot,
  DisplayExpressionToken,
  DisplayFunction,
  KeyId,
} from './engine';

export interface CalculatorExpressionView {
  mode: 'off' | 'entry' | 'equation' | 'named-result' | 'error';
  contextText: string;
  expressionText: string;
  resultText?: string;
  resultSymbol?: '=' | '≈';
  /**
   * What the second line actually is. Never infer this from resultSymbol: that
   * flag is absent for an inner group and for an exact conversion alike.
   */
  valueLabel?: string;
  valueText?: string;
  valueSymbol?: '=' | '≈';
  errorTitle?: string;
  progressText?: string;
  guidanceText?: string;
  guidanceTone?: 'tip' | 'next' | 'warning' | 'error';
  /** Concise status-region announcement; unlike ariaText it excludes routine coaching. */
  liveText: string;
  ariaText: string;
  entryActive: boolean;
  diagram?: CalculatorDiagramView;
}

export type CalculatorDiagramKind =
  | 'right-triangle'
  | 'circle'
  | 'segment'
  | 'offset'
  | 'law-cosines'
  | 'roof'
  | 'stairs'
  | 'solids'
  | 'fan-law'
  | 'trig'
  | 'power'
  | 'velocity'
  | 'angle';

export type CalculatorDiagramStatus = 'entered' | 'expected' | 'calculated';

export interface CalculatorDiagramMetric {
  id: string;
  symbol: string;
  /**
   * The element's own short symbol, kept for the drawing when the result cycle
   * renames the metric. A tag reading "theta" must not become "%GRD" on the
   * canvas: the position is chosen for the element, and a four-times wider tag
   * grows straight into the line it stands beside. The renamed label belongs in
   * the value list, where it has room and carries its number.
   */
  tagSymbol?: string;
  label: string;
  value?: string;
  placeholder: string;
  status: CalculatorDiagramStatus;
  active: boolean;
}

export interface CalculatorDiagramView {
  kind: CalculatorDiagramKind;
  variant?: string;
  title: string;
  metrics: CalculatorDiagramMetric[];
  geometry?: {
    radius?: number;
    chord?: number;
    rise?: number;
    theta?: number;
    onCenter?: number;
    memberIndex?: number;
    memberCount?: number;
    memberProgress?: number;
    memberSide?: 'regular' | 'irregular';
  };
  pendingEntry: boolean;
  ariaText: string;
}

interface SemanticResult {
  context: string;
  label: string;
  suffix?: string;
  empty?: boolean;
  emptyText?: string;
}

const OPERATOR_TEXT: Record<Operator, string> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
};

const FUNCTION_TEXT: Record<DisplayFunction, string> = {
  sqrt: '√(',
  cuberoot: '∛(',
  reciprocal: '1 ÷ (',
  negate: '−(',
  sin: 'sin(',
  cos: 'cos(',
  tan: 'tan(',
  asin: 'sin⁻¹(',
  acos: 'cos⁻¹(',
  atan: 'tan⁻¹(',
};

const ERROR_TEXT: Record<string, string> = {
  'DIV Error': 'Cannot divide by zero',
  'DIM Error': 'Units do not match',
  'TYP Error': 'This value cannot be used here',
  'ENT Error': 'Complete the entry',
  'EXP Error': 'Check the exponent',
  'ROOT Error': 'Square root needs a nonnegative value',
  'TRIG Error': 'Check the angle',
  'THRT Error': 'Check the offset geometry',
  '0-fL0': 'Result exceeds the calculator range',
  'PRESS On/C': 'Press On/C to clear',
  ERROR: 'Calculation error',
};

const SEQUENCE_CONTEXT: Record<string, string> = {
  circle: 'Circle',
  arc: 'Circular arc',
  pitch: 'Pitch',
  diag: 'Right triangle',
  offset: 'Offset',
  lawcos: 'Law of Cosines',
  hip: 'Hip / valley',
  jacks: 'Regular jacks',
  'ir-jacks': 'Irregular jacks',
  stairs: 'Stair layout',
  'column-cone': 'Column / cone',
  velocity: 'Air velocity / pressure',
};

const STAIR_RESULT_LABELS: Record<string, string> = {
  'R-HT': 'Actual riser height',
  RSRS: 'Number of risers',
  'R+/−': 'Riser overage / underage',
  'T-WD': 'Actual tread width',
  TRDS: 'Number of treads',
  'T+/−': 'Tread overage / underage',
  OPEN: 'Stairwell opening',
  STRG: 'Stringer length',
  INCL: 'Incline angle',
  RUN: 'Total run',
  'RUN (X) STORED': 'Stored total run',
  RISE: 'Total rise',
  'RISE (Y) STORED': 'Stored total rise',
  'R-HT STORED': 'Preferred riser height',
  'T-WD STORED': 'Preferred tread width',
  'HDRM STORED': 'Preferred headroom',
  'FLOR STORED': 'Floor thickness',
};

const BASIC_RESULT_LABELS: Record<string, SemanticResult> = {
  X: { context: 'Right triangle', label: 'Run' },
  Y: { context: 'Right triangle', label: 'Rise' },
  R: { context: 'Right triangle', label: 'Diagonal' },
  RAD: { context: 'Circular segment', label: 'Radius' },
  CORD: { context: 'Circular segment', label: 'Chord length' },
  RISE: { context: 'Circular segment', label: 'Segment rise' },
  IPCH: { context: 'Irregular pitch', label: 'Irregular pitch' },
  'PTCH STORED': { context: 'Pitch', label: 'Recalled pitch' },
  'IPCH STORED': { context: 'Irregular pitch', label: 'Recalled irregular pitch' },
  'JKOC STORED': { context: 'Jack rafters', label: 'On-center spacing' },
  'R-HT STORED': { context: 'Stair layout', label: 'Desired riser height' },
  DEG: { context: 'Angle conversion', label: 'Decimal angle' },
  DMS: { context: 'Angle conversion', label: 'Angle' },
};

function jackSideForResult(
  sequence: NonNullable<CalculatorState['sequence']> | undefined,
  index: number | undefined,
  rawLabel: string,
): 'regular' | 'irregular' {
  if (/^IJ(?:OC|\d)/.test(rawLabel)) return 'irregular';
  if (/^JK(?:OC|\d)/.test(rawLabel)) return 'regular';
  if (sequence && index !== undefined) {
    for (let cursor = Math.min(index, sequence.results.length - 1); cursor >= 0; cursor -= 1) {
      const label = sequence.results[cursor].label;
      if (/^IJ(?:OC|\d)/.test(label)) return 'irregular';
      if (/^JK(?:OC|\d)/.test(label)) return 'regular';
    }
  }
  return sequence?.id === 'ir-jacks' ? 'irregular' : 'regular';
}

function sequenceResult(
  sequenceId: string,
  rawLabel: string,
  value?: CalcValue,
  sequence?: NonNullable<CalculatorState['sequence']>,
  index?: number,
): SemanticResult {
  const context = SEQUENCE_CONTEXT[sequenceId] ?? 'Calculation';
  const fixed: Partial<Record<string, Record<string, string>>> = {
    circle: {
      DIA: 'Diameter',
      CIRC: 'Circumference',
      AREA: 'Circle area',
    },
    pitch: {
      PTCH: 'Pitch',
      '∠θ': 'Pitch angle',
      '%GRD': 'Percent grade',
      SLP: 'Slope ratio',
    },
    diag: {
      R: 'Diagonal',
      PLMB: 'Plumb cut angle',
      LEVL: 'Level cut angle',
    },
    offset: {
      RAD: 'Centerline radius',
      WL: 'Wrapper length',
      HEEL: 'Heel radius',
      THRT: 'Throat radius',
      THET: 'Offset angle',
      X: 'Actual length',
      Y: 'Offset length',
      'A STORED': 'End-A height',
    },
    lawcos: {
      '∠A': 'Angle A',
      '∠B': 'Angle B',
      '∠C': 'Angle C',
      AREA: 'Triangle area',
      a: 'Side A',
      b: 'Side B',
      c: 'Side C',
    },
    hip: {
      'H/V': 'Hip / valley length',
      'IH/V': 'Irregular hip / valley length',
      PLMB: 'Plumb cut angle',
      LEVL: 'Level cut angle',
      CHK1: 'Cheek cut 1',
      CHK2: 'Cheek cut 2',
    },
    'column-cone': {
      COL: 'Column volume',
      'COL AREA': 'Column total surface area',
      CONE: 'Cone volume',
      'CONE AREA': 'Cone total surface area',
    },
  };

  if (sequenceId === 'arc') {
    if (rawLabel === 'ARC') {
      return { context, label: value?.angle ? 'Arc angle' : 'Arc length' };
    }
    const arcLabels: Record<string, string> = {
      CORD: 'Chord',
      SEG: 'Circular segment area',
      PIE: 'Circular sector area',
      RISE: 'Segment rise',
      OC: 'Stud spacing',
    };
    const width = rawLabel.match(/^AW(\d+)$/);
    return {
      context,
      label: width
        ? `Arched-wall stud ${width[1]} length`
        : arcLabels[rawLabel] ?? rawLabel,
    };
  }

  if (sequenceId === 'jacks' || sequenceId === 'ir-jacks') {
    const side = jackSideForResult(sequence, index, rawLabel);
    const sideName = side === 'irregular' ? 'Irregular-side' : 'Regular-side';
    const jack = rawLabel.match(/^(JK|IJ)(\d+)$/);
    const labels: Record<string, string> = {
      JKOC: 'Regular on-center spacing',
      'JKOC STORED': 'Stored regular on-center spacing',
      IJOC: 'Irregular on-center spacing',
      'IJOC STORED': 'Stored irregular on-center spacing',
      PLMB: `${sideName} plumb cut angle`,
      LEVL: `${sideName} level cut angle`,
      CHK1: `${sideName} cheek cut angle`,
    };
    return {
      context: side === 'irregular' ? 'Irregular jacks' : 'Regular jacks',
      label: jack
        ? `${jack[1] === 'IJ' ? 'Irregular jack' : 'Regular jack'} ${jack[2]} length`
        : labels[rawLabel] ?? rawLabel,
    };
  }

  if (sequenceId === 'stairs') {
    return { context, label: STAIR_RESULT_LABELS[rawLabel] ?? rawLabel };
  }

  if (sequenceId === 'velocity') {
    const values: Record<string, Pick<SemanticResult, 'label' | 'suffix'>> = {
      FPM: { label: 'Air velocity', suffix: 'FPM' },
      VP: { label: 'Velocity pressure', suffix: 'in. w.g.' },
      MPS: { label: 'Air velocity', suffix: 'm/s' },
      KPA: { label: 'Velocity pressure', suffix: 'Pa' },
      ENTRY: { label: 'Original entry' },
    };
    return { context, ...(values[rawLabel] ?? { label: rawLabel }) };
  }

  if (sequenceId === 'pitch' && rawLabel === '%GRD') {
    return { context, label: 'Percent grade', suffix: '%' };
  }

  return { context, label: fixed[sequenceId]?.[rawLabel] ?? rawLabel };
}

function sequenceIsCurrent(state: CalculatorState): boolean {
  const sequence = state.sequence;
  if (!sequence) return false;
  if (sequence.index < 0) {
    if (sequence.id !== 'arc' || state.display.label.trim() !== 'ARC' || !state.current) {
      return false;
    }
    const expectedAmount = state.circle.arcDegrees ?? state.circle.arcLength;
    const expectedPower = state.circle.arcDegrees !== undefined ? 0 : 1;
    return expectedAmount !== undefined
      && state.current.amount === expectedAmount
      && state.current.power === expectedPower;
  }
  const activeResult = sequence.results[sequence.index];
  if (!activeResult || activeResult.label !== state.display.label.trim()) return false;
  if (!state.current) return false;
  return activeResult.value.amount === state.current.amount
    && activeResult.value.power === state.current.power
    && Boolean(activeResult.value.angle) === Boolean(state.current.angle);
}

function sequenceCanAdvance(state: CalculatorState): boolean {
  const sequence = state.sequence;
  if (!sequence) return false;
  const label = state.display.label.trim();
  const storageOverlay = (
    /^(?:M-[123](?: STORED)?|M\+(?: STORED| EMPTY)?|M−)$/.test(label)
    || /^(?:A|B|C|An|Bn) STORED$/.test(label)
  );
  const displayOnlyOverlay = (
    state.lastKey === 'feet'
    || state.lastKey === 'inch'
    || state.lastKey === 'meter'
    || (state.lastKey === 'conv' && !state.modifier)
    || storageOverlay
  );
  return Boolean(
    state.display.label !== 'ERROR'
    && state.expression.length === 0
    && state.parenthesisDepth === 0
    && !state.inputActive
    && !state.entry
    && state.fractionNumerator === undefined
    && state.composedInches === undefined
    && state.exponentBase === undefined
    && (state.lastKey === sequence.trigger || displayOnlyOverlay),
  );
}

function sequenceIsDisplayed(state: CalculatorState): boolean {
  if (!sequenceCanAdvance(state)) return false;
  if (sequenceIsCurrent(state)) return true;
  const source = state.transformationSource?.current;
  const activeResult = state.sequence?.results[state.sequence.index];
  return Boolean(
    source
    && activeResult
    && activeResult.value.amount === source.amount
    && activeResult.value.power === source.power
    && Boolean(activeResult.value.angle) === Boolean(source.angle),
  );
}

function semanticResult(state: CalculatorState): SemanticResult | undefined {
  const rawLabel = state.display.label.trim();
  if (!rawLabel) return undefined;
  if (state.modifier === 'convert') return undefined;
  if (state.modifier === 'recall' || state.modifier === 'recall-convert') {
    return { context: 'Recall', label: 'Current value' };
  }

  const shared = rawLabel.match(/^(A|B|C|An|Bn) STORED$/);
  const sharedRegisterResult = shared ? (() => {
    const register = shared[1] === 'An'
      ? 'A new'
      : shared[1] === 'Bn' ? 'B new' : shared[1];
    const key = shared[1] === 'An'
      ? 'aNew'
      : shared[1] === 'Bn' ? 'bNew' : shared[1].toLowerCase() as 'a' | 'b' | 'c';
    const recalled = state.currentDisplayMetadata?.provenance === 'recalled';
    const empty = recalled && state.registers[key] === undefined;
    return {
      context: 'Stored values',
      label: recalled
        ? empty
          ? `Register ${register} is empty`
          : `Recalled register ${register}`
        : `Stored in register ${register}`,
      empty,
    };
  })() : undefined;
  const sharedKey: Record<string, KeyId> = {
    A: '4', B: '5', C: '6', An: '7', Bn: '8',
  };
  const explicitSharedRegisterAction = Boolean(
    shared
    && (
      state.lastKey === sharedKey[shared[1]]
      || state.currentDisplayMetadata?.provenance === 'recalled'
    ),
  );
  if (sharedRegisterResult && explicitSharedRegisterAction) return sharedRegisterResult;

  if (state.sequence && sequenceIsDisplayed(state)) {
    return sequenceResult(
      state.sequence.id,
      rawLabel,
      state.current,
      state.sequence,
      state.sequence.index,
    );
  }

  const memorySlot = rawLabel.match(/^M-(\d)(?: STORED)?$/);
  if (memorySlot) {
    const slot = `m${memorySlot[1]}` as 'm1' | 'm2' | 'm3';
    const recalled = state.currentDisplayMetadata?.provenance === 'recalled';
    const empty = recalled && state.memory[slot] === undefined;
    const cleared = !recalled && state.memory[slot] === undefined && state.current?.amount === 0;
    return {
      context: 'Memory',
      label: empty
        ? `M${memorySlot[1]} is empty`
        : cleared
          ? `Cleared M${memorySlot[1]}`
          : recalled ? `Recalled M${memorySlot[1]}` : `Stored in M${memorySlot[1]}`,
      empty,
    };
  }
  if (rawLabel === 'M+ STORED') {
    const empty = state.memory.cumulative === undefined;
    return {
      context: 'Memory',
      label: empty
        ? 'Running memory is empty'
        : 'Recalled running memory',
      empty,
    };
  }
  if (rawLabel === 'M+') {
    return {
      context: 'Memory',
      label: state.currentDisplayMetadata?.provenance === 'recalled'
        ? 'Recalled and cleared running memory'
        : 'Value added to running memory',
    };
  }
  if (rawLabel === 'M+ EMPTY') {
    return { context: 'Memory', label: 'Running memory was empty', empty: true };
  }
  if (rawLabel === 'M−') {
    return { context: 'Memory', label: 'Value subtracted from running memory' };
  }
  if (rawLabel === 'SWAP M+') {
    return { context: 'Memory', label: 'Previous running memory' };
  }
  if (rawLabel === 'SWAP M+ EMPTY') {
    return {
      context: 'Memory',
      label: 'Previous running memory was empty',
      empty: true,
      emptyText: 'Swap returns 0',
    };
  }

  const fan = rawLabel.match(/^(CFM|CFMn|RPM|RPMn|SP|SPn|BHP|BHPn) FAN LAW ([123])$/);
  if (fan) {
    const labels: Record<string, string> = {
      CFM: 'Original airflow',
      CFMn: 'New airflow',
      RPM: 'Original fan speed',
      RPMn: 'New fan speed',
      SP: 'Original static pressure',
      SPn: 'New static pressure',
      BHP: 'Original brake horsepower',
      BHPn: 'New brake horsepower',
    };
    const suffixes: Record<string, string> = {
      CFM: 'CFM',
      CFMn: 'CFM',
      RPM: 'RPM',
      RPMn: 'RPM',
      SP: 'in. w.g.',
      SPn: 'in. w.g.',
      BHP: 'BHP',
      BHPn: 'BHP',
    };
    return {
      context: `Fan Law ${fan[2]}`,
      label: labels[fan[1]],
      suffix: suffixes[fan[1]],
    };
  }

  if (rawLabel === 'JKOC STORED') {
    const recalled = state.currentDisplayMetadata?.provenance === 'recalled';
    return {
      context: 'Jack settings',
      label: recalled ? 'Recalled on-center spacing' : 'Stored on-center spacing',
    };
  }
  if (rawLabel === 'R-HT STORED') {
    const recalled = state.currentDisplayMetadata?.provenance === 'recalled';
    return {
      context: 'Stair settings',
      label: recalled ? 'Recalled desired riser height' : 'Stored desired riser height',
    };
  }

  if (sharedRegisterResult) return sharedRegisterResult;

  const jack = rawLabel.match(/^(JK|IJ)(\d+)$/);
  if (jack) {
    return {
      context: jack[1] === 'IJ' ? 'Irregular jack rafters' : 'Jack rafters',
      label: `${jack[1] === 'IJ' ? 'Irregular jack' : 'Jack'} ${jack[2]} length`,
    };
  }

  return BASIC_RESULT_LABELS[rawLabel];
}

function normalizeLeadingMinus(text: string): string {
  return text.replace(/(^|[\s(])-(?=\d)/g, '$1−');
}

export function readableMeasurement(text: string): string {
  return normalizeLeadingMinus(text)
    .replace(/([−-]?\d+(?:\.\d+)?)e([−-]?\d+)/gi, '$1 × 10^$2')
    .replace(/([−-]?\d+)\.(?=\s|$)/g, '$1')
    .replace(/\bsq feet\b|\bsq ft\b/gi, 'ft²')
    .replace(/\bcu feet\b|\bcu ft\b/gi, 'ft³')
    .replace(/\bsq inch\b|\bsq in\b/gi, 'in²')
    .replace(/\bcu inch\b|\bcu in\b/gi, 'in³')
    .replace(/\bsq mm\b/gi, 'mm²')
    .replace(/\bcu mm\b/gi, 'mm³')
    .replace(/\bsq m\b/gi, 'm²')
    .replace(/\bcu m\b/gi, 'm³')
    .replace(/\s+ft\b(?![²³])/gi, '′')
    .replace(/\s+in\b(?![²³]|\.\s*w\.g\.)/gi, '″')
    .replace(/\s+yards?\b/gi, ' yd')
    .replace(/(\d)-(\d+\/(?:\d+|…))(?=″)/g, '$1 $2')
    .replace(/^([−-]?)0\s+(?=\d+\/\d+″$)/, '$1')
    .replace(/\^-/g, '^−')
    .trim();
}

function typedNumber(value: number): string {
  return normalizeLeadingMinus(String(value));
}

function readableSourceValue(value: CalcValue): string | undefined {
  const source = value.source;
  if (!source || source.power < 1 || source.power > 3) return undefined;
  const coefficient = source.entryText
    ? normalizeLeadingMinus(source.entryText)
    : typedNumber(source.amount);
  const suffix = source.power === 1
    ? source.unit === 'ft' ? '′' : source.unit === 'in' ? '″' : ` ${source.unit}`
    : ` ${source.unit}${source.power === 2 ? '²' : '³'}`;
  return `${coefficient}${suffix}`;
}

export function readableValue(
  value: CalcValue,
  preferences: Preferences,
  preferEnteredSource = false,
): string {
  if (preferEnteredSource) {
    const sourceText = readableSourceValue(value);
    if (sourceText) return sourceText;
  }
  return readableMeasurement(formatValue(value, preferences).plainText);
}

export function readableExpressionTokens(
  tokens: DisplayExpressionToken[],
  preferences: Preferences,
): string {
  return tokens.map((token) => {
    if (token.type === 'value') {
      return token.draft
        ? currentDraft(token.draft, preferences) ?? readableValue(token.value, preferences)
        : readableValue(token.value, preferences);
    }
    if (token.type === 'operator') return OPERATOR_TEXT[token.operator];
    if (token.type === 'left') return '(';
    if (token.type === 'right' || token.type === 'function-close') return ')';
    if (token.type === 'function-open') return FUNCTION_TEXT[token.function];
    return token.symbol;
  }).join(' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+([²³°%′″])/g, '$1');
}

function enteredText(entry: string): string {
  return normalizeLeadingMinus(entry || '0');
}

function dmsDraft(entry: string): string | undefined {
  const pieces = entry.split('.');
  if (pieces.length < 3) return undefined;
  const [degrees = '0', minutes = '', seconds = ''] = pieces;
  return `${enteredText(degrees || '0')}° ${minutes || '…'}′ ${seconds || '…'}″`;
}

function readableDmsResult(text: string): string | undefined {
  const match = normalizeLeadingMinus(text).match(/^([−]?\d+)\.(\d{2})\.(\d{2})$/);
  if (!match) return undefined;
  return `${match[1]}° ${match[2]}′ ${match[3]}″`;
}

function readableDisplayText(text: string, angleDisplayMode?: 'decimal' | 'dms'): string {
  if (angleDisplayMode === 'dms') return readableDmsResult(text) ?? readableMeasurement(text);
  return readableMeasurement(text);
}

function trailingImperialComponentIsNegative(base: string): boolean {
  const lastPlus = base.lastIndexOf(' + ');
  const lastMinus = base.lastIndexOf(' − ');
  if (lastPlus >= 0 || lastMinus >= 0) return lastMinus > lastPlus;
  return base.startsWith('−') || base.startsWith('-');
}

function appendPendingInches(base: string, component: string, combineFraction = false): string {
  const negative = component.startsWith('−') || component.startsWith('-');
  const magnitude = component.replace(/^[−-]/, '');
  const marked = `${magnitude}″`;
  if (!base) return `${negative ? '−' : ''}${marked}`;
  if (negative) return `${base} − ${marked}`;

  const trailingNegative = trailingImperialComponentIsNegative(base);
  if (combineFraction && /(?:^|[^\d./])\d+″$/.test(base) && !trailingNegative) {
    return `${base.slice(0, -1)} ${marked}`;
  }
  if (base.endsWith('′') && !trailingNegative) return `${base} ${marked}`;
  return `${base} + ${marked}`;
}

function appendFraction(base: string, numerator: number, denominator: string): string {
  return appendPendingInches(base, `${numerator}/${denominator}`, true);
}

function withApproximation(
  state: DisplayDraftSnapshot,
  text: string | undefined,
): string | undefined {
  if (!text || state.metadata?.exactness !== 'approximate' || text.startsWith('≈')) return text;
  return `≈${text}`;
}

function hasTopLevelOperator(items: DisplayExpressionToken[]): boolean {
  let depth = 0;
  for (const item of items) {
    if (item.type === 'left' || item.type === 'function-open') depth += 1;
    else if (item.type === 'right' || item.type === 'function-close') depth -= 1;
    else if (item.type === 'operator' && depth === 0) return true;
  }
  return false;
}

function currentDraft(
  state: DisplayDraftSnapshot,
  preferences: Preferences,
): string | undefined {
  const sourceText = state.sourceExpression?.length
    ? readableExpressionTokens(state.sourceExpression, preferences)
    : undefined;
  const sourceOperand = sourceText && hasTopLevelOperator(state.sourceExpression ?? [])
    ? `(${sourceText})`
    : sourceText;
  if (state.exponentBase) {
    const exponent = exponentDraft(state, preferences);
    const exponentText = exponent.startsWith('≈') ? `(${exponent})` : exponent;
    const scientific = `${sourceOperand
      ?? readableValue(state.exponentBase, preferences, true)} × 10^${exponentText}`;
    return withApproximation(
      state,
      state.inputKind === 'percent' ? `(${scientific})%` : scientific,
    );
  }
  if (sourceText) {
    return state.inputKind === 'percent' ? `${sourceOperand}%` : sourceText;
  }

  const dms = state.composedInches === undefined ? dmsDraft(state.entry) : undefined;
  if (dms) return withApproximation(state, dms);

  if (state.committedText) {
    const committed = readableDisplayText(state.committedText, state.angleDisplayMode);
    return withApproximation(state, state.inputKind === 'percent' && !committed.endsWith('%')
      ? `${committed}%`
      : committed);
  }

  if (state.composedInches !== undefined || state.imperialEntryText) {
    const base = state.imperialEntryText
      ?? (state.current ? readableValue(state.current, preferences, true) : '');
    if (state.fractionNumerator !== undefined) {
      return withApproximation(
        state,
        appendFraction(base, state.fractionNumerator, state.entry || '…'),
      );
    }
    if (state.entry) {
      const nextEntry = enteredText(state.entry);
      return withApproximation(state, appendPendingInches(base, nextEntry));
    }
    return withApproximation(state, base || undefined);
  }

  if (state.fractionNumerator !== undefined) {
    return withApproximation(state, `${state.fractionNumerator}/${state.entry || '…'}″`);
  }
  if (state.entry) {
    const suffix = state.inputKind === 'percent' ? '%' : '';
    return withApproximation(state, `${enteredText(state.entry)}${suffix}`);
  }
  if (state.current) {
    const current = readableValue(state.current, preferences, true);
    return withApproximation(state, state.inputKind === 'percent' ? `${current}%` : current);
  }
  return undefined;
}

function exponentDraft(state: DisplayDraftSnapshot, preferences: Preferences): string {
  if (state.entry) return enteredText(state.entry);
  if (state.current) {
    return withApproximation(state, readableValue(state.current, preferences, true)) ?? '…';
  }
  return '…';
}

function spokenText(text: string): string {
  return text
    .replace(
      /([−-]?\d+(?:\.\d+)?)°(?:\s+(\d+(?:\.\d+)?|…)′)?(?:\s+(\d+(?:\.\d+)?|…)″)?/g,
      (_match, degreesPart: string, minutesPart?: string, secondsPart?: string) => [
        `${degreesPart} degrees`,
        minutesPart ? `${minutesPart === '…' ? 'blank' : minutesPart} minutes` : '',
        secondsPart ? `${secondsPart === '…' ? 'blank' : secondsPart} seconds` : '',
      ].filter(Boolean).join(' '),
    )
    .replace(/\[%\s*grade\]/gi, ' percent grade ')
    .replace(/(\d+)\/(\d+|…)/g, '$1 over $2')
    .replace(/ft²/g, ' square feet ')
    .replace(/ft³/g, ' cubic feet ')
    .replace(/in²/g, ' square inches ')
    .replace(/in³/g, ' cubic inches ')
    .replace(/mm²/g, ' square millimeters ')
    .replace(/mm³/g, ' cubic millimeters ')
    .replace(/m²/g, ' square meters ')
    .replace(/m³/g, ' cubic meters ')
    .replace(/sin⁻¹/g, ' inverse sine ')
    .replace(/cos⁻¹/g, ' inverse cosine ')
    .replace(/tan⁻¹/g, ' inverse tangent ')
    .replace(/√/g, ' square root of ')
    .replace(/∛/g, ' cube root of ')
    .replace(/²/g, ' squared ')
    .replace(/³/g, ' cubed ')
    .replace(/π/g, ' pi ')
    .replace(/×\s*10\^/g, ' times ten to the power of ')
    .replace(/\^/g, ' to the power of ')
    .replace(/°/g, ' degrees ')
    .replace(/′/g, ' feet ')
    .replace(/″/g, ' inches ')
    .replace(/×/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/\+/g, ' plus ')
    .replace(/−/g, ' minus ')
    .replace(/%/g, ' percent ')
    .replace(/→/g, ' converts to ')
    .replace(/≈/g, ' approximately ')
    .replace(/…/g, 'blank')
    .replace(/\s+/g, ' ')
    .trim();
}

function expressionEndsWithValue(items: DisplayExpressionToken[]): boolean {
  const last = items.at(-1);
  return last?.type === 'value'
    || last?.type === 'right'
    || last?.type === 'function-close'
    || last?.type === 'postfix';
}

function expressionUsesApproximateValue(items: DisplayExpressionToken[]): boolean {
  return items.some((item) => {
    if (item.type !== 'value' || !item.draft) return false;
    return item.draft.metadata?.exactness === 'approximate'
      || Boolean(
        item.draft.sourceExpression?.length
        && expressionUsesApproximateValue(item.draft.sourceExpression),
      );
  });
}

function displayContext(state: CalculatorState, hasCompletedExpression: boolean): string {
  if (!state.powered) return 'Calculator off';
  if (state.display.label === 'ERROR') return 'Check entry';
  if (state.preferenceMode) {
    const names = [
      'Fraction resolution',
      'Area display',
      'Volume display',
      'Tread width',
      'Headroom',
      'Floor thickness',
      'Jack order',
      'Irregular jack mode',
      'Exponent display',
      'Meter decimals',
      'Degree decimals',
      'Math order',
      'Constant fraction mode',
    ];
    const index = state.preferenceIndex ?? 0;
    return `Preference ${index + 1} of ${names.length} · ${names[index] ?? 'Setting'}`;
  }
  if (state.modifier === 'convert') return 'Convert mode';
  if (state.modifier === 'recall-convert') return 'Recall convert';
  if (state.modifier === 'recall') return 'Recall mode';
  if (state.transformationSource) return 'Conversion';
  if (
    state.display.label === ')'
    && state.current
    && state.displayExpression.at(-1)?.type === 'right'
  ) return 'Subexpression';
  const activeItems = hasCompletedExpression ? state.completedExpression : state.displayExpression;
  if (
    state.preferences.mathMode === 'chain'
    && activeItems.some((item) => item.type === 'operator')
  ) return 'Chain mode';
  // The line under this caption is the expression, finished or not. Calling it
  // "Result" here put the word above the example and left the actual result
  // unlabelled on the line below.
  if (hasCompletedExpression || state.lastKey === 'equals') return 'Expression';
  const hasLiveOperand = Boolean(
    state.entry
    || state.current
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.imperialEntryText
    || state.exponentBase !== undefined
    || state.currentSourceExpression?.length,
  );
  if (state.displayExpression.at(-1)?.type === 'operator' && !hasLiveOperand) {
    return 'Enter next value';
  }
  if (
    hasLiveOperand
    || state.displayExpression.length
  ) return 'Expression';
  const label = state.display.label.trim();
  if (label && !['READY', 'ENTRY', 'FEET', 'INCH', 'M'].includes(label)) return label;
  return 'Ready';
}

function sequenceProgress(state: CalculatorState): string | undefined {
  const sequence = state.sequence;
  if (!sequence || state.display.label === 'ERROR') return undefined;
  if (state.modifier === 'recall' || state.modifier === 'recall-convert') return undefined;
  if (!sequenceIsDisplayed(state)) return undefined;
  if (sequence.index < 0) return undefined;
  return `${sequence.index + 1} of ${sequence.results.length}`;
}

function triggerName(trigger: string, sequenceId?: string): string {
  const sequenceNames: Record<string, string> = {
    arc: 'Arc / Circ',
    offset: 'Offset / (',
    lawcos: 'LawCos / 9',
    'ir-jacks': 'Ir/Jack / Jack',
    'column-cone': 'Column / )',
    velocity: 'VP/FPM / 0',
    'fan-law-1': 'Fan 1 / Run',
    'fan-law-2': 'Fan 2 / Rise',
    'fan-law-3': 'Fan 3 / Diag',
  };
  if (sequenceId && sequenceNames[sequenceId]) return sequenceNames[sequenceId];
  const names: Record<string, string> = {
    run: 'Run',
    rise: 'Rise',
    diag: 'Diag',
    pitch: 'Pitch',
    hip: 'Hip/V',
    circ: 'Circ',
    stair: 'Stair',
    jack: 'Jack',
    left: 'Offset / (',
    right: 'Column / )',
  };
  return names[trigger] ?? trigger;
}

function sequenceGuidance(state: CalculatorState): string | undefined {
  const sequence = state.sequence;
  if (!sequence?.results.length) return undefined;
  if (!sequenceCanAdvance(state)) return undefined;
  const nextIndex = sequence.index < 0
    ? 0
    : (sequence.index + 1) % sequence.results.length;
  const next = sequence.results[nextIndex];
  const nextResult = sequenceResult(sequence.id, next.label, next.value, sequence, nextIndex);
  const action = sequence.index >= 0 && nextIndex === 0 ? 'return to' : 'show';
  return `Tap ${triggerName(sequence.trigger, sequence.id)} to ${action} ${nextResult.label}.`;
}

function errorRecovery(state: CalculatorState): string {
  const clear = 'Tap On/C to clear.';
  if (state.display.plainText === 'PRESS On/C') {
    return 'Tap On/C to clear the previous error; all other keys are locked.';
  }
  const codeFirstRecovery: Partial<Record<string, string>> = {
    'DIV Error': 'Use a nonzero divisor.',
    'EXP Error': 'Complete the exponent with a valid number.',
    'ROOT Error': 'Use zero or a positive value for square root.',
    'TRIG Error': 'Check the angle and try again.',
    'THRT Error': 'The offset throat is negative; reduce end A or change the offset.',
    '0-fL0': 'Use a smaller value within the calculator range.',
  };
  if (codeFirstRecovery[state.display.plainText]) {
    return `${clear} ${codeFirstRecovery[state.display.plainText]}`;
  }
  const note = state.display.note?.trim();
  if (note) {
    return note.replace(/^Press On\/C\./, clear);
  }

  const recovery: Record<string, string> = {
    'DIV Error': 'Use a nonzero divisor.',
    'DIM Error': 'Use compatible length, area, or volume units.',
    'TYP Error': 'Use the value type required by this function.',
    'ENT Error': 'Complete the required entry, then try again.',
    'EXP Error': 'Complete the exponent with a valid number.',
    'ROOT Error': 'Use zero or a positive value for square root.',
    'TRIG Error': 'Check the angle and try again.',
    'THRT Error': 'The offset throat is negative; reduce end A or change the offset.',
    '0-fL0': 'Use a smaller value within the calculator range.',
    'PRESS On/C': 'Clear the locked error before entering another value.',
  };
  return `${clear} ${recovery[state.display.plainText] ?? 'Check the values and try again.'}`;
}

function errorContext(state: CalculatorState): string {
  const topic = state.display.note?.match(/Press On\/C\.\s*([^:]+):/)?.[1];
  return topic ? `${topic} — check entry` : 'Check entry';
}

function errorTitle(state: CalculatorState): string {
  if (state.display.plainText === 'PRESS On/C') return 'Previous error is locked';
  if (['DIV Error', 'EXP Error', 'ROOT Error', 'TRIG Error', 'THRT Error', '0-fL0']
    .includes(state.display.plainText)) {
    return ERROR_TEXT[state.display.plainText];
  }
  const note = state.display.note ?? '';
  if (/Segment:.*cannot exceed/i.test(note)) return 'Segment geometry is not possible';
  if (/Triangle:.*incompatible/i.test(note)) return 'Triangle values are incompatible';
  if (/Stair:.*too small/i.test(note)) return 'Stair rise or run is too small';
  const topic = note.match(/Press On\/C\.\s*([^:]+):/)?.[1];
  if (topic) return `${topic} needs valid inputs`;
  return ERROR_TEXT[state.display.plainText] ?? readableMeasurement(state.display.plainText);
}

function appendSemanticSuffix(
  text: string,
  value: CalcValue | undefined,
): string {
  const kind = value?.semanticKind;
  const suffix = semanticValueSuffix(kind);
  if (!suffix) return text;
  // Each suffix spells the notation out, so the percent sign already carried by
  // the formatted value is dropped rather than repeated.
  const normalized = text.replace(/\.$/, '').replace(/%$/, '');
  return suffix === '% grade' ? `${normalized}% grade` : `${normalized} ${suffix}`;
}

function triangleGuidance(state: CalculatorState): string | undefined {
  const entered = new Set(
    state.triangleInputs.filter((key) => state.triangle[key] !== undefined),
  );
  const names: Record<string, string> = {
    x: 'Run',
    y: 'Rise',
    r: 'Diagonal',
    theta: 'Pitch',
  };

  const segmentChordValue = state.circle.chord ?? state.triangle.x;
  const segmentRiseValue = state.circle.rise ?? state.triangle.y;
  // Run/Rise are shared by the triangle and segment workflows. A fresh pair
  // alone is still presented as a right triangle; it becomes segment-focused
  // when a radius is already stored or after the user invokes Seg Radius.
  // This keeps the written guidance aligned with calculatorDiagramView().
  const activeSegmentPair = Boolean(
    state.segmentPairReady && state.circle.radius !== undefined,
  );
  if (activeSegmentPair && (
    segmentChordValue === undefined
    || segmentRiseValue === undefined
    || !Number.isFinite(segmentChordValue)
    || !Number.isFinite(segmentRiseValue)
    || segmentChordValue <= 0
    || segmentRiseValue <= 0
  )) {
    return 'Chord and rise must both be positive before calculating the segment radius.';
  }
  if (activeSegmentPair) {
    return 'Chord and rise are ready. Tap Conv + Pitch to calculate the segment radius.';
  }
  if (
    state.segmentRadiusReady
    && state.circle.radius !== undefined
    && Number.isFinite(state.circle.radius)
    && state.circle.radius > 0
  ) {
    const diameter = state.circle.radius * 2;
    if (
      segmentChordValue !== undefined
      && (!Number.isFinite(segmentChordValue) || segmentChordValue <= 0 || segmentChordValue > diameter)
    ) {
      return 'Chord must be positive and cannot exceed the stored circle diameter.';
    }
    if (
      segmentRiseValue !== undefined
      && (!Number.isFinite(segmentRiseValue) || segmentRiseValue <= 0 || segmentRiseValue > diameter)
    ) {
      return 'Segment rise must be positive and cannot exceed twice the stored radius.';
    }
    if (state.display.label === 'RISE' && state.circle.rise !== undefined) {
      return 'Segment rise is calculated. Tap Run to show the matching chord, or enter a new value.';
    }
    if (state.display.label === 'CORD' && state.circle.chord !== undefined) {
      return 'Segment chord is calculated. Tap Rise to show the matching segment rise, or enter a new value.';
    }
    if (state.segmentInputs.includes('x') && !state.segmentInputs.includes('y')) {
      return 'Radius and chord are ready. Tap Rise to calculate the segment rise.';
    }
    if (state.segmentInputs.includes('y') && !state.segmentInputs.includes('x')) {
      return 'Radius and rise are ready. Tap Run to calculate the segment chord.';
    }
    const hasStoredChord = state.circle.chord !== undefined;
    const hasStoredRise = state.circle.rise !== undefined;
    if (hasStoredChord && !hasStoredRise) {
      return 'Radius and chord are ready. Tap Rise to calculate the segment rise.';
    }
    if (hasStoredRise && !hasStoredChord) {
      return 'Radius and rise are ready. Tap Run to calculate the segment chord.';
    }
    if (hasStoredChord && hasStoredRise) {
      return 'Radius, chord, and rise are stored. Tap Rise to recalculate rise from the chord, or Run to recalculate chord from the rise.';
    }
    return 'Radius is stored. Enter a chord with Run or a segment rise with Rise.';
  }

  const usesStoredPitch = !entered.has('theta')
    && state.permanentPitchSlope !== undefined
    && Number.isFinite(state.permanentPitchSlope);
  if (usesStoredPitch) entered.add('theta');
  if (!entered.size) return undefined;
  const validationValues: Parameters<typeof solveRightTriangle>[0] = {};
  for (const key of entered) {
    if (key === 'theta' && state.triangle.theta === undefined && usesStoredPitch) {
      validationValues.theta = Math.atan(state.permanentPitchSlope!) * 180 / Math.PI;
    } else {
      validationValues[key as keyof typeof validationValues] = state.triangle[
        key as keyof typeof state.triangle
      ];
    }
  }
  const hasInvalidStoredValue = Object.values(validationValues).some((value) => (
    value !== undefined && (!Number.isFinite(value) || value <= 0)
  ));
  if (hasInvalidStoredValue) {
    return 'Stored triangle dimensions must be positive. Replace the invalid value before solving.';
  }
  if (entered.size >= 2) {
    try {
      solveRightTriangle(validationValues);
    } catch {
      return 'Stored triangle dimensions are incompatible. Diagonal must be longer than Run and Rise, and Pitch must be between 0° and 90°.';
    }
  }
  if (usesStoredPitch && entered.size === 1) {
    return 'Stored Pitch is ready. Enter Run, Rise, or Diagonal.';
  }
  if (usesStoredPitch && entered.size === 2) {
    const side = [...entered].find((key) => key !== 'theta');
    const solveTargets: Record<string, string> = {
      x: 'Rise or Diagonal',
      y: 'Run or Diagonal',
      r: 'Run or Rise',
    };
    if (side) {
      return `${names[side]} and stored Pitch are ready. Tap ${solveTargets[side]} to solve the triangle, or use Hip/V, Jack, or Stair.`;
    }
  }
  if (entered.size === 1) {
    const key = [...entered][0];
    const stored = names[key];
    const choices = (['x', 'y', 'r', 'theta'] as const)
      .filter((candidate) => candidate !== key)
      .map((candidate) => names[candidate]);
    return `${stored} is stored. Enter ${choices.slice(0, -1).join(', ')}, or ${choices.at(-1)}.`;
  }
  if (state.segmentPairReady && entered.has('x') && entered.has('y')) {
    return 'Run and Rise are ready. Tap Diagonal or Pitch to solve the triangle, or Conv + Pitch for the segment radius.';
  }
  return 'Triangle is ready. Solve a side, or use Pitch, Hip/V, Jack, or Stair.';
}

function registerGuidance(state: CalculatorState): string | undefined {
  const { a, b, c, aNew, bNew } = state.registers;
  const usableSide = (value: CalcValue | undefined): value is CalcValue => Boolean(
    value
    && Number.isFinite(value.amount)
    && value.amount > 0
    && !value.angle
    && !value.semanticKind
    && (value.power === 0 || value.power === 1),
  );
  const fanValue = (value: CalcValue | undefined): value is CalcValue => Boolean(
    value
    && Number.isFinite(value.amount)
    && value.amount > 0
    && !value.angle
    && value.power === 0,
  );
  const sides = [a, b, c];
  const allSidesStored = sides.every((value) => value !== undefined);
  const hasFieldValueAsSide = sides.some((value) => Boolean(value?.semanticKind));
  const lawCosReady = sides.every(usableSide)
    && a!.amount + b!.amount > c!.amount
    && a!.amount + c!.amount > b!.amount
    && b!.amount + c!.amount > a!.amount;
  const fanValues = [a, aNew, b, bNew].filter(fanValue).length;
  if (lawCosReady && fanValues === 3) {
    return 'Geometry and Fan Law values are ready. Use Conv + 9, or choose Fan Law 1, 2, or 3.';
  }
  if (lawCosReady) {
    return 'A, B, and C are ready. Tap Conv + 9; stored values remain available to other tools.';
  }
  if (allSidesStored && hasFieldValueAsSide) {
    const fanPath = fanValues === 3
      ? ' Three Fan Law values are ready—choose Fan Law 1, 2, or 3.'
      : '';
    return `A, B, and C include an HVAC field value. Replace it with a length or bare number before using Conv + 9.${fanPath}`;
  }
  if (allSidesStored && fanValues === 3) {
    return 'Three Fan Law values are ready—choose Fan Law 1, 2, or 3. A, B, and C must form a valid triangle before using Conv + 9.';
  }
  if (allSidesStored) {
    return 'A, B, and C are stored, but they must be positive sides that form a valid triangle before using Conv + 9.';
  }
  if (fanValues === 3) {
    return 'Three Fan Law values are ready. Choose Fan Law 1, 2, or 3; A/B/C stay available.';
  }
  if (a || b || c || aNew || bNew) {
    return 'Value stored. Continue with A/B/C geometry or A/A new/B/B new Fan Law values.';
  }
  return undefined;
}

function displayGuidance(
  state: CalculatorState,
  hasCompletedExpression: boolean,
  entryActive: boolean,
): { text?: string; tone?: CalculatorExpressionView['guidanceTone'] } {
  if (state.display.label === 'ERROR') {
    return { text: errorRecovery(state), tone: 'error' };
  }
  const activeSequenceNote = state.sequence && sequenceCanAdvance(state)
    ? state.sequence.results[state.sequence.index]?.note
    : undefined;
  const note = state.display.note ?? activeSequenceNote;
  const withNote = (
    text: string,
    tone: CalculatorExpressionView['guidanceTone'] = 'next',
  ): { text: string; tone: CalculatorExpressionView['guidanceTone'] } => {
    if (!note) return { text, tone };
    const warning = note.replace(/\.?$/, '.');
    return { text: `${warning} ${text}`, tone: 'warning' };
  };
  if (state.preferenceMode) {
    return withNote(
      state.preferenceMode === 'edit'
        ? 'Use + or − to change this preference. Tap = for the next setting.'
        : 'Tap = for the next saved preference.',
    );
  }
  if (state.modifier === 'convert') {
    return withNote('Choose a key to use its yellow function.');
  }
  if (state.modifier === 'recall-convert') {
    return state.irregularPitchSlope !== undefined
      ? withNote('Tap Hip/V to recall the stored irregular pitch.')
      : withNote(
          'No irregular pitch is stored. Tap On/C, enter an irregular pitch, then tap Conv + Hip/V to store it.',
          'warning',
        );
  }
  if (state.modifier === 'recall') {
    return withNote('Choose the stored value or preference you want to recall.');
  }
  if (state.display.label === ')') {
    return withNote(state.parenthesisDepth > 0
      ? 'Continue with an operator, close the outer group, or tap =.'
      : 'Continue with an operator or tap =.');
  }
  if (state.expression.at(-1)?.type === 'operator') {
    const hasRightOperand = Boolean(
      state.current
      || state.entry
      || state.fractionNumerator !== undefined
      || state.composedInches !== undefined
      || state.imperialEntryText
      || state.exponentBase !== undefined
      || state.currentSourceExpression?.length,
    );
    return hasRightOperand
      ? { text: 'Tap = to calculate, or choose another operator to continue.', tone: 'next' }
      : { text: 'Enter the next value, then tap =.', tone: 'next' };
  }
  if (state.parenthesisDepth > 0) {
    const hasGroupValue = Boolean(
      state.current
      || state.entry
      || state.fractionNumerator !== undefined
      || state.composedInches !== undefined
      || state.imperialEntryText
      || state.exponentBase !== undefined
      || state.currentSourceExpression?.length,
    );
    return hasGroupValue
      ? { text: 'Choose an operator or tap ) to close this group.', tone: 'next' }
      : { text: 'Enter the first value in this group.', tone: 'next' };
  }
  const nextResult = sequenceGuidance(state);
  if (note) {
    const warning = note.replace(/\.?$/, '.');
    return {
      text: nextResult ? `${warning} ${nextResult}` : warning,
      tone: 'warning',
    };
  }
  if (nextResult) return { text: nextResult, tone: 'next' };
  if (state.transformationSource) {
    return { text: 'Choose another conversion, an operator, or a new value.', tone: 'tip' };
  }
  // A live or recalled operand takes precedence over older stored geometry.
  // Otherwise a suggested geometry key can consume the operand instead of the
  // registers the hint describes (for example recalled FPM as a segment radius).
  if (entryActive) {
    // A recalled irregular pitch is a named roof value, not an anonymous entry.
    if (state.display.label.trim() === 'IPCH STORED') {
      return {
        text: 'Stored irregular pitch is on screen. Enter Run and tap Hip/V, or type a new pitch and store it with Conv + Hip/V.',
        tone: 'tip',
      };
    }
    if (
      state.inputKind === 'dms'
      || state.inputKind === 'decimal-degree'
      || (state.entry.match(/\./g) ?? []).length >= 2
    ) {
      return { text: 'Complete the angle, then choose an operation or conversion.', tone: 'tip' };
    }
    return {
      text: 'Choose a unit, operator, or function. Length tools treat a bare number as inches.',
      tone: 'tip',
    };
  }
  if (!hasCompletedExpression && state.inputActive && state.current) {
    return {
      text: 'Current value is ready. Choose an operator, conversion, or compatible function.',
      tone: 'tip',
    };
  }
  if (!hasCompletedExpression) {
    const guidanceTone = (text: string): CalculatorExpressionView['guidanceTone'] => (
      /\b(?:must|cannot|incompatible|invalid|replace)\b/i.test(text)
        ? 'warning'
        : 'tip'
    );
    const activeDiagram = calculatorDiagramView(state);
    if (
      state.display.label.trim() === 'A STORED'
      && state.diagramFocus === 'offset'
      && !hasValidStagedOffset(state)
    ) {
      return {
        text: 'Offset is not ready: Run and Rise must be positive, and End A must match their dimension mode and leave a non-negative throat radius.',
        tone: 'warning',
      };
    }
    if (activeDiagram?.kind === 'offset' && state.display.label.trim() === 'A STORED') {
      return {
        text: 'Run, Rise, and End A are ready. Tap Conv + ( to calculate the Offset.',
        tone: 'tip',
      };
    }
    // The irregular-roof drawing and the written hint describe the same step:
    // without this the stored regular Pitch kept offering the Diagonal, which
    // is not part of the irregular hip workflow that is on screen.
    if (activeDiagram?.variant === 'ir-hip'
      && activeDiagram.metrics.some((item) => item.id === 'irregular-pitch')) {
      return {
        text: state.permanentPitchSlope === undefined
          ? 'Irregular pitch is stored for the second roof plane. Store the regular Pitch, then enter Run and tap Hip/V.'
          : 'Both roof pitches are stored. Enter Run, then tap Hip/V for the irregular hip and valley.',
        tone: 'tip',
      };
    }
    if (activeDiagram?.kind === 'law-cosines' || activeDiagram?.kind === 'fan-law') {
      const registers = registerGuidance(state);
      if (registers) return { text: registers, tone: guidanceTone(registers) };
    }
    const triangle = triangleGuidance(state);
    if (triangle) {
      return {
        text: triangle,
        tone: guidanceTone(triangle),
      };
    }
    const registers = registerGuidance(state);
    if (registers) return { text: registers, tone: guidanceTone(registers) };
  }
  if (hasCompletedExpression) {
    return { text: 'Continue with an operator, conversion, or new calculation.', tone: 'tip' };
  }
  if (state.current) {
    return { text: 'Continue with an operator, conversion, or new calculation.', tone: 'tip' };
  }
  return {
    text: 'Enter a value. Length tools treat a bare number as inches.',
    tone: 'tip',
  };
}

function hasPendingDiagramEntry(state: CalculatorState): boolean {
  return Boolean(
    state.entry
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.imperialEntryText
    || state.exponentBase !== undefined,
  );
}

function diagramValue(value: CalcValue | undefined, state: CalculatorState): string | undefined {
  return value
    ? readableMeasurement(formatValue(value, state.preferences).plainText)
    : undefined;
}

function diagramLinearValue(
  state: CalculatorState,
  amount: number | undefined,
  unit: CalcValue['unit'] | undefined,
  unitless = false,
  fractionDenominator?: CalcValue['fractionDenominator'],
  inputValue?: CalcValue,
): string | undefined {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  if (unitless) {
    return diagramValue({ amount, power: 0, unit: 'auto', system: 'neutral' }, state);
  }
  const normalizedInputValue = inputValue?.power === 0 && !inputValue.angle && !inputValue.semanticKind
    ? {
        ...inputValue,
        power: 1,
        unit: inputValue.fractionDenominator ? 'in' as const : 'decimal-in' as const,
        system: 'imperial' as const,
      }
    : inputValue;
  const normalizedSource = normalizedInputValue?.source;
  const decimalSourceUnit = normalizedInputValue?.power === 1
    && normalizedInputValue.fractionDenominator === undefined
    && /\d\.\d/.test(normalizedSource?.entryText ?? '')
      ? normalizedSource?.unit
      : undefined;
  const resolvedUnit = decimalSourceUnit === 'in'
    ? 'decimal-in'
    : decimalSourceUnit === 'ft'
      ? 'decimal-ft'
      : inputValue?.power === 0 && !inputValue.angle && !inputValue.semanticKind
        ? inputValue.fractionDenominator ? 'in' : 'decimal-in'
      : normalizedInputValue?.power === 1
        && !normalizedInputValue.angle
        && (
          normalizedInputValue.fractionDenominator !== undefined
          || normalizedInputValue.unit === 'ft-decimal-in'
          || normalizedInputValue.unit === 'm'
          || normalizedInputValue.unit === 'mm'
        )
        ? normalizedInputValue.unit === 'decimal-in'
          ? 'in'
          : normalizedInputValue.unit === 'decimal-ft'
            ? 'ft-in'
            : normalizedInputValue.unit
        : unit ?? 'ft-in';
  const value: CalcValue = {
    amount,
    power: 1,
    unit: resolvedUnit,
    system: resolvedUnit === 'm' || resolvedUnit === 'mm' ? 'metric' : 'imperial',
    fractionDenominator: normalizedInputValue?.fractionDenominator ?? fractionDenominator,
  };
  const formatted = diagramValue(value, state);
  if (
    amount !== 0
    && (resolvedUnit === 'in' || resolvedUnit === 'ft-in')
    && (formatted === '0″' || formatted === '0′ 0″')
  ) {
    return readableMeasurement(formatValue({ ...value, unit: 'decimal-in' }, state.preferences).plainText);
  }
  return formatted;
}

function diagramAngleValue(state: CalculatorState, amount: number | undefined): string | undefined {
  if (amount === undefined || !Number.isFinite(amount)) return undefined;
  return diagramValue({ amount, power: 0, angle: true, unit: 'auto', system: 'neutral' }, state);
}

function diagramMetric(
  id: string,
  symbol: string,
  label: string,
  value: string | undefined,
  entered: boolean,
  active: boolean,
  placeholder = 'enter option',
): CalculatorDiagramMetric {
  return {
    id,
    symbol,
    label,
    value,
    placeholder,
    status: value === undefined ? 'expected' : entered ? 'entered' : 'calculated',
    active,
  };
}

function finishDiagram(
  state: CalculatorState,
  diagram: Omit<CalculatorDiagramView, 'pendingEntry' | 'ariaText'>,
): CalculatorDiagramView {
  const pendingEntry = hasPendingDiagramEntry(state);
  const sequence = state.sequence;
  const currentSequenceResult = sequence
    && sequence.index >= 0
    && sequenceIsDisplayed(state)
      ? sequence.results[sequence.index]
      : undefined;
  const currentSemantic = currentSequenceResult && sequence
    ? sequenceResult(
        sequence.id,
        currentSequenceResult.label,
        currentSequenceResult.value,
        sequence,
        sequence.index,
      )
    : undefined;
  const currentIsEntered = Boolean(
    currentSequenceResult
    && sequence
    && (
      sequence.inputIndex === sequence.index
      || /STORED$/.test(currentSequenceResult.label)
      || (sequence.id === 'lawcos' && /^[abc]$/.test(currentSequenceResult.label))
      || (sequence.id === 'offset' && currentSequenceResult.label === 'A STORED')
      || (sequence.id === 'arc' && currentSequenceResult.label === 'OC' && state.onCenterStored)
    )
  );
  const metrics = diagram.metrics.map((metric) => {
    if (!metric.active || !currentSequenceResult || !currentSemantic) return metric;
    // Pitch is a representation cycle (inches, angle, grade, slope). Only the
    // exact representation supplied by the operator is entered; the remaining
    // formats are conversions even though they share the same theta drawing.
    const matchesEnteredMetric = sequence?.id !== 'pitch' && metric.status === 'entered' && (
      metric.label === currentSemantic.label
      || metric.label.startsWith(`${currentSemantic.label} `)
      || currentSemantic.label.startsWith(`${metric.label} `)
    );
    const renamedSymbol = currentSequenceResult.label.replace(/(?: \([^)]*\))? STORED$/, '');
    return {
      ...metric,
      symbol: renamedSymbol,
      // Keep the element's own symbol on the drawing only when the rename is a
      // different WRITING of the same quantity and is materially wider - theta
      // becoming %GRD is the same angle, and a four-times wider tag grows into
      // the line it stands beside. A rename of similar length is a different
      // quantity (R-HT -> RSRS is a height becoming a count), and there the
      // drawing must say what the list says.
      tagSymbol: renamedSymbol.length - metric.symbol.length >= 2
        ? metric.symbol
        : undefined,
      label: currentSemantic.label,
      value: diagramValue(currentSequenceResult.value, state),
      // Selecting an item in a result cycle must not erase its provenance.
      // A Run/Chord or register supplied by the user remains "entered" even
      // when that same element is the currently highlighted cycle result.
      status: currentIsEntered || matchesEnteredMetric
        ? 'entered' as const
        : 'calculated' as const,
    };
  });
  const statusNames: Record<CalculatorDiagramStatus, string> = {
    entered: 'entered or stored',
    expected: 'expected next',
    calculated: 'calculated',
  };
  const metricText = metrics.map((metric) => (
    `${metric.label}: ${metric.value ?? metric.placeholder}; ${statusNames[metric.status]}${metric.active ? '; current result' : ''}`
  ));
  return {
    ...diagram,
    metrics,
    pendingEntry,
    ariaText: [
      diagram.title,
      pendingEntry
        ? 'The number currently being typed is not assigned until a geometry key is pressed.'
        : undefined,
      ...metricText,
    ].filter(Boolean).join('. '),
  };
}

function sequenceResultValue(
  state: CalculatorState,
  matcher: string | RegExp,
): CalcValue | undefined {
  return state.sequence?.results.find((result) => (
    typeof matcher === 'string' ? result.label === matcher : matcher.test(result.label)
  ))?.value;
}

function rightTriangleDiagram(
  state: CalculatorState,
  variant = 'triangle',
  force = false,
): CalculatorDiagramView | undefined {
  const entered = new Set(
    state.triangleInputs.filter((key) => state.triangle[key] !== undefined),
  );
  const usesStoredPitch = entered.size < 2
    && !entered.has('theta')
    && state.permanentPitchSlope !== undefined
    && Number.isFinite(state.permanentPitchSlope);
  const theta = state.triangle.theta ?? (usesStoredPitch
    ? Math.atan(state.permanentPitchSlope!) * 180 / Math.PI
    : undefined);
  if (!force && !entered.size && theta === undefined) return undefined;
  const label = state.display.label.trim();
  const active = {
    x: label === 'X',
    y: label === 'Y',
    r: label === 'R',
    theta: ['PTCH', 'PTCH STORED', '∠θ', '%GRD', 'SLP', 'PLMB', 'LEVL'].includes(label),
  };
  const unitless = state.triangleUnitless === true;
  const fallbackUnit = state.resultUnit;
  return finishDiagram(state, {
    kind: 'right-triangle',
    variant,
    title: 'Right triangle · Run, Rise, Diagonal and Pitch',
    metrics: [
      diagramMetric(
        'x', 'x', 'Run',
        diagramLinearValue(
          state,
          state.triangle.x,
          state.triangleUnits.x ?? fallbackUnit,
          unitless,
          state.triangleFractionDenominators.x,
          state.triangleInputValues.x,
        ),
        entered.has('x'), active.x,
      ),
      diagramMetric(
        'y', 'y', 'Rise',
        diagramLinearValue(
          state,
          state.triangle.y,
          state.triangleUnits.y ?? fallbackUnit,
          unitless,
          state.triangleFractionDenominators.y,
          state.triangleInputValues.y,
        ),
        entered.has('y'), active.y,
      ),
      diagramMetric(
        'r', 'r', 'Diagonal',
        diagramLinearValue(
          state,
          state.triangle.r,
          state.triangleUnits.r ?? fallbackUnit,
          unitless,
          state.triangleFractionDenominators.r,
          state.triangleInputValues.r,
        ),
        entered.has('r'), active.r,
      ),
      diagramMetric(
        'theta', label === 'PTCH STORED' ? 'PTCH' : 'θ',
        label === 'PTCH STORED' ? 'Stored pitch' : 'Pitch angle',
        label === 'PTCH STORED'
          ? diagramValue(state.current, state)
          : diagramAngleValue(state, theta),
        entered.has('theta') || usesStoredPitch || label === 'PTCH STORED', active.theta,
      ),
    ],
  });
}

function circleDiagram(state: CalculatorState): CalculatorDiagramView {
  const label = state.display.label.trim();
  const unit = state.circleRadiusUnit ?? state.circleResultUnit ?? state.resultUnit;
  return finishDiagram(state, {
    kind: 'circle',
    title: 'Circle · Diameter, Radius, Circumference and Area',
    metrics: [
      diagramMetric(
        'diameter', 'Ø', 'Diameter',
        diagramValue(sequenceResultValue(state, 'DIA'), state)
          ?? diagramLinearValue(
            state,
            state.circle.diameter,
            unit,
            false,
            state.circleInput === 'diameter' ? state.circleInputFractionDenominator : undefined,
            state.circleInput === 'diameter' ? state.circleInputValue : undefined,
          ),
        state.circleInput === 'diameter', label === 'DIA', 'enter diameter',
      ),
      diagramMetric(
        'radius', 'r', 'Radius',
        diagramLinearValue(
          state,
          state.circle.radius,
          unit,
          false,
          state.circleInput === 'radius' ? state.circleInputFractionDenominator : undefined,
          state.circleInput === 'radius' ? state.circleInputValue : undefined,
        ),
        state.circleInput === 'radius', label === 'RAD', 'from diameter',
      ),
      diagramMetric(
        'circumference', 'C', 'Circumference',
        diagramValue(sequenceResultValue(state, 'CIRC'), state),
        false, label === 'CIRC', 'after solve',
      ),
      diagramMetric(
        'area', 'A', 'Circle area',
        diagramValue(sequenceResultValue(state, 'AREA'), state),
        false, label === 'AREA', 'after solve',
      ),
    ],
  });
}

function segmentDiagram(state: CalculatorState, variant = 'segment'): CalculatorDiagramView {
  const label = state.display.label.trim();
  const unit = state.circleRadiusUnit ?? state.circleResultUnit ?? state.resultUnit;
  const radius = state.circle.radius
    ?? (state.circle.diameter === undefined ? undefined : state.circle.diameter / 2);
  const chordEntered = state.segmentInputs.includes('x');
  const riseEntered = state.segmentInputs.includes('y');
  const hasFreshSegmentInput = Boolean(state.segmentPairReady || chordEntered || riseEntered);
  const activeArcSequence = state.sequence?.id === 'arc' && sequenceIsDisplayed(state);
  const retainedArcIsCurrent = activeArcSequence || !hasFreshSegmentInput;
  let theta = retainedArcIsCurrent ? state.circle.arcDegrees : undefined;
  if (
    theta === undefined
    && retainedArcIsCurrent
    && radius
    && state.circle.arcLength !== undefined
  ) {
    theta = state.circle.arcLength / radius * 180 / Math.PI;
  }
  const explicitArc = Boolean(state.arcInput && activeArcSequence);
  const storedChord = state.circle.chord ?? state.triangle.x;
  const storedRise = state.circle.rise ?? state.triangle.y;
  if (theta === undefined && radius) {
    const thetaFromRise = () => {
      if (storedRise === undefined) return undefined;
      const cosine = (radius - storedRise) / radius;
      return cosine >= -1 && cosine <= 1
        ? 2 * Math.acos(cosine) * 180 / Math.PI
        : undefined;
    };
    const thetaFromChord = () => {
      if (storedChord === undefined) return undefined;
      const sine = storedChord / (2 * radius);
      return sine >= -1 && sine <= 1
        ? 2 * Math.asin(sine) * 180 / Math.PI
        : undefined;
    };
    const latestSegmentInput = state.segmentInputs.at(-1);
    theta = state.segmentPairReady && chordEntered && riseEntered
      ? thetaFromRise()
      : latestSegmentInput === 'x'
        ? thetaFromChord()
        : latestSegmentInput === 'y'
          ? thetaFromRise()
          : thetaFromRise() ?? thetaFromChord();
  }
  const derivedChord = radius && theta !== undefined
    ? 2 * radius * Math.sin(theta * Math.PI / 360)
    : undefined;
  const derivedRise = radius && theta !== undefined
    ? radius * (1 - Math.cos(theta * Math.PI / 360))
    : undefined;
  const chord = explicitArc ? derivedChord : storedChord ?? derivedChord;
  const rise = explicitArc ? derivedRise : storedRise ?? derivedRise;
  const chordResult = sequenceResultValue(state, 'CORD');
  const riseResult = sequenceResultValue(state, 'RISE');
  const enteredArcAngleIsDisplayed = state.arcInput === 'angle'
    && activeArcSequence
    && state.sequence?.index === -1
    && label === 'ARC';
  const arcValue = retainedArcIsCurrent
    ? state.arcInput === 'length'
      ? diagramLinearValue(
          state,
          state.circle.arcLength,
          state.circleResultUnit ?? unit,
          false,
          state.arcInputFractionDenominator,
          state.arcInputValue,
        )
      : enteredArcAngleIsDisplayed
        ? readableMeasurement(state.display.plainText)
        : diagramAngleValue(state, theta)
    : undefined;
  const arcIsLength = retainedArcIsCurrent && state.arcInput === 'length';
  const chordShown = explicitArc || state.sequence?.id === 'arc' || chordEntered || label === 'CORD';
  const riseShown = explicitArc || state.sequence?.id === 'arc' || riseEntered || label === 'RISE';
  const radiusDerivedFromPair = state.circleInput === undefined && chordEntered && riseEntered;
  const arcEntered = state.sequence?.inputIndex === -1;
  const wallMemberMatch = label.match(/^AW(\d+)$/);
  const wallMemberCount = state.sequence?.id === 'arc'
    ? state.sequence.results.filter((result) => /^AW\d+$/.test(result.label)).length
    : 0;
  return finishDiagram(state, {
    kind: 'segment',
    variant,
    title: variant === 'arc'
      ? 'Circular arc · Radius, Chord, Rise and Arc'
      : 'Circular segment · Radius, Chord and Rise',
    geometry: {
      radius,
      chord,
      rise,
      theta,
      onCenter: state.preferences.onCenter,
      memberIndex: wallMemberMatch ? Number(wallMemberMatch[1]) : undefined,
      memberCount: wallMemberCount || undefined,
    },
    metrics: [
      diagramMetric(
        'radius', 'r', 'Radius',
        diagramLinearValue(
          state,
          state.circle.radius,
          unit,
          false,
          state.circleInput === 'radius' ? state.circleInputFractionDenominator : undefined,
          state.circleInput === 'radius' ? state.circleInputValue : undefined,
        ),
        state.circleInput === 'radius' && !radiusDerivedFromPair,
        label === 'RAD', 'enter radius',
      ),
      diagramMetric(
        'chord', 'c', 'Chord / Run',
        (explicitArc ? diagramValue(chordResult, state) : undefined)
          ?? (chordShown
            ? diagramLinearValue(
                state,
                chord,
                state.triangleUnits.x ?? state.circleResultUnit ?? unit,
                false,
                chordEntered ? state.triangleFractionDenominators.x : undefined,
                chordEntered ? state.triangleInputValues.x : undefined,
              )
            : undefined)
          ?? diagramValue(chordResult, state),
        chordEntered, label === 'CORD' || label === 'X', 'enter chord',
      ),
      diagramMetric(
        'rise', 'h', 'Segment rise',
        (explicitArc ? diagramValue(riseResult, state) : undefined)
          ?? (riseShown
            ? diagramLinearValue(
                state,
                rise,
                state.triangleUnits.y ?? state.circleHeightUnit ?? unit,
                false,
                riseEntered ? state.triangleFractionDenominators.y : undefined,
                riseEntered ? state.triangleInputValues.y : undefined,
              )
            : undefined)
          ?? diagramValue(riseResult, state),
        riseEntered, label === 'RISE' || label === 'Y', 'enter rise',
      ),
      diagramMetric(
        'arc', arcIsLength ? 's' : 'θ', arcIsLength ? 'Arc length' : 'Arc angle', arcValue,
        arcEntered, label === 'ARC', 'after solve',
      ),
      diagramMetric(
        'segment-area', 'SEG', 'Circular segment area',
        diagramValue(sequenceResultValue(state, 'SEG'), state),
        false, label === 'SEG', 'after solve',
      ),
      diagramMetric(
        'sector-area', 'PIE', 'Circular sector area',
        diagramValue(sequenceResultValue(state, 'PIE'), state),
        false, label === 'PIE', 'after solve',
      ),
      diagramMetric(
        'spacing', 'OC', 'Arched-wall spacing',
        diagramLinearValue(
          state,
          sequenceResultValue(state, 'OC')?.amount,
          'in',
          false,
          undefined,
          state.linearPreferenceInputValues.onCenter,
        ),
        state.onCenterStored === true, label === 'OC', 'stored setting',
      ),
      diagramMetric(
        'member', wallMemberMatch?.[0] ?? 'AW', 'Current arched-wall member',
        wallMemberMatch ? diagramValue(state.current, state) : undefined,
        false, Boolean(wallMemberMatch), 'cycle Arc',
      ),
    ],
  });
}

function offsetDiagram(state: CalculatorState): CalculatorDiagramView {
  const label = state.display.label.trim();
  const unitless = state.triangleUnitless === true;
  const unit = state.resultUnit;
  const usesSequenceSnapshot = state.sequence?.id === 'offset' && sequenceIsDisplayed(state);
  const radius = usesSequenceSnapshot ? sequenceResultValue(state, 'RAD') : undefined;
  const wrapper = usesSequenceSnapshot ? sequenceResultValue(state, 'WL') : undefined;
  const heel = usesSequenceSnapshot ? sequenceResultValue(state, 'HEEL') : undefined;
  const throat = usesSequenceSnapshot ? sequenceResultValue(state, 'THRT') : undefined;
  const theta = usesSequenceSnapshot ? sequenceResultValue(state, 'THET') : undefined;
  const storedEndA = (usesSequenceSnapshot
    ? sequenceResultValue(state, 'A STORED')
    : undefined) ?? state.registers.a;
  const displayedEndA = unitless
    ? diagramValue(storedEndA, state)
    : diagramLinearValue(
        state,
        storedEndA?.amount,
        storedEndA?.power === 1 ? storedEndA.unit : 'in',
        false,
        storedEndA?.fractionDenominator,
        storedEndA,
      );
  return finishDiagram(state, {
    kind: 'offset',
    title: 'Offset · Actual length, Offset and End A',
    metrics: [
      diagramMetric(
        'x', 'x', 'Actual length',
        diagramLinearValue(
          state,
          state.triangle.x,
          state.triangleUnits.x ?? unit,
          unitless,
          state.triangleFractionDenominators.x,
          state.triangleInputValues.x,
        ),
        state.triangleInputs.includes('x'), label === 'X', 'enter with Run',
      ),
      diagramMetric(
        'y', 'y', 'Offset length',
        diagramLinearValue(
          state,
          state.triangle.y,
          state.triangleUnits.y ?? unit,
          unitless,
          state.triangleFractionDenominators.y,
          state.triangleInputValues.y,
        ),
        state.triangleInputs.includes('y'), label === 'Y', 'enter with Rise',
      ),
      diagramMetric(
        'a', 'A', 'End-A height', displayedEndA,
        storedEndA !== undefined, label === 'A STORED', 'store with Conv + 4',
      ),
      diagramMetric(
        'radius', 'R', 'Centerline radius', diagramValue(radius, state),
        false, label === 'RAD', 'after solve',
      ),
      diagramMetric(
        'wrapper', 'WL', 'Wrapper length', diagramValue(wrapper, state),
        false, label === 'WL', 'after solve',
      ),
      diagramMetric(
        'heel', 'HEEL', 'Heel radius', diagramValue(heel, state),
        false, label === 'HEEL', 'after solve',
      ),
      diagramMetric(
        'throat', 'THRT', 'Throat radius', diagramValue(throat, state),
        false, label === 'THRT', 'after solve',
      ),
      diagramMetric(
        'theta', 'θ', 'Offset angle', diagramValue(theta, state),
        false, label === 'THET', 'after solve',
      ),
    ],
  });
}

function usableGeometryRegister(value: CalcValue | undefined): value is CalcValue {
  return Boolean(
    value
    && Number.isFinite(value.amount)
    && value.amount > 0
    && !value.angle
    && !value.semanticKind
    && (value.power === 0 || value.power === 1),
  );
}

function displayedGeometryRegister(value: CalcValue | undefined, state: CalculatorState): string | undefined {
  return diagramLinearValue(
    state,
    value?.amount,
    value?.power === 1 ? value.unit : 'in',
    false,
    value?.fractionDenominator,
    value,
  );
}

function lawCosinesDiagram(state: CalculatorState, force = false): CalculatorDiagramView | undefined {
  const usesSequenceSnapshot = state.sequence?.id === 'lawcos' && sequenceIsDisplayed(state);
  const a = (usesSequenceSnapshot ? sequenceResultValue(state, 'a') : undefined) ?? state.registers.a;
  const b = (usesSequenceSnapshot ? sequenceResultValue(state, 'b') : undefined) ?? state.registers.b;
  const c = (usesSequenceSnapshot ? sequenceResultValue(state, 'c') : undefined) ?? state.registers.c;
  const supplied = [a, b, c].filter(usableGeometryRegister);
  if (!force && c === undefined) return undefined;
  if ([a, b, c].some((value) => value !== undefined && !usableGeometryRegister(value))) {
    return undefined;
  }
  if (
    supplied.length === 3
    && (a!.amount + b!.amount <= c!.amount
      || a!.amount + c!.amount <= b!.amount
      || b!.amount + c!.amount <= a!.amount)
  ) return undefined;
  const label = state.display.label.trim();
  const storedSide = label.match(/^([ABC]) STORED$/)?.[1].toLowerCase();
  const activeSide = label.length === 1 ? label : storedSide;
  return finishDiagram(state, {
    kind: 'law-cosines',
    title: 'Law of Cosines · Sides and opposite angles',
    metrics: [
      diagramMetric('a', 'a', 'Side a', displayedGeometryRegister(a, state), Boolean(a), activeSide === 'a', 'store side a'),
      diagramMetric('b', 'b', 'Side b', displayedGeometryRegister(b, state), Boolean(b), activeSide === 'b', 'store side b'),
      diagramMetric('c', 'c', 'Side c', displayedGeometryRegister(c, state), Boolean(c), activeSide === 'c', 'store side c'),
      diagramMetric(
        'angle-a', 'A', 'Angle A', diagramValue(sequenceResultValue(state, '∠A'), state),
        false, label === '∠A', 'after solve',
      ),
      diagramMetric(
        'angle-b', 'B', 'Angle B', diagramValue(sequenceResultValue(state, '∠B'), state),
        false, label === '∠B', 'after solve',
      ),
      diagramMetric(
        'angle-c', 'C', 'Angle C', diagramValue(sequenceResultValue(state, '∠C'), state),
        false, label === '∠C', 'after solve',
      ),
      diagramMetric(
        'area', 'AREA', 'Triangle area', diagramValue(sequenceResultValue(state, 'AREA'), state),
        false, label === 'AREA', 'after solve',
      ),
    ],
  });
}

/**
 * Irregular pitch defines the second roof plane, so it is drawn on the
 * irregular hip roof rather than on a bare right triangle: the operator sees
 * which of the two slopes the number they are entering belongs to, and which
 * roof values are still expected.
 */
function irregularPitchDiagram(state: CalculatorState): CalculatorDiagramView {
  const label = state.display.label.trim();
  const showsIrregular = /^IPCH(?: STORED)?$/.test(label);
  // irregularPitch() normalizes the screen to rise-per-12 while the stored entry
  // keeps the typed form, so on the IPCH screen the drawing has to follow the
  // screen. Off-screen it falls back to what the operator typed.
  const irregular = showsIrregular && state.current
    ? state.current
    : state.irregularPitchInputValue;
  return finishDiagram(state, {
    kind: 'roof',
    variant: 'ir-hip',
    title: 'Irregular hip / valley \u00b7 Two roof planes with different pitches',
    geometry: { memberSide: 'irregular' },
    metrics: [
      // The roof drawing always renders run/rise/hip, so they are named here
      // with the same symbols every other roof view uses. Without them the
      // canvas fell back to raw metric ids and printed "? run" / "? hip".
      diagramMetric(
        'run', 'x', 'Roof run',
        diagramLinearValue(
          state,
          state.triangle.x,
          state.triangleUnits.x ?? state.resultUnit,
          state.triangleUnitless === true,
          state.triangleFractionDenominators.x,
          state.triangleInputValues.x,
        ),
        state.triangleInputs.includes('x'), false, 'enter run',
      ),
      diagramMetric(
        'rise', 'y', 'Roof rise',
        diagramLinearValue(
          state,
          state.triangle.y,
          state.triangleUnits.y ?? state.resultUnit,
          state.triangleUnitless === true,
          state.triangleFractionDenominators.y,
          state.triangleInputValues.y,
        ),
        state.triangleInputs.includes('y'), false, 'from pitch',
      ),
      diagramMetric(
        'hip', 'H/V', 'Hip / valley length', undefined,
        false, false, 'after Hip/V',
      ),
      diagramMetric(
        'pitch', 'PTCH', 'Regular roof pitch',
        diagramValue(state.permanentPitchInputValue, state),
        state.permanentPitchSlope !== undefined, false, 'store a pitch',
      ),
      diagramMetric(
        'irregular-pitch', 'IPCH', 'Irregular roof pitch',
        diagramValue(irregular, state),
        true, showsIrregular, 'enter irregular pitch',
      ),
    ],
  });
}

function roofDiagram(state: CalculatorState, variant: string): CalculatorDiagramView {
  const label = state.display.label.trim();
  const unitless = state.triangleUnitless === true;
  const hip = sequenceResultValue(state, /^(?:I?H\/V)$/);
  const jack = sequenceResultValue(state, /^(?:JK|IJ)\d+$/);
  const onCenter = sequenceResultValue(state, /^(?:JK|IJ)OC(?: STORED)?$/);
  const isJack = variant === 'jacks' || variant === 'ir-jacks';
  const isIrregularHip = variant === 'hip' && Boolean(
    label === 'IH/V'
    || label === 'CHK2'
    || state.sequence?.results.some((result) => result.label === 'CHK2'),
  );
  const hasIrregularJackSide = isJack && Boolean(
    state.sequence?.results.some((result) => /^IJ(?:OC|\d)/.test(result.label)),
  );
  const diagramVariant = isIrregularHip
    ? 'ir-hip'
    : hasIrregularJackSide
      ? 'ir-jacks'
      : variant;
  const currentJack = label.match(/^(JK|IJ)(\d+)$/);
  const currentJackPrefix = currentJack?.[1];
  const jackMemberCount = currentJackPrefix && state.sequence
    ? state.sequence.results.filter((result) => (
        new RegExp(`^${currentJackPrefix}\\d+$`).test(result.label)
      )).length
    : 0;
  const jackMemberIndex = currentJack ? Number(currentJack[2]) : undefined;
  const memberProgress = jackMemberIndex === undefined || jackMemberCount === 0
    ? undefined
    : state.preferences.jackOrder === 'ascending'
      ? jackMemberIndex / (jackMemberCount + 1)
      : (jackMemberCount - jackMemberIndex + 1) / (jackMemberCount + 1);
  const memberSide = label === 'CHK2'
    ? 'irregular'
    : isIrregularHip && label === 'CHK1'
      ? 'regular'
      : jackSideForResult(state.sequence, state.sequence?.index, label);
  return finishDiagram(state, {
    kind: 'roof',
    variant: diagramVariant,
    title: isJack
      ? 'Jack rafters · Roof plan and true-length elevation'
      : 'Hip / valley · Roof plan and true-length elevation',
    geometry: {
      memberIndex: jackMemberIndex,
      memberCount: jackMemberCount || undefined,
      memberProgress,
      memberSide,
    },
    metrics: [
      diagramMetric(
        'run', 'x', 'Roof run',
        diagramLinearValue(
          state,
          state.triangle.x,
          state.triangleUnits.x ?? state.resultUnit,
          unitless,
          state.triangleFractionDenominators.x,
          state.triangleInputValues.x,
        ),
        state.triangleInputs.includes('x'), false, 'enter run',
      ),
      diagramMetric(
        'rise', 'y', 'Roof rise',
        diagramLinearValue(
          state,
          state.triangle.y,
          state.triangleUnits.y ?? state.resultUnit,
          unitless,
          state.triangleFractionDenominators.y,
          state.triangleInputValues.y,
        ),
        state.triangleInputs.includes('y'), false, 'from pitch',
      ),
      diagramMetric(
        'hip', 'H/V', 'Hip / valley length', diagramValue(hip, state),
        false, label === 'H/V' || label === 'IH/V', 'after solve',
      ),
      diagramMetric(
        'jack', currentJack?.[0] ?? 'JK', 'Current jack rafter',
        diagramValue(currentJack ? state.current : jack, state),
        false, /^(?:JK|IJ)\d+$/.test(label), isJack ? 'cycle Jack' : 'after solve',
      ),
      diagramMetric(
        'spacing', 'OC', 'On-center spacing',
        diagramValue(/^(?:JK|IJ)OC/.test(label) ? state.current : onCenter, state)
          ?? diagramLinearValue(
            state,
            state.preferences.onCenter,
            'in',
            false,
            undefined,
            state.linearPreferenceInputValues.onCenter,
          ),
        state.onCenterStored === true,
        /^(?:JK|IJ)OC/.test(label), 'stored setting',
      ),
      diagramMetric(
        'plumb', 'PLMB', 'Plumb cut angle',
        diagramValue(label === 'PLMB' ? state.current : sequenceResultValue(state, 'PLMB'), state),
        false, label === 'PLMB', 'after solve',
      ),
      diagramMetric(
        'level', 'LEVL', 'Level cut angle',
        diagramValue(label === 'LEVL' ? state.current : sequenceResultValue(state, 'LEVL'), state),
        false, label === 'LEVL', 'after solve',
      ),
      diagramMetric(
        'cheek', 'CHK', 'Cheek cut angle',
        diagramValue(/^CHK[12]$/.test(label)
          ? state.current
          : sequenceResultValue(state, 'CHK1'), state),
        false, /^CHK[12]$/.test(label), 'after solve',
      ),
    ],
  });
}

function stairDiagram(state: CalculatorState): CalculatorDiagramView {
  const label = state.display.label.trim();
  const run = sequenceResultValue(state, /^RUN/);
  const rise = sequenceResultValue(state, /^RISE/);
  const riser = label === 'R-HT STORED'
    ? state.current
    : sequenceResultValue(state, 'R-HT');
  return finishDiagram(state, {
    kind: 'stairs',
    title: 'Stair layout · Total dimensions and individual steps',
    metrics: [
      diagramMetric(
        'run', 'Run', 'Total run', state.triangleInputs.includes('x')
          ? diagramLinearValue(
              state,
              state.triangle.x,
              state.triangleUnits.x ?? state.resultUnit,
              state.triangleUnitless === true,
              state.triangleFractionDenominators.x,
              state.triangleInputValues.x,
            )
          : diagramValue(run, state),
        state.triangleInputs.includes('x'), /^RUN/.test(label), 'calculated if omitted',
      ),
      diagramMetric(
        'rise', 'Rise', 'Total rise', state.triangleInputs.includes('y')
          ? diagramLinearValue(
              state,
              state.triangle.y,
              state.triangleUnits.y ?? state.resultUnit,
              state.triangleUnitless === true,
              state.triangleFractionDenominators.y,
              state.triangleInputValues.y,
            )
          : diagramValue(rise, state),
        state.triangleInputs.includes('y'), /^RISE/.test(label), 'calculated if omitted',
      ),
      diagramMetric(
        'stringer', 'STRG', 'Stringer', diagramValue(sequenceResultValue(state, 'STRG'), state),
        false, label === 'STRG', 'after solve',
      ),
      diagramMetric(
        'riser', 'R-HT', 'Riser height', diagramValue(riser, state),
        label === 'R-HT STORED', /^(?:R-HT|RSRS|R\+\/−)/.test(label), 'after solve',
      ),
      diagramMetric(
        'tread', 'T-WD', 'Tread width', diagramValue(sequenceResultValue(state, 'T-WD'), state),
        false, /^(?:T-WD|TRDS|T\+\/−)/.test(label), 'after solve',
      ),
      diagramMetric(
        'opening', 'OPEN', 'Stairwell opening', diagramValue(sequenceResultValue(state, 'OPEN'), state),
        false, label === 'OPEN', 'after solve',
      ),
      diagramMetric(
        'incline', 'INCL', 'Incline angle', diagramValue(sequenceResultValue(state, 'INCL'), state),
        false, label === 'INCL', 'after solve',
      ),
      diagramMetric(
        'headroom', 'HDRM', 'Preferred headroom', diagramValue(sequenceResultValue(state, 'HDRM STORED'), state),
        false, label === 'HDRM STORED', 'stored setting',
      ),
      diagramMetric(
        'floor', 'FLOR', 'Floor thickness', diagramValue(sequenceResultValue(state, 'FLOR STORED'), state),
        false, label === 'FLOR STORED', 'stored setting',
      ),
    ],
  });
}

function solidsDiagram(state: CalculatorState): CalculatorDiagramView {
  const label = state.display.label.trim();
  const radius = state.circle.radius
    ?? (state.circle.diameter === undefined ? undefined : state.circle.diameter / 2);
  const diameter = state.circle.diameter ?? (radius === undefined ? undefined : radius * 2);
  const height = state.circle.height ?? state.triangle.y;
  const unit = state.circleRadiusUnit ?? state.circleResultUnit ?? state.resultUnit;
  return finishDiagram(state, {
    kind: 'solids',
    variant: label.startsWith('CONE') ? 'cone' : 'column',
    title: 'Column / cone · Radius, Height and Surface',
    metrics: [
      diagramMetric(
        'diameter', 'Ø', 'Diameter', diagramLinearValue(
          state,
          diameter,
          unit,
          false,
          state.circleInput === 'diameter' ? state.circleInputFractionDenominator : undefined,
          state.circleInput === 'diameter' ? state.circleInputValue : undefined,
        ),
        state.circleInput === 'diameter', false, 'enter with Circ',
      ),
      diagramMetric(
        'radius', 'r', 'Radius', diagramLinearValue(
          state,
          radius,
          unit,
          false,
          state.circleInput === 'radius' ? state.circleInputFractionDenominator : undefined,
          state.circleInput === 'radius' ? state.circleInputValue : undefined,
        ),
        state.circleInput === 'radius', false, 'enter with Conv + Pitch',
      ),
      diagramMetric(
        'height', 'h', 'Height',
        diagramLinearValue(
          state,
          height,
          state.circleHeightUnit ?? state.triangleUnits.y ?? state.resultUnit,
          false,
          state.triangleInputs.includes('y')
            ? state.triangleFractionDenominators.y
            : undefined,
          state.triangleInputs.includes('y')
            ? state.triangleInputValues.y
            : undefined,
        ),
        state.triangleInputs.includes('y'), false, 'enter with Rise',
      ),
      diagramMetric(
        'column', 'COL', label === 'COL AREA' ? 'Column total surface' : 'Column volume',
        diagramValue(sequenceResultValue(state, label.startsWith('COL') ? label : 'COL'), state),
        false, label.startsWith('COL'), 'after solve',
      ),
      diagramMetric(
        'cone', 'CONE', label === 'CONE AREA' ? 'Cone total surface' : 'Cone volume',
        diagramValue(sequenceResultValue(state, label.startsWith('CONE') ? label : 'CONE'), state),
        false, label.startsWith('CONE'), 'after solve',
      ),
    ],
  });
}

function fanLawDiagram(state: CalculatorState, force = false): CalculatorDiagramView | undefined {
  const label = state.display.label.trim();
  const fanMatch = label.match(/^(CFM|CFMn|RPM|RPMn|SP|SPn|BHP|BHPn) FAN LAW ([123])$/);
  const hasIntent = Boolean(fanMatch || state.registers.aNew || state.registers.bNew);
  // A stale C register belongs to Law of Cosines, but must not hide an explicit
  // Fan Law result; the 4090 intentionally shares these registers.
  if (!hasIntent || (!force && state.registers.c && !fanMatch)) return undefined;
  const storedActiveId = label === 'A STORED' && state.diagramFocus === 'fan-law'
    ? 'a'
    : label === 'B STORED' && state.diagramFocus === 'fan-law'
      ? 'b'
      : label === 'An STORED'
        ? 'a-new'
        : label === 'Bn STORED'
          ? 'b-new'
          : undefined;
  const activeId = fanMatch
    ? fanMatch[1] === 'CFM' ? 'a'
      : fanMatch[1] === 'CFMn' ? 'a-new'
        : fanMatch[1].endsWith('n') ? 'b-new' : 'b'
    : storedActiveId;
  const field = (
    id: string,
    symbol: string,
    fieldLabel: string,
    value: CalcValue | undefined,
  ) => {
    const isKnownInput = Boolean(
      value
      && Number.isFinite(value.amount)
      && value.amount > 0
      && !value.semanticKind,
    );
    const visibleValue = value && Number.isFinite(value.amount) && value.amount > 0
      ? value
      : undefined;
    return diagramMetric(
      id,
      symbol,
      fieldLabel,
      diagramValue(visibleValue, state),
      isKnownInput,
      activeId === id,
      'enter a positive value',
    );
  };
  return finishDiagram(state, {
    kind: 'fan-law',
    variant: fanMatch?.[2],
    title: fanMatch ? `Fan Law ${fanMatch[2]} · Existing to new condition` : 'Fan Law inputs · Existing to new condition',
    metrics: [
      field('a', 'A', 'Existing airflow', state.registers.a),
      field('a-new', 'Aₙ', 'New airflow', state.registers.aNew),
      field('b', 'B', 'Existing RPM / SP / BHP', state.registers.b),
      field('b-new', 'Bₙ', 'New RPM / SP / BHP', state.registers.bNew),
    ],
  });
}

function hasValidStagedOffset(state: CalculatorState): boolean {
  const { x, y } = state.triangle;
  const endA = state.registers.a;
  if (
    x === undefined
    || y === undefined
    || !Number.isFinite(x)
    || !Number.isFinite(y)
    || x <= 0
    || y <= 0
    || !endA
    || !Number.isFinite(endA.amount)
    || endA.amount < 0
    || endA.angle
  ) return false;
  const correctPower = state.triangleUnitless === true
    ? endA.power === 0
    : endA.power === 0 || endA.power === 1;
  if (!correctPower) return false;
  const centerlineRadius = (x ** 2 + y ** 2) / (4 * y);
  return centerlineRadius - endA.amount / 2 >= 0;
}

/**
 * Air velocity and the pressure it produces. The two readings are opposite
 * directions of one conversion, so only the reading actually on screen is shown
 * as a result, and the operator's own number is shown in the role it plays:
 * the pressure behind a velocity, or the velocity behind a pressure.
 */
function velocityDiagram(state: CalculatorState): CalculatorDiagramView | undefined {
  const label = state.display.label.trim();
  const entry = sequenceResultValue(state, 'ENTRY');
  if (!entry) return undefined;
  const shown = state.sequence && sequenceIsDisplayed(state) && state.sequence.index >= 0
    ? state.sequence.results[state.sequence.index]?.value
    : undefined;
  const showsSpeed = label === 'FPM' || label === 'MPS';
  const showsPressure = label === 'VP' || label === 'KPA';
  const si = label === 'MPS' || label === 'KPA';
  return finishDiagram(state, {
    kind: 'velocity',
    variant: si ? 'si' : 'imperial',
    title: 'Air stream · Velocity and the velocity pressure it produces',
    metrics: [
      diagramMetric(
        'speed', si ? 'MPS' : 'FPM',
        si ? 'Velocity in metres per second' : 'Velocity in feet per minute',
        showsSpeed ? diagramValue(shown, state)
          : showsPressure ? diagramValue(entry, state)
            : undefined,
        showsPressure, showsSpeed, 'after solve',
      ),
      diagramMetric(
        'pressure', si ? 'KPA' : 'VP',
        si ? 'Velocity pressure in pascals' : 'Velocity pressure in inches w.g.',
        showsPressure ? diagramValue(shown, state)
          : showsSpeed ? diagramValue(entry, state)
            : undefined,
        showsSpeed, showsPressure, 'after solve',
      ),
      // Off its own step the reading is already shown in the row whose part it
      // plays, so repeating it would say the same number twice. The figure keeps
      // its height through the cycle from CSS, not from a filler row.
      ...(label === 'ENTRY' ? [diagramMetric(
        'entry', 'ENT', 'Entered reading',
        diagramValue(entry, state),
        true, true, 'enter a reading',
      )] : []),
    ],
  });
}

/**
 * The same angle written two ways. The converted notation is on screen; the
 * notation it came from is taken verbatim from the transformation, because
 * re-formatting the number would print the same notation twice.
 */
function angleNotationDiagram(state: CalculatorState): CalculatorDiagramView | undefined {
  const shown = state.current;
  const source = state.transformationSource;
  // While a two-dot number is still being typed the label already reads DMS,
  // and nothing has been converted yet.
  if (!shown || !Number.isFinite(shown.amount) || state.entry) return undefined;
  if (!source?.committedText) return undefined;
  const asDms = state.display.label.trim() === 'DMS';
  const sourceEntered = provenanceIsOperandOwn(source.metadata?.provenance);
  return finishDiagram(state, {
    kind: 'angle',
    variant: asDms ? 'dms' : 'decimal',
    title: 'Angle · Degrees-minutes-seconds and decimal degrees',
    geometry: { theta: Math.abs(shown.amount) % 180 },
    metrics: [
      diagramMetric(
        'shown', asDms ? 'DMS' : 'DEG',
        asDms ? 'Degrees, minutes, seconds' : 'Decimal degrees',
        readableMeasurement(state.display.plainText),
        false, true, 'after conversion',
      ),
      diagramMetric(
        'source', asDms ? 'DEG' : 'DMS',
        asDms ? 'Decimal degrees' : 'Degrees, minutes, seconds',
        // A DMS source is kept verbatim, because re-formatting it would print
        // the notation already on screen. A decimal source has to be formatted:
        // its raw entry text ("30.30") is this calculator's own DMS grammar and
        // would read as the very notation this row exists to tell apart.
        asDms && source.current
          ? diagramValue({ ...source.current, angle: true }, state)
          : readableMeasurement(source.committedText),
        sourceEntered, false, 'the angle converted',
      ),
    ],
  });
}

const TRIG_FORMS: Record<string, { title: string; ratio: string; pair: string }> = {
  SIN: { title: 'Sine', ratio: 'Opposite ÷ Hypotenuse', pair: 'opp-hyp' },
  COS: { title: 'Cosine', ratio: 'Adjacent ÷ Hypotenuse', pair: 'adj-hyp' },
  TAN: { title: 'Tangent', ratio: 'Opposite ÷ Adjacent', pair: 'opp-adj' },
  ASIN: { title: 'Arcsine', ratio: 'Opposite ÷ Hypotenuse', pair: 'opp-hyp' },
  ACOS: { title: 'Arccosine', ratio: 'Adjacent ÷ Hypotenuse', pair: 'adj-hyp' },
  ATAN: { title: 'Arctangent', ratio: 'Opposite ÷ Adjacent', pair: 'opp-adj' },
};

const POWER_FORMS: Record<string, 'square' | 'cube' | 'sqrt' | 'cuberoot'> = {
  'x²': 'square',
  'x³': 'cube',
  '√x': 'sqrt',
  '³√x': 'cuberoot',
};

/**
 * Trigonometry drawn as the triangle it describes, at the angle actually on
 * screen, with the two sides that form the ratio highlighted. The direct
 * functions enter an angle and solve a ratio; the arc functions do the reverse.
 */
function trigDiagram(
  state: CalculatorState,
  input: NonNullable<CalculatorState['unaryInput']>,
): CalculatorDiagramView | undefined {
  const form = TRIG_FORMS[input.mode];
  if (!form) return undefined;
  const inverse = input.mode.startsWith('A');
  // Trigonometry reads its argument as a plain angle or ratio, so any earlier
  // meaning the number carried (FPM, percent grade) is deliberately dropped -
  // keeping it would print a velocity in the angle row.
  const bare = (value: CalcValue, angle: boolean): CalcValue => ({
    ...value, angle, semanticKind: undefined,
  });
  const angleValue = inverse ? state.current : input.value;
  const ratioValue = inverse ? input.value : state.current;
  if (!angleValue || !Number.isFinite(angleValue.amount)) return undefined;
  return finishDiagram(state, {
    kind: 'trig',
    variant: form.pair,
    title: `${form.title} · ${form.ratio} of a right triangle`,
    geometry: { theta: angleValue.amount },
    metrics: [
      diagramMetric(
        'theta', 'θ', 'Angle',
        diagramValue(bare(angleValue, true), state),
        !inverse && input.entered, inverse, 'enter an angle',
      ),
      diagramMetric(
        'ratio', input.mode.replace(/^A/, ''), form.ratio,
        ratioValue ? diagramValue(bare(ratioValue, false), state) : undefined,
        inverse && input.entered, !inverse, 'enter a ratio',
      ),
    ],
  });
}

/**
 * Square and cube work: the side and the area or volume of one figure, with the
 * operator's own number marked and the solved one following from it.
 */
function powerDiagram(
  state: CalculatorState,
  input: NonNullable<CalculatorState['unaryInput']>,
): CalculatorDiagramView | undefined {
  const mode = POWER_FORMS[input.mode];
  if (!mode) return undefined;
  const cubic = mode === 'cube' || mode === 'cuberoot';
  const solvesSide = mode === 'sqrt' || mode === 'cuberoot';
  const side = solvesSide ? state.current : input.value;
  const measure = solvesSide ? input.value : state.current;
  if (!side || !measure) return undefined;
  return finishDiagram(state, {
    kind: 'power',
    variant: cubic ? 'cube' : 'square',
    title: cubic ? 'Cube · Side and volume' : 'Square · Side and area',
    metrics: [
      diagramMetric(
        'side', 's', 'Side', diagramValue(side, state),
        !solvesSide && input.entered, solvesSide, 'enter a side',
      ),
      diagramMetric(
        cubic ? 'volume' : 'area',
        cubic ? 'V' : 'A',
        cubic ? 'Volume' : 'Area',
        diagramValue(measure, state),
        solvesSide && input.entered, !solvesSide, cubic ? 'enter a volume' : 'enter an area',
      ),
    ],
  });
}

/**
 * Drawings for the single-value functions. They are shown only when the result
 * is the whole of what is on screen: inside an arithmetic expression the number
 * belongs to the arithmetic, not to a figure.
 */
function unaryDiagram(state: CalculatorState): CalculatorDiagramView | undefined {
  const input = state.unaryInput;
  // The record survives in state, so it counts only while its own result is the
  // one on screen. Any other key puts a different label up and retires it.
  if (!input || state.display.label.trim() !== input.mode) return undefined;
  const insideExpression = Boolean(
    state.expression.length
    || state.parenthesisDepth
    || state.completedExpression.length
    // Only an operator means arithmetic. A dimensional square writes itself as
    // "(4')2", so its grouping brackets are part of the function, not a sum.
    || state.displayExpression.some((item) => item.type === 'operator'),
  );
  if (insideExpression) return undefined;
  return TRIG_FORMS[input.mode]
    ? trigDiagram(state, input)
    : powerDiagram(state, input);
}

export function calculatorDiagramView(state: CalculatorState): CalculatorDiagramView | undefined {
  if (
    !state.powered
    || state.display.label === 'ERROR'
    || state.preferenceMode
    || state.preferencesOpen
    || state.modifier === 'recall'
    || state.modifier === 'recall-convert'
  ) return undefined;

  const hasOrdinaryMath = Boolean(
    state.expression.length
    || state.parenthesisDepth
    || state.completedExpression.length
    || state.displayExpression.some((token) => (
      token.type === 'operator'
      || token.type === 'left'
      || token.type === 'right'
      || token.type === 'function-open'
      || token.type === 'function-close'
      || token.type === 'postfix'
    )),
  );
  // Unary math is not "ordinary arithmetic": squaring a side or taking a sine
  // describes a figure, and the figure is what makes the result readable.
  const unary = unaryDiagram(state);
  if (unary) return unary;
  const angleLabel = state.display.label.trim();
  if ((angleLabel === 'DMS' || angleLabel === 'DEG') && !hasOrdinaryMath) {
    const notation = angleNotationDiagram(state);
    if (notation) return notation;
  }
  if (hasOrdinaryMath) return undefined;

  const sequenceId = state.sequence && sequenceIsDisplayed(state)
    ? state.sequence.id
    : undefined;
  if (sequenceId === 'pitch' || sequenceId === 'diag') {
    return rightTriangleDiagram(state, sequenceId, true);
  }
  if (sequenceId === 'circle') return circleDiagram(state);
  if (sequenceId === 'arc') return segmentDiagram(state, 'arc');
  if (sequenceId === 'offset') return offsetDiagram(state);
  if (sequenceId === 'lawcos') return lawCosinesDiagram(state, true);
  if (sequenceId === 'hip' || sequenceId === 'jacks' || sequenceId === 'ir-jacks') {
    return roofDiagram(state, sequenceId);
  }
  if (sequenceId === 'stairs') return stairDiagram(state);
  if (sequenceId === 'column-cone') return solidsDiagram(state);
  if (sequenceId === 'velocity') return velocityDiagram(state);

  const label = state.display.label.trim();
  // Only while the irregular pitch is the value on screen, or while a new one is
  // being typed into it. A lingering irregular-pitch focus must never shadow the
  // Pitch/Jack/Stair recalls or draw a roof behind an unrelated operand.
  if (
    /^IPCH(?: STORED)?$/.test(label)
    || (state.diagramFocus === 'irregular-pitch' && hasPendingDiagramEntry(state))
  ) {
    return irregularPitchDiagram(state);
  }
  if (/^(?:PTCH|PTCH STORED|∠θ|%GRD|SLP|PLMB|LEVL)$/.test(label)) {
    return rightTriangleDiagram(state, 'pitch', true);
  }
  if (/^(?:An|Bn) STORED$/.test(label)) return fanLawDiagram(state, true);
  if (/^(?:JK|IJ)OC(?: STORED)?$/.test(label)) {
    return roofDiagram(state, label.startsWith('IJ') ? 'ir-jacks' : 'jacks');
  }
  if (label === 'R-HT STORED') return stairDiagram(state);
  if (label === 'A STORED' && state.diagramFocus === 'offset') {
    return hasValidStagedOffset(state) ? offsetDiagram(state) : undefined;
  }
  if (/^[AB] STORED$/.test(label) && state.diagramFocus === 'fan-law') {
    return fanLawDiagram(state, true);
  }
  if (state.diagramFocus === 'fan-law' && /FAN LAW/.test(label)) {
    return fanLawDiagram(state, true);
  }
  if (/^[ABC] STORED$/.test(label)) return lawCosinesDiagram(state, true);

  const activeTriangleKey = label === 'X' ? 'x' : label === 'Y' ? 'y' : label === 'R' ? 'r' : undefined;
  const activeTriangleValue = activeTriangleKey ? state.triangle[activeTriangleKey] : undefined;
  const currentMatchesTriangle = activeTriangleValue !== undefined
    && state.current !== undefined
    && Number.isFinite(state.current.amount)
    && Math.abs(state.current.amount - activeTriangleValue)
      <= Math.max(1, Math.abs(activeTriangleValue)) * 1e-12;
  const pendingDiagramEntry = hasPendingDiagramEntry(state);
  const triangleDisplayIsCurrent = Boolean(
    activeTriangleKey
    || ['PTCH', 'PTCH STORED', '∠θ', '%GRD', 'SLP', 'PLMB', 'LEVL'].includes(label)
    || pendingDiagramEntry,
  );
  if (state.diagramFocus === 'triangle' && triangleDisplayIsCurrent) {
    const triangle = rightTriangleDiagram(state, 'triangle', true);
    if (triangle) return triangle;
  }

  const segmentDisplayIsCurrent = Boolean(
    ['RAD', 'CORD', 'RISE', 'ARC'].includes(label)
    || (['X', 'Y'].includes(label) && state.diagramFocus !== 'triangle')
    || pendingDiagramEntry
    || !state.current,
  );
  const hasSegmentContext = Boolean(
    state.circle.radius !== undefined
    && segmentDisplayIsCurrent
    && (
      state.segmentInputs.length
      || (
        state.segmentRadiusReady
        && (['RAD', 'CORD', 'RISE'].includes(label) || hasPendingDiagramEntry(state))
      )
      || (state.arcInput && (label === 'ARC' || hasPendingDiagramEntry(state)))
    )
  );
  if (hasSegmentContext) return segmentDiagram(state);

  if (activeTriangleKey && currentMatchesTriangle) {
    return rightTriangleDiagram(state, 'triangle', true);
  }

  // A committed unit, constant, conversion, or recalled/stored operand is not
  // part of older geometry until the operator assigns it with a geometry key.
  // Suppress that stale drawing instead of implying that it describes the
  // value currently visible on the screen. Raw digits remain diagram-aware so
  // the drawing can still guide the next Run/Rise/etc. assignment.
  if (state.current && !pendingDiagramEntry) return undefined;

  const fanLaw = fanLawDiagram(state);
  if (fanLaw) return fanLaw;

  const triangle = rightTriangleDiagram(state);
  if (triangle) return triangle;
  const lawCosines = lawCosinesDiagram(state);
  if (lawCosines) return lawCosines;
  if (state.circle.radius !== undefined || state.circle.diameter !== undefined) {
    return circleDiagram(state);
  }
  return undefined;
}

export function calculatorExpressionView(state: CalculatorState): CalculatorExpressionView {
  if (!state.powered) {
    return {
      mode: 'off',
      contextText: 'Calculator off',
      expressionText: 'Off',
      ariaText: 'Calculator off',
      liveText: 'Calculator off',
      entryActive: false,
    };
  }

  const hasTransformation = Boolean(state.transformationSource)
    && state.display.label !== 'ERROR'
    && !state.preferenceMode;
  const hasError = state.display.label === 'ERROR';
  const hasCompletedExpression = !hasError
    && !hasTransformation
    && state.completedExpression.length > 0
    && (
      state.lastKey === 'equals'
      || Boolean(state.modifier)
      || state.display.label === 'RESULT'
    );
  const errorUsesCompletedExpression = hasError
    && state.displayExpression.length === 0
    && state.completedExpression.length > 0;
  const tokens = hasCompletedExpression || errorUsesCompletedExpression
    ? state.completedExpression
    : state.displayExpression;
  let expressionText = readableExpressionTokens(tokens, state.preferences);
  const hasUnfinishedDraft = Boolean(
    state.entry
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.imperialEntryText
    || state.exponentBase,
  );
  const hasActiveArithmetic = state.expression.length > 0 || state.parenthesisDepth > 0;
  const liveCommittedText = !hasUnfinishedDraft
    && state.current
    && !hasError
    && state.currentDisplayMetadata?.provenance !== 'unit-source'
    && !state.currentSourceExpression?.length
      ? hasActiveArithmetic
        ? displayOperandText(state)
        : appendSemanticSuffix(state.display.plainText, state.current)
      : undefined;
  const draft = hasCompletedExpression || hasTransformation
    ? undefined
    : currentDraft({
        ...state,
        committedText: liveCommittedText,
        sourceExpression: state.currentSourceExpression,
      }, state.preferences);
  if (state.exponentBase && expressionEndsWithValue(tokens)) {
    const exponent = exponentDraft(
      { ...state, metadata: state.currentDisplayMetadata },
      state.preferences,
    );
    expressionText = `${expressionText} × 10^${exponent}`;
  } else if (draft && !expressionEndsWithValue(tokens)) {
    expressionText = expressionText ? `${expressionText} ${draft}` : draft;
  }

  if (hasTransformation && state.transformationSource) {
    expressionText = `${currentDraft(state.transformationSource, state.preferences) ?? 'Value'} →`;
  }
  expressionText = expressionText.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

  const hasStandaloneUnary = !hasError
    && !hasCompletedExpression
    && !hasTransformation
    && !state.exponentBase
    && state.expression.length === 0
    && state.displayExpression.some((item) => (
      item.type === 'function-open' || item.type === 'postfix'
    ));
  const hasImmediateSubexpression = !hasError
    && !hasCompletedExpression
    && !hasTransformation
    && state.display.label === ')'
    && Boolean(state.current)
    && state.displayExpression.at(-1)?.type === 'right';
  const hasOuterGroupExpression = hasImmediateSubexpression
    && (
      state.parenthesisDepth > 0
      || hasTopLevelOperator(state.displayExpression)
    );
  const resultText = hasError
    ? errorTitle(state)
    : hasCompletedExpression || hasTransformation || hasStandaloneUnary || hasImmediateSubexpression
      ? appendSemanticSuffix(
          readableDisplayText(state.display.plainText, state.angleDisplayMode),
          state.current,
        )
      : undefined;

  if (!expressionText) {
    expressionText = resultText
      ?? readableMeasurement(state.display.plainText || state.display.valueText || '0');
  }
  const standaloneRenderedApproximate = !resultText
    && !hasError
    && !hasTransformation
    && !hasUnfinishedDraft
    && tokens.length === 0
    && !state.currentSourceExpression?.length
    && state.currentDisplayMetadata?.exactness === 'approximate';
  if (standaloneRenderedApproximate && !expressionText.startsWith('≈')) {
    expressionText = `≈${expressionText}`;
  }

  const entryActive = Boolean(
    state.entry
    || state.fractionNumerator !== undefined
    || state.composedInches !== undefined
    || state.imperialEntryText
    || state.exponentBase !== undefined
    || state.currentSourceExpression?.length
    || state.displayExpression.length
  ) && !hasCompletedExpression
    && !hasTransformation
    && !hasStandaloneUnary
    && !hasImmediateSubexpression
    && state.display.label !== 'ERROR';
  const namedResult = !hasError
    && !hasTransformation
    && !hasCompletedExpression
    && !hasUnfinishedDraft
    && !hasActiveArithmetic
    && Boolean(state.current)
      ? semanticResult(state)
      : undefined;
  const contextText = hasError ? errorContext(state) : namedResult?.context ?? (hasOuterGroupExpression
    ? 'Current group'
    : displayContext(
      state,
      hasCompletedExpression || hasTransformation || hasStandaloneUnary || hasImmediateSubexpression,
    ));
  const resultIsApproximate = Boolean(
    resultText
    && !hasError
    && (hasTransformation
      ? state.transformationResultMetadata?.exactness === 'approximate'
      : (
          state.currentDisplayMetadata?.exactness === 'approximate'
          || expressionUsesApproximateValue(tokens)
        )),
  );
  const namedValueIsApproximate = Boolean(
    namedResult
    && (
      expressionText.startsWith('≈')
      || state.currentDisplayMetadata?.exactness === 'approximate'
      || state.current?.approximate
    ),
  );
  const pitchGradeResult = Boolean(
    namedResult
    && state.sequence?.id === 'pitch'
    && state.display.label.trim() === '%GRD',
  );
  const namedValueBase = namedResult
    ? (pitchGradeResult
        ? readableDisplayText(state.display.plainText, state.angleDisplayMode)
        : expressionText
      ).replace(/^≈\s*/, '')
    : undefined;
  // The percent sign now travels with the formatted value itself, so only the
  // spelled-out suffixes are appended here.
  const namedValueSuffix = pitchGradeResult
    ? undefined
    : state.current?.semanticKind
      ? undefined
      : namedResult?.suffix;
  const namedValueText = namedResult?.empty
    ? namedResult.emptyText ?? 'Recall returns 0'
    : namedResult && namedValueBase
      ? `${namedValueSuffix ? namedValueBase.replace(/%$/, '') : namedValueBase}${namedValueSuffix
      ? namedValueSuffix === '% grade' ? '% grade' : ` ${namedValueSuffix}`
      : ''}`
      : undefined;
  const equationAriaText = resultText && resultText !== expressionText
    ? state.display.label === 'ERROR'
      ? `${spokenText(expressionText)}. ${resultText}`
      : hasOuterGroupExpression
        ? `${spokenText(expressionText)}. Current group ${spokenText(resultText)}`
      : `${spokenText(expressionText)} ${hasTransformation
        ? resultIsApproximate ? 'approximately ' : ''
        : resultIsApproximate ? 'approximately ' : 'equals '}${spokenText(resultText)}`
    : spokenText(expressionText);
  const genericContexts = new Set([
    'Ready', 'Expression', 'Enter next value', 'Result', 'Conversion',
    'Convert mode', 'Recall mode', 'Recall convert', 'Check entry',
    'Subexpression', 'Current group',
  ]);
  const baseAriaText = genericContexts.has(contextText)
    ? equationAriaText
    : `${contextText}. ${equationAriaText}`;
  const progressText = sequenceProgress(state);
  const guidance = displayGuidance(
    state,
    hasCompletedExpression || hasStandaloneUnary || hasImmediateSubexpression,
    entryActive,
  );
  const semanticAriaText = namedResult && namedValueText
    ? namedResult.empty
      ? `${namedResult.context}. ${namedResult.label}. ${spokenText(namedValueText)}`
      : `${namedResult.context}. ${namedResult.label} ${namedValueIsApproximate
        ? 'approximately'
        : 'equals'} ${spokenText(namedValueText)}`
    : undefined;
  const errorExpression = hasError && expressionText !== resultText
    ? spokenText(expressionText)
    : undefined;
  const errorAriaText = hasError
    ? [resultText, errorExpression].filter(Boolean).join('. ')
    : undefined;
  const coreAriaText = errorAriaText ?? semanticAriaText ?? baseAriaText;
  const lockedError = hasError && state.display.plainText === 'PRESS On/C';
  const lockedErrorText = guidance.text ?? coreAriaText;
  const liveText = lockedError
    ? lockedErrorText
    : [
        coreAriaText,
        progressText,
        hasError ? guidance.text : undefined,
      ].filter(Boolean).join('. ');
  const ariaText = lockedError
    ? lockedErrorText
    : [
        coreAriaText,
        progressText,
        guidance.text,
      ].filter(Boolean).join('. ');
  const mode: CalculatorExpressionView['mode'] = hasError
    ? 'error'
    : namedResult
      ? 'named-result'
      : resultText ? 'equation' : 'entry';
  const diagram = calculatorDiagramView(state);

  return {
    mode,
    contextText,
    expressionText,
    resultText,
    resultSymbol: hasTransformation
      ? resultIsApproximate ? '≈' : undefined
      : !hasError
        && !hasOuterGroupExpression
        && (hasCompletedExpression || hasStandaloneUnary || hasImmediateSubexpression)
        ? resultIsApproximate ? '≈' : '='
        : undefined,
    valueLabel: namedResult?.label,
    valueText: namedValueText,
    valueSymbol: namedResult && !namedResult.empty
      ? namedValueIsApproximate ? '≈' : '='
      : undefined,
    errorTitle: hasError ? resultText : undefined,
    progressText,
    guidanceText: guidance.text,
    guidanceTone: guidance.tone,
    liveText,
    ariaText,
    entryActive,
    diagram,
  };
}
