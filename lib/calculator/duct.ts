export type DuctField = 'airflowCfm' | 'frictionRate' | 'velocityFpm' | 'diameterIn';
export type DuctUnitSystem = 'imperial' | 'si';

export interface DuctInputs {
  airflowCfm?: number;
  frictionRate?: number;
  velocityFpm?: number;
  diameterIn?: number;
}

export interface DuctConditions {
  densityLbFt3: number;
  roughnessFt: number;
}

export interface DuctSolution {
  airflowCfm: number;
  frictionRate: number;
  velocityFpm: number;
  diameterIn: number;
  reynolds: number;
  frictionFactor: number;
}

export interface RectangularEquivalent {
  widthIn: number;
  heightIn: number;
  equivalentDiameterIn: number;
  velocityFpm: number;
  differencePercent: number;
  frictionDifferencePercent: number;
  aspectRatio: number;
}

export const STANDARD_DUCT_CONDITIONS: DuctConditions = {
  densityLbFt3: 0.075,
  roughnessFt: 0.0003,
};

export const DUCT_CONVERSIONS = {
  cfmToLitersPerSecond: 0.471947443,
  fpmToMetersPerSecond: 0.00508,
  inchToMillimeter: 25.4,
  inWgPer100FtToPascalPerMeter: 249.08891 / 30.48,
} as const;

const REYNOLDS_STANDARD_AIR = 8.5;
const LAMINAR_REYNOLDS_LIMIT = 2_300;
const REYNOLDS_BOUNDARY_EPSILON = 1e-12;
const TURBULENT_BOUNDARY_FACTOR = 1 + 1e-9;
const VELOCITY_CONSTANT = 576 / Math.PI;

function frictionTolerance(value: number): number {
  return Math.max(value * 1e-9, 1e-12);
}

function transitionRangeError(): RangeError {
  return new RangeError('The entered values fall in an unsupported flow-transition range.');
}

function ambiguousFlowError(): RangeError {
  return new RangeError('The entered values have multiple valid laminar and turbulent solutions.');
}

function laminarBoundaryFriction(
  velocityFpm: number,
  diameterIn: number,
  conditions: DuctConditions,
): number {
  return 1200 * (64 / LAMINAR_REYNOLDS_LIMIT) * conditions.densityLbFt3 /
    diameterIn * (velocityFpm / 1097) ** 2;
}

export type DuctAmbiguousCommaMode = 'reject' | 'decimal' | 'grouping';

export function ductEntryCommaMode(
  field: DuctField,
  unitSystem: DuctUnitSystem,
): DuctAmbiguousCommaMode {
  if (field === 'frictionRate') return 'decimal';
  if (field === 'velocityFpm' && unitSystem === 'si') return 'decimal';
  return 'grouping';
}

export function parseDuctEntry(
  value: string,
  ambiguousCommaMode: DuctAmbiguousCommaMode = 'reject',
): number | undefined {
  const compact = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!compact) return undefined;

  let normalized = compact;
  if (compact.includes(',')) {
    const ambiguousSingleComma = /^[+-]?[1-9]\d{0,2},\d{3}$/.test(compact);
    if (
      /^[+-]?[1-9]\d{0,2}(?:,\d{3}){2,}$/.test(compact)
      || /^[+-]?[1-9]\d{0,2}(?:,\d{3})+\.\d+$/.test(compact)
      || (ambiguousSingleComma && ambiguousCommaMode === 'grouping')
    ) {
      normalized = compact.replaceAll(',', '');
    } else if (
      !compact.includes('.')
      && /^[+-]?(?:\d+,\d*|,\d+)$/.test(compact)
      && (!ambiguousSingleComma || ambiguousCommaMode === 'decimal')
    ) {
      normalized = compact.replace(',', '.');
    } else {
      return undefined;
    }
  }

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function ductFlowRegimeNotice(reynolds: number): string | undefined {
  if (!Number.isFinite(reynolds) || reynolds <= 0) return undefined;
  if (reynolds <= LAMINAR_REYNOLDS_LIMIT) {
    return 'Laminar flow: the calculation uses f = 64/Re; verify this low-flow application.';
  }
  if (reynolds < 10_000) {
    return 'Transitional flow: results can be sensitive to small changes; verify before use.';
  }
  return undefined;
}

function requirePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return value;
}

export function airflowFromVelocityAndDiameter(velocityFpm: number, diameterIn: number): number {
  requirePositive(velocityFpm, 'Velocity');
  requirePositive(diameterIn, 'Diameter');
  return Math.PI * diameterIn ** 2 * velocityFpm / 576;
}

export function velocityFromAirflowAndDiameter(airflowCfm: number, diameterIn: number): number {
  requirePositive(airflowCfm, 'Airflow');
  requirePositive(diameterIn, 'Diameter');
  return VELOCITY_CONSTANT * airflowCfm / diameterIn ** 2;
}

export function ductReynolds(
  velocityFpm: number,
  diameterIn: number,
  densityLbFt3 = STANDARD_DUCT_CONDITIONS.densityLbFt3,
): number {
  requirePositive(velocityFpm, 'Velocity');
  requirePositive(diameterIn, 'Diameter');
  requirePositive(densityLbFt3, 'Air density');
  return REYNOLDS_STANDARD_AIR * diameterIn * velocityFpm *
    densityLbFt3 / STANDARD_DUCT_CONDITIONS.densityLbFt3;
}

export function diameterFromAirflowAndVelocity(airflowCfm: number, velocityFpm: number): number {
  requirePositive(airflowCfm, 'Airflow');
  requirePositive(velocityFpm, 'Velocity');
  return Math.sqrt(VELOCITY_CONSTANT * airflowCfm / velocityFpm);
}

export function ductFrictionFactor(
  reynolds: number,
  diameterIn: number,
  roughnessFt = STANDARD_DUCT_CONDITIONS.roughnessFt,
): number {
  requirePositive(reynolds, 'Reynolds number');
  requirePositive(diameterIn, 'Diameter');
  if (!Number.isFinite(roughnessFt) || roughnessFt < 0) {
    throw new RangeError('Roughness must be a non-negative finite number.');
  }

  if (reynolds <= LAMINAR_REYNOLDS_LIMIT * (1 + REYNOLDS_BOUNDARY_EPSILON)) {
    return 64 / reynolds;
  }

  const relativeRoughness = 12 * roughnessFt / diameterIn;
  let inverseRoot = 1 / Math.sqrt(0.02);

  for (let index = 0; index < 40; index += 1) {
    const next = -2 * Math.log10(
      relativeRoughness / 3.7 + 2.51 * inverseRoot / reynolds,
    );
    if (Math.abs(next - inverseRoot) < 1e-11) {
      inverseRoot = next;
      break;
    }
    inverseRoot = next;
  }

  return 1 / inverseRoot ** 2;
}

export function ductFrictionRate(
  velocityFpm: number,
  diameterIn: number,
  conditions: DuctConditions = STANDARD_DUCT_CONDITIONS,
): number {
  requirePositive(velocityFpm, 'Velocity');
  requirePositive(diameterIn, 'Diameter');
  requirePositive(conditions.densityLbFt3, 'Air density');

  const reynolds = ductReynolds(velocityFpm, diameterIn, conditions.densityLbFt3);
  const factor = ductFrictionFactor(reynolds, diameterIn, conditions.roughnessFt);
  return 1200 * factor * conditions.densityLbFt3 / diameterIn * (velocityFpm / 1097) ** 2;
}

function solveMonotonic(
  target: number,
  valueAt: (input: number) => number,
  direction: 'increasing' | 'decreasing',
  initialLow = 0.05,
  initialHigh = 100,
  bounds: { minimum?: number; maximum?: number } = {},
): number {
  requirePositive(target, 'Target');
  const minimum = bounds.minimum ?? Number.MIN_VALUE;
  const maximum = bounds.maximum ?? Number.POSITIVE_INFINITY;
  const boundedByFlowRegime = bounds.minimum !== undefined || bounds.maximum !== undefined;
  const unsupportedRange = () => new RangeError(boundedByFlowRegime
    ? 'The entered values fall in an unsupported flow-transition range.'
    : 'The entered values are outside the supported duct-sizing range.');
  let low = Math.max(initialLow, minimum);
  let high = Math.min(Math.max(initialHigh, low * 2), maximum);
  const tolerance = Math.max(target * 1e-12, Number.MIN_VALUE);

  if (!(low <= high) || !Number.isFinite(low) || low <= 0) {
    throw unsupportedRange();
  }
  if (Math.abs(valueAt(low) - target) <= tolerance) return low;
  if (Math.abs(valueAt(high) - target) <= tolerance) return high;

  for (let index = 0; index < 40; index += 1) {
    const lowDelta = valueAt(low) - target;
    const highDelta = valueAt(high) - target;
    if (Math.abs(lowDelta) <= tolerance) return low;
    if (Math.abs(highDelta) <= tolerance) return high;
    if (lowDelta * highDelta < 0) break;

    let expanded = false;
    if (direction === 'increasing') {
      if (lowDelta > 0 && low > minimum) {
        const next = Math.max(low / 2, minimum);
        expanded ||= next !== low;
        low = next;
      }
      if (highDelta < 0 && high < maximum) {
        const next = Math.min(high * 2, maximum);
        expanded ||= next !== high;
        high = next;
      }
    } else {
      if (lowDelta < 0 && low > minimum) {
        const next = Math.max(low / 2, minimum);
        expanded ||= next !== low;
        low = next;
      }
      if (highDelta > 0 && high < maximum) {
        const next = Math.min(high * 2, maximum);
        expanded ||= next !== high;
        high = next;
      }
    }
    if (!expanded) break;
  }

  const lowDelta = valueAt(low) - target;
  const highDelta = valueAt(high) - target;
  if (!Number.isFinite(lowDelta) || !Number.isFinite(highDelta) || lowDelta * highDelta > 0) {
    throw unsupportedRange();
  }

  for (let index = 0; index < 80; index += 1) {
    const middle = Math.sqrt(low * high);
    const delta = valueAt(middle) - target;
    if (Math.abs(delta) <= tolerance) return middle;

    if (direction === 'increasing') {
      if (delta < 0) low = middle;
      else high = middle;
    } else if (delta > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const result = Math.sqrt(low * high);
  const residual = Math.abs(valueAt(result) - target);
  if (!Number.isFinite(residual) || residual > Math.max(target * 1e-7, 1e-12)) {
    throw new RangeError('The entered values fall in an unsupported flow-transition range.');
  }
  return result;
}

export function solveRoundDuct(
  inputs: DuctInputs,
  conditions: DuctConditions = STANDARD_DUCT_CONDITIONS,
): DuctSolution {
  const known = (Object.entries(inputs) as Array<[DuctField, number | undefined]>)
    .filter((entry): entry is [DuctField, number] => entry[1] !== undefined);

  if (known.length !== 2) {
    throw new RangeError('Enter exactly two duct values.');
  }
  for (const [field, value] of known) requirePositive(value, field);

  let airflowCfm = inputs.airflowCfm;
  let frictionRate = inputs.frictionRate;
  let velocityFpm = inputs.velocityFpm;
  let diameterIn = inputs.diameterIn;

  if (airflowCfm !== undefined && diameterIn !== undefined) {
    velocityFpm = velocityFromAirflowAndDiameter(airflowCfm, diameterIn);
  } else if (airflowCfm !== undefined && velocityFpm !== undefined) {
    diameterIn = diameterFromAirflowAndVelocity(airflowCfm, velocityFpm);
  } else if (velocityFpm !== undefined && diameterIn !== undefined) {
    airflowCfm = airflowFromVelocityAndDiameter(velocityFpm, diameterIn);
  } else if (airflowCfm !== undefined && frictionRate !== undefined) {
    const densityScale = conditions.densityLbFt3 / STANDARD_DUCT_CONDITIONS.densityLbFt3;
    const boundaryDiameter = REYNOLDS_STANDARD_AIR * VELOCITY_CONSTANT *
      airflowCfm * densityScale / LAMINAR_REYNOLDS_LIMIT;
    const turbulentMaximum = boundaryDiameter / TURBULENT_BOUNDARY_FACTOR;
    const laminarMinimum = boundaryDiameter * TURBULENT_BOUNDARY_FACTOR;
    const frictionAt = (diameter: number) => ductFrictionRate(
      velocityFromAirflowAndDiameter(airflowCfm!, diameter),
      diameter,
      conditions,
    );
    const boundaryVelocity = velocityFromAirflowAndDiameter(airflowCfm, boundaryDiameter);
    const laminarBoundary = laminarBoundaryFriction(boundaryVelocity, boundaryDiameter, conditions);
    const turbulentBoundaryFriction = frictionAt(turbulentMaximum);
    const tolerance = frictionTolerance(frictionRate);

    if (turbulentBoundaryFriction < laminarBoundary - tolerance &&
        frictionRate >= turbulentBoundaryFriction - tolerance &&
        frictionRate <= laminarBoundary + tolerance) {
      throw ambiguousFlowError();
    }
    if (Math.abs(frictionRate - laminarBoundary) <= tolerance) {
      diameterIn = boundaryDiameter;
    } else if (frictionRate < laminarBoundary) {
      diameterIn = solveMonotonic(
        frictionRate,
        frictionAt,
        'decreasing',
        laminarMinimum,
        Math.max(100, laminarMinimum * 2),
        { minimum: laminarMinimum },
      );
    } else if (frictionRate >= turbulentBoundaryFriction - tolerance) {
      diameterIn = solveMonotonic(
        frictionRate,
        frictionAt,
        'decreasing',
        Math.min(0.05, turbulentMaximum / 2),
        turbulentMaximum,
        { maximum: turbulentMaximum },
      );
    } else {
      throw transitionRangeError();
    }
    velocityFpm = velocityFromAirflowAndDiameter(airflowCfm, diameterIn);
  } else if (velocityFpm !== undefined && frictionRate !== undefined) {
    const densityScale = conditions.densityLbFt3 / STANDARD_DUCT_CONDITIONS.densityLbFt3;
    const boundaryDiameter = LAMINAR_REYNOLDS_LIMIT /
      (REYNOLDS_STANDARD_AIR * velocityFpm * densityScale);
    const turbulentMinimum = boundaryDiameter * TURBULENT_BOUNDARY_FACTOR;
    const laminarMaximum = boundaryDiameter / TURBULENT_BOUNDARY_FACTOR;
    const frictionAt = (diameter: number) => ductFrictionRate(velocityFpm!, diameter, conditions);
    const laminarBoundary = laminarBoundaryFriction(velocityFpm, boundaryDiameter, conditions);
    const turbulentBoundaryFriction = frictionAt(turbulentMinimum);
    const tolerance = frictionTolerance(frictionRate);

    if (turbulentBoundaryFriction > laminarBoundary) {
      if (frictionRate >= laminarBoundary - tolerance &&
          frictionRate <= turbulentBoundaryFriction + tolerance) {
        throw ambiguousFlowError();
      }
    } else if (frictionRate <= laminarBoundary + tolerance &&
               frictionRate >= turbulentBoundaryFriction - tolerance) {
      throw transitionRangeError();
    }
    if (frictionRate > Math.max(laminarBoundary, turbulentBoundaryFriction)) {
      diameterIn = solveMonotonic(
        frictionRate,
        frictionAt,
        'decreasing',
        Math.min(0.05, laminarMaximum / 2),
        laminarMaximum,
        { maximum: laminarMaximum },
      );
    } else {
      diameterIn = solveMonotonic(
        frictionRate,
        frictionAt,
        'decreasing',
        turbulentMinimum,
        Math.max(100, turbulentMinimum * 2),
        { minimum: turbulentMinimum },
      );
    }
    airflowCfm = airflowFromVelocityAndDiameter(velocityFpm, diameterIn);
  } else if (diameterIn !== undefined && frictionRate !== undefined) {
    const densityScale = conditions.densityLbFt3 / STANDARD_DUCT_CONDITIONS.densityLbFt3;
    const boundaryVelocity = LAMINAR_REYNOLDS_LIMIT /
      (REYNOLDS_STANDARD_AIR * diameterIn * densityScale);
    const turbulentMinimum = boundaryVelocity * TURBULENT_BOUNDARY_FACTOR;
    const laminarMaximum = boundaryVelocity / TURBULENT_BOUNDARY_FACTOR;
    const frictionAt = (velocity: number) => ductFrictionRate(velocity, diameterIn!, conditions);
    const laminarBoundary = laminarBoundaryFriction(boundaryVelocity, diameterIn, conditions);
    const turbulentBoundaryFriction = frictionAt(turbulentMinimum);
    const tolerance = frictionTolerance(frictionRate);

    if (turbulentBoundaryFriction < laminarBoundary - tolerance &&
        frictionRate >= turbulentBoundaryFriction - tolerance &&
        frictionRate <= laminarBoundary + tolerance) {
      throw ambiguousFlowError();
    }
    if (Math.abs(frictionRate - laminarBoundary) <= tolerance) {
      velocityFpm = boundaryVelocity;
    } else if (frictionRate < laminarBoundary) {
      velocityFpm = solveMonotonic(
        frictionRate,
        frictionAt,
        'increasing',
        Math.min(0.05, laminarMaximum / 2),
        laminarMaximum,
        { maximum: laminarMaximum },
      );
    } else if (frictionRate >= turbulentBoundaryFriction - tolerance) {
      velocityFpm = solveMonotonic(
        frictionRate,
        frictionAt,
        'increasing',
        turbulentMinimum,
        Math.max(100, turbulentMinimum * 2),
        { minimum: turbulentMinimum },
      );
    } else {
      throw transitionRangeError();
    }
    airflowCfm = airflowFromVelocityAndDiameter(velocityFpm, diameterIn);
  }

  if (
    airflowCfm === undefined ||
    velocityFpm === undefined ||
    diameterIn === undefined
  ) {
    throw new RangeError('This pair of duct values could not be solved.');
  }

  frictionRate = ductFrictionRate(velocityFpm, diameterIn, conditions);
  const reynolds = ductReynolds(velocityFpm, diameterIn, conditions.densityLbFt3);
  const frictionFactor = ductFrictionFactor(reynolds, diameterIn, conditions.roughnessFt);

  return { airflowCfm, frictionRate, velocityFpm, diameterIn, reynolds, frictionFactor };
}

export function equivalentRoundDiameter(width: number, height: number): number {
  requirePositive(width, 'Width');
  requirePositive(height, 'Height');
  return 1.3 * (width * height) ** 0.625 / (width + height) ** 0.25;
}

const STANDARD_RECTANGULAR_SIDES = [
  4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48,
  52, 56, 60, 64, 68, 72, 76, 80, 84, 88, 92, 96,
];

export const MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT = 10;

export function promoteDuctInput(
  order: DuctField[],
  field: DuctField,
): DuctField[] {
  return [...order.filter((item) => item !== field).slice(-1), field];
}

export function rectangularEquivalents(
  diameterIn: number,
  airflowCfm: number,
  limit = 6,
): RectangularEquivalent[] {
  requirePositive(diameterIn, 'Diameter');
  requirePositive(airflowCfm, 'Airflow');
  if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('Limit must be a positive integer.');

  const candidates: RectangularEquivalent[] = [];
  const targetFrictionRate = ductFrictionRate(
    velocityFromAirflowAndDiameter(airflowCfm, diameterIn),
    diameterIn,
  );
  for (const heightIn of STANDARD_RECTANGULAR_SIDES) {
    for (const widthIn of STANDARD_RECTANGULAR_SIDES) {
      if (widthIn < heightIn || widthIn / heightIn > 4) continue;
      const equivalentDiameterIn = equivalentRoundDiameter(widthIn, heightIn);
      const differencePercent = (equivalentDiameterIn - diameterIn) / diameterIn * 100;
      const equivalentFrictionRate = ductFrictionRate(
        velocityFromAirflowAndDiameter(airflowCfm, equivalentDiameterIn),
        equivalentDiameterIn,
      );
      const frictionDifferencePercent =
        (equivalentFrictionRate / targetFrictionRate - 1) * 100;
      if (Math.abs(frictionDifferencePercent) > MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT) continue;
      candidates.push({
        widthIn,
        heightIn,
        equivalentDiameterIn,
        velocityFpm: 144 * airflowCfm / (widthIn * heightIn),
        differencePercent,
        frictionDifferencePercent,
        aspectRatio: widthIn / heightIn,
      });
    }
  }

  candidates.sort((left, right) => (
    Math.abs(left.frictionDifferencePercent) - Math.abs(right.frictionDifferencePercent) ||
    left.aspectRatio - right.aspectRatio ||
    left.widthIn * left.heightIn - right.widthIn * right.heightIn
  ));

  const selected: RectangularEquivalent[] = [];
  for (const candidate of candidates) {
    const sameShape = selected.some((item) => Math.abs(item.aspectRatio - candidate.aspectRatio) < 0.16);
    if (!sameShape || selected.length < 2) selected.push(candidate);
    if (selected.length === limit) break;
  }
  if (selected.length < limit) {
    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
      if (selected.length === limit) break;
    }
  }

  return selected.sort((left, right) => left.aspectRatio - right.aspectRatio);
}

export function imperialToDisplayValue(
  field: DuctField,
  value: number,
  system: DuctUnitSystem,
): number {
  if (system === 'imperial') return value;
  if (field === 'airflowCfm') return value * DUCT_CONVERSIONS.cfmToLitersPerSecond;
  if (field === 'frictionRate') return value * DUCT_CONVERSIONS.inWgPer100FtToPascalPerMeter;
  if (field === 'velocityFpm') return value * DUCT_CONVERSIONS.fpmToMetersPerSecond;
  return value * DUCT_CONVERSIONS.inchToMillimeter;
}

export function displayToImperialValue(
  field: DuctField,
  value: number,
  system: DuctUnitSystem,
): number {
  if (system === 'imperial') return value;
  if (field === 'airflowCfm') return value / DUCT_CONVERSIONS.cfmToLitersPerSecond;
  if (field === 'frictionRate') return value / DUCT_CONVERSIONS.inWgPer100FtToPascalPerMeter;
  if (field === 'velocityFpm') return value / DUCT_CONVERSIONS.fpmToMetersPerSecond;
  return value / DUCT_CONVERSIONS.inchToMillimeter;
}

/** Preserve manual values through repeated Imperial ⇄ SI input toggles. */
export function formatDuctConvertedInput(value: number): string {
  return Number(value.toPrecision(12)).toString();
}
