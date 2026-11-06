import type { EquationAtom } from '../core/model';
import type { MathBox } from '../core/math';
import { equationBox, MATH_FONT } from '../layout/equation';
import type { EditorStore } from '../editor/store';
import { memo } from 'react';
import type { ChartAtom, DiagramShape } from '../core/model';

export const CHART_COLORS = ['#2347ff', '#12a594', '#e5a50a', '#d6336c', '#6741d9', '#e8590c', '#2f9e44', '#1098ad'];

const poly = (pts: [number, number][]): string => `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`;

// Outline of a preset shape, drawn inside a w by h box.
export const shapePath = (prst: string, w: number, h: number): string => {
  const r = Math.min(w, h) * 0.16;
  switch (prst) {
    case 'ellipse': return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 1 0 ${h / 2}Z`;
    case 'roundRect': return `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
    case 'triangle': return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'rtTriangle': return poly([[0, 0], [w, h], [0, h]]);
    case 'diamond': return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'parallelogram': return poly([[w * 0.2, 0], [w, 0], [w * 0.8, h], [0, h]]);
    case 'trapezoid': return poly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]]);
    case 'pentagon': return poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
    case 'hexagon': return poly([[w * 0.25, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [w * 0.25, h], [0, h / 2]]);
    case 'octagon': return poly([[w * 0.29, 0], [w * 0.71, 0], [w, h * 0.29], [w, h * 0.71], [w * 0.71, h], [w * 0.29, h], [0, h * 0.71], [0, h * 0.29]]);
    case 'rightArrow': return poly([[0, h * 0.25], [w * 0.6, h * 0.25], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.75], [0, h * 0.75]]);
    case 'leftArrow': return poly([[w, h * 0.25], [w * 0.4, h * 0.25], [w * 0.4, 0], [0, h / 2], [w * 0.4, h], [w * 0.4, h * 0.75], [w, h * 0.75]]);
    case 'upArrow': return poly([[w * 0.25, h], [w * 0.25, h * 0.4], [0, h * 0.4], [w / 2, 0], [w, h * 0.4], [w * 0.75, h * 0.4], [w * 0.75, h]]);
    case 'downArrow': return poly([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h * 0.6], [w, h * 0.6], [w / 2, h], [0, h * 0.6], [w * 0.25, h * 0.6]]);
    case 'star5': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const k = i % 2 ? 0.4 : 1;
        pts.push([w / 2 + (Math.cos(a) * k * w) / 2, h / 2 + (Math.sin(a) * k * h) / 2]);
      }
      return poly(pts);
    }
    case 'line': case 'straightConnector1': return `M0 0L${w} ${h}`;
    default: return `M0 0H${w}V${h}H0Z`;
  }
};

export const ShapeOutline = ({ prst, w, h, fill, stroke, width }: { prst: string; w: number; h: number; fill?: string; stroke?: string; width?: number }) => {
  const sw = stroke ? (width ?? 0.75) : 0;
  return (
    <svg className="shapesvg" width={w} height={h} viewBox={`${-sw} ${-sw} ${w + sw * 2} ${h + sw * 2}`} preserveAspectRatio="none" aria-hidden>
      <path d={shapePath(prst, w, h)} fill={fill ?? 'none'} stroke={stroke ?? 'none'} strokeWidth={sw} />
    </svg>
  );
};

const niceStep = (range: number): number => {
  const raw = range / 5 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};

const fmt = (v: number): string => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(+v.toFixed(2)));

const seriesColor = (a: ChartAtom, i: number): string => a.series[i]?.color ?? CHART_COLORS[i % CHART_COLORS.length]!;

const FONT = 'Carlito, "Noto Naskh Arabic", sans-serif';

export const chartRange = (a: ChartAtom): { min: number; max: number; step: number } => {
  const cats = Math.max(...a.series.map((s) => s.values.length), 0);
  let hi = 0;
  let lo = 0;
  if (a.stacked) {
    for (let c = 0; c < cats; c++) {
      let pos = 0;
      let neg = 0;
      for (const s of a.series) { const v = s.values[c] ?? 0; if (v >= 0) pos += v; else neg += v; }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    }
  } else {
    for (const s of a.series) for (const v of s.values) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  const step = niceStep(hi - lo);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step || step, step };
};

const Round = ({ a, W, top, H }: { a: ChartAtom; W: number; top: number; H: number }) => {
  const s = a.series[0];
  const vals = (s?.values ?? []).map((v) => Math.max(0, v));
  const total = vals.reduce((x, y) => x + y, 0) || 1;
  const cx = W / 2;
  const cy = top + H / 2;
  const R = Math.max(10, Math.min(W, H) / 2 - 6);
  const inner = a.chart === 'doughnut' ? R * 0.58 : 0;
  let ang = -Math.PI / 2;
  return (
    <>
      {vals.map((v, i) => {
        const span = (v / total) * Math.PI * 2;
        const end = ang + Math.min(span, Math.PI * 2 - 0.0001);
        const big = span > Math.PI ? 1 : 0;
        const p = (r: number, t: number) => `${cx + Math.cos(t) * r} ${cy + Math.sin(t) * r}`;
        const d = inner
          ? `M${p(R, ang)}A${R} ${R} 0 ${big} 1 ${p(R, end)}L${p(inner, end)}A${inner} ${inner} 0 ${big} 0 ${p(inner, ang)}Z`
          : `M${cx} ${cy}L${p(R, ang)}A${R} ${R} 0 ${big} 1 ${p(R, end)}Z`;
        ang += span;
        return <path key={i} d={d} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#fff" strokeWidth={1} />;
      })}
    </>
  );
};

const Axes = ({ a, x0, y0, W, H }: { a: ChartAtom; x0: number; y0: number; W: number; H: number }) => {
  const { min, max, step } = chartRange(a);
  const horizontal = a.chart === 'bar';
  const n = a.categories.length || 1;
  const scale = (v: number) => (v - min) / (max - min || 1);
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(+v.toFixed(8));
  const band = (horizontal ? H : W) / n;
  const zero = scale(0);
  const ser = a.series.length || 1;
  const marks = a.series.map((s, si) => {
    const color = seriesColor(a, si);
    if (a.chart === 'line' || a.chart === 'area') {
      const pts = s.values.map((v, i) => [x0 + band * (i + 0.5), y0 + H - scale(v) * H] as const);
      const line = pts.map(([x, y]) => `${x} ${y}`).join('L');
      if (!pts.length) return null;
      if (a.chart === 'area') return <path key={si} d={`M${pts[0]![0]} ${y0 + H - zero * H}L${line}L${pts[pts.length - 1]![0]} ${y0 + H - zero * H}Z`} fill={color} fillOpacity={0.55} stroke={color} />;
      return <g key={si}><path d={`M${line}`} fill="none" stroke={color} strokeWidth={1.75} />{pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.2} fill={color} />)}</g>;
    }
    return s.values.map((v, i) => {
      let base = 0;
      if (a.stacked) for (let k = 0; k < si; k++) { const o = a.series[k]!.values[i] ?? 0; if (Math.sign(o) === Math.sign(v)) base += o; }
      const from = scale(base);
      const to = scale(base + v);
      const lo = Math.min(from, to);
      const len = Math.abs(to - from);
      const slot = band * 0.72;
      const w = a.stacked ? slot : slot / ser;
      const off = band * 0.14 + (a.stacked ? 0 : si * w);
      return horizontal
        ? <rect key={`${si}-${i}`} x={x0 + lo * W} y={y0 + band * i + off} width={len * W} height={w} fill={color} />
        : <rect key={`${si}-${i}`} x={x0 + band * i + off} y={y0 + H - (lo + len) * H} width={w} height={len * H} fill={color} />;
    });
  });
  return (
    <>
      {ticks.map((t) => {
        const p = scale(t);
        return horizontal
          ? <g key={t}><line x1={x0 + p * W} x2={x0 + p * W} y1={y0} y2={y0 + H} stroke="#dfe2ea" strokeWidth={0.5} /><text x={x0 + p * W} y={y0 + H + 10} textAnchor="middle" fontSize={8} fill="#555">{fmt(t)}</text></g>
          : <g key={t}><line x1={x0} x2={x0 + W} y1={y0 + H - p * H} y2={y0 + H - p * H} stroke="#dfe2ea" strokeWidth={0.5} /><text x={x0 - 4} y={y0 + H - p * H + 3} textAnchor="end" fontSize={8} fill="#555">{fmt(t)}</text></g>;
      })}
      {marks}
      {a.categories.map((c, i) => (horizontal
        ? <text key={i} x={x0 - 4} y={y0 + band * (i + 0.5) + 3} textAnchor="end" fontSize={8} fill="#333">{c.slice(0, 14)}</text>
        : <text key={i} x={x0 + band * (i + 0.5)} y={y0 + H + 10} textAnchor="middle" fontSize={8} fill="#333">{c.slice(0, Math.max(4, Math.floor(band / 4)))}</text>))}
      {horizontal
        ? <line x1={x0 + zero * W} x2={x0 + zero * W} y1={y0} y2={y0 + H} stroke="#888" strokeWidth={0.75} />
        : <line x1={x0} x2={x0 + W} y1={y0 + H - zero * H} y2={y0 + H - zero * H} stroke="#888" strokeWidth={0.75} />}
    </>
  );
};

export const ChartView = memo(function ChartView({ a }: { a: ChartAtom }) {
  const W = a.width;
  const H = a.height;
  const round = a.chart === 'pie' || a.chart === 'doughnut';
  const top = a.title ? 22 : 8;
  const names = round ? a.categories : a.series.map((s) => s.name);
  const showLegend = names.length > 1 || round;
  const legendY = H - 8;
  const bottom = showLegend ? 18 : 6;
  const longest = a.chart === 'bar' ? Math.min(70, Math.max(...a.categories.map((c) => c.length), 1) * 4.2 + 8) : 32;
  let lx = 0;
  const widths = names.map((n) => Math.min(n.length, 16) * 4.4 + 18);
  const total = widths.reduce((x, y) => x + y, 0);
  lx = Math.max(4, (W - total) / 2);
  return (
    <svg className="chartsvg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={a.alt || a.title || 'Chart'} style={{ fontFamily: FONT }}>
      <rect width={W} height={H} fill="#fff" />
      {a.title && <text x={W / 2} y={14} textAnchor="middle" fontSize={12} fill="#222">{a.title}</text>}
      {round
        ? <Round a={a} W={W} top={top} H={H - top - bottom} />
        : <Axes a={a} x0={longest} y0={top} W={Math.max(10, W - longest - 10)} H={Math.max(10, H - top - bottom - 12)} />}
      {showLegend && names.map((n, i) => {
        const x = lx;
        lx += widths[i]!;
        return <g key={i}><rect x={x} y={legendY - 7} width={8} height={8} fill={round ? CHART_COLORS[i % CHART_COLORS.length] : seriesColor(a, i)} /><text x={x + 11} y={legendY} fontSize={8} fill="#333">{n.slice(0, 16)}</text></g>;
      })}
    </svg>
  );
});

export const DiagramView = ({ shapes, w, h }: { shapes: DiagramShape[]; w: number; h: number }) => (
  <svg className="chartsvg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Diagram" style={{ fontFamily: FONT }}>
    {shapes.map((s, i) => (
      <g key={i} transform={`translate(${s.x} ${s.y})`}>
        <path d={shapePath(s.prst, s.w, s.h)} fill={s.fill ?? 'none'} stroke={s.stroke ?? 'none'} />
        {s.text && <text x={s.w / 2} y={s.h / 2 + (s.size ?? 10) * 0.35} textAnchor="middle" fontSize={s.size ?? 10} fill={s.color ?? '#fff'}>{s.text}</text>}
      </g>
    ))}
  </svg>
);

export const EquationView = ({ atom, size, store, color }: { atom: EquationAtom; size: number; store: EditorStore; color?: string }) => <MathView box={equationBox(store.measurer, atom, size)} color={color} />;

export const MathView = ({ box, color = '#000' }: { box: MathBox; color?: string }) => (
  <svg className="mathsvg" width={Math.ceil(box.w) + 1} height={Math.ceil(box.asc + box.desc)} viewBox={`0 ${-box.asc} ${Math.ceil(box.w) + 1} ${Math.ceil(box.asc + box.desc)}`} style={{ verticalAlign: -box.desc }} role="img" aria-label="Equation">
    {box.draw.map((d, i) => {
      if (d.k === 'text') return <text key={i} x={d.x} y={d.y} fontSize={d.size} fontStyle={d.italic ? 'italic' : undefined} fontFamily={MATH_FONT} fill={color}>{d.text}</text>;
      if (d.k === 'line') return <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={color} strokeWidth={d.w} />;
      return <path key={i} d={d.d} fill="none" stroke={color} strokeWidth={d.w} />;
    })}
  </svg>
);
