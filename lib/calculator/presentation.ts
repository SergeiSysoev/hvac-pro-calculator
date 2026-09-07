import { formatValue } from './core';
import type { CalcValue, Operator, Preferences } from './core';
import type {
  CalculatorState,
  DisplayDraftSnapshot,
  DisplayExpressionToken,
  DisplayFunction,
} from './engine';

export interface CalculatorExpressionView {
  contextText: string;
  expressionText: string;
  resultText?: string;
  resultSymbol?: '=' | '≈';
  progressText?: string;
  ariaText: string;
  entryActive: boolean;
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
    .replace(/\s+in\b(?![²³])/gi, '″')
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
  if (state.preferenceMode) return 'Preferences';
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
  const triggerText: Partial<Record<string, string>> = {
    run: 'Run',
    rise: 'Rise',
    diag: 'Diag',
    pitch: 'Pitch',
    hip: 'Hip/V',
    circ: 'Circ',
    stair: 'Stair',
    jack: 'Jack',
    left: '(',
    right: ')',
    '0': '0',
    '9': '9',
  };
  const nextKey = triggerText[sequence.trigger] ?? sequence.trigger;
  return sequence.index < 0
    ? `${nextKey} for next`
    : `${sequence.index + 1}/${sequence.results.length} · ${nextKey} for next`;
}

export function calculatorExpressionView(state: CalculatorState): CalculatorExpressionView {
  if (!state.powered) {
    return {
      contextText: 'Calculator off',
      expressionText: 'Off',
      ariaText: 'Calculator off',
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
  const liveCommittedText = !hasUnfinishedDraft
    && state.current
    && !hasError
    && state.currentDisplayMetadata?.provenance !== 'unit-source'
    && !state.currentSourceExpression?.length
      ? state.display.plainText
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
    && hasTopLevelOperator(state.displayExpression);
  const resultText = hasError
    ? ERROR_TEXT[state.display.plainText] ?? readableMeasurement(state.display.plainText)
    : hasCompletedExpression || hasTransformation || hasStandaloneUnary || hasImmediateSubexpression
      ? readableDisplayText(state.display.plainText, state.angleDisplayMode)
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

  const contextText = hasOuterGroupExpression
    ? 'Current group'
    : displayContext(
      state,
      hasCompletedExpression || hasTransformation || hasStandaloneUnary || hasImmediateSubexpression,
    );
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
  const ariaText = genericContexts.has(contextText)
    ? equationAriaText
    : `${contextText}. ${equationAriaText}`;
  const progressText = sequenceProgress(state);

  return {
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
    progressText,
    ariaText: progressText ? `${ariaText}. ${progressText}` : ariaText,
    entryActive: Boolean(
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
      && state.display.label !== 'ERROR',
  };
}
