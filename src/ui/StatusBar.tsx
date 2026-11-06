import { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { EditorStore } from '../editor/store';
import { stats } from '../features/exports';

export const StatusBar = ({ store }: { store: EditorStore }) => {
  const words = useMemo(() => stats(store).words, [store.doc]); // eslint-disable-line
  const hit = store.layout.lineIndex.get(store.sel.focus.para)?.[0];
  const pct = Math.round(store.view.zoom * 100);
  const track = store.doc.settings.trackChanges;
  const story = store.sel.focus.story;
  return (
    <footer className="status">
      <button onClick={() => store.openDialog('goto')}>Page {(hit?.page ?? 0) + 1} of {store.layout.pages.length}</button>
      <button onClick={() => store.openDialog('count')}>{words.toLocaleString()} words</button>
      {track && <span className="pill">Tracking changes</span>}
      {story !== 'body' && <button className="pill" onClick={() => store.enterStory('body')}>Back to the page</button>}
      {store.doc.settings.protection && <span className="pill">Read only</span>}
      <div className="grow" />
      <button aria-label="Zoom out" onClick={() => store.setView({ zoom: Math.max(0.25, store.view.zoom - 0.1) })}><Minus size={14} strokeWidth={1.9} /></button>
      <input aria-label="Zoom" type="range" min={25} max={300} step={5} value={pct} onChange={(e) => store.setView({ zoom: Number(e.target.value) / 100 })} />
      <button aria-label="Zoom in" onClick={() => store.setView({ zoom: Math.min(3, store.view.zoom + 0.1) })}><Plus size={14} strokeWidth={1.9} /></button>
      <span className="zoomv">{pct}%</span>
    </footer>
  );
};
