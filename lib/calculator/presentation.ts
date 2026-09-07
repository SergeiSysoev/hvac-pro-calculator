import { formatValue } from './core';
import type { CalcValue, Operator, Preferences } from './core';
import { solveRightTriangle } from './formulas';
import { displayOperandText, semanticValueSuffix } from './engine';
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
  if (hasCompletedExpression || state.lastKey === 'equals') return 'Result';
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
  const normalized = text.replace(/\.$/, '');
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
  if (state.segmentPairReady && (
    segmentChordValue === undefined
    || segmentRiseValue === undefined
    || !Number.isFinite(segmentChordValue)
    || !Number.isFinite(segmentRiseValue)
    || segmentChordValue <= 0
    || segmentRiseValue <= 0
  )) {
    return 'Chord and rise must both be positive before calculating the segment radius.';
  }
  if (state.segmentPairReady) {
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
  const namedValueSuffix = pitchGradeResult
    ? '%'
    : state.current?.semanticKind
      ? undefined
      : namedResult?.suffix;
  const namedValueText = namedResult?.empty
    ? namedResult.emptyText ?? 'Recall returns 0'
    : namedResult && namedValueBase
      ? `${namedValueBase}${namedValueSuffix
      ? namedValueSuffix === '%' ? '%' : namedValueSuffix === '% grade' ? '% grade' : ` ${namedValueSuffix}`
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
  };
}
