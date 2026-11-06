import { useEffect, useRef, useState, type MouseEvent as RME, type ReactElement } from 'react';
import type { ParaProps, TabStop } from '../core/model';
import { setParaProps, updateTable } from '../core/ops';
import { locate, storyBlocks } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { currentPara, setSection } from '../features/coreCommands';

const PT = 4 / 3;
const SNAP = 4.5;
const snap = (v: number): number => Math.round(v / SNAP) * SNAP;

export const Ruler = ({ store }: { store: EditorStore }) => {
  const el = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  const sec = store.doc.section;
  const zoom = store.view.zoom * PT;
  const px = (pt: number) => left + pt * zoom;

  useEffect(() => {
    const canvas = document.querySelector('.canvas');
    const update = () => {
      const page = document.querySelector('.page');
      const base = el.current?.getBoundingClientRect().left ?? 0;
      if (page) setLeft(page.getBoundingClientRect().left - base);
    };
    update();
    canvas?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    if (canvas) ro.observe(canvas);
    return () => { canvas?.removeEventListener('scroll', update); window.removeEventListener('resize', update); ro.disconnect(); };
  });

  const p = currentPara(store);
  const ml = sec.marginLeft + (sec.gutter ?? 0);
  const textWidth = sec.pageWidth - ml - sec.marginRight;
  const metric = Math.abs(sec.pageWidth - 595.3) < 3;
  const unit = metric ? 28.35 : 72;

  const drag = (e: RME, onMove: (dx: number) => void, onEnd?: (x: number, y: number) => void) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const move = (ev: MouseEvent) => onMove((ev.clientX - sx) / zoom);
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      onEnd?.(ev.clientX, ev.clientY);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const para = (patch: ParaProps) => store.commit(setParaProps(store.doc, store.sel, patch), { group: true });
  const tabs = p.tabs ?? [];
  const setTabs = (list: TabStop[]) => para({ tabs: list });

  const addTab = (e: RME) => {
    const r = el.current!.getBoundingClientRect();
    const pos = snap((e.clientX - r.left - left) / zoom - ml);
    if (pos > 0 && pos < textWidth) setTabs([...tabs, { pos, kind: 'left' }]);
  };

  const home = locate(storyBlocks(store.doc, store.sel.focus.story), store.sel.focus.para);
  const table = home?.table;
  let colX = 0;
  const cols = table ? table.grid.slice(0, -1).map((g) => (colX += g)) : [];

  const dragCol = (e: RME, i: number) => {
    const t = table!;
    const startA = t.grid[i]!;
    const startB = t.grid[i + 1]!;
    drag(e, (dx) => {
      const a = Math.max(18, Math.min(startA + startB - 18, startA + dx));
      const grid = t.grid.map((g, k) => (k === i ? a : k === i + 1 ? startA + startB - a : g));
      const widths = (start: number, span: number) => grid.slice(start, start + span).reduce((x, y) => x + y, 0);
      store.commit(updateTable(store.doc, store.sel.focus.story, store.sel.focus.para, (tb) => ({
        ...tb,
        grid,
        rows: tb.rows.map((r) => {
          let c = 0;
          return { ...r, cells: r.cells.map((cell) => { const span = cell.props.gridSpan ?? 1; const w = widths(c, span); c += span; return { ...cell, props: { ...cell.props, width: w } }; }) };
        }),
      })), { group: true });
    });
  };

  const ticks: ReactElement[] = [];
  const count = Math.ceil(sec.pageWidth / unit);
  for (let i = -Math.floor(ml / unit); i <= count; i++) {
    const x = px(ml + i * unit);
    if (i !== 0) ticks.push(<span key={`n${i}`} className="num" style={{ left: x }}>{Math.abs(i)}</span>);
    ticks.push(<span key={`h${i}`} className="tick" style={{ left: px(ml + (i + 0.5) * unit) }} />);
  }

  const indent = p.indentLeft ?? 0;
  const first = p.firstLine ?? 0;
  const right = p.indentRight ?? 0;

  return (
    <div className="ruler" ref={el} onMouseDown={addTab} aria-hidden>
      <div className="sheet" style={{ left: px(0), width: sec.pageWidth * zoom }} />
      <div className="off" style={{ left: px(0), width: ml * zoom }} />
      <div className="off" style={{ left: px(sec.pageWidth - sec.marginRight), width: sec.marginRight * zoom }} />
      {ticks}
      <span className="edge" style={{ left: px(ml) }} onMouseDown={(e) => { const s0 = sec.marginLeft; drag(e, (d) => setSection(store, { marginLeft: Math.max(0, snap(s0 + d)) })); }} />
      <span className="edge" style={{ left: px(sec.pageWidth - sec.marginRight) }} onMouseDown={(e) => { const s0 = sec.marginRight; drag(e, (d) => setSection(store, { marginRight: Math.max(0, snap(s0 - d)) })); }} />
      {!table && <>
        <span className="mk first" title="First line" style={{ left: px(ml + indent + first) }} onMouseDown={(e) => { const s0 = first; drag(e, (d) => para({ firstLine: snap(s0 + d) })); }} />
        <span className="mk left" title="Left indent" style={{ left: px(ml + indent) }} onMouseDown={(e) => { const s0 = indent; drag(e, (d) => para({ indentLeft: Math.max(0, snap(s0 + d)) })); }} />
        <span className="mk right" title="Right indent" style={{ left: px(sec.pageWidth - sec.marginRight - right) }} onMouseDown={(e) => { const s0 = right; drag(e, (d) => para({ indentRight: Math.max(0, snap(s0 - d)) })); }} />
        {tabs.filter((t) => t.kind !== 'clear').map((t, i) => (
          <span key={i} className={`tb ${t.kind}`} title="Tab stop. Double-click to change the kind. Drag down to remove."
            style={{ left: px(ml + t.pos) }}
            onDoubleClick={(e) => { e.stopPropagation(); const order: TabStop['kind'][] = ['left', 'center', 'right', 'decimal']; setTabs(tabs.map((x, k) => (k === i ? { ...x, kind: order[(order.indexOf(x.kind) + 1) % 4]! } : x))); }}
            onMouseDown={(e) => {
              const s0 = t.pos;
              const y0 = e.clientY;
              drag(e, (d) => setTabs(tabs.map((x, k) => (k === i ? { ...x, pos: Math.max(0, snap(s0 + d)) } : x))), (_x, y) => { if (Math.abs(y - y0) > 24) setTabs(tabs.filter((_, k) => k !== i)); });
            }} />
        ))}
      </>}
      {cols.map((c, i) => <span key={i} className="col" title="Drag to change the column width" style={{ left: px(ml + (table!.props.indent ?? 0) + c) }} onMouseDown={(e) => dragCol(e, i)} />)}
    </div>
  );
};
