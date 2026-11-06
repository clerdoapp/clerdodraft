import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { isCollapsed, selectedText } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { lookupWord, matchCase, type WordEntry } from '../features/wordbook';
import { replaceWordHere, wordHere } from '../features/writing';
import { canTranslate, LANGUAGES, translate } from '../features/translate';

const Shell = ({ store, title, children }: { store: EditorStore; title: string; children: React.ReactNode }) => (
  <aside className="inspector" aria-label={title}>
    <div className="phead"><h2>{title}</h2><button className="ico" aria-label="Close" onClick={() => store.setView({ pane: null })}><X size={16} strokeWidth={1.9} /></button></div>
    <div className="pbody">{children}</div>
  </aside>
);

export const WordPane = ({ store }: { store: EditorStore }) => {
  const here = wordHere(store)?.text ?? '';
  const [query, setQuery] = useState(here);
  const [entry, setEntry] = useState<WordEntry | null | undefined>(undefined);

  useEffect(() => { if (here) setQuery(here); }, [here]);
  useEffect(() => {
    let live = true;
    if (!query.trim()) { setEntry(undefined); return; }
    void lookupWord(query).then((e) => { if (live) setEntry(e); });
    return () => { live = false; };
  }, [query]);

  return (
    <Shell store={store} title="Word book">
      <label className="field"><span>Word</span><input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      {!query.trim() && <p className="muted">Click a word in your document, or type one here.</p>}
      {entry === null && <p className="muted">This word isn't in the word book.</p>}
      {entry && (
        <>
          {!!entry.definitions.length && (
            <section className="group"><h3>Meaning of {entry.word}</h3>
              {entry.definitions.map((d, i) => <p key={i} className="meaning"><i>{d.part}</i> {d.text}</p>)}
            </section>
          )}
          {!!entry.synonyms.length && (
            <section className="group"><h3>Similar words</h3>
              <div className="wordchips">
                {entry.synonyms.map((w) => <button key={w} title="Replace the word in your document" onMouseDown={(e) => e.preventDefault()} onClick={() => replaceWordHere(store, matchCase(here || w, w))}>{w}</button>)}
              </div>
            </section>
          )}
        </>
      )}
    </Shell>
  );
};

export const TranslatePane = ({ store }: { store: EditorStore }) => {
  const [from, setFrom] = useState('en');
  const [to, setTo] = useState('ar');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const source = isCollapsed(store.sel) ? '' : selectedText(store.doc, store.sel);
  const go = async () => {
    setBusy(true);
    try { setOut(await translate(source, from, to)); } catch (e) { store.notify(e instanceof Error ? e.message : "This couldn't be translated."); }
    setBusy(false);
  };
  const pick = (label: string, v: string, set: (x: string) => void) => (
    <label className="field"><span>{label}</span><select value={v} onChange={(e) => set(e.target.value)}>{LANGUAGES.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>
  );
  return (
    <Shell store={store} title="Translate">
      {!canTranslate() && <p className="muted">Translation uses language models built into the system, and this device doesn't offer them.</p>}
      {pick('From', from, setFrom)}
      {pick('To', to, setTo)}
      <p className="muted">{source ? `${source.length} characters selected` : 'Select the text to translate.'}</p>
      <button className="tool" disabled={!source || busy || !canTranslate()} onClick={() => void go()}>{busy ? 'Translating…' : 'Translate'}</button>
      {out && <><p className="translation" dir="auto">{out}</p><button className="tool" onClick={() => store.typeText(out)}>Replace the selection</button></>}
    </Shell>
  );
};
