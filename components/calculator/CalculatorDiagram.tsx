import type {
  CalculatorDiagramMetric,
  CalculatorDiagramView,
} from '@/lib/calculator/presentation';

interface CalculatorDiagramProps {
  view: CalculatorDiagramView;
}

const STATUS_MARKER = {
  entered: '●',
  expected: '?',
  calculated: '✓',
} as const;

function metric(view: CalculatorDiagramView, id: string): CalculatorDiagramMetric {
  const found = view.metrics.find((item) => item.id === id);
  if (!found) {
    return {
      id,
      symbol: id,
      label: id,
      placeholder: 'after solve',
      status: 'expected',
      active: false,
    };
  }
  return found;
}

function metricClass(item: CalculatorDiagramMetric): string {
  return `diagram-status-${item.status} ${item.active ? 'is-current' : ''}`.trim();
}

function MetricLabel({
  item,
  x,
  y,
  anchor = 'middle',
}: {
  item: CalculatorDiagramMetric;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
}) {
  const detail = item.value && (item.status === 'entered' || item.active)
    ? item.value
    : item.active
      ? item.placeholder
      : undefined;
  return (
    <g className={`diagram-metric-label ${metricClass(item)}`} data-metric={item.id}>
      <text x={x} y={y} textAnchor={anchor}>
        <tspan className="diagram-status-marker">{STATUS_MARKER[item.status]}</tspan>
        <tspan>{` ${item.symbol}`}</tspan>
      </text>
      {detail ? (
        <text className="diagram-metric-value" x={x} y={y + 13} textAnchor={anchor}>
          {detail}
        </text>
      ) : null}
    </g>
  );
}

function TriangleDiagram({ view }: { view: CalculatorDiagramView }) {
  const x = metric(view, 'x');
  const y = metric(view, 'y');
  const r = metric(view, 'r');
  const theta = metric(view, 'theta');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <path className={`diagram-line ${metricClass(x)}`} d="M26 88 H148" />
      <path className={`diagram-line ${metricClass(y)}`} d="M148 88 V20" />
      <path className={`diagram-line ${metricClass(r)}`} d="M26 88 L148 20" />
      <path className="diagram-reference" d="M137 88 V77 H148" />
      <path className={`diagram-angle ${metricClass(theta)}`} d="M45 88 A19 19 0 0 0 42.6 78.8" />
      <MetricLabel item={r} x={87} y={40} />
      <MetricLabel item={theta} x={49} y={69} />
      <MetricLabel item={x} x={86} y={96} />
      <MetricLabel item={y} x={154} y={53} anchor="start" />
    </svg>
  );
}

function CircleDiagram({ view }: { view: CalculatorDiagramView }) {
  const diameter = metric(view, 'diameter');
  const radius = metric(view, 'radius');
  const circumference = metric(view, 'circumference');
  const area = metric(view, 'area');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <circle className={`diagram-area ${metricClass(area)}`} cx="90" cy="55" r="42" />
      <circle className={`diagram-line ${metricClass(circumference)}`} cx="90" cy="55" r="42" />
      <path className={`diagram-line ${metricClass(diameter)}`} d="M48 55 H132" />
      <path className={`diagram-line ${metricClass(radius)}`} d="M90 55 L119.7 25.3" />
      <circle className="diagram-center" cx="90" cy="55" r="2.4" />
      <MetricLabel item={circumference} x={90} y={9} />
      <MetricLabel item={diameter} x={90} y={64} />
      <MetricLabel item={radius} x={127} y={25} anchor="start" />
      <MetricLabel item={area} x={90} y={91} />
    </svg>
  );
}

export interface SegmentSvgGeometry {
  center: { x: number; y: number };
  radius: number;
  left: { x: number; y: number };
  right: { x: number; y: number };
  apex: { x: number; y: number };
  chordY: number;
  largeArc: 0 | 1;
  arcPath: string;
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildSegmentSvgGeometry(
  values: CalculatorDiagramView['geometry'] = {},
): SegmentSvgGeometry {
  let theta = values?.theta;
  if (
    (theta === undefined || !Number.isFinite(theta))
    && values?.radius
    && values.rise !== undefined
  ) {
    const cosine = (values.radius - values.rise) / values.radius;
    if (cosine >= -1 && cosine <= 1) theta = 2 * Math.acos(cosine) * 180 / Math.PI;
  }
  if (
    (theta === undefined || !Number.isFinite(theta))
    && values?.radius
    && values.chord !== undefined
  ) {
    const sine = values.chord / (2 * values.radius);
    if (sine >= -1 && sine <= 1) theta = 2 * Math.asin(sine) * 180 / Math.PI;
  }
  // A true-to-scale shallow segment can collapse to only a few pixels on a
  // phone (for example a 10 ft radius with a 3 ft chord). Keep the topology
  // mathematically consistent while applying a documented schematic minimum
  // sweep so chord, rise, radius, and arc remain distinguishable by touch-side
  // viewing. Numeric labels always retain the actual calculated values.
  const normalizedTheta = Math.min(355, Math.max(80, theta ?? 120));
  const isMajor = normalizedTheta > 180;
  const center = isMajor ? { x: 90, y: 72 } : { x: 90, y: 91 };
  const radius = isMajor ? 52 : 65;
  const halfAngle = normalizedTheta * Math.PI / 360;
  const horizontal = radius * Math.sin(halfAngle);
  const vertical = radius * Math.cos(halfAngle);
  const left = { x: rounded(center.x - horizontal), y: rounded(center.y - vertical) };
  const right = { x: rounded(center.x + horizontal), y: rounded(center.y - vertical) };
  const apex = { x: center.x, y: center.y - radius };
  const largeArc = normalizedTheta > 180 ? 1 : 0;
  return {
    center,
    radius,
    left,
    right,
    apex,
    chordY: left.y,
    largeArc,
    arcPath: `M${left.x} ${left.y} A${radius} ${radius} 0 ${largeArc} 1 ${right.x} ${right.y}`,
  };
}

function SegmentDiagram({ view }: { view: CalculatorDiagramView }) {
  const radius = metric(view, 'radius');
  const chord = metric(view, 'chord');
  const rise = metric(view, 'rise');
  const arc = metric(view, 'arc');
  const segmentArea = metric(view, 'segment-area');
  const sectorArea = metric(view, 'sector-area');
  const spacing = metric(view, 'spacing');
  const member = metric(view, 'member');
  const shape = buildSegmentSvgGeometry(view.geometry);
  const studXs = [0.15, 0.32, 0.5, 0.68, 0.85].map((ratio) => (
    shape.left.x + (shape.right.x - shape.left.x) * ratio
  ));
  const memberIndex = view.geometry?.memberIndex;
  const memberCount = Math.max(1, view.geometry?.memberCount ?? 1);
  const halfChord = Math.abs(view.geometry?.chord ?? 0) / 2;
  const memberRatio = memberIndex === undefined
    ? undefined
    : Math.min(0.96, Math.max(
        0.04,
        halfChord > 0 && view.geometry?.onCenter
          ? memberIndex * view.geometry.onCenter / halfChord
          : memberIndex / (memberCount + 1),
      ));
  const memberX = memberRatio === undefined
    ? undefined
    : shape.center.x + (shape.right.x - shape.center.x) * memberRatio;
  const memberTop = memberX === undefined
    ? undefined
    : shape.center.y - Math.sqrt(Math.max(0, shape.radius ** 2 - (memberX - shape.center.x) ** 2));
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      {sectorArea.active ? (
        <path
          data-area-kind="sector"
          className={`diagram-area ${metricClass(sectorArea)}`}
          d={`${shape.arcPath} L${shape.center.x} ${shape.center.y} Z`}
        />
      ) : null}
      {segmentArea.active ? (
        <path
          data-area-kind="segment"
          className={`diagram-area ${metricClass(segmentArea)}`}
          d={`${shape.arcPath} L${shape.left.x} ${shape.left.y} Z`}
        />
      ) : null}
      <path className={`diagram-line ${metricClass(arc)}`} d={shape.arcPath} />
      <path
        className={`diagram-line ${metricClass(chord)}`}
        d={`M${shape.left.x} ${shape.chordY} H${shape.right.x}`}
      />
      <path
        className={`diagram-line ${metricClass(rise)}`}
        d={`M${shape.center.x} ${shape.chordY} V${shape.apex.y}`}
      />
      <path
        className={`diagram-line ${metricClass(radius)}`}
        d={`M${shape.center.x} ${shape.center.y} L${shape.left.x} ${shape.left.y}`}
      />
      <circle className="diagram-center" cx={shape.center.x} cy={shape.center.y} r="2.3" />
      {view.variant === 'arc' ? (
        <g className={`diagram-studs ${metricClass(spacing)}`}>
          {studXs.map((x) => {
            const top = shape.center.y - Math.sqrt(Math.max(0, shape.radius ** 2 - (x - shape.center.x) ** 2));
            return <path key={x} d={`M${rounded(x)} ${shape.chordY} V${rounded(top)}`} />;
          })}
        </g>
      ) : null}
      {view.variant === 'arc' && memberX !== undefined && memberTop !== undefined ? (
        <path
          data-arc-member={`AW${memberIndex}`}
          className={`diagram-line ${metricClass(member)}`}
          d={`M${rounded(memberX)} ${shape.chordY} V${rounded(memberTop)}`}
        />
      ) : null}
      <MetricLabel item={arc} x={7} y={12} anchor="start" />
      <MetricLabel item={radius} x={7} y={64} anchor="start" />
      <MetricLabel item={rise} x={173} y={64} anchor="end" />
      <MetricLabel item={chord} x={90} y={112} />
      {view.variant === 'arc' && !member.active && (spacing.active || spacing.status === 'entered')
        ? <MetricLabel item={spacing} x={164} y={19} anchor="end" />
        : null}
      {segmentArea.active ? <MetricLabel item={segmentArea} x={90} y={59} /> : null}
      {sectorArea.active ? <MetricLabel item={sectorArea} x={90} y={59} /> : null}
      {member.active ? <MetricLabel item={member} x={164} y={19} anchor="end" /> : null}
    </svg>
  );
}

function OffsetDiagram({ view }: { view: CalculatorDiagramView }) {
  const x = metric(view, 'x');
  const y = metric(view, 'y');
  const a = metric(view, 'a');
  const radius = metric(view, 'radius');
  const wrapper = metric(view, 'wrapper');
  const heel = metric(view, 'heel');
  const throat = metric(view, 'throat');
  const theta = metric(view, 'theta');
  const activeCurve = [radius, wrapper, heel, throat].find((item) => item.active) ?? radius;
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <path className="diagram-reference" d="M19 83 H57 V99 H19 Z M123 13 H161 V29 H123 Z" />
      <path data-offset-element="wrapper" className={`diagram-line ${metricClass(wrapper)}`} d="M57 91 C78 91 79 21 123 21" />
      <path data-offset-element="throat" className={`diagram-line ${metricClass(throat)}`} d="M57 83 C70 83 76 13 123 13" />
      <path data-offset-element="heel" className={`diagram-line ${metricClass(heel)}`} d="M57 99 C86 99 84 29 123 29" />
      <path data-offset-element="radius" className={`diagram-dimension ${metricClass(radius)}`} d="M58 89 L78 61 M55 87 L61 92 M75 59 L81 64" />
      <path className={`diagram-dimension ${metricClass(x)}`} d="M58 104 H123 M58 101 V107 M123 101 V107" />
      <path className={`diagram-dimension ${metricClass(y)}`} d="M168 21 V91 M165 21 H171 M165 91 H171" />
      <path className={`diagram-dimension ${metricClass(a)}`} d="M14 83 V99 M11 83 H17 M11 99 H17" />
      <path className={`diagram-angle ${metricClass(theta)}`} d="M61 89 A18 18 0 0 1 73 77" />
      <MetricLabel item={activeCurve} x={91} y={45} />
      <MetricLabel item={theta} x={70} y={70} />
      <MetricLabel item={x} x={91} y={96} />
      <MetricLabel item={y} x={162} y={52} anchor="end" />
      <MetricLabel item={a} x={20} y={65} anchor="start" />
    </svg>
  );
}

function LawCosinesDiagram({ view }: { view: CalculatorDiagramView }) {
  const a = metric(view, 'a');
  const b = metric(view, 'b');
  const c = metric(view, 'c');
  const angleA = metric(view, 'angle-a');
  const angleB = metric(view, 'angle-b');
  const angleC = metric(view, 'angle-c');
  const area = metric(view, 'area');
  const activeAngle = [angleA, angleB, angleC].find((item) => item.active);
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <path className={`diagram-area ${metricClass(area)}`} d="M87 17 L153 88 H27 Z" />
      <path className={`diagram-line ${metricClass(a)}`} d="M87 17 L153 88" />
      <path className={`diagram-line ${metricClass(b)}`} d="M27 88 L87 17" />
      <path className={`diagram-line ${metricClass(c)}`} d="M27 88 H153" />
      <path data-law-angle="A" className={`diagram-angle ${metricClass(angleA)}`} d="M40 88 A13 13 0 0 1 35 77" />
      <path data-law-angle="B" className={`diagram-angle ${metricClass(angleB)}`} d="M145 77 A13 13 0 0 1 140 88" />
      <path data-law-angle="C" className={`diagram-angle ${metricClass(angleC)}`} d="M79 28 A13 13 0 0 1 96 28" />
      <MetricLabel item={a} x={127} y={45} />
      <MetricLabel item={b} x={48} y={45} />
      <MetricLabel item={c} x={90} y={96} />
      {activeAngle ? <MetricLabel item={activeAngle} x={7} y={12} anchor="start" /> : null}
      {area.active ? <MetricLabel item={area} x={90} y={64} /> : null}
    </svg>
  );
}

function RoofDiagram({ view }: { view: CalculatorDiagramView }) {
  const run = metric(view, 'run');
  const rise = metric(view, 'rise');
  const hip = metric(view, 'hip');
  const jack = metric(view, 'jack');
  const spacing = metric(view, 'spacing');
  const plumb = metric(view, 'plumb');
  const level = metric(view, 'level');
  const cheek = metric(view, 'cheek');
  const showJacks = view.variant === 'jacks' || view.variant === 'ir-jacks';
  const irregular = view.variant === 'ir-jacks' || view.variant === 'ir-hip';
  const planRidgeX = irregular ? 104 : 90;
  const elevationRidgeX = irregular ? 116 : 106;
  const activeCut = [plumb, level, cheek].find((item) => item.active);
  // Only the irregular-pitch workflow names the two slopes, so the labels stay
  // off the ordinary hip and jack drawings.
  const showsPitches = view.metrics.some((item) => item.id === 'irregular-pitch');
  const pitch = metric(view, 'pitch');
  const irregularPitch = metric(view, 'irregular-pitch');
  const planFocused = Boolean(jack.active || spacing.active || cheek.active);
  const jackIndex = view.geometry?.memberIndex;
  const cutSide = view.geometry?.memberSide ?? 'regular';
  const jackSide = cutSide;
  const rawJackProgress = view.geometry?.memberProgress;
  const jackProgress = rawJackProgress === undefined
    ? undefined
    : Math.min(0.92, Math.max(0.08, rawJackProgress));
  const jackStartX = jackSide === 'irregular' ? 160 : 20;
  const jackEndX = jackProgress === undefined
    ? undefined
    : jackStartX + (planRidgeX - jackStartX) * jackProgress;
  const jackY = jackProgress === undefined ? undefined : 22 + 20 * jackProgress;
  const jackLabelX = jackEndX === undefined
    ? jackSide === 'irregular' ? 132 : 48
    : rounded((jackStartX + jackEndX) / 2);
  const jackLabelY = jackY === undefined ? 59 : rounded(jackY + 10);
  const cutClass = (
    item: CalculatorDiagramMetric,
    side: 'regular' | 'irregular',
  ) => metricClass(item.active && cutSide !== side ? { ...item, active: false } : item);

  if (planFocused) {
    return (
      <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
        <text className="diagram-column-title" x="90" y="11" textAnchor="middle">ROOF PLAN</text>
        <path className="diagram-reference" d="M20 22 H160 V94 H20 Z" />
        <path
          className={`diagram-line ${metricClass(hip)}`}
          d={`M20 22 L${planRidgeX} 42 L160 22 M20 94 L${planRidgeX} 74 L160 94 M${planRidgeX} 42 V74`}
        />
        {showJacks ? (
          <g className="diagram-jacks diagram-reference">
            <path d="M20 34 H58 M20 46 H76 M20 82 H58 M20 70 H76" />
            <path d="M160 34 H128 M160 46 H116 M160 82 H128 M160 70 H116" />
          </g>
        ) : null}
        {showJacks && jackEndX !== undefined && jackY !== undefined ? (
          <path
            data-jack-member={`${jackSide === 'irregular' ? 'IJ' : 'JK'}${jackIndex}`}
            data-jack-side={jackSide}
            className={`diagram-line ${metricClass(jack)}`}
            d={`M${jackStartX} ${rounded(jackY)} H${rounded(jackEndX)}`}
          />
        ) : null}
        <path
          className={`diagram-dimension ${metricClass(run)}`}
          d={`M20 108 H${planRidgeX} M20 105 V111 M${planRidgeX} 105 V111`}
        />
        <path
          data-roof-cut="cheek-regular"
          className={`diagram-angle ${cutClass(cheek, 'regular')}`}
          d={`M${planRidgeX - 12} 43 A12 12 0 0 1 ${planRidgeX - 1} 53`}
        />
        {irregular ? (
          <path
            data-roof-cut="cheek-irregular"
            className={`diagram-angle ${cutClass(cheek, 'irregular')}`}
            d={`M${planRidgeX + 12} 43 A12 12 0 0 0 ${planRidgeX + 1} 53`}
          />
        ) : null}
        <MetricLabel item={run} x={55} y={116} />
        <MetricLabel item={hip} x={139} y={63} anchor="end" />
        {showJacks ? <MetricLabel item={jack} x={jackLabelX} y={jackLabelY} /> : null}
        {showJacks && (spacing.active || spacing.status === 'entered')
          ? <MetricLabel item={spacing} x={172} y={12} anchor="end" />
          : null}
        {cheek.active ? (
          <MetricLabel
            item={cheek}
            x={cutSide === 'irregular' ? planRidgeX + 27 : planRidgeX - 27}
            y={28}
          />
        ) : null}
      </svg>
    );
  }

  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      <text className="diagram-column-title" x="90" y="11" textAnchor="middle">TRUE LENGTH ELEVATION</text>
      <path className="diagram-reference" d="M20 90 H160" />
      <path
        className={`diagram-line ${metricClass(hip)}`}
        d={`M20 90 L${elevationRidgeX} 24 L160 90`}
      />
      <path
        className={`diagram-dimension ${metricClass(rise)}`}
        d={`M${elevationRidgeX} 24 V90 M${elevationRidgeX - 3} 24 H${elevationRidgeX + 3} M${elevationRidgeX - 3} 90 H${elevationRidgeX + 3}`}
      />
      <path
        className={`diagram-dimension ${metricClass(run)}`}
        d={`M20 106 H${elevationRidgeX} M20 103 V109 M${elevationRidgeX} 103 V109`}
      />
      <path
        data-roof-cut="plumb-regular"
        className={`diagram-angle ${cutClass(plumb, 'regular')}`}
        d="M31 90 A15 15 0 0 1 28 81"
      />
      <path
        data-roof-cut="level-regular"
        className={`diagram-angle ${cutClass(level, 'regular')}`}
        d={`M${elevationRidgeX - 18} 38 A15 15 0 0 1 ${elevationRidgeX - 8} 28`}
      />
      {irregular ? (
        <>
          <path
            data-roof-cut="plumb-irregular"
            className={`diagram-angle ${cutClass(plumb, 'irregular')}`}
            d="M149 90 A15 15 0 0 0 154 79"
          />
          <path
            data-roof-cut="level-irregular"
            className={`diagram-angle ${cutClass(level, 'irregular')}`}
            d={`M${elevationRidgeX + 18} 38 A15 15 0 0 0 ${elevationRidgeX + 8} 28`}
          />
        </>
      ) : null}
      <MetricLabel item={hip} x={64} y={45} />
      <MetricLabel item={run} x={62} y={116} />
      <MetricLabel item={rise} x={124} y={53} anchor="start" />
      {showsPitches ? (
        <>
          <MetricLabel item={pitch} x={62} y={74} />
          {/* The irregular plane is the narrow one, and its label is the
              highlighted (larger) one, so it is set below that eave instead of
              being squeezed between the ridge and the slope. */}
          <MetricLabel item={irregularPitch} x={156} y={102} anchor="end" />
        </>
      ) : null}
      {activeCut ? (
        <MetricLabel
          item={activeCut}
          x={plumb.active
            ? cutSide === 'irregular' ? 171 : 9
            : cutSide === 'irregular' ? elevationRidgeX + 28 : elevationRidgeX - 28}
          y={plumb.active ? 104 : 15}
          anchor={plumb.active
            ? cutSide === 'irregular' ? 'end' : 'start'
            : 'middle'}
        />
      ) : null}
    </svg>
  );
}

function StairDiagram({ view }: { view: CalculatorDiagramView }) {
  const run = metric(view, 'run');
  const rise = metric(view, 'rise');
  const stringer = metric(view, 'stringer');
  const riser = metric(view, 'riser');
  const tread = metric(view, 'tread');
  const opening = metric(view, 'opening');
  const incline = metric(view, 'incline');
  const headroom = metric(view, 'headroom');
  const floor = metric(view, 'floor');
  const auxiliary = [incline, headroom, floor].find((item) => item.active);
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      <path className="diagram-reference" d="M28 87 H52 V75 H76 V63 H100 V51 H124 V39 H148 V27" />
      <path className={`diagram-line ${metricClass(stringer)}`} d="M28 87 L148 27" />
      <path className={`diagram-dimension ${metricClass(run)}`} d="M28 101 H148 M28 98 V104 M148 98 V104" />
      <path className={`diagram-dimension ${metricClass(rise)}`} d="M17 27 V87 M14 27 H20 M14 87 H20" />
      <path className={`diagram-line ${metricClass(riser)}`} d="M52 75 V87" />
      <path className={`diagram-line ${metricClass(tread)}`} d="M52 75 H76" />
      <path className={`diagram-dimension ${metricClass(opening)}`} d="M93 17 H148 M93 14 V20 M148 14 V20" />
      <path className={`diagram-angle ${metricClass(incline)}`} d="M42 87 A14 14 0 0 0 40 81" />
      <path className={`diagram-dimension ${metricClass(headroom)}`} d="M135 27 V63 M132 27 H138 M132 63 H138" />
      <path className={`diagram-dimension ${metricClass(floor)}`} d="M148 23 V31 M144 23 H152 M144 31 H152" />
      <MetricLabel item={stringer} x={111} y={61} />
      <MetricLabel item={run} x={89} y={92} />
      <MetricLabel item={rise} x={7} y={40} anchor="start" />
      <MetricLabel item={riser} x={48} y={72} anchor="end" />
      <MetricLabel item={tread} x={73} y={53} />
      <MetricLabel item={opening} x={121} y={8} />
      {auxiliary ? <MetricLabel item={auxiliary} x={102} y={116} /> : null}
    </svg>
  );
}

function SolidsDiagram({ view }: { view: CalculatorDiagramView }) {
  const diameter = metric(view, 'diameter');
  const radius = metric(view, 'radius');
  const height = metric(view, 'height');
  const column = metric(view, 'column');
  const cone = metric(view, 'cone');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <g className={`diagram-solid ${metricClass(column)}`}>
        <ellipse cx="50" cy="26" rx="25" ry="8" />
        <path d="M25 26 V84 M75 26 V84" />
        <ellipse cx="50" cy="84" rx="25" ry="8" />
      </g>
      <g className={`diagram-solid ${metricClass(cone)}`}>
        <ellipse cx="132" cy="84" rx="28" ry="8" />
        <path d="M104 84 L132 18 L160 84" />
      </g>
      <path className={`diagram-dimension ${metricClass(height)}`} d="M88 24 V84 M85 24 H91 M85 84 H91" />
      <path className={`diagram-dimension ${metricClass(radius)}`} d="M132 84 H160" />
      <path className={`diagram-dimension ${metricClass(diameter)}`} d="M104 102 H160 M104 98 V106 M160 98 V106" />
      <MetricLabel item={column} x={50} y={10} />
      <MetricLabel item={cone} x={132} y={10} />
      <MetricLabel item={height} x={94} y={48} anchor="start" />
      <MetricLabel item={radius} x={147} y={70} />
      <MetricLabel item={diameter} x={132} y={94} />
    </svg>
  );
}

function VariableBox({
  item,
  x,
  y,
}: {
  item: CalculatorDiagramMetric;
  x: number;
  y: number;
}) {
  return (
    <g className={`diagram-variable-box ${metricClass(item)}`} data-metric={item.id}>
      <rect x={x} y={y} width="55" height="30" rx="7" />
      <text x={x + 27.5} y={y + 13} textAnchor="middle">
        {`${STATUS_MARKER[item.status]} ${item.symbol}`}
      </text>
      <text className="diagram-metric-value" x={x + 27.5} y={y + 24} textAnchor="middle">
        {item.value ?? item.placeholder}
      </text>
    </g>
  );
}

function FanLawDiagram({ view }: { view: CalculatorDiagramView }) {
  const a = metric(view, 'a');
  const aNew = metric(view, 'a-new');
  const b = metric(view, 'b');
  const bNew = metric(view, 'b-new');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <text className="diagram-column-title" x="42" y="12" textAnchor="middle">EXISTING</text>
      <text className="diagram-column-title" x="138" y="12" textAnchor="middle">NEW</text>
      <VariableBox item={a} x={14} y={20} />
      <VariableBox item={aNew} x={111} y={20} />
      <VariableBox item={b} x={14} y={68} />
      <VariableBox item={bNew} x={111} y={68} />
      <path className="diagram-reference diagram-arrow" d="M72 35 H103 M96 29 L103 35 L96 41" />
      <path className="diagram-reference diagram-arrow" d="M72 83 H103 M96 77 L103 83 L96 89" />
    </svg>
  );
}

function DiagramGraphic({ view }: { view: CalculatorDiagramView }) {
  if (view.kind === 'right-triangle') return <TriangleDiagram view={view} />;
  if (view.kind === 'circle') return <CircleDiagram view={view} />;
  if (view.kind === 'segment') return <SegmentDiagram view={view} />;
  if (view.kind === 'offset') return <OffsetDiagram view={view} />;
  if (view.kind === 'law-cosines') return <LawCosinesDiagram view={view} />;
  if (view.kind === 'roof') return <RoofDiagram view={view} />;
  if (view.kind === 'stairs') return <StairDiagram view={view} />;
  if (view.kind === 'solids') return <SolidsDiagram view={view} />;
  return <FanLawDiagram view={view} />;
}

export default function CalculatorDiagram({ view }: CalculatorDiagramProps) {
  return (
    <figure
      className={`calculator-diagram calculator-diagram-${view.kind}`}
      data-diagram-kind={view.kind}
      aria-hidden="true"
    >
      <DiagramGraphic view={view} />
      <figcaption className={view.pendingEntry ? 'diagram-caption is-pending' : 'diagram-caption'}>
        {view.pendingEntry
          ? 'Typing: choose geometry key'
          : '● Given · ? Next · ✓ Solved'}
      </figcaption>
    </figure>
  );
}
