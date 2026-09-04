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
  | 'sq-mm'
  | 'cu-ft'
  | 'cu-in'
  | 'cu-m'
  | 'cu-mm';

export type MeasurementSystem = 'neutral' | 'imperial' | 'metric';
export type FractionResolution = 2 | 4 | 8 | 16 | 32 | 64;

export interface CalcValue {
  /** Base magnitude: inches raised to `power`; angles are stored in degrees. */
  amount: number;
  power: number;
  angle?: boolean;
  unit: UnitHint;
  system: MeasurementSystem;
  /** Finest supported binary-inch denominator explicitly used by the operator. */
  fractionDenominator?: FractionResolution;
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
  fractionDenominator: FractionResolution;
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

export interface FormatValueOptions {
  scalarMaxDecimals?: number;
  scalarSignificantDigits?: number;
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
  fractionDenominator?: FractionResolution,
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
    'mm-2': 'sq-mm',
    'mm-3': 'cu-mm',
  };
  return {
    amount: amount * factors[unit] ** power,
    power,
    unit: hints[`${unit}-${power}`] ?? 'auto',
    system: unit === 'm' || unit === 'mm' ? 'metric' : 'imperial',
    fractionDenominator: power === 1 ? fractionDenominator : undefined,
    source: { amount, unit, power },
  };
}

export function cloneValue(value: CalcValue): CalcValue {
  return { ...value, source: value.source ? { ...value.source } : undefined };
}

function compatibleForAdd(a: CalcValue, b: CalcValue): boolean {
  return a.power === b.power && (
    Boolean(a.angle) === Boolean(b.angle) || a.power === 0
  );
}

function combinedSystem(a: CalcValue, b: CalcValue): MeasurementSystem {
  if (a.system === b.system) return a.system;
  if (a.system === 'neutral') return b.system;
  if (b.system === 'neutral') return a.system;
  return 'imperial';
}

function preferredComputedSourceUnit(
  aUnit: 'ft' | 'in' | 'm' | 'mm' | undefined,
  bUnit: 'ft' | 'in' | 'm' | 'mm' | undefined,
  system: MeasurementSystem,
): 'ft' | 'in' | 'm' | 'mm' | undefined {
  if (!aUnit) return bUnit;
  if (!bUnit) return aUnit;
  if (aUnit === bUnit) return aUnit;
  const aMetric = aUnit === 'm' || aUnit === 'mm';
  const bMetric = bUnit === 'm' || bUnit === 'mm';
  if (aMetric && bMetric) return 'm';
  if (!aMetric && !bMetric) return 'ft';
  return system === 'metric' ? 'm' : 'ft';
}

function standardComputedUnit(unit: UnitHint): UnitHint {
  if (unit === 'decimal-ft') return 'ft-in';
  if (unit === 'decimal-in') return 'in';
  return unit;
}

function preferredAddSourceUnit(a: CalcValue, b: CalcValue): 'ft' | 'in' | 'm' | 'mm' | undefined {
  const aUnit = a.source?.unit ?? baseUnitFromHint(a.unit);
  const bUnit = b.source?.unit ?? baseUnitFromHint(b.unit);
  if (!aUnit) return bUnit;
  if (!bUnit) return aUnit;
  const imperial = (unit: typeof aUnit) => unit === 'ft' || unit === 'in';
  if (imperial(aUnit) && imperial(bUnit)) return aUnit === 'ft' || bUnit === 'ft' ? 'ft' : 'in';
  if (!imperial(aUnit) && !imperial(bUnit)) return aUnit === 'm' || bUnit === 'm' ? 'm' : 'mm';
  return aUnit;
}

function combinedFractionDenominator(
  a: CalcValue,
  b: CalcValue,
): FractionResolution | undefined {
  const denominator = Math.max(a.fractionDenominator ?? 0, b.fractionDenominator ?? 0);
  return denominator ? denominator as FractionResolution : undefined;
}

export function operate(a: CalcValue, operator: Operator, b: CalcValue): CalcValue {
  if (operator === '+' || operator === '-') {
    if (!compatibleForAdd(a, b)) throw new CalcError('DIM Error');
    const amount = operator === '+' ? a.amount + b.amount : a.amount - b.amount;
    const sourceUnit = preferredAddSourceUnit(a, b);
    const unit = a.power > 0 && sourceUnit
      ? measurement(0, sourceUnit, a.power).unit
      : standardComputedUnit(a.unit !== 'auto' ? a.unit : b.unit);
    return {
      amount,
      power: a.power,
      angle: a.angle || b.angle || undefined,
      unit,
      system: combinedSystem(a, b),
      fractionDenominator: a.power === 1 ? combinedFractionDenominator(a, b) : undefined,
      source: a.power > 0 && sourceUnit
        ? {
            amount: amount / measurement(1, sourceUnit, a.power).amount,
            unit: sourceUnit,
            power: a.power,
          }
        : undefined,
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

  if (a.power > 0 && b.power === 0) {
    const amount = operator === '*' ? a.amount * b.amount : a.amount / b.amount;
    return {
      ...a,
      amount,
      unit: standardComputedUnit(a.unit),
      source: a.source
        ? {
            ...a.source,
            amount: operator === '*' ? a.source.amount * b.amount : a.source.amount / b.amount,
          }
        : undefined,
    };
  }
  if (operator === '*' && a.power === 0 && b.power > 0) {
    return {
      ...b,
      amount: a.amount * b.amount,
      unit: standardComputedUnit(b.unit),
      source: b.source ? { ...b.source, amount: a.amount * b.source.amount } : undefined,
    };
  }

  const power = operator === '*' ? a.power + b.power : a.power - b.power;
  if (power < 0 || power > 3) throw new CalcError('DIM Error');
  const aSourceUnit = a.source?.unit ?? baseUnitFromHint(a.unit);
  const bSourceUnit = b.source?.unit ?? baseUnitFromHint(b.unit);
  const system = combinedSystem(a, b);
  const resultUnit = operator === '/'
    ? aSourceUnit ?? preferredComputedSourceUnit(aSourceUnit, bSourceUnit, system)
    : preferredComputedSourceUnit(aSourceUnit, bSourceUnit, system);
  if (power > 0 && resultUnit) {
    const amount = operator === '*' ? a.amount * b.amount : a.amount / b.amount;
    const sourceAmount = amount / measurement(1, resultUnit, power).amount;
    return measurement(sourceAmount, resultUnit, power);
  }
  return {
    amount: operator === '*' ? a.amount * b.amount : a.amount / b.amount,
    power,
    unit: 'auto',
    system,
  };
}

export function square(value: CalcValue): CalcValue {
  if (value.angle || value.power * 2 > 3) throw new CalcError('DIM Error');
  return transformedDimensionalValue(value, value.amount ** 2, value.power * 2);
}

export function cube(value: CalcValue): CalcValue {
  if (value.angle || value.power * 3 > 3) throw new CalcError('DIM Error');
  return transformedDimensionalValue(value, value.amount ** 3, value.power * 3);
}

function baseUnitFromHint(unit: UnitHint): 'ft' | 'in' | 'm' | 'mm' | undefined {
  if (unit === 'ft-in' || unit === 'decimal-ft' || unit === 'sq-ft' || unit === 'cu-ft') return 'ft';
  if (unit === 'in' || unit === 'decimal-in' || unit === 'sq-in' || unit === 'cu-in') return 'in';
  if (unit === 'm' || unit === 'sq-m' || unit === 'cu-m') return 'm';
  if (unit === 'mm' || unit === 'sq-mm' || unit === 'cu-mm') return 'mm';
  return undefined;
}

function transformedDimensionalValue(value: CalcValue, amount: number, power: number): CalcValue {
  const baseUnit = value.source?.unit
    ?? baseUnitFromHint(value.unit)
    ?? (value.power > 0 && value.system === 'metric' ? 'm' : undefined)
    ?? (value.power > 0 && value.system === 'imperial' ? 'ft' : undefined);
  if (baseUnit && power > 0) {
    const factors = { ft: 12, in: 1, m: 1000 / 25.4, mm: 1 / 25.4 };
    return measurement(amount / factors[baseUnit] ** power, baseUnit, power);
  }
  return { amount, power, unit: 'auto', system: value.system };
}

export function squareRoot(value: CalcValue): CalcValue {
  if (value.angle || value.amount < 0 || value.power % 2 !== 0) {
    throw new CalcError(value.amount < 0 ? 'ENT Error' : 'DIM Error');
  }
  return transformedDimensionalValue(value, Math.sqrt(value.amount), value.power / 2);
}

export function cubeRoot(value: CalcValue): CalcValue {
  if (value.angle || value.power % 3 !== 0) throw new CalcError('DIM Error');
  return transformedDimensionalValue(value, Math.cbrt(value.amount), value.power / 3);
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

function compactNumber(
  value: number,
  maxDecimals = 8,
  exponent = true,
  maxSignificantDigits?: number,
  minimumPlainDecimals = maxDecimals,
): string {
  if (!Number.isFinite(value)) throw new CalcError('0-fL0');
  const magnitude = Math.abs(value);
  if (magnitude > 19_999_999.99 || (magnitude > 0 && magnitude < 10 ** -minimumPlainDecimals)) {
    if (!exponent) throw new CalcError('0-fL0');
    const [mantissa, power] = value.toExponential(5).split('e');
    return `${mantissa}e${power.replace('+', '')}`;
  }
  const wholeDigits = magnitude >= 1 ? Math.floor(Math.log10(magnitude)) + 1 : 0;
  const leadingFractionZeros = magnitude > 0 && magnitude < 1
    ? Math.max(0, -Math.floor(Math.log10(magnitude)) - 1)
    : 0;
  const decimalPlaces = maxSignificantDigits === undefined
    ? maxDecimals
    : Math.max(0, Math.min(
      maxDecimals,
      maxSignificantDigits - wholeDigits + leadingFractionZeros,
    ));
  const fixed = value.toFixed(decimalPlaces);
  if (!exponent) {
    const [whole, fraction = ''] = fixed.split('.');
    const significantFraction = fraction.replace(/0+$/, '');
    return significantFraction ? `${whole}.${significantFraction}` : `${whole}.`;
  }
  const rounded = Number(fixed);
  return Number.isInteger(rounded) ? `${rounded}.` : String(rounded);
}

export const DISPLAY_MAX = 19_999_999.99;

function decimalDisplay(
  value: number,
  unitText: string,
  preferences: Preferences,
  maxDecimals = 6,
): FormattedValue {
  const text = compactNumber(value, maxDecimals, preferences.exponent, 7).replace(/\.$/, '');
  return { valueText: text, unitText, plainText: `${text} ${unitText.toLowerCase()}` };
}

function fixedDecimalWithinBudget(
  value: number,
  decimals: number,
  exponent: boolean,
  maxSignificantDigits: number,
): string {
  const magnitude = Math.abs(value);
  const wholeDigits = magnitude >= 1 ? Math.floor(Math.log10(magnitude)) + 1 : 0;
  const leadingFractionZeros = magnitude > 0 && magnitude < 1
    ? Math.max(0, -Math.floor(Math.log10(magnitude)) - 1)
    : 0;
  const significantDigits = wholeDigits + Math.max(0, decimals - leadingFractionZeros);
  const text = significantDigits <= maxSignificantDigits
    ? value.toFixed(decimals)
    : compactNumber(value, decimals, exponent, maxSignificantDigits);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
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
  return `${whole}-${numerator}/${denominator}`;
}

function formatImperialLength(
  amount: number,
  preferences: Preferences,
  feetAndInches: boolean,
  enteredDenominator?: FractionResolution,
): FormattedValue {
  const denominator = preferences.constantFraction
    ? preferences.fractionDenominator
    : Math.max(preferences.fractionDenominator, enteredDenominator ?? 0) as FractionResolution;
  const rounded = Math.round(Math.abs(amount) * denominator) / denominator;
  const sign = amount < 0 && rounded !== 0 ? '−' : '';

  if (!feetAndInches) {
    const parts = fractionParts(rounded, denominator, preferences.constantFraction);
    const inches = inchComponent(parts.whole, parts.numerator, parts.denominator);
    return {
      valueText: `${sign}${inches.replace('-', ' ')}`,
      unitText: 'INCH',
      plainText: `${sign}${inches}\u2033`,
    };
  }

  let feet = Math.floor(rounded / 12);
  let remaining = rounded - feet * 12;
  const parts = fractionParts(remaining, denominator, preferences.constantFraction);
  if (parts.whole === 12) {
    feet += 1;
    remaining = 0;
  }
  const finalParts = remaining === 0
    ? { whole: 0, numerator: 0, denominator }
    : parts;
  const inches = inchComponent(finalParts.whole, finalParts.numerator, finalParts.denominator);
  return {
    valueText: `${sign}${feet} - ${inches.replace('-', ' ')}`,
    unitText: 'FEET        INCH',
    plainText: `${sign}${feet}\u2032 ${inches}\u2033`,
  };
}

export function formatValue(
  value: CalcValue,
  preferences: Preferences,
  options: FormatValueOptions = {},
): FormattedValue {
  if (value.angle) {
    const rawDigits = preferences.degreeDecimals === 'fixed-2'
      ? value.amount.toFixed(2)
      : compactNumber(value.amount, 7, preferences.exponent, 7).replace(/\.$/, '');
    const digits = Number(rawDigits) === 0
      ? (preferences.degreeDecimals === 'fixed-2' ? '0.00' : '0')
      : rawDigits;
    return { valueText: digits, unitText: 'DEG', plainText: `${digits}°` };
  }

  if (value.power === 0) {
    const defaultMaxDecimals = Math.abs(value.amount) > 0 && Math.abs(value.amount) < 1e-6 ? 8 : 6;
    const text = compactNumber(
      value.amount,
      options.scalarMaxDecimals ?? defaultMaxDecimals,
      preferences.exponent,
      options.scalarSignificantDigits ?? 7,
      8,
    );
    return { valueText: text, unitText: '', plainText: text };
  }

  if (value.power === 1) {
    if (value.unit === 'decimal-ft') {
      const feet = value.amount / 12;
      if (Math.abs(feet) > DISPLAY_MAX && !preferences.exponent) return decimalDisplay(feet / 3, 'YARDS', preferences);
      const text = compactNumber(feet, 6, preferences.exponent, 7);
      return { valueText: text, unitText: 'FEET', plainText: `${text} ft` };
    }
    if (value.unit === 'decimal-in') {
      if (Math.abs(value.amount) > DISPLAY_MAX && !preferences.exponent) return decimalDisplay(value.amount / 12, 'FEET', preferences);
      const text = compactNumber(value.amount, 6, preferences.exponent, 7);
      return { valueText: text, unitText: 'INCH', plainText: `${text} in` };
    }
    if (value.unit === 'in') {
      if (Math.abs(value.amount) > DISPLAY_MAX) {
        return decimalDisplay(
          preferences.exponent ? value.amount : value.amount / 12,
          preferences.exponent ? 'INCH' : 'FEET',
          preferences,
        );
      }
      return formatImperialLength(value.amount, preferences, false, value.fractionDenominator);
    }
    if (value.unit === 'm') {
      const meters = value.amount * 0.0254;
      if (Math.abs(meters) > DISPLAY_MAX && !preferences.exponent) return decimalDisplay(meters / 1000, 'KM', preferences);
      const text = preferences.meterDecimals === 'fixed-3'
        ? fixedDecimalWithinBudget(meters, 3, preferences.exponent, 8)
        : compactNumber(meters, 8, preferences.exponent, 7).replace(/\.$/, '');
      return { valueText: text, unitText: 'M', plainText: `${text} m` };
    }
    if (value.unit === 'mm') {
      const millimeters = value.amount * 25.4;
      if (Math.abs(millimeters) > DISPLAY_MAX && !preferences.exponent) {
        const meters = millimeters / 1000;
        const text = preferences.meterDecimals === 'fixed-3'
          ? fixedDecimalWithinBudget(meters, 3, preferences.exponent, 8)
          : compactNumber(meters, 8, preferences.exponent, 7).replace(/\.$/, '');
        return { valueText: text, unitText: 'M', plainText: `${text} m` };
      }
      const text = compactNumber(millimeters, 4, preferences.exponent, 7);
      return { valueText: text, unitText: 'MM', plainText: `${text} mm` };
    }
    if (Math.abs(value.amount / 12) > DISPLAY_MAX) {
      return decimalDisplay(
        preferences.exponent ? value.amount / 12 : value.amount / 36,
        preferences.exponent ? 'FEET' : 'YARDS',
        preferences,
      );
    }
    return formatImperialLength(value.amount, preferences, true, value.fractionDenominator);
  }

  const forceMetric = value.power === 2
    ? preferences.areaFormat === 'sq-m'
    : preferences.volumeFormat === 'cu-m';
  const useMetric = forceMetric || (value.power === 2
    ? preferences.areaFormat === 'standard' && value.system === 'metric'
    : preferences.volumeFormat === 'standard' && value.system === 'metric');
  const forceImperial = value.power === 2
    ? preferences.areaFormat === 'sq-ft'
    : preferences.volumeFormat === 'cu-ft';
  const useInches = !forceImperial && !useMetric && (value.unit === 'sq-in' || value.unit === 'cu-in');
  const useMillimeters = !forceImperial && !forceMetric && (value.unit === 'sq-mm' || value.unit === 'cu-mm');
  let converted: number;
  let unitText: string;

  if (useMillimeters) {
    converted = value.amount * 25.4 ** value.power;
    unitText = value.power === 2 ? 'SQ MM' : 'CU MM';
  } else if (useMetric) {
    converted = value.amount * 0.0254 ** value.power;
    unitText = value.power === 2 ? 'SQ M' : 'CU M';
  } else if (useInches) {
    converted = value.amount;
    unitText = value.power === 2 ? 'SQ INCH' : 'CU INCH';
  } else {
    converted = value.amount / 12 ** value.power;
    unitText = value.power === 2 ? 'SQ FEET' : 'CU FEET';
  }
  if (Math.abs(converted) > DISPLAY_MAX && useMillimeters && !preferences.exponent) {
    converted /= 1000 ** value.power;
    unitText = value.power === 2 ? 'SQ M' : 'CU M';
  } else if (Math.abs(converted) > DISPLAY_MAX && useInches && !preferences.exponent) {
    converted /= 12 ** value.power;
    unitText = value.power === 2 ? 'SQ FEET' : 'CU FEET';
  }
  const usesExtendedDecimalPositions = useMillimeters || Math.abs(converted) >= 1_000_000;
  const text = compactNumber(
    converted,
    6,
    preferences.exponent,
    usesExtendedDecimalPositions ? 10 : 7,
  );
  return { valueText: text, unitText, plainText: `${text} ${unitText.toLowerCase()}` };
}

export function withUnit(value: CalcValue, unit: UnitHint): CalcValue {
  const system: MeasurementSystem = unit === 'm' || unit === 'mm' || unit === 'sq-m' || unit === 'sq-mm' || unit === 'cu-m' || unit === 'cu-mm'
    ? 'metric'
    : unit === 'auto'
      ? value.system
      : 'imperial';
  return { ...value, unit, system, source: undefined };
}

export function nearlyEqual(a: number, b: number, epsilon = 1e-7): boolean {
  return Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b));
}
