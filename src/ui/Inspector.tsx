import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Replace, Trash2, X } from 'lucide-react';
import type { Comment, Paragraph } from '../core/model';
import { newId, para } from '../core/model';
import { applyStyle, removeCommentMarks, resolveRevisions } from '../core/ops';
import { headingLevel } from '../core/styles';
import { flatten, paraLength, paraText, walkParagraphs } from '../core/tree';
import type { EditorStore } from '../editor/store';
import { findAll, nextMatch, replaceAll, replaceOne, type FindOptions } from '../features/find';
import { mail, recipients, type MailRule } from '../features/mailReview';
import { run } from '../editor/commands';
import { ProofPane } from './ProofPane';
import { TranslatePane, WordPane } from './WordPane';
import { BlocksPane, SignaturesPane, TogetherPane, VersionsPane } from './ExtraViews';

const S = 1.9;

const Pane = ({ store, title, children }: { store: EditorStore; title: string; children: React.ReactNode }) => (
  <aside className="inspector" aria-label={title}>
    <div className="phead"><h2>{title}</h2><button className="ico" aria-label="Close" onClick={() => store.setView({ pane: null })}><X size={16} strokeWidth={S} /></button></div>
    <div className="pbody">{children}</div>
  </aside>
);

const FindPane = ({ store }: { store: EditorStore }) => {
  const [o, set] = useState<FindOptions>({ query: '', matchCase: false, wholeWord: false, regex: false });
  const [rep, setRep] = useState('');
  const n = o.query ? findAll(store, o).length : 0;
  return (
    <Pane store={store} title="Find">
      <label className="field"><span>Find</span><input autoFocus value={o.query} onChange={(e) => set({ ...o, query: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') nextMatch(store, o, e.shiftKey ? -1 : 1); }} /></label>
      <div className="muted">{o.query ? `${n} found` : 'Type to search the document.'}</div>
      <div className="row">
        <button className="tool" onClick={() => nextMatch(store, o, -1)}><ChevronUp size={15} strokeWidth={S} /> Previous</button>
        <button className="tool" onClick={() => nextMatch(store, o, 1)}><ChevronDown size={15} strokeWidth={S} /> Next</button>
      </div>
      <label className="check"><input type="checkbox" checked={o.matchCase} onChange={(e) => set({ ...o, matchCase: e.target.checked })} /> Match case</label>
      <label className="check"><input type="checkbox" checked={o.wholeWord} onChange={(e) => set({ ...o, wholeWord: e.target.checked })} /> Whole words</label>
      <label className="check"><input type="checkbox" checked={o.regex} onChange={(e) => set({ ...o, regex: e.target.checked })} /> Pattern</label>
      <label className="field"><span>Replace with</span><input value={rep} onChange={(e) => setRep(e.target.value)} /></label>
      <div className="row">
        <button className="tool" onClick={() => replaceOne(store, o, rep)}><Replace size={15} strokeWidth={S} /> Replace</button>
        <button className="tool" onClick={() => store.notify(`Replaced ${replaceAll(store, o, rep)}.`)}>Replace all</button>
      </div>
    </Pane>
  );
};

const OutlinePane = ({ store }: { store: EditorStore }) => {
  const heads = [...walkParagraphs(store.doc.blocks)].flatMap((p) => { const l = headingLevel(store.doc, p); return l && !p.tocEntry ? [{ p, l }] : []; });
  const go = (p: Paragraph) => store.setSel({ anchor: { story: 'body', para: p.id, offset: 0 }, focus: { story: 'body', para: p.id, offset: 0 } });
  return (
    <Pane store={store} title="Outline">
      {!heads.length && <p className="muted">Headings appear here as you add them.</p>}
      {heads.map(({ p, l }) => (
        <div key={p.id} className="outrow" style={{ paddingInlineStart: (l - 1) * 14 }}>
          <button className="outlink" onClick={() => go(p)}>{paraText(p) || 'Untitled'}</button>
          <button className="ico" aria-label="Raise level" disabled={l <= 1} onClick={() => { go(p); store.commit(applyStyle(store.doc, { anchor: { story: 'body', para: p.id, offset: 0 }, focus: { story: 'body', para: p.id, offset: 0 } }, `Heading${l - 1}`)); }}><ChevronUp size={13} strokeWidth={S} /></button>
          <button className="ico" aria-label="Lower level" disabled={l >= 6} onClick={() => { store.commit(applyStyle(store.doc, { anchor: { story: 'body', para: p.id, offset: 0 }, focus: { story: 'body', para: p.id, offset: 0 } }, `Heading${l + 1}`)); }}><ChevronDown size={13} strokeWidth={S} /></button>
        </div>
      ))}
    </Pane>
  );
};

const REACTIONS = ['👍', '❤️', '😄', '🎉', '👀', '✅'];

const CommentCard = ({ store, c, replies }: { store: EditorStore; c: Comment; replies: Comment[] }) => {
  const [text, setText] = useState('');
  const body = (x: Comment) => x.blocks.map((b) => (b.type === 'p' ? paraText(b) : '')).join('\n');
  const reply = () => {
    if (!text.trim()) return;
    const id = String(Date.now() % 100000000);
    store.commit({ ...store.doc, comments: { ...store.doc.comments, [id]: { id, author: store.author, date: new Date().toISOString(), parent: c.id, blocks: [para([{ text, props: {} }])] } } });
    setText('');
  };
  const remove = () => {
    const d = removeCommentMarks(store.doc, c.id);
    const next = { ...d.comments };
    delete next[c.id];
    for (const r of replies) delete next[r.id];
    store.commit({ ...d, comments: next });
  };
  return (
    <article className={`card${c.resolved ? ' resolved' : ''}`}>
      <header><b>{c.author}</b><time>{c.date ? new Date(c.date).toLocaleDateString() : ''}</time></header>
      <p>{body(c)}</p>
      {replies.map((r) => <div key={r.id} className="reply"><b>{r.author}</b><p>{body(r)}</p></div>)}
      <div className="reacts">{REACTIONS.map((k) => {
        const list = (c.reactions ?? []).filter((x) => x.kind === k);
        const mine = list.some((x) => x.author === store.author);
        const toggle = () => store.commit({ ...store.doc, comments: { ...store.doc.comments, [c.id]: { ...c, reactions: mine ? (c.reactions ?? []).filter((x) => !(x.kind === k && x.author === store.author)) : [...(c.reactions ?? []), { author: store.author, kind: k }] } } });
        return <button key={k} className={mine ? 'on' : ''} title={list.map((x) => x.author).join(', ')} aria-pressed={mine} onClick={toggle}>{k}{list.length ? ` ${list.length}` : ''}</button>;
      })}</div>
      <input aria-label="Reply" placeholder="Reply" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') reply(); }} />
      <div className="row">
        <button className="tool" onClick={() => store.commit({ ...store.doc, comments: { ...store.doc.comments, [c.id]: { ...c, resolved: !c.resolved } } })}><Check size={14} strokeWidth={S} /> {c.resolved ? 'Reopen' : 'Resolve'}</button>
        <button className="tool" onClick={remove}><Trash2 size={14} strokeWidth={S} /> Remove</button>
      </div>
    </article>
  );
};

const CommentsPane = ({ store }: { store: EditorStore }) => {
  const all = Object.values(store.doc.comments);
  const [show, setShow] = useState('all');
  const people = [...new Set(all.map((c) => c.author).filter(Boolean))];
  const visible = (c: Comment) => show === 'all' || (show === 'open' && !c.resolved) || (show === 'done' && !!c.resolved) || show === `by:${c.author}`;
  return (
    <Pane store={store} title="Comments">
      <button className="tool" onClick={() => run(store, 'ins.comment')}>Add a comment on the selection</button>
      {!!all.length && (
        <label className="field"><span>Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="all">All comments</option><option value="open">Open</option><option value="done">Resolved</option>
            {people.map((p) => <option key={p} value={`by:${p}`}>From {p}</option>)}
          </select>
        </label>
      )}
      {!all.length && <p className="muted">No comments yet.</p>}
      {all.filter((c) => !c.parent && visible(c)).map((c) => <CommentCard key={c.id} store={store} c={c} replies={all.filter((r) => r.parent === c.id)} />)}
    </Pane>
  );
};

const ChangesPane = ({ store }: { store: EditorStore }) => {
  const items = flatten(store.doc.blocks).paras.flatMap((p) => {
    let off = 0;
    return p.runs.flatMap((r) => {
      const start = off;
      off += r.text.length;
      const rev = r.ins ?? r.del ?? r.fmtRev?.rev;
      return rev ? [{ p, start, end: off, rev, kind: r.ins ? 'Added' : r.del ? 'Removed' : 'Formatted', text: r.text }] : [];
    });
  });
  return (
    <Pane store={store} title="Changes">
      {!items.length && <p className="muted">No tracked changes.</p>}
      {items.slice(0, 300).map((c, i) => (
        <article key={i} className="card">
          <header><b>{c.rev.author}</b><span className="tag">{c.kind}</span></header>
          <button className="outlink" onClick={() => store.setSel({ anchor: { story: 'body', para: c.p.id, offset: c.start }, focus: { story: 'body', para: c.p.id, offset: c.end } })}>{c.text.slice(0, 80)}</button>
          <div className="row">
            <button className="tool" onClick={() => store.commit(resolveRevisions(store.doc, 'body', true, undefined, c.rev.id))}>Accept</button>
            <button className="tool" onClick={() => store.commit(resolveRevisions(store.doc, 'body', false, undefined, c.rev.id))}>Reject</button>
          </div>
        </article>
      ))}
    </Pane>
  );
};

const StylesPane = ({ store }: { store: EditorStore }) => {
  const list = Object.values(store.doc.styles.styles).filter((s) => !s.hidden && (s.kind === 'paragraph' || s.kind === 'character')).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Pane store={store} title="Styles">
      <button className="tool" onClick={() => store.openDialog('style', { id: newId(), create: true })}>New style</button>
      {list.map((s) => (
        <div key={s.id} className="outrow">
          <button className="outlink" onClick={() => store.commit(applyStyle(store.doc, store.sel, s.id))}>{s.name}</button>
          <button className="tool" onClick={() => store.openDialog('style', { id: s.id })}>Edit</button>
        </div>
      ))}
    </Pane>
  );
};

const MergeControls = ({ store, data }: { store: EditorStore; data: NonNullable<typeof mail.data> }) => {
  const [rule, setRule] = useState<MailRule>(mail.rule ?? { column: '', op: 'is', value: '' });
  const [at, setAt] = useState(0);
  const list = recipients();
  const show = (i: number | null) => { if (i === null) { store.setView({ mergeRow: null }); return; } const n = Math.max(0, Math.min(list.length - 1, i)); setAt(n); store.setView({ mergeRow: list[n] ?? null }); };
  const change = (r: MailRule) => { setRule(r); mail.rule = r; if (store.view.mergeRow) show(0); else store.emit(); };
  return (
    <>
      <section className="group"><h3>Preview</h3>
        <label className="check"><input type="checkbox" checked={!!store.view.mergeRow} onChange={(e) => show(e.target.checked ? at : null)} /> Show a recipient in the document</label>
        <div className="row">
          <button className="tool" disabled={!store.view.mergeRow || at <= 0} onClick={() => show(at - 1)}>Previous</button>
          <span className="muted">{list.length ? at + 1 : 0} of {list.length}</span>
          <button className="tool" disabled={!store.view.mergeRow || at >= list.length - 1} onClick={() => show(at + 1)}>Next</button>
        </div>
      </section>
      <section className="group"><h3>Only include</h3>
        <label className="field"><span>Field</span><select value={rule.column} onChange={(e) => change({ ...rule, column: e.target.value })}><option value="">Everyone</option>{data.columns.map((c) => <option key={c}>{c}</option>)}</select></label>
        {rule.column && <>
          <label className="field"><span>Rule</span><select value={rule.op} onChange={(e) => change({ ...rule, op: e.target.value as MailRule['op'] })}><option value="is">is</option><option value="not">is not</option><option value="has">contains</option><option value="more">is more than</option><option value="less">is less than</option></select></label>
          <label className="field"><span>Value</span><input value={rule.value} onChange={(e) => change({ ...rule, value: e.target.value })} /></label>
        </>}
      </section>
    </>
  );
};

const MailPane = ({ store }: { store: EditorStore }) => {
  const d = mail.data;
  const add = (c: string) => store.insertAtom({ kind: 'field', field: 'merge', instr: `MERGEFIELD ${c}`, result: `«${c}»` });
  return (
    <Pane store={store} title="Mail merge">
      {!d && <><p className="muted">Choose a list: a spreadsheet (.xlsx, .ods, .csv), contacts (.vcf) or data (.json). Its first row names the fields.</p><button className="tool" onClick={() => run(store, 'mail.source')}>Choose a list</button></>}
      {d && (
        <>
          <p className="muted">{d.rows.length} recipients. Click a field to place it in the document.</p>
          {d.columns.map((c) => <button key={c} className="tool" onClick={() => add(c)}>{c}</button>)}
          <MergeControls store={store} data={d} />
          <button className="tool" onClick={() => run(store, 'mail.merge')}>Finish as a new file</button>
        </>
      )}
    </Pane>
  );
};

export const Inspector = ({ store }: { store: EditorStore }) => {
  switch (store.view.pane) {
    case 'find': return <FindPane store={store} />;
    case 'outline': return <OutlinePane store={store} />;
    case 'comments': return <CommentsPane store={store} />;
    case 'changes': return <ChangesPane store={store} />;
    case 'styles': return <StylesPane store={store} />;
    case 'mail': return <MailPane store={store} />;
    case 'versions': return <VersionsPane store={store} />;
    case 'blocks': return <BlocksPane store={store} />;
    case 'together': return <TogetherPane store={store} />;
    case 'signatures': return <SignaturesPane store={store} />;
    case 'words': return <WordPane store={store} />;
    case 'translate': return <TranslatePane store={store} />;
    case 'proof': return <ProofPane store={store} onClose={() => store.setView({ pane: null })} />;
    default: return null;
  }
};

void paraLength;
