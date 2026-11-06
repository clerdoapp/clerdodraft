import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { EditorStore } from '../editor/store';
import { canvasToDoc } from '../features/objects';
import { deleteVersion, listVersions, restoreVersion, saveVersion, type Version } from '../features/versions';
import { PageView } from './Canvas';

export const VersionsPane = ({ store }: { store: EditorStore }) => {
  const [list, setList] = useState<Version[]>([]);
  const [label, setLabel] = useState('');
  const refresh = () => void listVersions(store.file.name).then(setList).catch(() => store.notify('Version history is not available here.'));
  useEffect(refresh, [store.file.name, store.file.lastSaved]); // eslint-disable-line
  const save = async () => { await saveVersion(store, label.trim() || 'Saved by hand'); setLabel(''); refresh(); };
  return (
    <aside className="inspector" aria-label="Version history">
      <div className="phead"><h2>Version history</h2><button className="ico" aria-label="Close" onClick={() => store.setView({ pane: null })}><X size={16} strokeWidth={1.9} /></button></div>
      <div className="pbody">
        <p className="muted">Kept on this device. A version is added each time you save.</p>
        <label className="field"><span>Name</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Optional" /></label>
        <button className="tool" onClick={() => void save()}>Save this version</button>
        {!list.length && <p className="muted">No versions yet.</p>}
        {list.map((v) => (
          <article key={v.id} className="card">
            <header><b>{v.label}</b></header>
            <p className="muted">{new Date(v.at).toLocaleString()}</p>
            <div className="row">
              <button className="tool" onClick={() => void restoreVersion(store, v.id).then(refresh)}>Restore</button>
              <button className="tool" onClick={() => void deleteVersion(v.id).then(refresh)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
};

// A second look at the same document, for reading one part while typing in another.
export const SplitView = ({ store }: { store: EditorStore }) => {
  const box = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ from: 0, to: 3 });
  const zoom = store.view.zoom * (4 / 3);
  const pages = store.layout.pages;
  const onScroll = () => {
    const el = box.current;
    const first = pages[0];
    if (!el || !first) return;
    const h = (first.height + 14) * zoom;
    const from = Math.max(0, Math.floor(el.scrollTop / h) - 1);
    setRange({ from, to: from + Math.ceil(el.clientHeight / h) + 2 });
  };
  return (
    <div className="splitview" ref={box} onScroll={onScroll} aria-label="Second view of the document">
      <div className="pages-wrap"><div className="pages" style={{ zoom, pointerEvents: 'none' }}>
        {pages.map((p, i) => <PageView key={i} page={p} live={i >= range.from && i <= range.to} marks={false} store={store} activeStory="body" />)}
      </div></div>
    </div>
  );
};

export const DrawDialog = ({ store }: { store: EditorStore }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#1b1c20');
  const [size, setSize] = useState(3);
  const [dirty, setDirty] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.current!.width / r.width), y: (e.clientY - r.top) * (canvas.current!.height / r.height) };
  };
  const down = (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); last.current = point(e); setDirty(true); };
  const move = (e: React.PointerEvent) => {
    if (!last.current) return;
    const g = canvas.current!.getContext('2d')!;
    const p = point(e);
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = size * (e.pressure > 0 && e.pointerType === 'pen' ? e.pressure * 2 : 1) * 2;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setDirty(false); };
  const insert = async () => { store.closeDialog(); await canvasToDoc(store, canvas.current!, 'drawing.png'); };
  return (
    <div className="drawbox">
      <h2>Draw</h2>
      <div className="row">
        <input type="color" aria-label="Pen color" value={color} onChange={(e) => setColor(e.target.value)} />
        <label className="mini">Size <input type="range" min={1} max={14} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
        <button type="button" className="tool" onClick={clear}>Clear</button>
      </div>
      <canvas ref={canvas} width={1200} height={700} style={{ touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} />
      <footer><button type="button" className="tool" onClick={() => store.closeDialog()}>Cancel</button><button className="primary" disabled={!dirty} onClick={() => void insert()}>Add to document</button></footer>
    </div>
  );
};
