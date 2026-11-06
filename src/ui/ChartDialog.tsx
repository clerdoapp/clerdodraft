import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { ChartAtom, ChartKind } from '../core/model';
import type { EditorStore } from '../editor/store';
import { applyChart, CHART_KINDS, sampleChart } from '../features/charts';
import { selectedAtom } from '../features/images';
import { ChartView } from './Drawings';

const num = (v: string): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const ChartDialog = ({ store, create }: { store: EditorStore; create: boolean }) => {
  const initial = !create ? selectedAtom(store) : undefined;
  const [a, set] = useState<ChartAtom>(initial?.kind === 'chart' ? initial : sampleChart());
  const patchCell = (si: number, ci: number, v: string) => set({ ...a, series: a.series.map((s, i) => (i === si ? { ...s, values: a.categories.map((_, k) => (k === ci ? num(v) : s.values[k] ?? 0)) } : s)) });
  const addRow = () => set({ ...a, categories: [...a.categories, `Item ${a.categories.length + 1}`], series: a.series.map((s) => ({ ...s, values: [...s.values, 0] })) });
  const delRow = () => { if (a.categories.length > 1) set({ ...a, categories: a.categories.slice(0, -1), series: a.series.map((s) => ({ ...s, values: s.values.slice(0, a.categories.length - 1) })) }); };
  const addCol = () => { if (a.series.length < 20) set({ ...a, series: [...a.series, { name: `Series ${a.series.length + 1}`, values: a.categories.map(() => 0) }] }); };
  const delCol = () => { if (a.series.length > 1) set({ ...a, series: a.series.slice(0, -1) }); };
  const round = ['pie', 'doughnut', 'treemap', 'funnel', 'waterfall', 'histogram'].includes(a.chart);
  const done = () => {
    store.closeDialog();
    if (create) store.insertAtom(a, {});
    else applyChart(store, a);
  };
  return (
    <div>
      <h2>{create ? 'Add a chart' : 'Edit chart'}</h2>
      <div className="fields">
        <label className="field"><span>Type</span><select value={a.chart} onChange={(e) => set({ ...a, chart: e.target.value as ChartKind })}>{CHART_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Title</span><input value={a.title ?? ''} onChange={(e) => set({ ...a, title: e.target.value })} /></label>
        {['column', 'bar', 'line', 'area'].includes(a.chart) && <label className="field"><span>Grouping</span><select value={a.percent ? 'percent' : a.stacked ? 'stacked' : 'side'} onChange={(e) => set({ ...a, stacked: e.target.value === 'stacked' || undefined, percent: e.target.value === 'percent' || undefined })}><option value="side">Side by side</option><option value="stacked">Stacked</option><option value="percent">Stacked to 100%</option></select></label>}
        <label className="field"><span>Legend</span><select value={a.legend ?? 'b'} onChange={(e) => set({ ...a, legend: e.target.value as ChartAtom['legend'] })}><option value="b">Below</option><option value="t">Above</option><option value="r">Right</option><option value="l">Left</option><option value="none">None</option></select></label>
        <label className="field"><span>Across title</span><input value={a.xTitle ?? ''} onChange={(e) => set({ ...a, xTitle: e.target.value || undefined })} /></label>
        <label className="field"><span>Up title</span><input value={a.yTitle ?? ''} onChange={(e) => set({ ...a, yTitle: e.target.value || undefined })} /></label>
        <div className="row">
          <label className="check"><input type="checkbox" checked={!!a.labels} onChange={(e) => set({ ...a, labels: e.target.checked || undefined })} /> Show values</label>
          <label className="check"><input type="checkbox" checked={!a.noGrid} onChange={(e) => set({ ...a, noGrid: !e.target.checked || undefined })} /> Gridlines</label>
          {['line', 'scatter', 'radar'].includes(a.chart) && <label className="check"><input type="checkbox" checked={a.markers !== false} onChange={(e) => set({ ...a, markers: e.target.checked ? undefined : false })} /> Markers</label>}
          {['line', 'scatter'].includes(a.chart) && <label className="check"><input type="checkbox" checked={!!a.smooth} onChange={(e) => set({ ...a, smooth: e.target.checked || undefined })} /> Smooth</label>}
        </div>
      </div>
      <div className="chartprev"><ChartView a={{ ...a, width: 396, height: 200 }} /></div>
      <div className="grid">
        <table>
          <thead>
            <tr><th />{a.series.map((s, si) => <th key={si}><input aria-label={`Series ${si + 1} name`} value={s.name} onChange={(e) => set({ ...a, series: a.series.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) })} /></th>)}</tr>
          </thead>
          <tbody>
            {a.categories.map((c, ci) => (
              <tr key={ci}>
                <th><input aria-label={`Row ${ci + 1} label`} value={c} onChange={(e) => set({ ...a, categories: a.categories.map((x, i) => (i === ci ? e.target.value : x)) })} /></th>
                {a.series.map((s, si) => <td key={si}><input aria-label={`${s.name} ${c}`} inputMode="decimal" value={s.values[ci] ?? 0} onChange={(e) => patchCell(si, ci, e.target.value)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="tool" onClick={addRow}><Plus size={14} strokeWidth={1.9} /> Row</button>
        <button className="tool" onClick={delRow}><Minus size={14} strokeWidth={1.9} /> Row</button>
        {!round && <button className="tool" onClick={addCol}><Plus size={14} strokeWidth={1.9} /> Series</button>}
        {!round && <button className="tool" onClick={delCol}><Minus size={14} strokeWidth={1.9} /> Series</button>}
      </div>
      <footer><button className="tool" onClick={() => store.closeDialog()}>Cancel</button><button className="primary" onClick={done}>{create ? 'Add' : 'Apply'}</button></footer>
    </div>
  );
};
