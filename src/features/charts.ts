import type { ChartAtom, ChartKind } from '../core/model';
import { mapRunsInSelection } from '../core/ops';
import { register } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { selectedAtom } from './images';

export const sampleChart = (): ChartAtom => ({
  kind: 'chart',
  chart: 'column',
  title: 'Quarterly results',
  categories: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [{ name: 'Sales', values: [12, 19, 15, 24] }, { name: 'Costs', values: [8, 11, 9, 13] }],
  width: 396,
  height: 228,
  wrap: 'inline',
});

export const CHART_KINDS: [ChartKind, string][] = [['column', 'Columns'], ['bar', 'Bars'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['doughnut', 'Ring']];

// Editing replaces the saved drawing, so the writer builds a fresh chart part.
export const applyChart = (s: EditorStore, next: ChartAtom): void => {
  const { xml: _x, ...clean } = next;
  s.commit(mapRunsInSelection(s.doc, s.sel, (r) => (r.atom?.kind === 'chart' ? { ...r, atom: clean } : r)));
};

export const registerCharts = (): void => {
  register(
    { id: 'ins.chart', label: 'Chart', group: 'Insert', run: (s) => s.openDialog('chart', { create: true }) },
    { id: 'obj.chart', label: 'Edit chart data', group: 'Insert', enabled: (s) => selectedAtom(s)?.kind === 'chart', run: (s) => s.openDialog('chart') },
  );
};
