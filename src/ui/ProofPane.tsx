import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { collapsed } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { readability } from '../features/proof/grammar';
import type { Issue } from '../features/proof';
import { walkParagraphs, rawParaText } from '../core/tree';

export const ProofPane = ({ store, onClose }: { store: EditorStore; onClose: () => void }) => {
  const proof = store.proof;
  const issues = proof?.all() ?? [];
  const spell = issues.filter((i) => i.kind === 'spell').length;
  const [index, setIndex] = useState(0);
  const cur: Issue | undefined = issues[Math.min(index, issues.length - 1)];
  const [fixes, setFixes] = useState<string[]>([]);
  const key = cur ? `${cur.para}:${cur.from}:${cur.text}` : '';

  useEffect(() => {
    let live = true;
    setFixes([]);
    if (cur && proof) {
      const pos = { story: 'body' as const, para: cur.para, offset: cur.from };
      store.setSel({ anchor: pos, focus: { ...pos, offset: cur.to } });
      void proof.suggestions(cur).then((f) => { if (live) setFixes(f); });
    }
    return () => { live = false; };
  }, [key]); // eslint-disable-line

  const stats = useMemo(() => readability([...walkParagraphs(store.doc.blocks)].map(rawParaText).join('\n')), [store.doc]);

  return (
    <aside className="inspector" aria-label="Spelling and grammar">
      <div className="phead"><h2>Spelling and grammar</h2><button className="ico" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={1.9} /></button></div>
      <div className="pbody">
        {!proof?.enabled && <><p className="muted">Checking is off.</p><button className="tool" onClick={() => proof?.setEnabled(true)}>Turn it on</button></>}
        {proof?.enabled && <p className="muted">{spell} spelling, {issues.length - spell} grammar</p>}
        {proof?.enabled && !cur && <p>No issues found.</p>}
        {cur && proof && (
          <article className="card">
            <header><b>{cur.text.trim() || 'Spacing'}</b><span className="tag">{cur.kind === 'spell' ? 'Spelling' : 'Grammar'}</span></header>
            <p>{cur.message}</p>
            {fixes.map((f) => <button key={f} className="tool" onClick={() => proof.apply(cur, f)}><b>{f || 'Remove'}</b></button>)}
            {!fixes.length && cur.kind === 'spell' && <p className="muted">Looking for suggestions…</p>}
            <div className="row">
              <button className="tool" onClick={() => proof.ignore(cur)}>Ignore</button>
              <button className="tool" onClick={() => proof.ignoreAll(cur)}>Ignore all</button>
              {cur.kind === 'spell' && <button className="tool" onClick={() => proof.addWord(cur)}>Add to my dictionary</button>}
            </div>
            <div className="row">
              <button className="tool" disabled={index <= 0} onClick={() => setIndex(index - 1)}>Previous</button>
              <button className="tool" disabled={index >= issues.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
            </div>
          </article>
        )}
        <section className="group">
          <h3>Readability</h3>
          <dl className="report">
            <div><dt>Reading ease</dt><dd>{stats.ease}</dd></div>
            <div><dt>School grade</dt><dd>{stats.grade}</dd></div>
            <div><dt>Words per sentence</dt><dd>{stats.wordsPerSentence}</dd></div>
          </dl>
        </section>
      </div>
    </aside>
  );
};

void collapsed;
