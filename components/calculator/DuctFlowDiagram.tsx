'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  type DuctField,
  type DuctSolution,
  type DuctUnitSystem,
  imperialToDisplayValue,
  MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
  MIN_RECTANGULAR_EQUIVALENT_REYNOLDS,
  rectangularEquivalents,
} from '@/lib/calculator/duct';

export type DuctDiagramStatus = 'entered' | 'expected' | 'calculated' | 'unavailable';

export interface DuctDiagramMetric {
  field: DuctField;
  label: string;
  symbol: string;
  status: DuctDiagramStatus;
  value?: string;
  displayValue?: string;
  unit: string;
}

export interface DuctDiagramView {
  metrics: Record<DuctField, DuctDiagramMetric>;
  rectangle: {
    status: 'expected' | 'calculated' | 'unavailable';
    unavailableReason?: 'low-flow' | 'catalog';
    value?: string;
    width?: number;
    height?: number;
    unit?: string;
    aspectRatio?: number;
    frictionDifferencePercent?: number;
    frictionDeltaText?: string;
    frictionTolerancePercent: number;
  };
  progressText: string;
  ariaText: string;
}

interface DuctDiagramOptions {
  manualOrder: readonly DuctField[];
  rawValues: Readonly<Partial<Record<DuctField, string>>>;
  solution?: DuctSolution;
  unitSystem: DuctUnitSystem;
  error?: string;
}

interface DuctFlowDiagramProps extends DuctDiagramOptions {
  className?: string;
}

const FIELD_ORDER: readonly DuctField[] = [
  'airflowCfm',
  'velocityFpm',
  'diameterIn',
  'frictionRate',
];

const MAX_DISPLAY_VALUE_CHARACTERS: Record<DuctField, number> = {
  airflowCfm: 9,
  velocityFpm: 8,
  diameterIn: 7,
  frictionRate: 7,
};

const FIELD_META: Record<DuctField, {
  label: string;
  symbol: string;
  imperialUnit: string;
  siUnit: string;
  fractionDigits: number;
}> = {
  airflowCfm: {
    label: 'Air flow',
    symbol: 'Q',
    imperialUnit: 'CFM',
    siUnit: 'L/s',
    fractionDigits: 1,
  },
  velocityFpm: {
    label: 'Velocity',
    symbol: 'V',
    imperialUnit: 'FPM',
    siUnit: 'm/s',
    fractionDigits: 1,
  },
  diameterIn: {
    label: 'Round diameter',
    symbol: 'ØD',
    imperialUnit: 'in',
    siUnit: 'mm',
    fractionDigits: 1,
  },
  frictionRate: {
    label: 'Friction loss',
    symbol: 'ΔP',
    imperialUnit: 'in.wg/100ft',
    siUnit: 'Pa/m',
    fractionDigits: 3,
  },
};

const STATUS_META: Record<DuctDiagramStatus, {
  marker: string;
  word: string;
  color: string;
}> = {
  entered: { marker: '●', word: 'entered', color: '#0a84ff' },
  expected: { marker: '?', word: 'expected', color: '#a1a1a6' },
  calculated: { marker: '✓', word: 'calculated', color: '#30d158' },
  unavailable: { marker: '—', word: 'not available', color: '#ff9f0a' },
};

const figureStyle: CSSProperties = {
  margin: '8px 0',
  padding: '8px 10px 7px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16,
  background: 'rgba(255,255,255,0.045)',
  color: '#f5f5f7',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
};

const captionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 2,
  fontSize: 12,
  lineHeight: 1.2,
};

function formatDiagramNumber(value: number, maximumFractionDigits: number): string {
  if (
    value !== 0
    && maximumFractionDigits > 0
    && Math.abs(value) < 10 ** -maximumFractionDigits
  ) {
    return value
      .toExponential(2)
      .replace(/\.0+(?=e)/, '')
      .replace(/(\.\d*?)0+(?=e)/, '$1')
      .replace('e-', 'e−')
      .replace('e+', 'e+');
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    useGrouping: true,
  }).format(value);
}

function boundedDiagramValue(value: string, maximumCharacters: number): string {
  const compact = value.replace(/\s+/g, ' ');
  if (compact.length <= maximumCharacters) return compact;
  return `${compact.slice(0, Math.max(1, maximumCharacters - 1))}…`;
}

function formatSignedPercent(value: number): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}${formatDiagramNumber(Math.abs(value), 1)}%`;
}

function metricUnit(field: DuctField, unitSystem: DuctUnitSystem): string {
  const meta = FIELD_META[field];
  return unitSystem === 'imperial' ? meta.imperialUnit : meta.siUnit;
}

function metricValue(
  field: DuctField,
  status: DuctDiagramStatus,
  options: DuctDiagramOptions,
): string | undefined {
  if (status === 'entered') {
    const raw = options.rawValues[field]?.trim();
    return raw || undefined;
  }
  if (status !== 'calculated' || !options.solution) return undefined;
  return formatDiagramNumber(
    imperialToDisplayValue(field, options.solution[field], options.unitSystem),
    FIELD_META[field].fractionDigits,
  );
}

export function buildDuctDiagramView(options: DuctDiagramOptions): DuctDiagramView {
  const manualFields = new Set(options.manualOrder);
  const metrics = Object.fromEntries(FIELD_ORDER.map((field) => {
    const status: DuctDiagramStatus = manualFields.has(field)
      ? 'entered'
      : options.solution
        ? 'calculated'
        : 'expected';
    const meta = FIELD_META[field];
    const value = metricValue(field, status, options);
    return [field, {
      field,
      label: meta.label,
      symbol: meta.symbol,
      status,
      value,
      displayValue: value
        ? boundedDiagramValue(value, MAX_DISPLAY_VALUE_CHARACTERS[field])
        : undefined,
      unit: metricUnit(field, options.unitSystem),
    } satisfies DuctDiagramMetric];
  })) as Record<DuctField, DuctDiagramMetric>;

  const equivalent = options.solution
    ? rectangularEquivalents(options.solution.diameterIn, options.solution.airflowCfm)[0]
    : undefined;
  const equivalentUnavailableReason = options.solution && !equivalent
    ? options.solution.reynolds < MIN_RECTANGULAR_EQUIVALENT_REYNOLDS
      ? 'low-flow' as const
      : 'catalog' as const
    : undefined;
  const rectangleUnit = options.unitSystem === 'imperial' ? 'in' : 'mm';
  const rectangleScale = options.unitSystem === 'imperial' ? 1 : 25.4;
  const rectangleWidth = equivalent
    ? equivalent.widthIn * rectangleScale
    : undefined;
  const rectangleHeight = equivalent
    ? equivalent.heightIn * rectangleScale
    : undefined;
  const rectangleValue = equivalent
    ? `${formatDiagramNumber(equivalent.widthIn * rectangleScale, 0)} × ${formatDiagramNumber(equivalent.heightIn * rectangleScale, 0)} ${rectangleUnit}`
    : undefined;

  const progressText = options.error
    ? 'Check the two entered values'
    : options.solution
      ? '2/2 inputs · solved'
      : options.manualOrder.length === 1
        ? '1/2 inputs · choose one more'
        : '0/2 inputs · choose any two';

  const metricDescription = FIELD_ORDER.map((field) => {
    const metric = metrics[field];
    const value = metric.value ? ` ${metric.value} ${metric.unit}` : '';
    return `${metric.label}, ${metric.symbol}:${value || ' no value'}, ${STATUS_META[metric.status].word}.`;
  }).join(' ');
  const rectangleDescription = rectangleValue && equivalent
    ? `Equivalent rectangular duct: ${rectangleValue}, calculated. It carries the same airflow · ΔP within ±${MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT}%; actual friction change ${formatSignedPercent(equivalent.frictionDifferencePercent)}.`
    : options.solution
      ? equivalentUnavailableReason === 'low-flow'
        ? 'Rectangular equivalence is not shown for laminar or transitional flow; verify this nonstandard low-flow application.'
        : 'No built-in standard rectangular match is within the allowed friction range.'
      : `Equivalent rectangular size will appear after the round duct is solved. A candidate must carry the same airflow with friction within ±${MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT}%.`;

  return {
    metrics,
    rectangle: {
      status: rectangleValue ? 'calculated' : options.solution ? 'unavailable' : 'expected',
      unavailableReason: equivalentUnavailableReason,
      value: rectangleValue,
      width: rectangleWidth,
      height: rectangleHeight,
      unit: equivalent ? rectangleUnit : undefined,
      aspectRatio: equivalent?.aspectRatio,
      frictionDifferencePercent: equivalent?.frictionDifferencePercent,
      frictionDeltaText: equivalent
        ? formatSignedPercent(equivalent.frictionDifferencePercent)
        : undefined,
      frictionTolerancePercent: MAX_RECTANGULAR_FRICTION_DIFFERENCE_PERCENT,
    },
    progressText,
    ariaText: `Round duct flow diagram. ${metricDescription} ${rectangleDescription}${options.error ? ` ${options.error}` : ''}`,
  };
}

function MetricText({
  metric,
  x,
  y,
  anchor = 'start',
  maximumWidth,
}: {
  metric: DuctDiagramMetric;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  maximumWidth: number;
}) {
  const status = STATUS_META[metric.status];
  const text = metric.displayValue
    ? `${status.marker} ${metric.symbol} ${metric.displayValue} ${metric.unit}`
    : `${status.marker} ${metric.symbol}`;
  const shouldFitWidth = text.length * 7.8 > maximumWidth;
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={status.color}
      fontSize="15.5"
      fontWeight="750"
      letterSpacing="-0.15"
      data-field={metric.field}
      data-status={metric.status}
      data-display-truncated={metric.displayValue !== metric.value || undefined}
      textLength={shouldFitWidth ? maximumWidth : undefined}
      lengthAdjust={shouldFitWidth ? 'spacingAndGlyphs' : undefined}
      data-text-fit={shouldFitWidth || undefined}
    >
      {text}
    </text>
  );
}

function DiagramGroup({ children, status }: {
  children: ReactNode;
  status: DuctDiagramStatus;
}) {
  const meta = STATUS_META[status];
  return (
    <g
      color={meta.color}
      opacity={status === 'expected' ? 0.72 : 1}
      strokeDasharray={status === 'expected' ? '6 5' : undefined}
    >
      {children}
    </g>
  );
}

export default function DuctFlowDiagram({ className, ...options }: DuctFlowDiagramProps) {
  const view = buildDuctDiagramView(options);
  const titleId = useId();
  const descriptionId = useId();
  const airflow = view.metrics.airflowCfm;
  const velocity = view.metrics.velocityFpm;
  const diameter = view.metrics.diameterIn;
  const friction = view.metrics.frictionRate;
  const rectangleStatus = view.rectangle.status;
  const rectangleMeta = STATUS_META[rectangleStatus];
  const rectangleAspectRatio = view.rectangle.aspectRatio ?? 2;
  const rectangleMaximumWidth = 142;
  const rectangleMaximumHeight = 58;
  const rectangleHeight = Math.min(rectangleMaximumHeight, rectangleMaximumWidth / rectangleAspectRatio);
  const rectangleWidth = rectangleHeight * rectangleAspectRatio;
  const rectangleCenterX = 337;
  const rectangleCenterY = 65;
  const rectangleX = rectangleCenterX - rectangleWidth / 2;
  const rectangleY = rectangleCenterY - rectangleHeight / 2;
  const rectangleUnavailable = rectangleStatus === 'unavailable';
  const rectangleHeading = rectangleUnavailable
    ? '— NO EQUIVALENT'
    : `${rectangleMeta.marker} EQUIVALENT`;
  const rectanglePrimary = rectangleUnavailable
    ? view.rectangle.unavailableReason === 'low-flow'
      ? 'LOW-FLOW RANGE'
      : 'NO CATALOG MATCH'
    : view.rectangle.value ?? 'W × H';
  const rectangleSecondary = rectangleUnavailable
    ? 'verify manually'
    : 'same airflow';
  const rectangleDetail = rectangleUnavailable
    ? view.rectangle.unavailableReason === 'low-flow'
      ? 'laminar / transition'
      : 'outside ±10%'
    : `ΔP ${view.rectangle.frictionDeltaText ? `${view.rectangle.frictionDeltaText} · ` : ''}within ±${view.rectangle.frictionTolerancePercent}%`;

  return (
    <figure
      className={className}
      style={figureStyle}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-duct-diagram="round-to-rectangular"
    >
      <figcaption id={titleId} style={captionStyle}>
        <strong style={{ fontSize: 13, letterSpacing: '-0.1px' }}>Flow relationship</strong>
        <span style={{ color: '#a1a1a6', textAlign: 'right' }}>{view.progressText}</span>
      </figcaption>

      <svg
        viewBox="0 0 420 166"
        width="100%"
        height="auto"
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block', maxHeight: 132 }}
      >
        <DiagramGroup status={airflow.status}>
          <ellipse cx="18" cy="59" rx="12" ry="29" fill="rgba(10,132,255,0.08)" stroke="currentColor" strokeWidth="3" />
          <path d="M18 30h112c12 0 21 13 21 29s-9 29-21 29H18" fill="rgba(255,255,255,0.025)" stroke="currentColor" strokeWidth="3" />
        </DiagramGroup>

        <DiagramGroup status={velocity.status}>
          <path d="M38 59h83" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="m113 50 12 9-12 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </DiagramGroup>
        <MetricText metric={airflow} x={35} y={48} maximumWidth={112} />
        <MetricText metric={velocity} x={35} y={80} maximumWidth={112} />

        <DiagramGroup status={friction.status}>
          <path d="M27 112h119" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="m27 112 9-5v10Zm119 0-9-5v10Z" fill="currentColor" stroke="none" />
        </DiagramGroup>
        <MetricText metric={friction} x={86} y={137} anchor="middle" maximumWidth={150} />

        <DiagramGroup status={diameter.status}>
          <circle cx="190" cy="59" r="30" fill="rgba(255,255,255,0.025)" stroke="currentColor" strokeWidth="3" />
          <path d="M190 31v56" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <path d="m190 30-5 9h10Zm0 58-5-9h10Z" fill="currentColor" stroke="none" />
        </DiagramGroup>
        <MetricText metric={diameter} x={190} y={113} anchor="middle" maximumWidth={74} />

        <text x="232" y="67" textAnchor="middle" fill="#d1d1d6" fontSize="25" fontWeight="650">≈</text>
        <g
          color={rectangleMeta.color}
          opacity={rectangleStatus === 'expected' ? 0.72 : rectangleUnavailable ? 0.82 : 1}
          strokeDasharray={rectangleStatus === 'calculated' ? undefined : '6 5'}
          data-status={rectangleStatus}
          data-shape="equivalent-rectangle"
          data-width={view.rectangle.width}
          data-height={view.rectangle.height}
          data-unit={view.rectangle.unit}
          data-aspect-ratio={view.rectangle.aspectRatio}
          data-friction-delta-percent={view.rectangle.frictionDifferencePercent}
        >
          <rect
            x={rectangleX}
            y={rectangleY}
            width={rectangleWidth}
            height={rectangleHeight}
            rx="6"
            fill="rgba(48,209,88,0.055)"
            stroke="currentColor"
            strokeWidth="3"
            data-rendered-aspect-ratio={rectangleWidth / rectangleHeight}
          />
          {rectangleUnavailable ? (
            <path
              d={`M${rectangleX + 11} ${rectangleY + 9} L${rectangleX + rectangleWidth - 11} ${rectangleY + rectangleHeight - 9} M${rectangleX + rectangleWidth - 11} ${rectangleY + 9} L${rectangleX + 11} ${rectangleY + rectangleHeight - 9}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          ) : null}
        </g>
        <text x="337" y="18" textAnchor="middle" fill={rectangleMeta.color} fontSize="14" fontWeight="750">
          {rectangleHeading}
        </text>
        <text x="337" y="116" textAnchor="middle" fill={rectangleMeta.color} fontSize="17" fontWeight="780">
          {rectanglePrimary}
        </text>
        <text x="337" y="139" textAnchor="middle" fill="#d1d1d6" fontSize="13" fontWeight="650">
          {rectangleSecondary}
        </text>
        <text x="337" y="158" textAnchor="middle" fill={view.rectangle.frictionDeltaText || rectangleUnavailable ? rectangleMeta.color : '#d1d1d6'} fontSize="12.5" fontWeight="700">
          {rectangleDetail}
        </text>
      </svg>

      <p id={descriptionId} className="visually-hidden">{view.ariaText}</p>
    </figure>
  );
}
