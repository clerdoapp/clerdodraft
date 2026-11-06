import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { EditorStore } from '../editor/store';
import { canvasToDoc } from '../features/objects';
import { deleteVersion, listVersions, restoreVersion, saveVersion, type Version } from '../features/versions';
import { PageView } from './Canvas';
import { DiagramView, MathView } from './Drawings';
import { isCollapsed, selectedText } from '../core/tree';
import { allCommands, prettyKeys } from '../editor/commands';
import { copyBlocks } from '../editor/interaction';
import { Together } from '../features/together';
import { shareLink } from '../features/share';
import { newId, type Block } from '../core/model';
import { buildDiagram, diagramAtom, DIAGRAM_GROUPS } from '../features/diagrams';
import { selectedAtom, updateSelectedAtom } from '../features/images';
import { savedBlocks, storeBlocks, type SavedBlock } from '../features/objects';
import { equationBox } from '../layout/equation';
import { iconLabel, iconPng, iconSvg, loadIcons } from '../features/icons';
import { buildTemplate, TEMPLATE_GROUPS, TEMPLATES } from '../features/templateLibrary';

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
  const editing = store.dialog?.props?.['edit'] ? selectedAtom(store) : undefined;
  useEffect(() => {
    if (editing?.kind !== 'image') return;
    const item = store.doc.media[editing.media];
    if (!item) return;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([item.data as BlobPart], { type: item.mime }));
    img.onload = () => { const c = canvas.current!; const k = Math.min(c.width / img.width, c.height / img.height); c.getContext('2d')!.drawImage(img, 0, 0, img.width * k, img.height * k); URL.revokeObjectURL(url); };
    img.src = url;
  }, []); // eslint-disable-line
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setDirty(false); };
  const insert = async () => {
    store.closeDialog();
    if (editing?.kind === 'image') {
      const blob = await new Promise<Blob | null>((r) => canvas.current!.toBlob(r, 'image/png'));
      if (!blob) return;
      const key = `media/drawing_${newId()}.png`;
      store.doc = { ...store.doc, media: { ...store.doc.media, [key]: { mime: 'image/png', data: new Uint8Array(await blob.arrayBuffer()), name: 'drawing.png' } } };
      updateSelectedAtom(store, { media: key });
      return;
    }
    await canvasToDoc(store, canvas.current!, 'drawing.png');
  };
  return (
    <div className="drawbox">
      <h2>Draw</h2>
      <div className="row">
        <input type="color" aria-label="Pen color" value={color} onChange={(e) => setColor(e.target.value)} />
        <label className="mini">Size <input type="range" min={1} max={14} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
        <button type="button" className="tool" onClick={clear}>Clear</button>
      </div>
      <canvas ref={canvas} width={1200} height={700} style={{ touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={() => { last.current = null; }} onPointerCancel={() => { last.current = null; }} />
      <footer><button type="button" className="tool" onClick={() => store.closeDialog()}>Cancel</button><button className="primary" disabled={!dirty} onClick={() => void insert()}>{editing ? 'Apply' : 'Add to document'}</button></footer>
    </div>
  );
};

const MATH_KEYS: [string, string][] = [['Fraction', '()/()'], ['Power', '^()'], ['Below', '_()'], ['Root', 'sqrt()'], ['Sum', '∑_(i=1)^(n) '], ['Integral', '∫_(a)^(b) '], ['π', 'π'], ['θ', 'θ'], ['α', 'α'], ['β', 'β'], ['Δ', 'Δ'], ['∞', '∞'], ['±', '±'], ['×', '×'], ['÷', '÷'], ['≤', '≤'], ['≥', '≥'], ['≠', '≠'], ['≈', '≈'], ['→', '→']];

export const EquationDialog = ({ store }: { store: EditorStore }) => {
  const sel = selectedAtom(store);
  const existing = sel?.kind === 'equation' ? sel : undefined;
  const [text, setText] = useState(existing?.source ?? 'x = (-b ± sqrt(b^2 - 4ac))/(2a)');
  const area = useRef<HTMLTextAreaElement>(null);
  const put = (k: string) => {
    const el = area.current!;
    const at = el.selectionStart;
    setText(text.slice(0, at) + k + text.slice(el.selectionEnd));
    requestAnimationFrame(() => { el.focus(); const p = k.indexOf('()'); el.selectionStart = el.selectionEnd = at + (p >= 0 ? p + 1 : k.length); });
  };
  const box = equationBox(store.measurer, { source: text }, 18);
  const done = () => {
    store.closeDialog();
    if (existing) updateSelectedAtom(store, { source: text, omml: undefined });
    else store.insertAtom({ kind: 'equation', source: text });
  };
  return (
    <div className="eqbox">
      <h2>Equation</h2>
      <div className="eqkeys">{MATH_KEYS.map(([l, k]) => <button key={l} type="button" onClick={() => put(k)}>{l}</button>)}</div>
      <textarea ref={area} rows={3} autoFocus dir="ltr" value={text} onChange={(e) => setText(e.target.value)} aria-label="Equation text" />
      <div className="eqpreview"><MathView box={box} /></div>
      <footer><button type="button" className="tool" onClick={() => store.closeDialog()}>Cancel</button><button className="primary" onClick={done}>{existing ? 'Apply' : 'Add'}</button></footer>
    </div>
  );
};

export const DiagramDialog = ({ store }: { store: EditorStore }) => {
  const [kind, setKind] = useState('process');
  const [text, setText] = useState('Plan\nBuild\nReview\nShip');
  const [color, setColor] = useState('#2347ff');
  const d = buildDiagram(kind, text, color);
  return (
    <div className="eqbox">
      <h2>Diagram</h2>
      <div className="fields">
        <label className="field"><span>Kind</span><select value={kind} onChange={(e) => setKind(e.target.value)}>{DIAGRAM_GROUPS.map(([g, l]) => <optgroup key={g} label={g}>{l.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</optgroup>)}</select></label>
        <label className="field"><span>Color</span><input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <label className="field"><span>One item per line, indent with two spaces for a lower level</span><textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} /></label>
      </div>
      <div className="eqpreview"><DiagramView shapes={d.shapes} w={d.width} h={d.height} /></div>
      <footer><button type="button" className="tool" onClick={() => store.closeDialog()}>Cancel</button><button className="primary" disabled={!text.trim()} onClick={() => { store.closeDialog(); store.insertAtom(diagramAtom(kind, text, color), {}); }}>Add</button></footer>
    </div>
  );
};

export const KeysDialog = ({ store }: { store: EditorStore }) => {
  const [q, setQ] = useState('');
  const list = allCommands().filter((c) => c.keys && `${c.label} ${c.group}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="keysbox">
      <h2>Keyboard shortcuts</h2>
      <input autoFocus placeholder="Search" aria-label="Search shortcuts" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul>{list.map((c) => <li key={c.id}><span>{c.label}</span><kbd>{prettyKeys(c.keys)}</kbd></li>)}</ul>
      <footer><button className="tool" onClick={() => store.closeDialog()}>Close</button></footer>
    </div>
  );
};

const freshIds = (blocks: Block[]): Block[] => blocks.map((b) => (b.type === 'p' ? { ...b, id: newId() } : b.type === 'tbl' ? { ...b, id: newId(), rows: b.rows.map((r) => ({ ...r, id: newId(), cells: r.cells.map((c) => ({ ...c, id: newId(), blocks: freshIds(c.blocks) })) })) } : b));

export const BlocksPane = ({ store }: { store: EditorStore }) => {
  const [name, setName] = useState('');
  const [list, setList] = useState<SavedBlock[]>(savedBlocks);
  const text = isCollapsed(store.sel) ? '' : selectedText(store.doc, store.sel);
  const keep = (next: SavedBlock[]) => { setList(next); storeBlocks(next); };
  return (
    <aside className="inspector" aria-label="Saved text">
      <div className="phead"><h2>Saved text</h2><button className="ico" aria-label="Close" onClick={() => store.setView({ pane: null })}><X size={16} strokeWidth={1.9} /></button></div>
      <div className="pbody">
        <p className="muted">Keep text you use often, with its formatting, then add it with a click.</p>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="tool" disabled={!text || !name.trim()} onClick={() => { keep([...list, { name: name.trim(), text, blocks: copyBlocks(store) }]); setName(''); }}>Save the selection</button>
        {list.map((b, i) => (
          <article key={i} className="card">
            <header><b>{b.name}</b></header>
            <p className="muted">{b.text.slice(0, 90)}</p>
            <div className="row">
              <button className="tool" onClick={() => (Array.isArray(b.blocks) && b.blocks.length ? store.insertContent(freshIds(b.blocks as Block[])) : store.typeText(b.text))}>Add</button>
              <button className="tool" onClick={() => keep(list.filter((_, k) => k !== i))}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
};

export const IconsDialog = ({ store }: { store: EditorStore }) => {
  const [all, setAll] = useState<[string, Parameters<typeof iconSvg>[0]][]>([]);
  const [q, setQ] = useState('');
  const [color, setColor] = useState('#2347ff');
  useEffect(() => { void loadIcons().then((m) => setAll(Object.entries(m))); }, []);
  const list = all.filter(([n]) => iconLabel(n).includes(q.toLowerCase().trim())).slice(0, 240);
  const add = async (name: string, node: Parameters<typeof iconSvg>[0]) => {
    store.closeDialog();
    const blob = await iconPng(iconSvg(node, color));
    const file = new File([blob], `${name}.png`, { type: 'image/png' });
    const { insertImageFile } = await import('../features/images');
    await insertImageFile(store, file, 48);
  };
  return (
    <div className="iconbox">
      <h2>Icons</h2>
      <div className="row"><input autoFocus placeholder={`Search ${all.length || ''} icons`} aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} /><input type="color" aria-label="Icon color" value={color} onChange={(e) => setColor(e.target.value)} /></div>
      <div className="icongrid">{list.map(([n, node]) => <button key={n} title={iconLabel(n)} aria-label={iconLabel(n)} onClick={() => void add(n, node)} dangerouslySetInnerHTML={{ __html: iconSvg(node, color, 26, 1.75) }} />)}</div>
      {!list.length && all.length > 0 && <p className="muted">No icons match.</p>}
      <footer><button className="tool" onClick={() => store.closeDialog()}>Close</button></footer>
    </div>
  );
};

export const TemplatesDialog = ({ store }: { store: EditorStore }) => {
  const [group, setGroup] = useState(TEMPLATE_GROUPS[0]!);
  const pick = (id: string, name: string) => { const d = buildTemplate(id); store.closeDialog(); if (d) store.load(d, { name }); };
  return (
    <div className="tplbox">
      <h2>Start from a template</h2>
      <div className="seg wrap">{TEMPLATE_GROUPS.map((g) => <button key={g} className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>{g}</button>)}</div>
      <div className="tplgrid">{TEMPLATES.filter((t) => t.group === group).map((t) => <button key={t.id} onClick={() => pick(t.id, t.name)}><span className="tplpage" aria-hidden><i /><i /><i /><i /></span><span>{t.name}</span></button>)}</div>
      <footer><button className="tool" onClick={() => store.closeDialog()}>Close</button></footer>
    </div>
  );
};

let together: Together | null = null;

export const TogetherPane = ({ store }: { store: EditorStore }) => {
  const [, tick] = useState(0);
  const [mine, setMine] = useState('');
  const [theirs, setTheirs] = useState('');
  const [busy, setBusy] = useState(false);
  together ??= new Together(store, () => store.emit());
  const t = together;
  useEffect(() => { const u = store.subscribe(() => tick((n) => n + 1)); return u; }, [store]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { store.notify(e instanceof Error ? e.message : 'That code did not work.'); } setBusy(false); };
  const copy = (s: string) => void navigator.clipboard.writeText(s).then(() => store.notify('Code copied.')).catch(() => undefined);
  const supported = typeof RTCPeerConnection !== 'undefined';
  return (
    <aside className="inspector" aria-label="Work together">
      <div className="phead"><h2>Work together</h2><button className="ico" aria-label="Close" onClick={() => store.setView({ pane: null })}><X size={16} strokeWidth={1.9} /></button></div>
      <div className="pbody">
        {!supported && <p className="muted">This device can't connect directly to others.</p>}
        {!!t.peers.length && (
          <section className="group"><h3>Connected</h3>
            {t.peers.map((p) => <p key={p.id}><b>{p.name}</b></p>)}
            <button className="tool" onClick={() => t.leave()}>Stop working together</button>
          </section>
        )}
        <section className="group"><h3>Start</h3>
          <p className="muted">1. Make an invitation and send the code to the other person.</p>
          <button className="tool" disabled={busy || !supported} onClick={() => void run(async () => { const c = await t.invite(); setMine(c); copy(c); })}>Make an invitation</button>
          <p className="muted">3. Paste the reply code they send back.</p>
        </section>
        <section className="group"><h3>Join</h3>
          <p className="muted">2. Paste an invitation code here, then send back your reply code.</p>
        </section>
        <label className="field"><span>Paste a code</span><textarea rows={3} value={theirs} onChange={(e) => setTheirs(e.target.value)} /></label>
        <div className="row">
          <button className="tool" disabled={busy || !theirs.trim() || !supported} onClick={() => void run(async () => { const c = await t.answer(theirs); setMine(c); setTheirs(''); copy(c); })}>Join with this invitation</button>
          <button className="tool" disabled={busy || !theirs.trim() || !t.host} onClick={() => void run(async () => { await t.accept(theirs); setTheirs(''); })}>Finish with this reply</button>
        </div>
        {mine && <label className="field"><span>Your code (copied)</span><textarea rows={3} readOnly value={mine} onFocus={(e) => e.currentTarget.select()} /></label>}
        <section className="group"><h3>Share a copy</h3>
          <button className="tool" onClick={() => void shareLink(store)}>Copy a link to this document</button>
        </section>
      </div>
    </aside>
  );
};

const SIGNER_KEY = 'clerdodraft.signer';

export const SignaturesPane = ({ store }: { store: EditorStore }) => {
  const list = store.file.signatures ?? [];
  const [name, setName] = useState(store.author);
  const [purpose, setPurpose] = useState('Approved');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const sign = async (fromFile?: File) => {
    setBusy(true);
    try {
      const m = await import('../formats/sign');
      let signer;
      if (fromFile) signer = m.loadCertificate(new Uint8Array(await fromFile.arrayBuffer()), pw);
      else {
        let saved: string | null = null;
        try { saved = localStorage.getItem(SIGNER_KEY); } catch { /* none */ }
        if (saved) signer = m.loadCertificate(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)), '');
        else {
          const made = m.makeCertificate(name.trim() || store.author, '');
          signer = made.signer;
          try { let s = ''; for (const b of made.p12) s += String.fromCharCode(b); localStorage.setItem(SIGNER_KEY, btoa(s)); } catch { /* kept for now only */ }
        }
      }
      const { writeDocx } = await import('../docx');
      const signed = m.signPackage(writeDocx(store.doc), signer, purpose);
      const { download } = await import('../features/files');
      download(signed as BlobPart, `${store.file.name} (signed).docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      store.file = { ...store.file, signatures: m.verifyPackage(signed) };
      store.notify('A signed copy was saved. Any change to it will show that it was edited.');
    } catch (e) {
      store.notify(e instanceof Error && /password|MAC|decrypt/i.test(e.message) ? 'That certificate password is not correct.' : e instanceof Error ? e.message : 'The document could not be signed.');
    }
    setBusy(false);
  };
  return (
    <aside className="inspector" aria-label="Signatures">
      <div className="phead"><h2>Signatures</h2><button className="ico" aria-label="Close" onClick={() => store.setView({ pane: null })}><X size={16} strokeWidth={1.9} /></button></div>
      <div className="pbody">
        {!list.length && <p className="muted">This document isn't signed.</p>}
        {list.map((s, i) => (
          <article key={i} className={`card sig ${s.valid && s.intact ? 'ok' : 'bad'}`}>
            <header><b>{s.signer}</b><span className="tag">{s.valid && s.intact ? 'Valid' : s.valid ? 'Changed since signing' : 'Not valid'}</span></header>
            {s.time && <p className="muted">{new Date(s.time).toLocaleString()}</p>}
            {s.purpose && <p>{s.purpose}</p>}
            {s.selfSigned && <p className="muted">Personal certificate: it proves the document is unchanged, and the signer's name is as they entered it.</p>}
          </article>
        ))}
        <section className="group"><h3>Sign this document</h3>
          <label className="field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Purpose</span><input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
          <button className="tool" disabled={busy} onClick={() => void sign()}>Sign with my personal certificate</button>
          <p className="muted">Or use a certificate file (.pfx or .p12):</p>
          <label className="field"><span>Certificate password</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <label className="tool filebtn">Choose a certificate file<input type="file" accept=".pfx,.p12" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void sign(f); e.target.value = ''; }} /></label>
        </section>
      </div>
    </aside>
  );
};
