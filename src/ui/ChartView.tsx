import { memo } from 'react';
import type { ChartAtom } from '../core/model';

export const CHART_COLORS = ['#2347ff', '#12a594', '#e5a50a', '#d6336c', '#6741d9', '#e8590c', '#2f9e44', '#1098ad', '#868e96', '#c2255c'];
const FONT = 'Carlito, "Noto Naskh Arabic", sans-serif';
const color = (a: ChartAtom, i: number): string => a.series[i]?.color ?? CHART_COLORS[i % CHART_COLORS.length]!;
const fmt = (v: number): string => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${+(v / 1e3).toFixed(1)}k` : String(+v.toFixed(2)));
const nice = (span: number): number => { const raw = (span || 1) / 5; const p = 10 ** Math.floor(Math.log10(raw)); const m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const range = (lo: number, hi: number) => { const step = nice(hi - lo); const min = Math.floor(lo / step) * step; const max = Math.ceil(hi / step) * step || step; return { min, max: max === min ? min + step : max, step }; };
const ticks = (min: number, max: number, step: number): number[] => { const out: number[] = []; for (let v = min; v <= max + step / 2; v += step) out.push(+v.toFixed(8)); return out; };
const num = (s: string, i: number): number => { const n = Number(s); return Number.isFinite(n) && s.trim() !== '' ? n : i + 1; };

interface Box { x: number; y: number; w: number; h: number }

const Grid = ({ b, min, max, step, horizontal, grid }: { b: Box; min: number; max: number; step: number; horizontal?: boolean; grid: boolean }) => (
  <>
    {ticks(min, max, step).map((t) => {
      const p = (t - min) / (max - min);
      return horizontal
        ? <g key={t}>{grid && <line x1={b.x + p * b.w} x2={b.x + p * b.w} y1={b.y} y2={b.y + b.h} stroke="#dfe2ea" strokeWidth={0.5} />}<text x={b.x + p * b.w} y={b.y + b.h + 10} textAnchor="middle" fontSize={8} fill="#555">{fmt(t)}</text></g>
        : <g key={t}>{grid && <line x1={b.x} x2={b.x + b.w} y1={b.y + b.h - p * b.h} y2={b.y + b.h - p * b.h} stroke="#dfe2ea" strokeWidth={0.5} />}<text x={b.x - 4} y={b.y + b.h - p * b.h + 3} textAnchor="end" fontSize={8} fill="#555">{fmt(t)}</text></g>;
    })}
  </>
);

const CatLabels = ({ a, b, horizontal }: { a: ChartAtom; b: Box; horizontal?: boolean }) => {
  const n = a.categories.length || 1;
  const band = (horizontal ? b.h : b.w) / n;
  return <>{a.categories.map((c, i) => (horizontal
    ? <text key={i} x={b.x - 4} y={b.y + band * (i + 0.5) + 3} textAnchor="end" fontSize={8} fill="#333">{c.slice(0, 14)}</text>
    : <text key={i} x={b.x + band * (i + 0.5)} y={b.y + b.h + 10} textAnchor="middle" fontSize={8} fill="#333">{c.slice(0, Math.max(4, Math.floor(band / 4)))}</text>))}</>;
};

const path = (pts: [number, number][], smooth?: boolean): string => {
  if (!pts.length) return '';
  if (!smooth || pts.length < 3) return `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}`;
  let d = `M${pts[0]![0]} ${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!; const p1 = pts[i]!; const p2 = pts[i + 1]!; const p3 = pts[i + 2] ?? p2;
    d += `C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return d;
};

// Columns, bars, lines and areas, plain, stacked or stacked to 100%.
const Cartesian = ({ a, b, kind }: { a: ChartAtom; b: Box; kind: 'column' | 'bar' | 'line' | 'area' }) => {
  const n = a.categories.length;
  const stacked = a.stacked || a.percent;
  const totals = a.categories.map((_, i) => a.series.reduce((s, x) => s + Math.abs(x.values[i] ?? 0), 0) || 1);
  const val = (si: number, i: number) => { const v = a.series[si]?.values[i] ?? 0; return a.percent ? (v / totals[i]!) * 100 : v; };
  let lo = 0; let hi = 0;
  for (let i = 0; i < n; i++) {
    if (stacked) { let pos = 0; let neg = 0; a.series.forEach((_, si) => { const v = val(si, i); if (v >= 0) pos += v; else neg += v; }); hi = Math.max(hi, pos); lo = Math.min(lo, neg); }
    else a.series.forEach((_, si) => { hi = Math.max(hi, val(si, i)); lo = Math.min(lo, val(si, i)); });
  }
  const { min, max, step } = a.percent ? { min: 0, max: 100, step: 20 } : range(lo, hi);
  const horizontal = kind === 'bar';
  const sc = (v: number) => (v - min) / (max - min);
  const band = (horizontal ? b.h : b.w) / (n || 1);
  const base = (si: number, i: number) => { let s = 0; for (let k = 0; k < si; k++) { const o = val(k, i); if (Math.sign(o) === Math.sign(val(si, i))) s += o; } return stacked ? s : 0; };
  const ser = a.series.length || 1;
  return (
    <>
      <Grid b={b} min={min} max={max} step={step} horizontal={horizontal} grid={!a.noGrid} />
      {a.series.map((s, si) => {
        const c = color(a, si);
        if (kind === 'line' || kind === 'area') {
          const pts = s.values.map((_, i) => [b.x + band * (i + 0.5), b.y + b.h - sc(base(si, i) + val(si, i)) * b.h] as [number, number]);
          if (!pts.length) return null;
          if (kind === 'area') {
            const under = s.values.map((_, i) => [b.x + band * (i + 0.5), b.y + b.h - sc(base(si, i)) * b.h] as [number, number]).reverse();
            return <path key={si} d={`${path(pts)}L${under.map(([x, y]) => `${x} ${y}`).join('L')}Z`} fill={c} fillOpacity={0.6} stroke={c} />;
          }
          return <g key={si}><path d={path(pts, a.smooth)} fill="none" stroke={c} strokeWidth={1.75} />{a.markers !== false && pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.2} fill={c} />)}{a.labels && pts.map(([x, y], i) => <text key={`l${i}`} x={x} y={y - 4} textAnchor="middle" fontSize={7} fill="#333">{fmt(s.values[i] ?? 0)}</text>)}</g>;
        }
        return s.values.map((_, i) => {
          const from = sc(base(si, i)); const to = sc(base(si, i) + val(si, i));
          const lo2 = Math.min(from, to); const len = Math.abs(to - from);
          const slot = band * 0.72; const w = stacked ? slot : slot / ser; const off = band * 0.14 + (stacked ? 0 : si * w);
          const r = horizontal ? { x: b.x + lo2 * b.w, y: b.y + band * i + off, width: len * b.w, height: w } : { x: b.x + band * i + off, y: b.y + b.h - (lo2 + len) * b.h, width: w, height: len * b.h };
          return <g key={`${si}-${i}`}><rect {...r} fill={c} />{a.labels && <text x={r.x + r.width / 2} y={horizontal ? r.y + r.height / 2 + 3 : r.y - 2} textAnchor="middle" fontSize={7} fill="#333">{fmt(a.series[si]!.values[i] ?? 0)}</text>}</g>;
        });
      })}
      <CatLabels a={a} b={b} horizontal={horizontal} />
      {horizontal ? <line x1={b.x + sc(0) * b.w} x2={b.x + sc(0) * b.w} y1={b.y} y2={b.y + b.h} stroke="#888" strokeWidth={0.75} /> : <line x1={b.x} x2={b.x + b.w} y1={b.y + b.h - sc(0) * b.h} y2={b.y + b.h - sc(0) * b.h} stroke="#888" strokeWidth={0.75} />}
    </>
  );
};

const Round = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
  const R = Math.max(10, Math.min(b.w, b.h) / 2 - 4);
  const rings = a.chart === 'sunburst' ? a.series : [a.series[0]!].filter(Boolean);
  const hole = a.chart === 'doughnut' ? 0.55 : a.chart === 'sunburst' ? 0.25 : 0;
  const width = (R * (1 - hole)) / (rings.length || 1);
  const p = (r: number, t: number) => `${cx + Math.cos(t) * r} ${cy + Math.sin(t) * r}`;
  return <>{rings.map((s, ri) => {
    const vals = s.values.map((v) => Math.max(0, v)); const total = vals.reduce((x, y) => x + y, 0) || 1;
    const r1 = R * hole + width * ri; const r2 = r1 + width;
    let ang = -Math.PI / 2;
    return vals.map((v, i) => {
      const span = (v / total) * Math.PI * 2; const end = ang + Math.min(span, Math.PI * 2 - 0.0001); const big = span > Math.PI ? 1 : 0;
      const d = r1 ? `M${p(r2, ang)}A${r2} ${r2} 0 ${big} 1 ${p(r2, end)}L${p(r1, end)}A${r1} ${r1} 0 ${big} 0 ${p(r1, ang)}Z` : `M${cx} ${cy}L${p(r2, ang)}A${r2} ${r2} 0 ${big} 1 ${p(r2, end)}Z`;
      const mid = ang + span / 2; ang += span;
      return <g key={`${ri}-${i}`}><path d={d} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={1 - ri * 0.18} stroke="#fff" strokeWidth={1} />{a.labels && span > 0.3 && <text x={cx + Math.cos(mid) * (r1 + r2) / 2} y={cy + Math.sin(mid) * (r1 + r2) / 2 + 3} textAnchor="middle" fontSize={7} fill="#fff">{fmt(v)}</text>}</g>;
    });
  })}</>;
};

const Scatter = ({ a, b, bubble }: { a: ChartAtom; b: Box; bubble?: boolean }) => {
  const xs = a.categories.map(num);
  const ys = bubble ? [a.series[0]?.values ?? []] : a.series.map((s) => s.values);
  const sizes = bubble ? a.series[1]?.values ?? [] : [];
  const xr = range(Math.min(0, ...xs), Math.max(...xs, 1)); const yr = range(Math.min(0, ...ys.flat()), Math.max(...ys.flat(), 1));
  const X = (v: number) => b.x + ((v - xr.min) / (xr.max - xr.min)) * b.w; const Y = (v: number) => b.y + b.h - ((v - yr.min) / (yr.max - yr.min)) * b.h;
  const big = Math.max(...sizes.map(Math.abs), 1);
  return (
    <>
      <Grid b={b} min={yr.min} max={yr.max} step={yr.step} grid={!a.noGrid} />
      {ticks(xr.min, xr.max, xr.step).map((t) => <text key={t} x={X(t)} y={b.y + b.h + 10} textAnchor="middle" fontSize={8} fill="#555">{fmt(t)}</text>)}
      {ys.map((vals, si) => <g key={si}>
        {a.smooth !== undefined && !bubble && a.markers === false && <path d={path(vals.map((v, i) => [X(xs[i]!), Y(v)] as [number, number]), a.smooth)} fill="none" stroke={color(a, si)} strokeWidth={1.5} />}
        {vals.map((v, i) => <circle key={i} cx={X(xs[i]!)} cy={Y(v)} r={bubble ? 3 + (Math.abs(sizes[i] ?? 1) / big) * Math.min(b.w, b.h) * 0.1 : 3} fill={color(a, si)} fillOpacity={bubble ? 0.6 : 1} />)}
      </g>)}
    </>
  );
};

const Radar = ({ a, b, filled }: { a: ChartAtom; b: Box; filled?: boolean }) => {
  const n = a.categories.length || 1; const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const R = Math.min(b.w, b.h) / 2 - 12;
  const { max, step } = range(0, Math.max(...a.series.flatMap((s) => s.values), 1));
  const pt = (i: number, v: number): [number, number] => { const t = -Math.PI / 2 + (i * Math.PI * 2) / n; return [cx + Math.cos(t) * R * (v / max), cy + Math.sin(t) * R * (v / max)]; };
  return (
    <>
      {ticks(step, max, step).map((t) => <path key={t} d={`${path(a.categories.map((_, i) => pt(i, t)))}Z`} fill="none" stroke="#dfe2ea" strokeWidth={0.5} />)}
      {a.categories.map((c, i) => { const [x, y] = pt(i, max * 1.12); return <g key={i}><line x1={cx} y1={cy} x2={pt(i, max)[0]} y2={pt(i, max)[1]} stroke="#dfe2ea" strokeWidth={0.5} /><text x={x} y={y + 3} textAnchor="middle" fontSize={8} fill="#333">{c.slice(0, 12)}</text></g>; })}
      {a.series.map((s, si) => <path key={si} d={`${path(s.values.map((v, i) => pt(i, Math.max(0, v))))}Z`} fill={filled ? color(a, si) : 'none'} fillOpacity={0.35} stroke={color(a, si)} strokeWidth={1.5} />)}
    </>
  );
};

const Stock = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const [hi, lo, close] = [a.series[0]?.values ?? [], a.series[1]?.values ?? [], a.series[2]?.values ?? []];
  const r = range(Math.min(...lo, ...close), Math.max(...hi, ...close, 1));
  const n = a.categories.length || 1; const band = b.w / n; const Y = (v: number) => b.y + b.h - ((v - r.min) / (r.max - r.min)) * b.h;
  return <><Grid b={b} min={r.min} max={r.max} step={r.step} grid={!a.noGrid} />{a.categories.map((_, i) => { const x = b.x + band * (i + 0.5); return <g key={i}><line x1={x} x2={x} y1={Y(hi[i] ?? 0)} y2={Y(lo[i] ?? 0)} stroke="#333" /><line x1={x} x2={x + band * 0.25} y1={Y(close[i] ?? 0)} y2={Y(close[i] ?? 0)} stroke={color(a, 0)} strokeWidth={2} /></g>; })}<CatLabels a={a} b={b} /></>;
};

const Surface = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const all = a.series.flatMap((s) => s.values); const lo = Math.min(...all, 0); const hi = Math.max(...all, 1);
  const cw = b.w / (a.categories.length || 1); const ch = b.h / (a.series.length || 1);
  const heat = (v: number) => { const t = (v - lo) / (hi - lo || 1); return `hsl(${230 - t * 230} 75% ${55 - t * 10}%)`; };
  return <>{a.series.map((s, si) => s.values.map((v, i) => <rect key={`${si}-${i}`} x={b.x + i * cw} y={b.y + si * ch} width={cw + 0.5} height={ch + 0.5} fill={heat(v)} />))}<CatLabels a={a} b={b} />{a.series.map((s, si) => <text key={si} x={b.x - 4} y={b.y + si * ch + ch / 2 + 3} textAnchor="end" fontSize={8} fill="#333">{s.name.slice(0, 10)}</text>)}</>;
};

// Squarified layout: rows of tiles kept as close to square as possible.
const Treemap = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const items = (a.series[0]?.values ?? []).map((v, i) => ({ v: Math.max(0, v), i })).filter((x) => x.v > 0).sort((p, q) => q.v - p.v);
  let total = items.reduce((s, x) => s + x.v, 0) || 1;
  const tiles: { i: number; x: number; y: number; w: number; h: number }[] = [];
  let { x, y, w, h } = b; let rest = items.slice(); let area = w * h;
  while (rest.length) {
    const side = Math.min(w, h); const row: typeof items = []; let worst = Infinity;
    for (const it of rest) {
      const next = [...row, it]; const s = next.reduce((t, q) => t + (q.v / total) * area, 0);
      const ws = Math.max(...next.map((q) => Math.max((side * side * (q.v / total) * area) / (s * s), (s * s) / (side * side * (q.v / total) * area))));
      if (ws > worst) break; worst = ws; row.push(it);
    }
    const s = row.reduce((t, q) => t + (q.v / total) * area, 0); const thick = s / side; let at = 0;
    for (const q of row) { const len = ((q.v / total) * area) / thick; tiles.push(w >= h ? { i: q.i, x, y: y + at, w: thick, h: len } : { i: q.i, x: x + at, y, w: len, h: thick }); at += len; }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    rest = rest.slice(row.length);
    const left = rest.reduce((t, q) => t + q.v, 0);
    total = left || 1;
    area = w * h;
  }
  return <>{tiles.map((t) => <g key={t.i}><rect x={t.x} y={t.y} width={Math.max(0, t.w - 1)} height={Math.max(0, t.h - 1)} fill={CHART_COLORS[t.i % CHART_COLORS.length]} />{t.w > 30 && t.h > 14 && <text x={t.x + 4} y={t.y + 11} fontSize={8} fill="#fff">{a.categories[t.i]?.slice(0, Math.floor(t.w / 5))}</text>}</g>)}</>;
};

const Histogram = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const vals = a.series.flatMap((s) => s.values); const lo = Math.min(...vals); const hi = Math.max(...vals);
  const bins = Math.max(3, Math.min(20, Math.ceil(Math.sqrt(vals.length)))); const size = (hi - lo || 1) / bins;
  const counts = Array.from({ length: bins }, (_, k) => vals.filter((v) => (k === bins - 1 ? v >= lo + k * size : v >= lo + k * size && v < lo + (k + 1) * size)).length);
  const fake: ChartAtom = { ...a, chart: 'column', categories: counts.map((_, k) => `${fmt(lo + k * size)}–${fmt(lo + (k + 1) * size)}`), series: [{ name: a.series[0]?.name ?? 'Count', values: counts, color: color(a, 0) }], stacked: false, percent: false };
  return <Cartesian a={fake} b={b} kind="column" />;
};

const BoxWhisker = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const stats = a.series.map((s) => { const v = [...s.values].sort((x, y) => x - y); const q = (p: number) => { const i = (v.length - 1) * p; const f = Math.floor(i); return v[f]! + ((v[Math.ceil(i)] ?? v[f]!) - v[f]!) * (i - f); }; return { min: v[0] ?? 0, q1: q(0.25), med: q(0.5), q3: q(0.75), max: v[v.length - 1] ?? 0, mean: v.reduce((x, y) => x + y, 0) / (v.length || 1) }; });
  const r = range(Math.min(...stats.map((s) => s.min)), Math.max(...stats.map((s) => s.max), 1));
  const Y = (v: number) => b.y + b.h - ((v - r.min) / (r.max - r.min)) * b.h; const band = b.w / (stats.length || 1);
  return <><Grid b={b} min={r.min} max={r.max} step={r.step} grid={!a.noGrid} />{stats.map((s, i) => { const x = b.x + band * i + band * 0.25; const w = band * 0.5; const c = color(a, i); return <g key={i}><line x1={x + w / 2} x2={x + w / 2} y1={Y(s.max)} y2={Y(s.min)} stroke="#333" /><rect x={x} y={Y(s.q3)} width={w} height={Math.max(1, Y(s.q1) - Y(s.q3))} fill={c} fillOpacity={0.5} stroke={c} /><line x1={x} x2={x + w} y1={Y(s.med)} y2={Y(s.med)} stroke="#111" strokeWidth={1.5} /><text x={x + w / 2} y={Y(s.mean) + 3} textAnchor="middle" fontSize={8}>×</text><text x={x + w / 2} y={b.y + b.h + 10} textAnchor="middle" fontSize={8} fill="#333">{a.series[i]!.name.slice(0, 12)}</text></g>; })}</>;
};

const Waterfall = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const d = a.series[0]?.values ?? []; let run = 0; const steps = d.map((v) => { const from = run; run += v; return { from, to: run, v }; });
  const r = range(Math.min(0, ...steps.map((s) => Math.min(s.from, s.to))), Math.max(...steps.map((s) => Math.max(s.from, s.to)), 1));
  const Y = (v: number) => b.y + b.h - ((v - r.min) / (r.max - r.min)) * b.h; const band = b.w / (d.length || 1);
  return <><Grid b={b} min={r.min} max={r.max} step={r.step} grid={!a.noGrid} />{steps.map((s, i) => <g key={i}><rect x={b.x + band * i + band * 0.15} y={Y(Math.max(s.from, s.to))} width={band * 0.7} height={Math.max(1, Math.abs(Y(s.from) - Y(s.to)))} fill={s.v >= 0 ? '#2f9e44' : '#d6336c'} />{i < steps.length - 1 && <line x1={b.x + band * i + band * 0.85} x2={b.x + band * (i + 1) + band * 0.15} y1={Y(s.to)} y2={Y(s.to)} stroke="#888" strokeWidth={0.5} />}{a.labels && <text x={b.x + band * (i + 0.5)} y={Y(Math.max(s.from, s.to)) - 2} textAnchor="middle" fontSize={7}>{fmt(s.v)}</text>}</g>)}<CatLabels a={a} b={b} /></>;
};

const Funnel = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const v = a.series[0]?.values ?? []; const top = Math.max(...v, 1); const h = b.h / (v.length || 1);
  return <>{v.map((x, i) => { const w = (Math.max(0, x) / top) * b.w; return <g key={i}><rect x={b.x + (b.w - w) / 2} y={b.y + i * h + 1} width={w} height={h - 2} fill={CHART_COLORS[i % CHART_COLORS.length]} /><text x={b.x + b.w / 2} y={b.y + i * h + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#fff">{`${a.categories[i] ?? ''} ${fmt(x)}`.slice(0, 30)}</text></g>; })}</>;
};

const Combo = ({ a, b }: { a: ChartAtom; b: Box }) => {
  const cols: ChartAtom = { ...a, series: a.series.slice(0, Math.max(1, a.series.length - 1)), stacked: false, percent: false };
  const all = a.series.flatMap((s) => s.values); const r = range(Math.min(0, ...all), Math.max(...all, 1));
  const last = a.series.length > 1 ? a.series[a.series.length - 1]! : null; const band = b.w / (a.categories.length || 1);
  const Y = (v: number) => b.y + b.h - ((v - r.min) / (r.max - r.min)) * b.h;
  return <><Cartesian a={{ ...cols, series: [...cols.series, { name: '', values: [r.max], color: 'transparent' }] }} b={b} kind="column" />{last && <path d={path(last.values.map((v, i) => [b.x + band * (i + 0.5), Y(v)]))} fill="none" stroke={color(a, a.series.length - 1)} strokeWidth={2} />}</>;
};

export const ChartView = memo(function ChartView({ a }: { a: ChartAtom }) {
  const W = a.width; const H = a.height;
  const perPoint = ['pie', 'doughnut', 'treemap', 'sunburst', 'funnel', 'waterfall'].includes(a.chart);
  const names = perPoint ? a.categories : a.chart === 'histogram' || a.chart === 'bubble' ? [] : a.series.map((s) => s.name);
  const legend = a.legend ?? 'b';
  const showLegend = legend !== 'none' && names.length > (perPoint ? 0 : 1) && a.chart !== 'funnel' && a.chart !== 'waterfall';
  const side = showLegend && (legend === 'r' || legend === 'l') ? Math.min(110, Math.max(...names.map((n) => Math.min(n.length, 16) * 4.4 + 18))) : 0;
  const top = (a.title ? 22 : 8) + (showLegend && legend === 't' ? 14 : 0);
  const bottom = (showLegend && legend === 'b' ? 18 : 6) + (a.xTitle ? 12 : 0);
  const axes = !['pie', 'doughnut', 'treemap', 'sunburst', 'funnel', 'radar', 'radarFilled'].includes(a.chart);
  const leftPad = (a.chart === 'bar' ? Math.min(70, Math.max(...a.categories.map((c) => c.length), 1) * 4.2 + 8) : axes ? 32 : 6) + (a.yTitle ? 12 : 0) + (legend === 'l' ? side : 0);
  const b: Box = { x: leftPad, y: top, w: Math.max(10, W - leftPad - 10 - (legend === 'r' ? side : 0)), h: Math.max(10, H - top - bottom - (axes ? 12 : 0)) };
  let body;
  switch (a.chart) {
    case 'pie': case 'doughnut': case 'sunburst': body = <Round a={a} b={b} />; break;
    case 'scatter': body = <Scatter a={a} b={b} />; break;
    case 'bubble': body = <Scatter a={a} b={b} bubble />; break;
    case 'radar': body = <Radar a={a} b={b} />; break;
    case 'radarFilled': body = <Radar a={a} b={b} filled />; break;
    case 'stock': body = <Stock a={a} b={b} />; break;
    case 'surface': body = <Surface a={a} b={b} />; break;
    case 'treemap': body = <Treemap a={a} b={b} />; break;
    case 'histogram': body = <Histogram a={a} b={b} />; break;
    case 'boxWhisker': body = <BoxWhisker a={a} b={b} />; break;
    case 'waterfall': body = <Waterfall a={a} b={b} />; break;
    case 'funnel': body = <Funnel a={a} b={b} />; break;
    case 'combo': body = <Combo a={a} b={b} />; break;
    default: body = <Cartesian a={a} b={b} kind={a.chart as 'column'} />;
  }
  const widths = names.map((n) => Math.min(n.length, 16) * 4.4 + 18);
  let lx = Math.max(4, (W - widths.reduce((x, y) => x + y, 0)) / 2);
  const swatch = (i: number) => (perPoint ? CHART_COLORS[i % CHART_COLORS.length] : color(a, i));
  return (
    <svg className="chartsvg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={a.alt || a.title || 'Chart'} style={{ fontFamily: FONT }}>
      <rect width={W} height={H} fill="#fff" />
      {a.title && <text x={W / 2} y={14} textAnchor="middle" fontSize={12} fill="#222">{a.title}</text>}
      {body}
      {a.xTitle && <text x={b.x + b.w / 2} y={H - (showLegend && legend === 'b' ? 18 : 4)} textAnchor="middle" fontSize={9} fill="#333">{a.xTitle}</text>}
      {a.yTitle && <text transform={`translate(10 ${b.y + b.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={9} fill="#333">{a.yTitle}</text>}
      {showLegend && (legend === 'b' || legend === 't') && names.map((n, i) => { const x = lx; lx += widths[i]!; const y = legend === 'b' ? H - 8 : (a.title ? 22 : 8) + 8; return <g key={i}><rect x={x} y={y - 7} width={8} height={8} fill={swatch(i)} /><text x={x + 11} y={y} fontSize={8} fill="#333">{n.slice(0, 16)}</text></g>; })}
      {showLegend && (legend === 'r' || legend === 'l') && names.map((n, i) => { const x = legend === 'r' ? W - side : 4; const y = top + 10 + i * 12; return <g key={i}><rect x={x} y={y - 7} width={8} height={8} fill={swatch(i)} /><text x={x + 11} y={y} fontSize={8} fill="#333">{n.slice(0, 16)}</text></g>; })}
    </svg>
  );
});
