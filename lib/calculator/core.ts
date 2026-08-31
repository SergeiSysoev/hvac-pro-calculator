export type UnitHint =
  | 'auto'
  | 'ft-in'
  | 'decimal-ft'
  | 'decimal-in'
  | 'in'
  | 'm'
  | 'mm'
  | 'sq-ft'
  | 'sq-in'
  | 'sq-m'
  | 'cu-ft'
  | 'cu-in'
  | 'cu-m';

export type MeasurementSystem = 'neutral' | 'imperial' | 'metric';

export interface CalcValue {
  /** Base magnitude: inches raised to `power`; angles are stored in degrees. */
  amount: number;
  power: number;
  angle?: boolean;
  unit: UnitHint;
  system: MeasurementSystem;
  source?: {
    amount: number;
    unit: 'ft' | 'in' | 'm' | 'mm';
    power: number;
  };
}

export type Operator = '+' | '-' | '*' | '/';

export type ExpressionToken =
  | { type: 'value'; value: CalcValue }
  | { type: 'operator'; operator: Operator }
  | { type: 'left' }
  | { type: 'right' };

export interface Preferences {
  fractionDenominator: 2 | 4 | 8 | 16 | 32 | 64;
  constantFraction: boolean;
  areaFormat: 'standard' | 'sq-ft' | 'sq-m';
  volumeFormat: 'standard' | 'cu-ft' | 'cu-m';
  treadWidth: number;
  headroom: number;
  floorThickness: number;
  desiredRiser: number;
  jackOrder: 'descending' | 'ascending';
  irregularJackMode: 'oc-oc' | 'mate';
  exponent: boolean;
  meterDecimals: 'fixed-3' | 'float';
  degreeDecimals: 'float' | 'fixed-2';
  mathMode: 'order' | 'chain';
  onCenter: number;
}

export interface FormattedValue {
  valueText: string;
  unitText: string;
  plainText: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  fractionDenominator: 16,
  constantFraction: false,
  areaFormat: 'standard',
  volumeFormat: 'standard',
  treadWidth: 10,
  headroom: 80,
  floorThickness: 10,
  desiredRiser: 7.5,
  jackOrder: 'descending',
  irregularJackMode: 'oc-oc',
  exponent: true,
  meterDecimals: 'fixed-3',
  degreeDecimals: 'float',
  mathMode: 'order',
  onCenter: 16,
};

export class CalcError extends Error {
  code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = 'CalcError';
    this.code = code;
  }
}

export function scalar(amount: number): CalcValue {
  return { amount, power: 0, unit: 'auto', system: 'neutral' };
}

export function degrees(amount: number): CalcValue {
  return { amount, power: 0, angle: true, unit: 'auto', system: 'neutral' };
}

export function measurement(
  amount: number,
  unit: 'ft' | 'in' | 'm' | 'mm',
  power = 1,
): CalcValue {
  const factors = { ft: 12, in: 1, m: 1000 / 25.4, mm: 1 / 25.4 };
  const hints: Record<string, UnitHint> = {
    'ft-1': 'ft-in',
    'ft-2': 'sq-ft',
    'ft-3': 'cu-ft',
    'in-1': 'in',
    'in-2': 'sq-in',
    'in-3': 'cu-in',
    'm-1': 'm',
    'm-2': 'sq-m',
    'm-3': 'cu-m',
    'mm-1': 'mm',
  };
  return {
    amount: amount * factors[unit] ** power,
    power,
    unit: hints[`${unit}-${power}`] ?? 'auto',
    system: unit === 'm' || unit === 'mm' ? 'metric' : 'imperial',
    source: { amount, unit, power },
  };
}

export function cloneValue(value: CalcValue): CalcValue {
  return { ...value, source: value.source ? { ...value.source } : undefined };
}

function compatibleForAdd(a: CalcValue, b: CalcValue): boolean {
  return a.power === b.power && Boolean(a.angle) === Boolean(b.angle);
}

function combinedSystem(a: CalcValue, b: CalcValue): MeasurementSystem {
  if (a.system === b.system) return a.system;
  if (a.system === 'neutral') return b.system;
  if (b.system === 'neutral') return a.system;
  return 'imperial';
}

export function operate(a: CalcValue, operator: Operator, b: CalcValue): CalcValue {
  if (operator === '+' || operator === '-') {
    if (!compatibleForAdd(a, b)) throw new CalcError('DIM Error');
    return {
      amount: operator === '+' ? a.amount + b.amount : a.amount - b.amount,
      power: a.power,
      angle: a.angle,
      unit: a.unit !== 'auto' ? a.unit : b.unit,
      system: combinedSystem(a, b),
    };
  }

  if (operator === '/' && b.amount === 0) throw new CalcError('DIV Error');
  if (a.angle || b.angle) {
    if (a.angle && b.power === 0 && !b.angle) {
      return { ...a, amount: operator === '*' ? a.amount * b.amount : a.amount / b.amount };
    }
    if (b.angle && a.power === 0 && !a.angle && operator === '*') {
      return { ...b, amount: a.amount * b.amount };
    }
    throw new CalcError('TYP Error');
  }

  const power = operator === '*' ? a.power + b.power : a.power - b.power;
  if (power < 0 || power > 3) throw new CalcError('DIM Error');
  return {
    amount: operator === '*' ? a.amount * b.amount : a.amount / b.amount,
    power,
    unit: 'auto',
    system: combinedSystem(a, b),
  };
}

export function square(value: CalcValue): CalcValue {
  if (value.angle || value.power * 2 > 3) throw new CalcError('DIM Error');
  return {
    amount: value.amount ** 2,
    power: value.power * 2,
    unit: 'auto',
    system: value.system,
  };
}

export function cube(value: CalcValue): CalcValue {
  if (value.angle || value.power * 3 > 3) throw new CalcError('DIM Error');
  return {
    amount: value.amount ** 3,
    power: value.power * 3,
    unit: 'auto',
    system: value.system,
  };
}

export function squareRoot(value: CalcValue): CalcValue {
  if (value.angle || value.amount < 0 || value.power % 2 !== 0) {
    throw new CalcError(value.amount < 0 ? 'ENT Error' : 'DIM Error');
  }
  return {
    amount: Math.sqrt(value.amount),
    power: value.power / 2,
    unit: 'auto',
    system: value.system,
  };
}

export function cubeRoot(value: CalcValue): CalcValue {
  if (value.angle || value.power % 3 !== 0) throw new CalcError('DIM Error');
  return {
    amount: Math.cbrt(value.amount),
    power: value.power / 3,
    unit: 'auto',
    system: value.system,
  };
}

function precedence(operator: Operator, mathMode: Preferences['mathMode']): number {
  if (mathMode === 'chain') return 1;
  return operator === '*' || operator === '/' ? 2 : 1;
}

function toRpn(tokens: ExpressionToken[], mathMode: Preferences['mathMode']): ExpressionToken[] {
  const output: ExpressionToken[] = [];
  const operators: ExpressionToken[] = [];

  for (const token of tokens) {
    if (token.type === 'value') {
      output.push(token);
      continue;
    }
    if (token.type === 'operator') {
      while (operators.length) {
        const top = operators.at(-1)!;
        if (
          top.type !== 'operator' ||
          precedence(top.operator, mathMode) < precedence(token.operator, mathMode)
        ) break;
        output.push(operators.pop()!);
      }
      operators.push(token);
      continue;
    }
    if (token.type === 'left') {
      operators.push(token);
      continue;
    }
    let foundLeft = false;
    while (operators.length) {
      const top = operators.pop()!;
      if (top.type === 'left') {
        foundLeft = true;
        break;
      }
      output.push(top);
    }
    if (!foundLeft) throw new CalcError('ENT Error');
  }

  while (operators.length) {
    const token = operators.pop()!;
    if (token.type === 'left' || token.type === 'right') throw new CalcError('ENT Error');
    output.push(token);
  }
  return output;
}

export function evaluateExpression(
  tokens: ExpressionToken[],
  mathMode: Preferences['mathMode'] = 'order',
): CalcValue {
  const stack: CalcValue[] = [];
  for (const token of toRpn(tokens, mathMode)) {
    if (token.type === 'value') {
      stack.push(cloneValue(token.value));
      continue;
    }
    if (token.type !== 'operator' || stack.length < 2) throw new CalcError('ENT Error');
    const b = stack.pop()!;
    const a = stack.pop()!;
    stack.push(operate(a, token.operator, b));
  }
  if (stack.length !== 1) throw new CalcError('ENT Error');
  return stack[0];
}

export function percentValue(left: CalcValue, operator: Operator, percent: number): CalcValue {
  const ratio = percent / 100;
  if (operator === '+' || operator === '-') {
    return { ...left, amount: left.amount * ratio, source: undefined };
  }
  return scalar(ratio);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function compactNumber(value: number, maxDecimals = 8): string {
  if (!Number.isFinite(value)) throw new CalcError('0-fL0');
  if (Math.abs(value) > 19_999_999.99) {
    return value.toExponential(6).replace('+', '');
  }
  const rounded = Number(value.toFixed(maxDecimals));
  return Number.isInteger(rounded) ? `${rounded}.` : String(rounded);
}

function fractionParts(
  inches: number,
  denominator: number,
  constant: boolean,
): { whole: number; numerator: number; denominator: number } {
  const rounded = Math.round(Math.abs(inches) * denominator) / denominator;
  let whole = Math.floor(rounded + 1e-10);
  let numerator = Math.round((rounded - whole) * denominator);
  if (numerator === denominator) {
    whole += 1;
    numerator = 0;
  }
  if (numerator && !constant) {
    const divisor = gcd(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
  }
  return { whole, numerator, denominator };
}

function inchComponent(whole: number, numerator: number, denominator: number): string {
  if (!numerator) return String(whole);
  return whole ? `${whole}-${numerator}/${denominator}` : `${numerator}/${denominator}`;
}

function formatImperialLength(
  amount: number,
  preferences: Preferences,
  feetAndInches: boolean,
): FormattedValue {
  const sign = amount < 0 ? '−' : '';
  const rounded = Math.round(Math.abs(amount) * preferences.fractionDenominator) /
    preferences.fractionDenominator;

  if (!feetAndInches) {
    const parts = fractionParts(rounded, preferences.fractionDenominator, preferences.constantFraction);
    const inches = inchComponent(parts.whole, parts.numerator, parts.denominator);
    return { valueText: `${sign}${inches}`, unitText: 'INCH', plainText: `${sign}${inches}\u2033` };
  }

  let feet = Math.floor(rounded / 12);
  let remaining = rounded - feet * 12;
  const parts = fractionParts(remaining, preferences.fractionDenominator, preferences.constantFraction);
  if (parts.whole === 12) {
    feet += 1;
    remaining = 0;
  }
  const finalParts = remaining === 0
    ? { whole: 0, numerator: 0, denominator: preferences.fractionDenominator }
    : parts;
  const inches = inchComponent(finalParts.whole, finalParts.numerator, finalParts.denominator);
  return {
    valueText: `${sign}${feet}  ${inches}`,
    unitText: 'FEET        INCH',
    plainText: `${sign}${feet}\u2032 ${inches}\u2033`,
  };
}

export function formatValue(value: CalcValue, preferences: Preferences): FormattedValue {
  if (value.angle) {
    const digits = preferences.degreeDecimals === 'fixed-2'
      ? value.amount.toFixed(2)
      : compactNumber(value.amount, 7).replace(/\.$/, '');
    return { valueText: digits, unitText: 'DEG', plainText: `${digits}°` };
  }

  if (value.power === 0) {
    const text = compactNumber(value.amount);
    return { valueText: text, unitText: '', plainText: text };
  }

  if (value.power === 1) {
    if (value.unit === 'decimal-ft') {
      const text = compactNumber(value.amount / 12, 6);
      return { valueText: text, unitText: 'FEET', plainText: `${text} ft` };
    }
    if (value.unit === 'decimal-in') {
      const text = compactNumber(value.amount, 6);
      return { valueText: text, unitText: 'INCH', plainText: `${text} in` };
    }
    if (value.unit === 'in') return formatImperialLength(value.amount, preferences, false);
    if (value.unit === 'm') {
      const meters = value.amount * 0.0254;
      const text = preferences.meterDecimals === 'fixed-3'
        ? meters.toFixed(3)
        : compactNumber(meters, 8).replace(/\.$/, '');
      return { valueText: text, unitText: 'M', plainText: `${text} m` };
    }
    if (value.unit === 'mm') {
      const text = compactNumber(value.amount * 25.4, 4);
      return { valueText: text, unitText: 'MM', plainText: `${text} mm` };
    }
    return formatImperialLength(value.amount, preferences, true);
  }

  const useMetric = value.power === 2
    ? preferences.areaFormat === 'sq-m' || (preferences.areaFormat === 'standard' && value.system === 'metric')
    : preferences.volumeFormat === 'cu-m' || (preferences.volumeFormat === 'standard' && value.system === 'metric');
  const forceImperial = value.power === 2
    ? preferences.areaFormat === 'sq-ft'
    : preferences.volumeFormat === 'cu-ft';
  const useInches = !forceImperial && !useMetric && (value.unit === 'sq-in' || value.unit === 'cu-in');
  let converted: number;
  let unitText: string;

  if (useMetric) {
    converted = value.amount * 0.0254 ** value.power;
    unitText = value.power === 2 ? 'SQ M' : 'CU M';
  } else if (useInches) {
    converted = value.amount;
    unitText = value.power === 2 ? 'SQ INCH' : 'CU INCH';
  } else {
    converted = value.amount / 12 ** value.power;
    unitText = value.power === 2 ? 'SQ FEET' : 'CU FEET';
  }
  const text = compactNumber(converted, 6);
  return { valueText: text, unitText, plainText: `${text} ${unitText.toLowerCase()}` };
}

export function withUnit(value: CalcValue, unit: UnitHint): CalcValue {
  const system: MeasurementSystem = unit === 'm' || unit === 'mm' || unit === 'sq-m' || unit === 'cu-m'
    ? 'metric'
    : unit === 'auto'
      ? value.system
      : 'imperial';
  return { ...value, unit, system, source: undefined };
}

export function nearlyEqual(a: number, b: number, epsilon = 1e-7): boolean {
  return Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b));
}
