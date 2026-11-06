import type { EquationAtom } from '../core/model';
import type { MathBox } from '../core/math';
import { equationBox, MATH_FONT } from '../layout/equation';
import type { EditorStore } from '../editor/store';
import type { ChartAtom, DiagramShape } from '../core/model';

export const CHART_COLORS = ['#2347ff', '#12a594', '#e5a50a', '#d6336c', '#6741d9', '#e8590c', '#2f9e44', '#1098ad'];


// Outline of a preset shape, drawn inside a w by h box.
import { isOutlineOnly, shapePath } from '../core/shapes';

export { shapePath };

export const ShapeOutline = ({ prst, w, h, fill, stroke, width }: { prst: string; w: number; h: number; fill?: string; stroke?: string; width?: number }) => {
  const sw = stroke ? (width ?? 0.75) : 0;
  return (
    <svg className="shapesvg" width={w} height={h} viewBox={`${-sw} ${-sw} ${w + sw * 2} ${h + sw * 2}`} preserveAspectRatio="none" aria-hidden>
      <path d={shapePath(prst, w, h)} fill={isOutlineOnly(prst) ? 'none' : (fill ?? 'none')} fillRule="evenodd" stroke={stroke ?? 'none'} strokeWidth={sw} />
    </svg>
  );
};

const niceStep = (range: number): number => {
  const raw = range / 5 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
};



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




const wrapText = (text: string, width: number, size: number): string[] => {
  const max = Math.max(4, Math.floor(width / (size * 0.52)));
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
};

const DiagramText = ({ s }: { s: DiagramShape }) => {
  const size = s.size ?? 10;
  const lines = wrapText(s.text!, s.w - 8, size).slice(0, Math.max(1, Math.floor((s.h - 4) / (size * 1.2))));
  const y0 = s.h / 2 - ((lines.length - 1) * size * 1.2) / 2 + size * 0.35;
  return <text textAnchor="middle" fontSize={size} fill={s.color ?? '#fff'}>{lines.map((l, i) => <tspan key={i} x={s.w / 2} y={y0 + i * size * 1.2}>{l}</tspan>)}</text>;
};

export const DiagramView = ({ shapes, w, h }: { shapes: DiagramShape[]; w: number; h: number }) => (
  <svg className="chartsvg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Diagram" style={{ fontFamily: FONT }}>
    {shapes.map((s, i) => (
      <g key={i} transform={`translate(${s.x} ${s.y})`}>
        <path d={shapePath(s.prst, s.w, s.h)} fill={s.fill ?? 'none'} stroke={s.stroke ?? 'none'} />
        {s.text && <DiagramText s={s} />}
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

export { ChartView } from './ChartView';
