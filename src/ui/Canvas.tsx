import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as RME } from 'react';
import type { ImageAtom, RunProps, ShapeAtom, StoryId } from '../core/model';
import { BOX_INSET_X, BOX_INSET_Y } from '../layout/paginate';
import { ChartView, DiagramView, EquationView, ShapeOutline } from './Drawings';
import { collapsed, findPara, isCollapsed, orderedSel, paraLength } from '../core/tree';
import { cssFamily } from '../layout/measure';
import type { Box, Frag, Page, PlacedFloat, PlacedLine } from '../layout/types';
import { fragStyle, handleCopy, handleKey, handlePaste, mediaUrl, posFromDom, wordAt, rectOfPos, ownSpans } from '../editor/interaction';
import type { EditorStore } from '../editor/store';
import { openBytes } from '../features/files';
import { symbolText } from '../core/fonts';
import { setParaProps } from '../core/ops';

const PT = 4 / 3;

// On touch screens the keyboard stays closed until the person taps the page.
const coarse = (): boolean => matchMedia('(pointer: coarse)').matches;

const pictureFilter = (a: ImageAtom): string | undefined => {
  const f = [a.gray ? 'grayscale(1)' : '', a.bright ? `brightness(${1 + a.bright / 100})` : '', a.contrast ? `contrast(${1 + a.contrast / 100})` : ''].filter(Boolean).join(' ');
  return f || undefined;
};

const cropStyle = (a: ImageAtom): CSSProperties => {
  const c = a.crop!;
  const w = a.width / (1 - (c.l + c.r) / 100);
  const h = a.height / (1 - (c.t + c.b) / 100);
  return { position: 'absolute', width: w, height: h, left: (-c.l / 100) * w, top: (-c.t / 100) * h, filter: pictureFilter(a), maxWidth: 'none' };
};

const LineView = memo(function LineView({ line, marks, store }: { line: PlacedLine; marks: boolean; store: EditorStore }) {
  const style: CSSProperties = {
    left: line.x,
    top: line.y,
    width: Math.max(line.textWidth, 1) + 1,
    height: line.height,
    lineHeight: `${line.height}px`,
    wordSpacing: line.wordSpacing || undefined,
    ...(line.turn ? { transform: `rotate(${line.turn}deg)`, transformOrigin: '0 0' } : {}),
  };
  return (
    <div className="ln" dir={line.rtl ? 'rtl' : 'ltr'} data-para={line.para} data-story={line.story} data-from={line.from} data-to={line.to} style={style}>
      {line.label && (
        <span className="lbl" data-label style={{ ...labelStyle(line.label.eff), width: line.label.advance ?? line.label.width, marginInlineStart: line.label.x }}>{line.label.text}</span>
      )}
      {line.frags.map((f, i) => <FragView key={i} f={f} marks={marks} store={store} />)}
      {marks && line.isLast && <span className="pilcrow" data-mark style={{ fontSize: line.frags[0]?.font.size ?? 11 }}>{'¶'}</span>}
      {!line.frags.length && <span data-f={line.from} className="empty">{'​'}</span>}
    </div>
  );
});

const labelStyle = (e: RunProps): CSSProperties => ({
  fontFamily: cssFamily(e.font ?? 'Calibri'),
  fontSize: e.size ?? 11,
  fontWeight: e.bold ? 700 : 400,
  fontStyle: e.italic ? 'italic' : undefined,
  color: e.color,
});

const FragView = ({ f, marks, store }: { f: Frag; marks: boolean; store: EditorStore }) => {
  if (f.kind === 'tab') {
    return (
      <span className={`tab${f.leader ? ' lead' : ''}`} data-f={f.from} data-tab style={{ width: f.width, fontFamily: cssFamily(f.font.family), fontSize: f.font.size }}>
        {f.leader ? f.leader.repeat(Math.max(0, Math.floor(f.width / (f.font.size * 0.28)))) : marks ? '→' : ''}
      </span>
    );
  }
  if (f.kind === 'mark') return marks ? <span className="brk" data-f={f.from} data-atom>{'↵'}</span> : <span data-f={f.from} data-atom className="brk0" />;
  const st = fragStyle(store, f);
  if (f.drop) return <span data-f={f.from} className="dropcap" style={{ ...st, fontSize: f.drop.size, left: -f.drop.width }}>{f.text}</span>;
  if (f.kind === 'hyphen') return <span aria-hidden style={st}>-</span>;
  if (f.atom) {
    const a = f.atom;
    if (a.kind === 'image') {
      if (a.wrap !== 'inline') return <span data-f={f.from} data-atom className="anchor" />;
      if (a.crop) return <span data-f={f.from} data-atom className="cropped" style={{ width: a.width, height: a.height }}><img alt={a.alt ?? ''} src={mediaUrl(store, a.media)} draggable={false} style={cropStyle(a)} /></span>;
      return <img data-f={f.from} data-atom alt={a.alt ?? ''} src={mediaUrl(store, a.media)} style={{ width: a.width, height: a.height, verticalAlign: 'baseline', filter: pictureFilter(a), transform: a.rotation ? `rotate(${a.rotation}deg)` : undefined }} draggable={false} />;
    }
    if (a.kind === 'shape') {
      if (a.wrap !== 'inline') return <span data-f={f.from} data-atom className="anchor" />;
      return <span data-f={f.from} data-atom data-drawing className="shape" style={{ width: a.width, height: a.height }}><ShapeBody atom={a} store={store} marks={marks} /></span>;
    }
    if (a.kind === 'chart') {
      if (a.wrap !== 'inline') return <span data-f={f.from} data-atom className="anchor" />;
      return <span data-f={f.from} data-atom data-drawing className="shape" style={{ width: a.width, height: a.height }}><ChartView a={a} /></span>;
    }
    if (a.kind === 'raw' && a.width && a.shapes?.length) return <span data-f={f.from} data-atom className="shape" style={{ width: a.width, height: a.height ?? 40 }}><DiagramView shapes={a.shapes} w={a.width} h={a.height ?? 40} /></span>;
    if (a.kind === 'raw' && a.width) return <span data-f={f.from} data-atom className="rawbox" style={{ width: a.width, height: a.height ?? 40 }}>{a.label}</span>;
    if (a.kind === 'control') return <span data-f={f.from} data-atom className="control" style={st}>{f.text}</span>;
    if (a.kind === 'equation') return <span data-f={f.from} data-atom data-drawing className="eq"><EquationView atom={a} size={f.font.size} store={store} color={f.eff.color} /></span>;
    return <span data-f={f.from} data-atom className={`atom ${a.kind}`} style={st}>{f.text}</span>;
  }
  const shown = symbolText(f.eff.font, f.text);
  return <span data-f={f.from} style={st}>{f.run?.link ? <a data-link href="#" onClick={(e) => e.preventDefault()}>{shown}</a> : shown}</span>;
};

const ShapeBody = ({ atom, store, marks }: { atom: ShapeAtom; store: EditorStore; marks: boolean }) => {
  const laid = atom.textId ? store.layout.boxes.get(atom.textId) : undefined;
  return (
    <>
      <ShapeOutline prst={atom.shape} w={atom.width} h={atom.height} fill={atom.fill} stroke={atom.stroke} width={atom.strokeWidth} />
      {atom.textId && (
        <div className="boxbody" data-box={atom.textId} style={{ left: BOX_INSET_X, top: BOX_INSET_Y, right: BOX_INSET_X, bottom: BOX_INSET_Y }}>
          {laid?.boxes.map((b, i) => <BoxView key={i} b={b} />)}
          {laid?.lines.map((l, i) => <LineView key={i} line={l} marks={marks} store={store} />)}
        </div>
      )}
    </>
  );
};

const BoxView = ({ b }: { b: Box }) => {
  const line = (l?: Box['top']) => (l ? `${Math.max(l.width, 0.5)}px ${l.style === 'double' ? 'double' : l.style === 'dotted' ? 'dotted' : l.style === 'dashed' ? 'dashed' : 'solid'} ${l.color ?? '#000'}` : undefined);
  return <div className="box" style={{ left: b.x, top: b.y, width: b.w, height: b.h, background: b.fill, borderTop: line(b.top), borderBottom: line(b.bottom), borderLeft: line(b.left), borderRight: line(b.right) }} />;
};

const FloatView = ({ f, store }: { f: PlacedFloat; store: EditorStore }) => {
  const a = f.atom;
  const st: CSSProperties = { left: f.x, top: f.y, width: f.w, height: f.h, zIndex: f.behind ? 0 : 3 };
  const onDown = (e: RME) => {
    if ((e.target as HTMLElement).closest('.boxbody')) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = { story: f.story, para: f.para, offset: f.offset };
    store.setSel({ anchor: pos, focus: { ...pos, offset: f.offset + 1 } });
    const zoom = store.view.zoom * PT;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - sx) / zoom;
      const dy = (ev.clientY - sy) / zoom;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      void import('../features/images').then((m) => m.moveSelectedFloat(store, f.x + dx, f.y + dy));
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  if (a.kind === 'image' && a.crop) return <div className="float cropped" data-float={`${f.para}:${f.offset}`} style={st} onMouseDown={onDown}><img alt={a.alt ?? ''} src={mediaUrl(store, a.media)} draggable={false} style={cropStyle({ ...a, width: f.w, height: f.h })} /></div>;
  if (a.kind === 'image') return <img className="float" data-float={`${f.para}:${f.offset}`} alt={a.alt ?? ''} src={mediaUrl(store, a.media)} style={{ ...st, filter: pictureFilter(a) }} onMouseDown={onDown} draggable={false} />;
  if (a.kind === 'chart') return <div className="float shape" data-float={`${f.para}:${f.offset}`} onMouseDown={onDown} style={st}><ChartView a={a} /></div>;
  return <div className="float shape" data-float={`${f.para}:${f.offset}`} onMouseDown={onDown} style={st}><ShapeBody atom={a} store={store} marks={store.view.showMarks} /></div>;
};

export const PageView = memo(function PageView({ page, live, marks, store, activeStory, grid }: { page: Page; live: boolean; marks: boolean; store: EditorStore; activeStory: string; grid?: boolean }) {
  const s = page.section;
  const doc = store.doc;
  const w = doc.settings.watermark;
  const inHF = activeStory.startsWith('hdr') || activeStory.startsWith('ftr');
  const pb = s.pageBorders;
  const pbLine = (l?: Box['top']) => (l ? `${Math.max(l.width, 0.5)}px solid ${l.color ?? '#000'}` : undefined);
  return (
    <div className={`page${grid ? ' gridded' : ''}`} data-page={page.index} style={{ width: page.width, height: page.height, background: doc.settings.pageColor ?? '#fff' }}>
      {!live ? null : (
        <>
          {pb && <div className="pgborder" style={{ inset: 24, borderTop: pbLine(pb.top), borderBottom: pbLine(pb.bottom), borderLeft: pbLine(pb.left), borderRight: pbLine(pb.right) }} />}
          {w?.text && <div className="wm" style={{ color: w.color ?? '#c8c8c8', transform: `translate(-50%,-50%) ${w.diagonal === false ? '' : 'rotate(-45deg)'}` }}>{w.text}</div>}
          {page.floats.filter((f) => f.behind).map((f, i) => <FloatView key={i} f={f} store={store} />)}
          <div className={`region${inHF ? ' dim' : ''}`}>
            {page.body.boxes.map((b, i) => <BoxView key={i} b={b} />)}
            {page.columnRules.map((r, i) => <div key={i} className="colrule" style={{ left: r.x, top: r.y, height: r.h }} />)}
            {page.body.lines.map((l, i) => <LineView key={i} line={l} marks={marks} store={store} />)}
            {page.noteSeparator && <div className="notesep" style={{ left: page.noteSeparator.x, top: page.noteSeparator.y, width: page.noteSeparator.w }} />}
            {page.notes.map((l, i) => <LineView key={`n${i}`} line={l} marks={marks} store={store} />)}
            {page.lineNumbers.map((n, i) => <div key={i} className="lnum" style={{ left: n.x, top: n.y, fontSize: n.size }}>{n.n}</div>)}
          </div>
          {(page.header || inHF) && (
            <div className={`region hf${inHF ? '' : ' dim'}`} data-hf="header" style={{ left: page.leftMargin ?? s.marginLeft, top: s.headerDistance, width: 0, height: 0 }}>
              {page.header?.boxes.map((b, i) => <BoxView key={i} b={b} />)}
              {page.header?.lines.map((l, i) => <LineView key={i} line={l} marks={marks} store={store} />)}
            </div>
          )}
          {(page.footer || inHF) && (
            <div className={`region hf${inHF ? '' : ' dim'}`} data-hf="footer" style={{ left: page.leftMargin ?? s.marginLeft, top: s.pageHeight - s.footerDistance - (page.footer?.height ?? 0), width: 0, height: 0 }}>
              {page.footer?.boxes.map((b, i) => <BoxView key={i} b={b} />)}
              {page.footer?.lines.map((l, i) => <LineView key={i} line={l} marks={marks} store={store} />)}
            </div>
          )}
          {page.floats.filter((f) => !f.behind).map((f, i) => <FloatView key={i} f={f} store={store} />)}
        </>
      )}
    </div>
  );
});

interface Overlay {
  caret: { x: number; y: number; h: number } | null;
  rects: { x: number; y: number; w: number; h: number }[];
  image: { x: number; y: number; w: number; h: number } | null;
  marks: { x: number; y: number; w: number; kind: string }[];
}

export const Canvas = ({ store }: { store: EditorStore }) => {
  useSyncExternalStore(store.subscribe, store.getVersion);
  const scroller = useRef<HTMLDivElement>(null);
  const pagesEl = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const dragging = useRef<'text' | null>(null);
  const clicks = useRef({ t: 0, n: 0, x: 0, y: 0 });
  const [range, setRange] = useState({ from: 0, to: 3 });
  const [overlay, setOverlay] = useState<Overlay>({ caret: null, rects: [], image: null, marks: [] });
  const { pages } = store.layout;
  const zoom = store.view.zoom * PT;
  const activeStory = store.sel.focus.story;

  const updateRange = useCallback(() => {
    const el = scroller.current;
    if (!el || !pagesEl.current) return;
    const kids = pagesEl.current.querySelectorAll<HTMLElement>('.page');
    const top = el.getBoundingClientRect().top;
    let from = kids.length;
    let to = 0;
    kids.forEach((k, i) => {
      const r = k.getBoundingClientRect();
      if (r.bottom >= top - 1200 && r.top <= top + el.clientHeight + 1200) {
        from = Math.min(from, i);
        to = Math.max(to, i + 1);
      }
    });
    if (from > to) { from = 0; to = 1; }
    setRange((p) => (p.from === from && p.to === to ? p : { from, to }));
  }, []);

  useEffect(() => { updateRange(); }, [pages.length, zoom, updateRange]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || store.view.mode !== 'web') return;
    const fit = () => {
      const w = Math.max(240, Math.round((el.clientWidth - 48) / zoom) - 36);
      if (Math.abs(w - store.view.webWidth) > 1) store.setView({ webWidth: w });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [store, store.view.mode, zoom]);

  const measureOverlay = useCallback(() => {
    const root = pagesEl.current;
    if (!root) return;
    const o = root.getBoundingClientRect();
    const toLocal = (r: DOMRect) => ({ x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, w: r.width / zoom, h: r.height / zoom });
    const sel = store.sel;
    const next: Overlay = { caret: null, rects: [], image: null, marks: [] };
    if (store.proof?.enabled) {
      root.querySelectorAll<HTMLElement>('.ln[data-story="body"]').forEach((ln) => {
        const para = ln.dataset.para!;
        const p = findPara(store.doc, { story: 'body', para });
        const issues = store.proof!.issuesIn(para, p);
        if (!issues.length) return;
        const lf = Number(ln.dataset.from);
        const lt = Number(ln.dataset.to);
        for (const i of issues) {
          if (i.to <= lf || i.from >= lt) continue;
          for (const r of rangeRects(ln, Math.max(lf, i.from), Math.min(lt, i.to))) {
            const q = toLocal(r);
            next.marks.push({ x: q.x, y: q.y + q.h - 2, w: q.w, kind: i.kind });
          }
        }
      });
    }
    if (isCollapsed(sel)) {
      const r = rectOfPos(root, sel.focus);
      if (r) next.caret = { x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, h: r.height / zoom };
    } else {
      const [a, b] = orderedSel(store.doc, sel);
      const lines = root.querySelectorAll<HTMLElement>('.ln');
      const ids = new Set(selectedIds(store));
      lines.forEach((ln) => {
        const para = ln.dataset.para!;
        if (!ids.has(para) || ln.dataset.story !== a.story) return;
        const lf = Number(ln.dataset.from);
        const lt = Number(ln.dataset.to);
        const from = para === a.para ? Math.max(lf, a.offset) : lf;
        const to = para === b.para ? Math.min(lt, b.offset) : lt;
        const whole = para !== b.para && to === lt;
        if (from > to) return;
        const rr = document.createRange();
        const spans = ownSpans(ln);
        let any = false;
        for (const s of spans) {
          const f = Number(s.dataset.f);
          const atom = s.dataset.atom !== undefined || s.dataset.tab !== undefined;
          const t = s.firstChild?.nodeType === 3 ? s.firstChild : (s.querySelector('a')?.firstChild ?? null);
          const len = atom ? 1 : (t?.textContent?.length ?? 0);
          if (f + len <= from || f >= to) continue;
          if (atom || !t) {
            next.rects.push(toLocal(s.getBoundingClientRect()));
          } else {
            rr.setStart(t, Math.max(0, from - f));
            rr.setEnd(t, Math.min(len, to - f));
            for (const c of rr.getClientRects()) next.rects.push(toLocal(c));
          }
          any = true;
        }
        const box = ln.getBoundingClientRect();
        if (!any && whole) next.rects.push({ ...toLocal(box), w: 6 });
        else if (whole && any) {
          const last = next.rects[next.rects.length - 1]!;
          last.w += 4;
        }
      });
      const p = findPara(store.doc, a);
      if (a.para === b.para && b.offset - a.offset === 1 && p) {
        const img = root.querySelector<HTMLElement>(`.ln[data-para="${a.para}"] img[data-f="${a.offset}"], .ln[data-para="${a.para}"] [data-drawing][data-f="${a.offset}"], [data-float="${a.para}:${a.offset}"]`);
        if (img) next.image = toLocal(img.getBoundingClientRect());
      }
    }
    setOverlay((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [store, zoom]);

  useLayoutEffect(() => { measureOverlay(); });

  // Keep the caret visible after edits and keyboard moves.
  const lastFocus = useRef('');
  useLayoutEffect(() => {
    const key = `${store.sel.focus.para}:${store.sel.focus.offset}`;
    if (key === lastFocus.current || dragging.current) return;
    lastFocus.current = key;
    const el = scroller.current;
    const root = pagesEl.current;
    if (!el || !root) return;
    const hit = store.layout.lineIndex.get(store.sel.focus.para);
    if (!hit?.length) return;
    const entry = hit.find((h) => store.sel.focus.offset <= h.line.to) ?? hit[hit.length - 1]!;
    const pageEl = root.querySelectorAll<HTMLElement>('.page')[entry.page];
    if (!pageEl) return;
    const pr = pageEl.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const top = pr.top + entry.line.y * zoom;
    const bot = top + entry.line.height * zoom;
    if (top < er.top + 24) el.scrollTop -= er.top + 24 - top;
    else if (bot > er.bottom - 24) el.scrollTop += bot - er.bottom + 24;
  });

  const focusInput = useCallback(() => input.current?.focus({ preventScroll: true }), []);

  useEffect(() => { focusInput(); }, [focusInput]);

  const dialogOpen = !!store.dialog;
  useEffect(() => { if (!dialogOpen) focusInput(); }, [dialogOpen, focusInput]);

  useEffect(() => {
    const back = () => {
      if (store.dialog || coarse()) return;
      const a = document.activeElement;
      if (a === input.current) return;
      if (!a || a === document.body || a.tagName === 'BUTTON') focusInput();
    };
    window.addEventListener('click', back);
    return () => window.removeEventListener('click', back);
  }, [store, focusInput]);

  useEffect(() => {
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = null;
      const brush = store.formatBrush;
      if (brush && !isCollapsed(store.sel)) {
        store.formatRun(brush.run);
        if (brush.para) store.commit(setParaProps(store.doc, store.sel, { ...brush.para, numbering: undefined }));
        if (brush.once) store.formatBrush = null;
      }
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !pagesEl.current) return;
      const pos = posFromDom(pagesEl.current, e.clientX, e.clientY, store.sel.focus.story);
      if (pos) store.setSel({ anchor: store.sel.anchor, focus: pos });
      const el = scroller.current!;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + 20) el.scrollTop -= 24;
      else if (e.clientY > r.bottom - 20) el.scrollTop += 24;
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mouseup', onUp); window.removeEventListener('mousemove', onMove); };
  }, [store]);

  // Touch: press and hold selects a word, then dragging extends the selection.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer = 0;
    let selecting = false;
    const pos = (t: Touch) => (pagesEl.current ? posFromDom(pagesEl.current, t.clientX, t.clientY, store.sel.focus.story) : null);
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t || !(e.target as HTMLElement).closest('.page')) return;
      timer = window.setTimeout(() => {
        const p = pos(t);
        if (!p) return;
        const [from, to] = wordAt(store.doc, p);
        store.setSel({ anchor: { ...p, offset: from }, focus: { ...p, offset: to } });
        selecting = true;
      }, 420);
    };
    const move = (e: TouchEvent) => {
      if (!selecting) { window.clearTimeout(timer); return; }
      e.preventDefault();
      const t = e.touches[0];
      const p = t ? pos(t) : null;
      if (p) store.setSel({ anchor: store.sel.anchor, focus: p });
    };
    const end = () => { window.clearTimeout(timer); selecting = false; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [store]);

  const onMouseDown = (e: RME) => {
    if (e.button !== 0) return;
    if (store.menu) { store.menu = null; store.emit(); }
    const root = pagesEl.current;
    if (!root) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.page')) return;
    e.preventDefault();
    focusInput();
    const c = clicks.current;
    const now = Date.now();
    c.n = now - c.t < 420 && Math.abs(e.clientX - c.x) < 4 && Math.abs(e.clientY - c.y) < 4 ? c.n + 1 : 1;
    c.t = now; c.x = e.clientX; c.y = e.clientY;
    const pageEl = target.closest<HTMLElement>('.page')!;
    const pr = pageEl.getBoundingClientRect();
    const py = (e.clientY - pr.top) / zoom;
    const page = pages[Number(pageEl.dataset.page)];
    const boxEl = target.closest<HTMLElement>('[data-box]');
    const imgHit = target.closest<HTMLElement>('img[data-f], [data-drawing]');
    if (imgHit && !boxEl && c.n === 1) {
      const ln = imgHit.closest<HTMLElement>('.ln')!;
      const pos = { story: ln.dataset.story as StoryId, para: ln.dataset.para!, offset: Number(imgHit.dataset.f) };
      store.setSel({ anchor: pos, focus: { ...pos, offset: pos.offset + 1 } });
      return;
    }
    if (page && c.n === 2 && store.view.mode === 'print' && !store.sel.focus.story.startsWith('fn')) {
      const inHeader = py < page.section.marginTop;
      const inFooter = py > page.height - page.section.marginBottom;
      if (inHeader || inFooter) {
        void import('../features/headerFooter').then((m) => m.enterHeaderFooter(store, page, inHeader ? 'header' : 'footer'));
        return;
      }
      if (store.sel.focus.story !== 'body') { store.enterStory('body'); return; }
    }
    const current = store.sel.focus.story;
    const story: StoryId = boxEl ? `box:${boxEl.dataset.box}` : current.startsWith('box:') ? 'body' : current;
    const pos = posFromDom(root, e.clientX, e.clientY, story);
    if (!pos) return;
    if (c.n === 2) {
      const [from, to] = wordAt(store.doc, pos);
      store.setSel({ anchor: { ...pos, offset: from }, focus: { ...pos, offset: to } });
      return;
    }
    if (c.n >= 3) {
      const p = findPara(store.doc, pos)!;
      store.setSel({ anchor: { ...pos, offset: 0 }, focus: { ...pos, offset: paraLength(p) } });
      return;
    }
    store.setSel(e.shiftKey ? { anchor: store.sel.anchor, focus: pos } : collapsed(pos));
    dragging.current = 'text';
  };

  const pageNodes = useMemo(() => pages.map((p, i) => <PageView key={i} page={p} live={store.view.printing || (i >= range.from - 1 && i <= range.to)} marks={store.view.showMarks} store={store} activeStory={activeStory} grid={store.view.showGrid} />), [pages, range, store, activeStory, store.view.showMarks, store.doc.settings, store.view.printing, store.view.markup, store.view.showGrid]);

  const caret = overlay.caret;
  const inputStyle: CSSProperties = caret
    ? { left: caret.x * zoom, top: caret.y * zoom }
    : { left: 0, top: 0 };

  return (
    <div className="canvas" ref={scroller} onScroll={updateRange} onMouseDown={onMouseDown} data-mode={store.view.mode}
      onContextMenu={(e) => {
        const root = pagesEl.current;
        if (!root || !(e.target as HTMLElement).closest('.page')) return;
        e.preventDefault();
        const pos = posFromDom(root, e.clientX, e.clientY, store.sel.focus.story);
        if (!pos) return;
        const [a, b] = orderedSel(store.doc, store.sel);
        const inside = !isCollapsed(store.sel) && a.para === b.para && pos.para === a.para && pos.offset >= a.offset && pos.offset <= b.offset;
        if (!inside) store.setSel(collapsed(pos));
        store.menu = { x: e.clientX, y: e.clientY, pos };
        store.emit();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (!f) return;
        if (/\.(docx?|docm|dotx|odt|rtf|pdf|txt|md|markdown|html?)$/i.test(f.name)) void f.arrayBuffer().then((b) => openBytes(store, new Uint8Array(b), f.name, null));
        else void import('../features/images').then((m) => m.insertImageFile(store, f));
      }}>
      <div className="pages-wrap" style={{ position: 'relative' }}>
        <div className={`pages${store.view.twoUp ? ' twoup' : ''}`} ref={pagesEl} style={{ zoom }}>
          {pageNodes}
          <div className="overlay" aria-hidden>
            {overlay.marks.map((m, i) => <div key={`m${i}`} className={`sq ${m.kind}`} style={{ left: m.x, top: m.y, width: m.w }} />)}
            {overlay.rects.map((r, i) => <div key={i} className="selrect" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />)}
            {caret && <div className="caret" key={`${caret.x}:${caret.y}`} style={{ left: caret.x, top: caret.y, height: caret.h }} />}
            {overlay.image && <ImageHandle box={overlay.image} store={store} zoom={zoom} />}
          </div>
          <textarea
            ref={input}
            className="ime"
            aria-label="Document text"
            autoCapitalize="off" autoComplete="off" spellCheck={false}
            style={inputStyle}
            onBlur={() => { if (coarse()) return; window.setTimeout(() => { if (!store.dialog && document.activeElement === document.body) focusInput(); }, 0); }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={(e) => { composing.current = false; store.typeText(e.data); e.currentTarget.value = ''; }}
            onInput={(e) => {
              if (composing.current) return;
              const t = e.currentTarget.value;
              e.currentTarget.value = '';
              const text = t.replace(/\r?\n/g, '');
              if (text) store.typeText(text);
            }}
            onKeyDown={(e) => { if (!composing.current) handleKey(store, e, pagesEl.current!); }}
            onCopy={(e) => handleCopy(store, e)}
            onCut={(e) => { handleCopy(store, e); store.deleteSelection(); }}
            onPaste={(e) => handlePaste(store, e)}
          />
        </div>
      </div>
    </div>
  );
};

const rangeRects = (ln: HTMLElement, from: number, to: number): DOMRect[] => {
  const out: DOMRect[] = [];
  const rr = document.createRange();
  for (const s of ownSpans(ln)) {
    if (s.dataset.atom !== undefined || s.dataset.tab !== undefined) continue;
    const f = Number(s.dataset.f);
    const t = s.firstChild?.nodeType === 3 ? s.firstChild : (s.querySelector('a')?.firstChild ?? null);
    const len = t?.textContent?.length ?? 0;
    if (!t || f + len <= from || f >= to) continue;
    rr.setStart(t, Math.max(0, from - f));
    rr.setEnd(t, Math.min(len, to - f));
    out.push(...rr.getClientRects());
  }
  return out;
};

const selectedIds = (store: EditorStore): string[] => {
  const [a, b] = orderedSel(store.doc, store.sel);
  if (a.para === b.para) return [a.para];
  const seen: string[] = [];
  let inside = false;
  for (const p of paragraphs(store, a.story)) {
    if (p === a.para) inside = true;
    if (inside) seen.push(p);
    if (p === b.para) break;
  }
  return seen;
};

import { flatten, storyBlocks } from '../core/tree';
const paragraphs = (store: EditorStore, story: Parameters<typeof storyBlocks>[1]) => flatten(storyBlocks(store.doc, story)).paras.map((p) => p.id);

const ImageHandle = ({ box, store, zoom }: { box: NonNullable<Overlay['image']>; store: EditorStore; zoom: number }) => {
  const onDown = (e: RME) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = box.w;
    const startH = box.h;
    const ratio = box.h / box.w;
    const move = (ev: MouseEvent) => {
      const w = Math.max(16, startW + (ev.clientX - startX) / zoom);
      void import('../features/images').then((m) => {
        const free = m.selectedAtom(store)?.kind !== 'image';
        m.resizeSelectedImage(store, w, free ? Math.max(16, startH + (ev.clientY - startY) / zoom) : w * ratio);
      });
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div className="imgbox" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <span className="grip" onMouseDown={onDown} />
    </div>
  );
};
