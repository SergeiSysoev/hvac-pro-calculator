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
  always = false,
  to,
}: {
  item: CalculatorDiagramMetric;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  /** Keep the tag even when the element is solved and not the current result. */
  always?: boolean;
  /** Point of the element this tag names, when the tag had to stand off it. */
  to?: readonly [number, number];
}) {
  // A drawing this size cannot carry nine callouts without them colliding, and
  // it does not need to: every value is listed below. The drawing points only
  // at what is in play - what the operator gave, what is expected next, and the
  // result currently on screen.
  if (!always && item.status === 'calculated' && !item.active) return null;
  return (
    <g className={`diagram-metric-label ${metricClass(item)}`} data-metric={item.id}>
      {/* A tag that had to stand off its element keeps a leader to it, the way a
          callout does on a drawing, so the link is never guesswork. */}
      {to ? <path className="diagram-leader" d={`M${x} ${y - 4} L${to[0]} ${to[1]}`} /> : null}
      <text x={x} y={y} textAnchor={anchor}>
        <tspan className="diagram-status-marker">{STATUS_MARKER[item.status]}</tspan>
        <tspan>{` ${item.tagSymbol ?? item.symbol}`}</tspan>
      </text>
    </g>
  );
}

/**
 * Every quantity the drawing knows, with its number. A value is shown whenever
 * the calculator has one - hiding a known radius behind a bare "r" was the
 * complaint this list answers - and the marker carries the status instead.
 */
function DiagramValues({ view }: { view: CalculatorDiagramView }) {
  // Never drop a row because its number happens to match another one: in this
  // trade round numbers collide constantly, and a stair whose opening equals its
  // rise would lose the very result it is showing. A quantity still being waited
  // for keeps its row too, so a figure is never left without a single number.
  const rows = view.metrics.filter((item) => Boolean(item.value) || item.active);
  if (!rows.length) return null;
  return (
    <ul className="diagram-values">
      {rows.map((item) => (
        <li
          key={item.id}
          className={`diagram-value-row ${metricClass(item)}`}
          data-value-for={item.id}
        >
          <span className="diagram-value-marker">{STATUS_MARKER[item.status]}</span>
          <span className="diagram-value-symbol">{item.symbol}</span>
          <span className="diagram-value-amount">{item.value ?? item.placeholder}</span>
        </li>
      ))}
    </ul>
  );
}

function TriangleDiagram({ view }: { view: CalculatorDiagramView }) {
  const x = metric(view, 'x');
  const y = metric(view, 'y');
  const r = metric(view, 'r');
  const theta = metric(view, 'theta');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <path data-owner="x" className={`diagram-line ${metricClass(x)}`} d="M26 88 H148" />
      <path data-owner="y" className={`diagram-line ${metricClass(y)}`} d="M148 88 V20" />
      <path data-owner="r" className={`diagram-line ${metricClass(r)}`} d="M26 88 L148 20" />
      <path className="diagram-reference" d="M137 88 V77 H148" />
      <path data-owner="theta" className={`diagram-angle ${metricClass(theta)}`} d="M45 88 A19 19 0 0 0 42.6 78.8" />
      <MetricLabel item={r} x={87} y={40} />
      <MetricLabel item={theta} x={26} y={110} anchor="start" />
      <MetricLabel item={x} x={104} y={105} />
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
      {/* Filling the disc means "this area is the answer on screen". Painting it
          while the diameter is showing said the wrong thing from the start. */}
      {area.active ? (
        <circle className={`diagram-area ${metricClass(area)}`} cx="90" cy="56" r="40" />
      ) : null}
      <circle data-owner="circumference" className={`diagram-line ${metricClass(circumference)}`} cx="90" cy="56" r="40" />
      <path data-owner="diameter" className={`diagram-line ${metricClass(diameter)}`} d="M50 56 H130" />
      <path data-owner="radius" className={`diagram-line ${metricClass(radius)}`} d="M90 56 L118.3 27.7" />
      <circle className="diagram-center" cx="90" cy="56" r="2.4" />
      {/* Each callout sits in its own free zone: the ring on top, the radius
          outside its own line, the diameter just under it, and the area inside
          the empty upper-left quadrant. Nothing shares a spot with a line. */}
      {/* The ring is a circle of radius 40 about (90,56): every tag stays well
          inside it, and each sits beside the element it names. */}
      {/* A circle has no clean interior near its apexes - a centred tag there
          always contains the ring. The tags sit in the free margins either side
          of it instead: the ring never reaches x<51 or x>129 between y 24 and 88. */}
      <MetricLabel item={circumference} x={4} y={40} anchor="start" />
      <MetricLabel item={radius} x={176} y={40} anchor="end" />
      <MetricLabel item={diameter} x={4} y={76} anchor="start" />
      {area.active ? <MetricLabel item={area} x={176} y={76} anchor="end" /> : null}
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
      <path data-owner="arc" className={`diagram-line ${metricClass(arc)}`} d={shape.arcPath} />
      <path
        data-owner="chord" className={`diagram-line ${metricClass(chord)}`}
        d={`M${shape.left.x} ${shape.chordY} H${shape.right.x}`}
      />
      <path
        data-owner="rise" className={`diagram-line ${metricClass(rise)}`}
        d={`M${shape.center.x} ${shape.chordY} V${shape.apex.y}`}
      />
      <path
        data-owner="radius" className={`diagram-line ${metricClass(radius)}`}
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
          data-owner="member" data-arc-member={`AW${memberIndex}`}
          className={`diagram-line ${metricClass(member)}`}
          d={`M${rounded(memberX)} ${shape.chordY} V${rounded(memberTop)}`}
        />
      ) : null}
      <MetricLabel item={arc} x={10} y={17} anchor="start" />
      <MetricLabel item={radius} x={7} y={64} anchor="start" />
      <MetricLabel item={rise} x={173} y={64} anchor="end" />
      <MetricLabel
        item={chord}
        x={rounded(shape.center.x + 34)}
        y={Math.min(128, rounded(shape.chordY + 15))}
        anchor="start"
      />
      {view.variant === 'arc' && !member.active && (spacing.active || spacing.status === 'entered')
        ? <MetricLabel item={spacing} x={164} y={19} anchor="end" />
        : null}
      {/* Both area tags sit clear of the rise line, which runs vertically down
          the middle of the shape from the apex to the chord. */}
      {segmentArea.active ? (
        <MetricLabel
          item={segmentArea}
          x={rounded(shape.center.x)}
          y={Math.max(16, rounded(shape.apex.y - 10))}
        />
      ) : null}
      {sectorArea.active ? (
        <MetricLabel
          item={sectorArea}
          x={rounded(shape.center.x)}
          y={Math.max(16, rounded(shape.apex.y - 10))}
        />
      ) : null}
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
  // Each curve has its own mid-point: one fixed leader tip named whichever
  // element happened to be nearest, which was the wrong one three times in four.
  // Середина каждой кривой по обеим координатам: общий x=90 попадал на heel,
  // то есть выноска WL указывала на чужой рез.
  const curveTip: readonly [number, number] = activeCurve === wrapper
    ? [81.4, 56]
    : activeCurve === heel
      ? [86.2, 64]
      : activeCurve === throat
        ? [77.2, 48]
        : [68, 75];
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 112" focusable="false">
      <path className="diagram-reference" d="M19 83 H57 V99 H19 Z M123 13 H161 V29 H123 Z" />
      <path data-owner="wrapper" data-offset-element="wrapper" className={`diagram-line ${metricClass(wrapper)}`} d="M57 91 C78 91 79 21 123 21" />
      <path data-owner="throat" data-offset-element="throat" className={`diagram-line ${metricClass(throat)}`} d="M57 83 C70 83 76 13 123 13" />
      <path data-owner="heel" data-offset-element="heel" className={`diagram-line ${metricClass(heel)}`} d="M57 99 C86 99 84 29 123 29" />
      <path data-owner="radius" data-offset-element="radius" className={`diagram-dimension ${metricClass(radius)}`} d="M58 89 L78 61 M55 87 L61 92 M75 59 L81 64" />
      <path data-owner="x" className={`diagram-dimension ${metricClass(x)}`} d="M58 104 H123 M58 101 V107 M123 101 V107" />
      <path data-owner="y" className={`diagram-dimension ${metricClass(y)}`} d="M168 21 V91 M165 21 H171 M165 91 H171" />
      <path data-owner="a" className={`diagram-dimension ${metricClass(a)}`} d="M14 83 V99 M11 83 H17 M11 99 H17" />
      <path data-owner="theta" className={`diagram-angle ${metricClass(theta)}`} d="M61 89 A18 18 0 0 1 73 77" />
      <MetricLabel item={activeCurve} x={12} y={24} anchor="start" to={curveTip} />
      <MetricLabel item={theta} x={44} y={44} anchor="end" />
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
      {area.active ? (
        <path className={`diagram-area ${metricClass(area)}`} d="M87 17 L153 88 H27 Z" />
      ) : null}
      <path data-owner="a" className={`diagram-line ${metricClass(a)}`} d="M87 17 L153 88" />
      <path data-owner="b" className={`diagram-line ${metricClass(b)}`} d="M27 88 L87 17" />
      <path data-owner="c" className={`diagram-line ${metricClass(c)}`} d="M27 88 H153" />
      <path data-owner="angle-a" data-law-angle="A" className={`diagram-angle ${metricClass(angleA)}`} d="M40 88 A13 13 0 0 1 35 77" />
      <path data-owner="angle-b" data-law-angle="B" className={`diagram-angle ${metricClass(angleB)}`} d="M145 77 A13 13 0 0 1 140 88" />
      <path data-owner="angle-c" data-law-angle="C" className={`diagram-angle ${metricClass(angleC)}`} d="M79 28 A13 13 0 0 1 96 28" />
      <MetricLabel item={a} x={127} y={45} />
      <MetricLabel item={b} x={48} y={45} />
      <MetricLabel item={c} x={90} y={105} />
      {activeAngle ? <MetricLabel item={activeAngle} x={7} y={20} anchor="start" /> : null}
      {area.active ? <MetricLabel item={area} x={90} y={80} /> : null}
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
          data-owner="hip" className={`diagram-line ${metricClass(hip)}`}
          d={`M20 22 L${planRidgeX} 42 L160 22 M20 94 L${planRidgeX} 74 L160 94`}
        />
        {/* The ridge is not the hip: giving it the hip's name let a hip tag sit
            on it unnoticed. */}
        <path
          data-owner="ridge" className={`diagram-line ${metricClass(hip)}`}
          d={`M${planRidgeX} 42 V74`}
        />
        {showJacks ? (
          <g className="diagram-jacks diagram-reference">
            <path d="M20 34 H58 M20 46 H76 M20 82 H58 M20 70 H76" />
            <path d="M160 34 H128 M160 46 H116 M160 82 H128 M160 70 H116" />
          </g>
        ) : null}
        {showJacks && jackEndX !== undefined && jackY !== undefined ? (
          <path
            data-owner="jack" data-jack-member={`${jackSide === 'irregular' ? 'IJ' : 'JK'}${jackIndex}`}
            data-jack-side={jackSide}
            className={`diagram-line ${metricClass(jack)}`}
            d={`M${jackStartX} ${rounded(jackY)} H${rounded(jackEndX)}`}
          />
        ) : null}
        <path
          data-owner="run" className={`diagram-dimension ${metricClass(run)}`}
          d={`M20 108 H${planRidgeX} M20 105 V111 M${planRidgeX} 105 V111`}
        />
        <path
          data-roof-cut="cheek-regular"
          data-owner="cheek"
          className={`diagram-angle ${cutClass(cheek, 'regular')}`}
          d={`M${planRidgeX - 12} 43 A12 12 0 0 1 ${planRidgeX - 1} 53`}
        />
        {irregular ? (
          <path
            data-roof-cut="cheek-irregular"
            data-owner="cheek"
            className={`diagram-angle ${cutClass(cheek, 'irregular')}`}
            d={`M${planRidgeX + 12} 43 A12 12 0 0 0 ${planRidgeX + 1} 53`}
          />
        ) : null}
        <MetricLabel item={run} x={62} y={112} />
        {hip.value || hip.active ? <MetricLabel item={hip} x={139} y={52} anchor="end" /> : null}
        {/* The rafters are a fan of parallel lines, so a tag placed among them
            lands on a neighbour. It moves to the free band below the plan but
            stays on its own side of the ridge, which is what names the side. */}
        {showJacks ? (
          <MetricLabel
            item={jack}
            x={jackSide === 'irregular' ? 136 : 44}
            y={130}
          />
        ) : null}
        {showJacks && (spacing.active || spacing.status === 'entered')
          ? <MetricLabel item={spacing} x={176} y={16} anchor="end" />
          : null}
        {/* The cheek cut belongs to a ridge line, and any tag placed on that
            line lies along it; the free band above the plan reads cleanly. */}
        {cheek.active ? (
          <MetricLabel
            item={cheek}
            x={cutSide === 'irregular' ? 136 : 44}
            y={130}
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
        data-owner="hip" className={`diagram-line ${metricClass(hip)}`}
        d={`M20 90 L${elevationRidgeX} 24 L160 90`}
      />
      <path
        data-owner="rise" className={`diagram-dimension ${metricClass(rise)}`}
        d={`M${elevationRidgeX} 24 V90 M${elevationRidgeX - 3} 24 H${elevationRidgeX + 3} M${elevationRidgeX - 3} 90 H${elevationRidgeX + 3}`}
      />
      <path
        data-owner="run" className={`diagram-dimension ${metricClass(run)}`}
        d={`M20 106 H${elevationRidgeX} M20 103 V109 M${elevationRidgeX} 103 V109`}
      />
      <path
        data-roof-cut="plumb-regular"
        data-owner="plumb"
        className={`diagram-angle ${cutClass(plumb, 'regular')}`}
        d="M31 90 A15 15 0 0 1 28 81"
      />
      <path
        data-roof-cut="level-regular"
        data-owner="level"
        className={`diagram-angle ${cutClass(level, 'regular')}`}
        d={`M${elevationRidgeX - 18} 38 A15 15 0 0 1 ${elevationRidgeX - 8} 28`}
      />
      {irregular ? (
        <>
          <path
            data-roof-cut="plumb-irregular"
            data-owner="plumb"
            className={`diagram-angle ${cutClass(plumb, 'irregular')}`}
            d="M149 90 A15 15 0 0 0 154 79"
          />
          <path
            data-roof-cut="level-irregular"
            data-owner="level"
            className={`diagram-angle ${cutClass(level, 'irregular')}`}
            d={`M${elevationRidgeX + 18} 38 A15 15 0 0 0 ${elevationRidgeX + 8} 28`}
          />
        </>
      ) : null}
      <MetricLabel item={hip} x={84} y={74} to={[68, 57]} />
      <MetricLabel item={run} x={68} y={104} />
      <MetricLabel item={rise} x={150} y={30} to={[elevationRidgeX + 2, 62]} />
      {showsPitches ? (
        <>
          <MetricLabel item={pitch} x={40} y={34} to={[46, 74]} />
          {/* The irregular plane is the narrow one, and its label is the
              highlighted (larger) one, so it is set below that eave instead of
              being squeezed between the ridge and the slope. */}
          <MetricLabel item={irregularPitch} x={176} y={124} anchor="end" to={[140, 62]} />
        </>
      ) : null}
      {activeCut ? (
        <MetricLabel
          item={activeCut}
          x={plumb.active
            ? cutSide === 'irregular' ? 176 : 4
            : cutSide === 'irregular' ? 150 : 40}
          y={plumb.active ? 124 : 34}
          anchor={plumb.active
            ? cutSide === 'irregular' ? 'end' : 'start'
            : 'middle'}
          to={plumb.active
            ? (cutSide === 'irregular' ? [151, 88] : [30, 88])
            : (cutSide === 'irregular'
                ? [elevationRidgeX + 12, 34]
                : [elevationRidgeX - 12, 34])}
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
      <path data-owner="stringer" className={`diagram-line ${metricClass(stringer)}`} d="M28 87 L148 27" />
      <path data-owner="run" className={`diagram-dimension ${metricClass(run)}`} d="M28 101 H148 M28 98 V104 M148 98 V104" />
      <path data-owner="rise" className={`diagram-dimension ${metricClass(rise)}`} d="M17 27 V87 M14 27 H20 M14 87 H20" />
      <path data-owner="riser" className={`diagram-line ${metricClass(riser)}`} d="M52 75 V87" />
      <path data-owner="tread" className={`diagram-line ${metricClass(tread)}`} d="M52 75 H76" />
      <path data-owner="opening" className={`diagram-dimension ${metricClass(opening)}`} d="M93 17 H148 M93 14 V20 M148 14 V20" />
      <path data-owner="incline" className={`diagram-angle ${metricClass(incline)}`} d="M42 87 A14 14 0 0 0 40 81" />
      <path data-owner="headroom" className={`diagram-dimension ${metricClass(headroom)}`} d="M135 27 V63 M132 27 H138 M132 63 H138" />
      <path data-owner="floor" className={`diagram-dimension ${metricClass(floor)}`} d="M148 23 V31 M144 23 H152 M144 31 H152" />
      <MetricLabel item={stringer} x={94} y={36} />
      <MetricLabel item={run} x={120} y={124} />
      {/* Beside its dimension line, not across it, and clear of the tags above
          and below it at any tag size. */}
      <MetricLabel item={rise} x={24} y={60} anchor="start" />
      <MetricLabel item={riser} x={20} y={124} anchor="start" to={[52, 82]} />
      <MetricLabel item={tread} x={136} y={88} to={[64, 75]} />
      <MetricLabel item={opening} x={60} y={16} to={[93, 17]} />
      {auxiliary ? <MetricLabel item={auxiliary} x={60} y={34} /> : null}
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
      <path data-owner="height" className={`diagram-dimension ${metricClass(height)}`} d="M88 24 V84 M85 24 H91 M85 84 H91" />
      <path data-owner="radius" className={`diagram-dimension ${metricClass(radius)}`} d="M132 84 H160" />
      <path data-owner="diameter" className={`diagram-dimension ${metricClass(diameter)}`} d="M104 102 H160 M104 98 V106 M160 98 V106" />
      <MetricLabel item={column} x={4} y={106} anchor="start" />
      <MetricLabel item={cone} x={132} y={16} />
      <MetricLabel item={height} x={94} y={48} anchor="start" />
      {/* The two dimensions are told apart by where they are drawn: the radius
          runs from the axis, the diameter spans the whole base. Forcing a tag
          onto each only put them on the cone's edge. */}
      <MetricLabel item={radius} x={132} y={72} />
      <MetricLabel item={diameter} x={176} y={106} anchor="end" />
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
      <rect x={x} y={y} width="55" height="22" rx="7" />
      <text x={x + 27.5} y={y + 15} textAnchor="middle">
        {`${STATUS_MARKER[item.status]} ${item.symbol}`}
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

function VelocityDiagram({ view }: { view: CalculatorDiagramView }) {
  const entry = metric(view, 'entry');
  const speed = metric(view, 'speed');
  const pressure = metric(view, 'pressure');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      <text className="diagram-column-title" x="90" y="11" textAnchor="middle">AIR STREAM</text>
      <path className="diagram-reference" d="M16 34 H164 M16 86 H164" />
      <path
        data-owner="speed" data-air="flow"
        className={`diagram-line ${metricClass(speed)}`}
        d="M28 68 H128 M116 59 L128 68 L116 77"
      />
      <path
        data-owner="pressure" data-air="pressure"
        className={`diagram-dimension ${metricClass(pressure)}`}
        d="M152 44 V78 M147 44 H157 M147 78 H157"
      />
      <MetricLabel item={speed} x={74} y={56} />
      <MetricLabel item={pressure} x={172} y={104} anchor="end" />
      {/* Off the ENTRY step the reading is already shown in the row whose part
          it plays, so a second copy would only take a line. */}
      {entry.active ? <MetricLabel item={entry} x={10} y={104} anchor="start" /> : null}
    </svg>
  );
}

function AngleNotationDiagram({ view }: { view: CalculatorDiagramView }) {
  const shown = metric(view, 'shown');
  const source = metric(view, 'source');
  const raw = view.geometry?.theta ?? 45;
  const angle = Math.min(88, Math.max(6, raw > 90 ? 180 - raw : raw));
  const radians = angle * Math.PI / 180;
  const originX = 30;
  const originY = 96;
  // Keep the arm inside the canvas at any opening: a steep angle would run off
  // the top and cross the title.
  const arm = Math.min(
    120,
    76 / Math.max(0.08, Math.sin(radians)),
    140 / Math.max(0.08, Math.cos(radians)),
  );
  const tipX = rounded(originX + arm * Math.cos(radians));
  const tipY = rounded(originY - arm * Math.sin(radians));
  const arc = 30;
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      <text className="diagram-column-title" x="90" y="11" textAnchor="middle">ANGLE</text>
      <path className="diagram-reference" d={`M${originX} ${originY} H${originX + arm}`} />
      <path
        data-owner="shown" data-angle="arm"
        className={`diagram-line ${metricClass(shown)}`}
        d={`M${originX} ${originY} L${tipX} ${tipY}`}
      />
      <path
        data-owner="shown" className={`diagram-angle ${metricClass(shown)}`}
        d={`M${originX + arc} ${originY} A${arc} ${arc} 0 0 0 ${rounded(originX + arc * Math.cos(radians))} ${rounded(originY - arc * Math.sin(radians))}`}
      />
      {/* Both rows describe the same opening, so both always carry their
          number - a blank row would defeat the point of the figure. */}
      <MetricLabel item={shown} x={originX + 78} y={originY - 30} anchor="start" always />
      <MetricLabel item={source} x={originX + 40} y={originY + 16} anchor="start" always />
    </svg>
  );
}

function TrigDiagram({ view }: { view: CalculatorDiagramView }) {
  const theta = metric(view, 'theta');
  const ratio = metric(view, 'ratio');
  const pair = view.variant ?? 'opp-hyp';
  // Draw the triangle at the angle actually on screen, clamped only so that a
  // near-flat or near-vertical angle still reads as a triangle.
  const raw = Math.abs(view.geometry?.theta ?? 45) % 180;
  const angle = Math.min(80, Math.max(10, raw > 90 ? 180 - raw : raw));
  const originX = 26;
  const baseY = 100;
  const adjacent = 112;
  const opposite = Math.min(74, adjacent * Math.tan(angle * Math.PI / 180));
  const cornerX = rounded(originX + adjacent);
  const apexY = rounded(baseY - opposite);
  const usesOpposite = pair !== 'adj-hyp';
  const usesAdjacent = pair !== 'opp-hyp';
  const usesHypotenuse = pair !== 'opp-adj';
  const sideClass = (used: boolean) => (used
    ? `diagram-line ${metricClass(ratio)}`
    : 'diagram-reference');
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      <text className="diagram-column-title" x="90" y="11" textAnchor="middle">RIGHT TRIANGLE</text>
      <path
        data-owner="ratio" data-trig-side="adjacent"
        className={sideClass(usesAdjacent)}
        d={`M${originX} ${baseY} H${cornerX}`}
      />
      <path
        data-owner="ratio" data-trig-side="opposite"
        className={sideClass(usesOpposite)}
        d={`M${cornerX} ${baseY} V${apexY}`}
      />
      <path
        data-owner="ratio" data-trig-side="hypotenuse"
        className={sideClass(usesHypotenuse)}
        d={`M${originX} ${baseY} L${cornerX} ${apexY}`}
      />
      <path
        data-owner="theta" className={`diagram-angle ${metricClass(theta)}`}
        d={`M${originX + 18} ${baseY} A18 18 0 0 0 ${rounded(originX + 18 * Math.cos(angle * Math.PI / 180))} ${rounded(baseY - 18 * Math.sin(angle * Math.PI / 180))}`}
      />
      <path className="diagram-reference" d={`M${cornerX - 7} ${baseY} V${baseY - 7} H${cornerX}`} />
      <text className="diagram-side-name" x={rounded(originX + adjacent / 2)} y={baseY + 21} textAnchor="middle">adj</text>
      <text className="diagram-side-name" x={cornerX + 9} y={rounded((baseY + apexY) / 2)} textAnchor="start">opp</text>
      <text className="diagram-side-name" x={rounded(originX + adjacent / 2) - 16} y={rounded((baseY + apexY) / 2) - 4} textAnchor="middle">hyp</text>
      <MetricLabel item={theta} x={20} y={baseY + 16} anchor="start" to={[originX + 13, baseY - 4]} />
      <MetricLabel item={ratio} x={90} y={30} />
    </svg>
  );
}

function PowerDiagram({ view }: { view: CalculatorDiagramView }) {
  const side = metric(view, 'side');
  const cubic = view.variant === 'cube';
  const measure = metric(view, cubic ? 'volume' : 'area');
  const left = 46;
  const top = 34;
  const size = 56;
  const depth = 16;
  return (
    <svg className="diagram-canvas" viewBox="0 0 180 132" focusable="false">
      <text className="diagram-column-title" x="90" y="11" textAnchor="middle">
        {cubic ? 'CUBE' : 'SQUARE'}
      </text>
      {cubic ? (
        <g className="diagram-reference">
          <path d={`M${left} ${top} l${depth} -${depth} h${size} v${size} l-${depth} ${depth}`} />
          <path d={`M${left + size} ${top} l${depth} -${depth}`} />
        </g>
      ) : null}
      <path
        data-owner={cubic ? 'volume' : 'area'} data-power-face="front"
        className={`diagram-line ${metricClass(measure)}`}
        d={`M${left} ${top} h${size} v${size} h-${size} Z`}
      />
      <path
        data-owner="side" data-power-side="edge"
        className={`diagram-dimension ${metricClass(side)}`}
        d={`M${left} ${top + size + 10} h${size} M${left} ${top + size + 7} v6 M${left + size} ${top + size + 7} v6`}
      />
      <MetricLabel item={side} x={left + size / 2} y={top + size + 26} />
      <MetricLabel item={measure} x={left + size / 2} y={top + size / 2 - 4} />
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
  if (view.kind === 'trig') return <TrigDiagram view={view} />;
  if (view.kind === 'power') return <PowerDiagram view={view} />;
  if (view.kind === 'velocity') return <VelocityDiagram view={view} />;
  if (view.kind === 'angle') return <AngleNotationDiagram view={view} />;
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
      <DiagramValues view={view} />
      {/* The legend never changed and was learned in the first minute; the
          typing warning is the only state this line ever really carried. The
          element stays so the drawing does not jump as the list changes length. */}
      <figcaption className={view.pendingEntry ? 'diagram-caption is-pending' : 'diagram-caption'}>
        {view.pendingEntry ? 'Typing: choose geometry key' : '\u00a0'}
      </figcaption>
    </figure>
  );
}
