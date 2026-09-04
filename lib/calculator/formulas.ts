import {
  CalcError,
  CalcValue,
  Preferences,
  degrees,
  scalar,
  withUnit,
} from './core';

export interface NamedResult {
  label: string;
  value: CalcValue;
  note?: string;
}

export interface TriangleValues {
  x?: number;
  y?: number;
  r?: number;
  theta?: number;
}

export interface FanRegisters {
  a?: number;
  aNew?: number;
  b?: number;
  bNew?: number;
}

export interface CircleValues {
  radius?: number;
  diameter?: number;
  arcDegrees?: number;
  arcLength?: number;
  chord?: number;
  rise?: number;
  height?: number;
}

const MAX_ENUMERATED_MEMBERS = 10_000;

function lengthValue(inches: number, unit: CalcValue['unit'] = 'auto'): CalcValue {
  return { amount: inches, power: 1, unit, system: unit === 'm' || unit === 'mm' ? 'metric' : 'imperial' };
}

function areaValue(squareInches: number, system: CalcValue['system'] = 'imperial'): CalcValue {
  return { amount: squareInches, power: 2, unit: 'auto', system };
}

function volumeValue(cubicInches: number, system: CalcValue['system'] = 'imperial'): CalcValue {
  return { amount: cubicInches, power: 3, unit: 'auto', system };
}

export function solveRightTriangle(values: TriangleValues): Required<TriangleValues> {
  const { x, y, r, theta } = values;
  const known = [x, y, r, theta].filter((value) => value !== undefined).length;
  if (known < 2) throw new CalcError('ENT Error');

  const sides = [x, y, r].filter((value): value is number => value !== undefined);
  if (
    sides.some((value) => !Number.isFinite(value) || value <= 0) ||
    (theta !== undefined && (!Number.isFinite(theta) || theta <= 0 || theta >= 90))
  ) {
    throw new CalcError('ENT Error');
  }

  const rad = theta === undefined ? undefined : theta * Math.PI / 180;
  let solved: Required<TriangleValues>;
  if (x !== undefined && y !== undefined) {
    solved = {
      x,
      y,
      r: Math.hypot(x, y),
      theta: Math.atan2(y, x) * 180 / Math.PI,
    };
  } else if (x !== undefined && r !== undefined) {
    if (x >= r) throw new CalcError('ENT Error');
    solved = {
      x,
      y: Math.sqrt(r ** 2 - x ** 2),
      r,
      theta: Math.acos(x / r) * 180 / Math.PI,
    };
  } else if (y !== undefined && r !== undefined) {
    if (y >= r) throw new CalcError('ENT Error');
    solved = {
      x: Math.sqrt(r ** 2 - y ** 2),
      y,
      r,
      theta: Math.asin(y / r) * 180 / Math.PI,
    };
  } else if (x !== undefined && rad !== undefined) {
    solved = { x, y: x * Math.tan(rad), r: x / Math.cos(rad), theta: theta! };
  } else if (y !== undefined && rad !== undefined) {
    solved = { x: y / Math.tan(rad), y, r: y / Math.sin(rad), theta: theta! };
  } else if (r !== undefined && rad !== undefined) {
    solved = { x: r * Math.cos(rad), y: r * Math.sin(rad), r, theta: theta! };
  } else {
    throw new CalcError('ENT Error');
  }

  if (
    Object.values(solved).some((value) => !Number.isFinite(value) || value <= 0) ||
    solved.theta >= 90
  ) {
    throw new CalcError('ENT Error');
  }

  const matches = (actual: number, expected: number) => (
    Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(actual), Math.abs(expected))
  );
  for (const key of ['x', 'y', 'r', 'theta'] as const) {
    const supplied = values[key];
    if (supplied !== undefined && !matches(supplied, solved[key])) {
      throw new CalcError('ENT Error');
    }
  }

  return solved;
}

export function pitchCycle(values: TriangleValues): NamedResult[] {
  const solved = solveRightTriangle(values);
  const slope = solved.y / solved.x;
  return [
    { label: 'PTCH', value: lengthValue(slope * 12, 'in') },
    { label: '∠θ', value: degrees(Math.atan(slope) * 180 / Math.PI) },
    { label: '%GRD', value: scalar(slope * 100) },
    { label: 'SLP', value: scalar(slope) },
  ];
}

export function diagonalCycle(values: TriangleValues): NamedResult[] {
  const solved = solveRightTriangle(values);
  return [
    { label: 'R', value: lengthValue(solved.r) },
    { label: 'PLMB', value: degrees(solved.theta) },
    { label: 'LEVL', value: degrees(90 - solved.theta) },
  ];
}

export function lawOfCosines(a: number, b: number, c: number): NamedResult[] {
  if (
    ![a, b, c].every((side) => Number.isFinite(side) && side > 0)
    || a + b <= c || a + c <= b || b + c <= a
  ) {
    throw new CalcError('ENT Error');
  }
  const angle = (opposite: number, side1: number, side2: number) => {
    const cosine = (side1 ** 2 + side2 ** 2 - opposite ** 2) / (2 * side1 * side2);
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  };
  const semi = (a + b + c) / 2;
  const area = Math.sqrt(semi * (semi - a) * (semi - b) * (semi - c));
  return [
    { label: '∠A', value: degrees(angle(a, b, c)) },
    { label: '∠B', value: degrees(angle(b, a, c)) },
    { label: '∠C', value: degrees(angle(c, a, b)) },
    { label: 'AREA', value: areaValue(area) },
    { label: 'a', value: lengthValue(a) },
    { label: 'b', value: lengthValue(b) },
    { label: 'c', value: lengthValue(c) },
  ];
}

export function offsetResults(x: number, y: number, endA: number): NamedResult[] {
  if (x <= 0 || y <= 0 || endA < 0) throw new CalcError('ENT Error');
  const slant = Math.hypot(x, y);
  const theta = Math.atan2(y, x) * 180 / Math.PI;
  const centerline = slant ** 2 / (4 * y);
  const wrapper = centerline * (Math.PI / 180) * 4 * theta;
  const heel = centerline + endA / 2;
  const throat = centerline - endA / 2;
  if (throat < 0) throw new CalcError('THRT Error');
  return [
    { label: 'RAD', value: lengthValue(centerline) },
    { label: 'WL', value: lengthValue(wrapper) },
    { label: 'HEEL', value: lengthValue(heel) },
    { label: 'THRT', value: lengthValue(throat) },
    { label: 'THET', value: degrees(theta) },
    { label: 'X', value: lengthValue(x) },
    { label: 'Y', value: lengthValue(y) },
    { label: 'A STORED', value: lengthValue(endA) },
  ];
}

export function solveFanLaw(
  law: 1 | 2 | 3,
  registers: FanRegisters,
): { registers: Required<FanRegisters>; result: NamedResult } {
  const keys = ['a', 'aNew', 'b', 'bNew'] as const;
  const supplied = keys.filter((key) => registers[key] !== undefined && registers[key] !== 0);
  if (supplied.some((key) => !Number.isFinite(registers[key]) || registers[key]! < 0)) {
    throw new CalcError('ENT Error');
  }
  const missing = keys.filter((key) => registers[key] === undefined || registers[key] === 0);
  if (missing.length !== 1) throw new CalcError('ENT Error');
  const output = { ...registers } as Required<FanRegisters>;
  const exponent = law;
  const key = missing[0];
  const { a, aNew, b, bNew } = output;

  if (key === 'aNew') output.aNew = a * (bNew / b) ** (1 / exponent);
  if (key === 'a') output.a = aNew / (bNew / b) ** (1 / exponent);
  if (key === 'bNew') output.bNew = b * (aNew / a) ** exponent;
  if (key === 'b') output.b = bNew / (aNew / a) ** exponent;

  const labels = {
    a: 'CFM FAN LAW',
    aNew: 'CFMn FAN LAW',
    b: law === 1 ? 'RPM FAN LAW' : law === 2 ? 'SP FAN LAW' : 'BHP FAN LAW',
    bNew: law === 1 ? 'RPMn FAN LAW' : law === 2 ? 'SPn FAN LAW' : 'BHPn FAN LAW',
  };
  const value = output[key];
  if (!Number.isFinite(value) || value <= 0) throw new CalcError('ENT Error');
  return { registers: output, result: { label: `${labels[key]} ${law}`, value: scalar(value) } };
}

export function velocityPressureResults(input: number): NamedResult[] {
  if (!Number.isFinite(input) || input < 0) throw new CalcError('ENT Error');
  return [
    { label: 'FPM', value: scalar(4005 * Math.sqrt(input)) },
    { label: 'VP', value: scalar((input / 4005) ** 2) },
    { label: 'MPS', value: scalar(1.3 * Math.sqrt(input)) },
    { label: 'KPA', value: scalar((input / 1.3) ** 2) },
    { label: 'ENTRY', value: scalar(input) },
  ];
}

export function segmentRadius(chord: number, rise: number): number {
  if (chord <= 0 || rise <= 0) throw new CalcError('ENT Error');
  return (chord ** 2 + 4 * rise ** 2) / (8 * rise);
}

export function segmentChord(radius: number, rise: number): number {
  if (radius <= 0 || rise < 0 || rise > 2 * radius) throw new CalcError('ENT Error');
  return 2 * Math.sqrt(2 * radius * rise - rise ** 2);
}

export function segmentRise(radius: number, chord: number): number {
  if (radius <= 0 || chord < 0 || chord > 2 * radius) throw new CalcError('ENT Error');
  return radius - Math.sqrt(radius ** 2 - (chord / 2) ** 2);
}

export function circleResults(circle: CircleValues): NamedResult[] {
  const radius = circle.radius ?? (circle.diameter === undefined ? undefined : circle.diameter / 2);
  if (!radius || radius <= 0) throw new CalcError('ENT Error');
  return [
    { label: 'DIA', value: lengthValue(radius * 2) },
    { label: 'CIRC', value: lengthValue(2 * Math.PI * radius) },
    { label: 'AREA', value: areaValue(Math.PI * radius ** 2) },
  ];
}

export function arcResults(circle: CircleValues, onCenter = 16): NamedResult[] {
  const radius = circle.radius ?? (circle.diameter === undefined ? undefined : circle.diameter / 2);
  if (!radius || radius <= 0 || !Number.isFinite(radius) || !Number.isFinite(onCenter) || onCenter <= 0) {
    throw new CalcError('ENT Error');
  }
  let theta = circle.arcDegrees;
  let arcLength = circle.arcLength;
  if (theta === undefined && arcLength === undefined) throw new CalcError('ENT Error');
  if (theta === undefined) theta = arcLength! / radius * 180 / Math.PI;
  if (arcLength === undefined) arcLength = radius * theta * Math.PI / 180;
  if (!Number.isFinite(theta) || !Number.isFinite(arcLength) || theta <= 0 || theta > 360 || arcLength <= 0) {
    throw new CalcError('ENT Error');
  }
  const radians = theta * Math.PI / 180;
  const chord = 2 * radius * Math.sin(radians / 2);
  const segmentArea = radius ** 2 / 2 * (radians - Math.sin(radians));
  const sectorArea = radius ** 2 * radians / 2;
  const rise = radius * (1 - Math.cos(radians / 2));
  const results: NamedResult[] = [
    { label: 'ARC', value: circle.arcDegrees === undefined ? degrees(theta) : lengthValue(arcLength) },
    { label: 'CORD', value: lengthValue(chord) },
    { label: 'SEG', value: areaValue(segmentArea) },
    { label: 'PIE', value: areaValue(sectorArea) },
    { label: 'RISE', value: lengthValue(rise) },
    { label: 'OC', value: lengthValue(onCenter, 'in') },
  ];
  const halfChord = chord / 2;
  const baseline = radius - rise;
  const wallCount = Math.max(0, Math.ceil(halfChord / onCenter) - 1);
  if (wallCount > MAX_ENUMERATED_MEMBERS) throw new CalcError('0-fL0');
  for (let offset = onCenter, index = 1; offset < halfChord; offset += onCenter, index += 1) {
    const height = Math.max(0, Math.sqrt(radius ** 2 - offset ** 2) - baseline);
    results.push({ label: `AW${index}`, value: lengthValue(height) });
  }
  return results;
}

export function columnConeResults(radius: number, height: number): NamedResult[] {
  if (!Number.isFinite(radius) || !Number.isFinite(height) || radius <= 0 || height <= 0) {
    throw new CalcError('ENT Error');
  }
  const slant = Math.hypot(radius, height);
  return [
    { label: 'COL', value: volumeValue(Math.PI * radius ** 2 * height) },
    { label: 'COL AREA', value: areaValue(2 * Math.PI * radius * height + 2 * Math.PI * radius ** 2) },
    { label: 'CONE', value: volumeValue(Math.PI * radius ** 2 * height / 3) },
    { label: 'CONE AREA', value: areaValue(Math.PI * radius * slant + Math.PI * radius ** 2) },
  ];
}

export function hipValleyResults(
  run: number,
  slope: number,
  irregularSlope?: number,
): NamedResult[] {
  if (
    run <= 0 || slope <= 0 || !Number.isFinite(run) || !Number.isFinite(slope)
    || (irregularSlope !== undefined && (!Number.isFinite(irregularSlope) || irregularSlope <= 0))
  ) throw new CalcError('ENT Error');
  const rise = run * slope;
  const oppositeRun = irregularSlope ? rise / irregularSlope : run;
  const plan = Math.hypot(run, oppositeRun);
  const length = Math.hypot(plan, rise);
  const plumb = Math.atan2(rise, plan) * 180 / Math.PI;
  const cheek1 = Math.atan2(oppositeRun, run) * 180 / Math.PI;
  const results: NamedResult[] = [
    { label: irregularSlope ? 'IH/V' : 'H/V', value: lengthValue(length) },
    { label: 'PLMB', value: degrees(plumb) },
    { label: 'LEVL', value: degrees(90 - plumb) },
    { label: 'CHK1', value: degrees(cheek1) },
  ];
  if (irregularSlope) results.push({ label: 'CHK2', value: degrees(90 - cheek1) });
  return results;
}

export function jackRafterResults(
  run: number,
  slope: number,
  preferences: Preferences,
  irregularSlope?: number,
  irregularFirst = false,
): NamedResult[] {
  if (
    run <= 0 || slope <= 0 || !Number.isFinite(run) || !Number.isFinite(slope)
    || !Number.isFinite(preferences.onCenter) || preferences.onCenter <= 0
    || (irregularSlope !== undefined && (!Number.isFinite(irregularSlope) || irregularSlope <= 0))
  ) throw new CalcError('ENT Error');
  const rise = run * slope;
  const oppositeRun = irregularSlope ? rise / irregularSlope : run;
  const makeSide = (
    sideRun: number,
    otherRun: number,
    sideSlope: number,
    prefix: 'JK' | 'IJ',
    cheek: number,
  ): NamedResult[] => {
    const spacingBasis = irregularSlope && preferences.irregularJackMode === 'mate'
      ? oppositeRun
      : otherRun;
    const decrement = preferences.onCenter * sideRun / spacingBasis;
    const values: NamedResult[] = [];
    if (!Number.isFinite(decrement) || decrement <= 0) throw new CalcError('ENT Error');
    const jackCount = Math.ceil(sideRun / decrement);
    if (jackCount > MAX_ENUMERATED_MEMBERS) throw new CalcError('0-fL0');
    for (let index = 1; ; index += 1) {
      const horizontal = Math.max(0, sideRun - index * decrement);
      values.push({ label: `${prefix}${index}`, value: lengthValue(horizontal * Math.sqrt(1 + sideSlope ** 2)) });
      if (horizontal === 0) break;
    }
    if (preferences.jackOrder === 'ascending') values.reverse();
    const pitchAngle = Math.atan(sideSlope) * 180 / Math.PI;
    values.push(
      { label: 'PLMB', value: degrees(pitchAngle) },
      { label: 'LEVL', value: degrees(90 - pitchAngle) },
      { label: 'CHK1', value: degrees(cheek) },
    );
    return values;
  };

  const regularCheek = Math.atan2(oppositeRun, run) * 180 / Math.PI;
  const regular = makeSide(run, oppositeRun, slope, 'JK', irregularSlope ? 90 - regularCheek : 45);
  if (!irregularSlope) {
    return [{ label: 'JKOC', value: lengthValue(preferences.onCenter, 'in') }, ...regular];
  }
  const irregular = makeSide(oppositeRun, run, irregularSlope, 'IJ', regularCheek);
  const regularOc = { label: 'JKOC', value: lengthValue(preferences.onCenter, 'in') };
  const irregularOc = { label: 'IJOC', value: lengthValue(preferences.onCenter, 'in') };
  return irregularFirst
    ? [irregularOc, ...irregular, regularOc, ...regular]
    : [regularOc, ...regular, irregularOc, ...irregular];
}

export function stairResults(
  rise: number | undefined,
  run: number | undefined,
  preferences: Preferences,
): NamedResult[] {
  if (rise === undefined && run === undefined) throw new CalcError('ERROR');
  if ((rise !== undefined && (!Number.isFinite(rise) || rise <= 0)) ||
      (run !== undefined && (!Number.isFinite(run) || run <= 0))) {
    throw new CalcError('DIM Error');
  }
  let risers: number;
  let treads: number;
  let actualRiser: number;
  let actualTread: number;

  if (rise !== undefined) {
    risers = Math.max(1, Math.round(rise / preferences.desiredRiser));
    treads = Math.max(0, risers - 1);
    actualRiser = rise / risers;
  } else {
    treads = Math.max(1, Math.round(run! / preferences.treadWidth));
    risers = treads + 1;
    actualRiser = preferences.desiredRiser;
    rise = risers * actualRiser;
  }
  if (risers < 2 || treads < 1) throw new CalcError('DIM Error');

  if (run !== undefined) {
    actualTread = treads ? run / treads : 0;
  } else {
    actualTread = preferences.treadWidth;
    run = treads * actualTread;
  }

  const denominator = preferences.fractionDenominator;
  const roundedRiser = Math.round(actualRiser * denominator) / denominator;
  const roundedTread = Math.round(actualTread * denominator) / denominator;
  const riserOver = roundedRiser * risers - rise;
  const treadOver = roundedTread * treads - run;
  const opening = (preferences.headroom + preferences.floorThickness) * roundedTread / roundedRiser;
  const stringer = treads * Math.hypot(roundedRiser, roundedTread);
  const incline = Math.atan2(roundedRiser, roundedTread) * 180 / Math.PI;
  const desiredRatio = preferences.desiredRiser / preferences.treadWidth;
  const actualRatio = roundedRiser / roundedTread;
  const warningNote = Math.abs(actualRatio / desiredRatio - 1) > 0.1
    ? 'Steep/atypical stair ratio'
    : undefined;

  const results: NamedResult[] = [
    { label: 'R-HT', value: lengthValue(roundedRiser, 'in') },
    { label: 'RSRS', value: scalar(risers) },
    { label: 'R+/−', value: lengthValue(riserOver, 'in') },
    { label: 'T-WD', value: lengthValue(roundedTread, 'in') },
    { label: 'TRDS', value: scalar(treads) },
    { label: 'T+/−', value: lengthValue(treadOver, 'in') },
    { label: 'OPEN', value: lengthValue(opening) },
    { label: 'STRG', value: lengthValue(stringer) },
    { label: 'INCL', value: degrees(incline) },
    { label: 'RUN', value: lengthValue(run) },
    { label: 'RISE', value: lengthValue(rise) },
    { label: 'R-HT STORED', value: lengthValue(preferences.desiredRiser, 'in') },
    { label: 'T-WD STORED', value: lengthValue(preferences.treadWidth, 'in') },
    { label: 'HDRM STORED', value: lengthValue(preferences.headroom, 'ft-in') },
    { label: 'FLOR STORED', value: lengthValue(preferences.floorThickness, 'in') },
  ];
  return results.map((result) => ({ ...result, note: warningNote }));
}

export function convertDms(value: number, toDecimal: boolean): number {
  if (toDecimal) {
    const degreesPart = Math.trunc(value);
    const remainder = Math.abs(value - degreesPart);
    const minutesAndSeconds = Math.round(remainder * 10_000);
    const minutes = Math.trunc(minutesAndSeconds / 100);
    const seconds = minutesAndSeconds % 100;
    return Math.sign(value || 1) * (Math.abs(degreesPart) + minutes / 60 + seconds / 3600);
  }
  const absolute = Math.abs(value);
  const roundedSeconds = Math.round(absolute * 3600);
  const degreesPart = Math.trunc(roundedSeconds / 3600);
  const remainingSeconds = roundedSeconds % 3600;
  const minutes = Math.trunc(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return Math.sign(value || 1) * (degreesPart + minutes / 100 + seconds / 10_000);
}

export function convertUnit(value: CalcValue, unit: CalcValue['unit']): CalcValue {
  if (value.power === 0) throw new CalcError('DIM Error');
  return withUnit(value, unit);
}
