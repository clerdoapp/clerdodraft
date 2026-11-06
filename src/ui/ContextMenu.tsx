import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isCollapsed, findPara, selectedText } from '../core/tree';
import { command, prettyKeys, run } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { inTable } from '../features/coreCommands';
import { selectedAtom } from '../features/images';
import { lookupWord, matchCase } from '../features/wordbook';
import { replaceWordHere, wordHere } from '../features/writing';

export const ContextMenu = ({ store }: { store: EditorStore }) => {
  const m = store.menu!;
  const el = useRef<HTMLDivElement>(null);
  const [fixes, setFixes] = useState<string[]>([]);
  const [similar, setSimilar] = useState<string[]>([]);
  const here = wordHere(store)?.text;
  const [place, setPlace] = useState({ left: m.x, top: m.y });
  const p = findPara(store.doc, m.pos);
  const issue = store.proof?.at(m.pos, p);
  const close = () => { store.menu = null; store.emit(); };

  useEffect(() => {
    let live = true;
    if (issue) void store.proof!.suggestions(issue).then((f) => { if (live) setFixes(f); });
    return () => { live = false; };
  }, [issue?.from, issue?.text]); // eslint-disable-line

  useEffect(() => {
    let live = true;
    if (here && !issue) void lookupWord(here).then((e) => { if (live) setSimilar(e?.synonyms.slice(0, 4) ?? []); });
    return () => { live = false; };
  }, [here, issue?.text]); // eslint-disable-line

  useLayoutEffect(() => {
    const r = el.current?.getBoundingClientRect();
    if (r) setPlace({ left: Math.min(m.x, innerWidth - r.width - 8), top: Math.min(m.y, innerHeight - r.height - 8) });
  }, [m.x, m.y, fixes.length, similar.length]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!el.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', away, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', away, true); window.removeEventListener('keydown', key); };
  });

  const item = (id: string, label?: string) => {
    const c = command(id);
    if (!c) return null;
    return <button key={id} disabled={!(c.enabled?.(store) ?? true)} onClick={() => { close(); run(store, id); }}><span>{label ?? c.label}</span><kbd>{prettyKeys(c.keys)}</kbd></button>;
  };
  const has = !isCollapsed(store.sel);
  const copy = async (cut: boolean) => {
    close();
    try {
      await navigator.clipboard.writeText(selectedText(store.doc, store.sel));
      if (cut) store.deleteSelection();
    } catch { store.notify('Use the keyboard to copy here.'); }
  };
  const paste = async () => {
    close();
    try { store.typeText(await navigator.clipboard.readText()); } catch { store.notify('Use the keyboard to paste here.'); }
  };

  return (
    <div className="ctx" ref={el} role="menu" style={place}>
      {issue && (
        <>
          <p>{issue.message}</p>
          {fixes.map((f) => <button key={f} className="fixit" onClick={() => { close(); store.proof!.apply(issue, f); }}>{f || 'Remove'}</button>)}
          <button onClick={() => { close(); store.proof!.ignoreAll(issue); }}>Ignore all</button>
          {issue.kind === 'spell' && <button onClick={() => { close(); store.proof!.addWord(issue); }}>Add to my dictionary</button>}
          <hr />
        </>
      )}
      {!!similar.length && <><div className="ctxwords">{similar.map((w) => <button key={w} onClick={() => { close(); replaceWordHere(store, matchCase(here!, w)); }}>{w}</button>)}</div>{item('rev.thesaurus', 'More in word book')}<hr /></>}
      <button disabled={!has} onClick={() => void copy(true)}>Cut</button>
      <button disabled={!has} onClick={() => void copy(false)}>Copy</button>
      <button onClick={() => void paste()}>Paste</button>
      <hr />
      {selectedAtom(store)?.kind === 'chart' && item('obj.chart')}
      {selectedAtom(store)?.kind === 'shape' && item('obj.text')}
      {selectedAtom(store)?.kind === 'shape' && item('obj.shapeSettings')}
      {selectedAtom(store) && item('obj.settings')}
      {item('ins.comment', 'Comment')}
      {item('ins.link', 'Link')}
      {item('fmt.font')}
      {item('par.settings')}
      {inTable(store) && <><hr />{item('tbl.rowBelow')}{item('tbl.colRight')}{item('tbl.delRow')}{item('tbl.delCol')}</>}
    </div>
  );
};
