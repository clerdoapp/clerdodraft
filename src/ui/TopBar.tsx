import { Redo2, Save, Search, Undo2 } from 'lucide-react';
import type { EditorStore } from '../editor/store';
import { run } from '../editor/commands';

const STROKE = 1.9;

export const TopBar = ({ store }: { store: EditorStore }) => {
  const f = store.file;
  const state = f.dirty ? 'Not saved yet' : f.lastSaved ? 'Saved' : '';
  return (
    <header className="topbar">
      <span className="wordmark" data-no-translate>Clerdo<b>Draft</b></span>
      <input
        className="docname" aria-label="Document name" value={f.name}
        onChange={(e) => { store.file = { ...f, name: e.target.value }; store.emit(); }}
      />
      <span className="savestate" role="status">{state}</span>
      <div className="grow" />
      <button className="cmdsearch" onClick={() => run(store, 'edit.palette')}>
        <Search size={15} strokeWidth={STROKE} /> Search commands <kbd>/</kbd>
      </button>
      <div className="grow" />
      <button className="ico" aria-label="Undo" title="Undo" disabled={!store.canUndo} onClick={() => store.undo()}><Undo2 size={17} strokeWidth={STROKE} /></button>
      <button className="ico" aria-label="Redo" title="Redo" disabled={!store.canRedo} onClick={() => store.redo()}><Redo2 size={17} strokeWidth={STROKE} /></button>
      <button className="primary" onClick={() => run(store, 'file.save')}><Save size={15} strokeWidth={STROKE} /> Save</button>
    </header>
  );
};
