import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Align, Paragraph, ParaProps, RunProps, Style } from '../core/model';
import { para } from '../core/model';
import { createTable, insertBlocksAfter, mapRunsInSelection, setParaProps, updateTable } from '../core/ops';
import { cellOf } from '../editor/interaction';
import { collapsed, findPara, flatten, isCollapsed, selectedText, storyBlocks, updatePara, walkParagraphs } from '../core/tree';
import { allCommands, prettyKeys, run } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { currentPara, currentRun, setSection } from '../features/coreCommands';
import { stats } from '../features/exports';
import { addCommentHere, seqCaption } from '../features/insert';
import { makeEnvelope, makeLabels } from '../features/mailReview';
import { styleLabel } from './labels';
import { selectedAtom, updateSelectedAtom } from '../features/images';
import { SHAPES } from '../features/insert';
import { ChartDialog } from './ChartDialog';
import { insertCitation, insertCrossRef, markIndexEntry, referenceTargets, saveSource } from '../features/references';
import { saveTyping, typing, type TypingOptions } from '../features/autoType';

type Val = string | number | boolean;

interface Field {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'check' | 'color' | 'area';
  options?: [string, string][];
  step?: number;
}

interface FormDef {
  title: string;
  ok?: string;
  fields: Field[];
  initial: Record<string, Val>;
  apply: (v: Record<string, Val>) => void;
}

const Form = ({ store, def }: { store: EditorStore; def: FormDef }) => {
  const [v, set] = useState(def.initial);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => { first.current?.querySelector<HTMLElement>('input,select,textarea')?.focus(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); def.apply(v); store.closeDialog(); }}>
      <h2>{def.title}</h2>
      <div className="fields" ref={first}>
        {def.fields.map((f) => (
          <label key={f.key} className={f.type === 'check' ? 'check' : 'field'}>
            {f.type === 'check'
              ? <><input type="checkbox" checked={!!v[f.key]} onChange={(e) => set({ ...v, [f.key]: e.target.checked })} /> {f.label}</>
              : <><span>{f.label}</span>{f.type === 'select'
                ? <select value={String(v[f.key] ?? '')} onChange={(e) => set({ ...v, [f.key]: e.target.value })}>{f.options!.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
                : f.type === 'area'
                  ? <textarea rows={4} value={String(v[f.key] ?? '')} onChange={(e) => set({ ...v, [f.key]: e.target.value })} />
                  : <input type={f.type ?? 'text'} step={f.step ?? (f.type === 'number' ? 0.5 : undefined)} value={String(v[f.key] ?? (f.type === 'color' ? '#000000' : ''))} onChange={(e) => set({ ...v, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} />}</>}
          </label>
        ))}
      </div>
      <footer><button type="button" className="tool" onClick={() => store.closeDialog()}>Cancel</button><button className="primary">{def.ok ?? 'Apply'}</button></footer>
    </form>
  );
};

const hasValue = (v: Val | undefined): boolean => v !== undefined && v !== '';

const fontForm = (s: EditorStore): FormDef => {
  const r = currentRun(s);
  return {
    title: 'Text settings',
    fields: [
      { key: 'font', label: 'Font' }, { key: 'size', label: 'Size (pt)', type: 'number' }, { key: 'color', label: 'Color', type: 'color' },
      { key: 'underline', label: 'Underline', type: 'select', options: [['none', 'None'], ['single', 'Single'], ['double', 'Double'], ['thick', 'Thick'], ['dotted', 'Dotted'], ['dashed', 'Dashed'], ['wave', 'Wave'], ['words', 'Words only']] },
      { key: 'spacing', label: 'Letter spacing (pt)', type: 'number', step: 0.1 }, { key: 'position', label: 'Raise (pt)', type: 'number' }, { key: 'scale', label: 'Width (%)', type: 'number', step: 1 },
      { key: 'bold', label: 'Bold', type: 'check' }, { key: 'italic', label: 'Italic', type: 'check' }, { key: 'strike', label: 'Strikethrough', type: 'check' }, { key: 'doubleStrike', label: 'Double strikethrough', type: 'check' }, { key: 'smallCaps', label: 'Small capitals', type: 'check' }, { key: 'caps', label: 'All capitals', type: 'check' }, { key: 'hidden', label: 'Hidden', type: 'check' }, { key: 'shadow', label: 'Shadow', type: 'check' }, { key: 'outline', label: 'Outline', type: 'check' },
    ],
    initial: { font: r.font ?? '', size: r.size ?? 11, color: r.color ?? '#000000', underline: r.underline ?? 'none', spacing: r.spacing ?? 0, position: r.position ?? 0, scale: r.scale ?? 100, bold: !!r.bold, italic: !!r.italic, strike: !!r.strike, doubleStrike: !!r.doubleStrike, smallCaps: !!r.smallCaps, caps: !!r.caps, hidden: !!r.hidden, shadow: !!r.shadow, outline: !!r.outline },
    apply: (v) => s.formatRun(v as unknown as RunProps),
  };
};

const paraForm = (s: EditorStore): FormDef => {
  const p = currentPara(s);
  const ls = p.lineSpacing ?? { rule: 'auto', value: 1 };
  return {
    title: 'Paragraph settings',
    fields: [
      { key: 'align', label: 'Alignment', type: 'select', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justified'], ['distribute', 'Distributed']] },
      { key: 'indentLeft', label: 'Left indent (pt)', type: 'number' }, { key: 'indentRight', label: 'Right indent (pt)', type: 'number' }, { key: 'firstLine', label: 'First line (pt, negative hangs)', type: 'number' },
      { key: 'spaceBefore', label: 'Space before (pt)', type: 'number' }, { key: 'spaceAfter', label: 'Space after (pt)', type: 'number' },
      { key: 'rule', label: 'Line spacing', type: 'select', options: [['auto', 'Multiple'], ['atLeast', 'At least (pt)'], ['exact', 'Exactly (pt)']] }, { key: 'line', label: 'Value', type: 'number', step: 0.05 },
      { key: 'shading', label: 'Shading', type: 'color' }, { key: 'useShading', label: 'Use shading', type: 'check' },
      { key: 'keepNext', label: 'Keep with next', type: 'check' }, { key: 'keepLines', label: 'Keep lines together', type: 'check' }, { key: 'pageBreakBefore', label: 'Start on a new page', type: 'check' }, { key: 'widowControl', label: 'Avoid single lines at page edges', type: 'check' }, { key: 'bidi', label: 'Right-to-left', type: 'check' },
    ],
    initial: { align: p.align ?? 'left', indentLeft: p.indentLeft ?? 0, indentRight: p.indentRight ?? 0, firstLine: p.firstLine ?? 0, spaceBefore: p.spaceBefore ?? 0, spaceAfter: p.spaceAfter ?? 0, rule: ls.rule, line: ls.value, shading: p.shading ?? '#ffffff', useShading: !!p.shading, keepNext: !!p.keepNext, keepLines: !!p.keepLines, pageBreakBefore: !!p.pageBreakBefore, widowControl: p.widowControl !== false, bidi: !!p.bidi },
    apply: (v) => {
      const patch: ParaProps = {
        align: v['align'] as Align, indentLeft: v['indentLeft'] as number, indentRight: v['indentRight'] as number, firstLine: v['firstLine'] as number,
        spaceBefore: v['spaceBefore'] as number, spaceAfter: v['spaceAfter'] as number, lineSpacing: { rule: v['rule'] as 'auto', value: v['line'] as number },
        shading: v['useShading'] ? (v['shading'] as string) : undefined,
        keepNext: !!v['keepNext'], keepLines: !!v['keepLines'], pageBreakBefore: !!v['pageBreakBefore'], widowControl: !!v['widowControl'], bidi: !!v['bidi'],
      };
      s.commit(setParaProps(s.doc, s.sel, patch));
    },
  };
};

const pageForm = (s: EditorStore): FormDef => {
  const c = s.doc.section;
  return {
    title: 'Page setup',
    fields: [
      { key: 'pageWidth', label: 'Width (pt)', type: 'number' }, { key: 'pageHeight', label: 'Height (pt)', type: 'number' },
      { key: 'marginTop', label: 'Top margin', type: 'number' }, { key: 'marginBottom', label: 'Bottom margin', type: 'number' }, { key: 'marginLeft', label: 'Left margin', type: 'number' }, { key: 'marginRight', label: 'Right margin', type: 'number' }, { key: 'gutter', label: 'Gutter', type: 'number' },
      { key: 'headerDistance', label: 'Header from edge', type: 'number' }, { key: 'footerDistance', label: 'Footer from edge', type: 'number' },
      { key: 'titlePage', label: 'Different first page', type: 'check' }, { key: 'evenOdd', label: 'Different odd and even pages', type: 'check' }, { key: 'separator', label: 'Line between columns', type: 'check' },
    ],
    initial: { pageWidth: c.pageWidth, pageHeight: c.pageHeight, marginTop: c.marginTop, marginBottom: c.marginBottom, marginLeft: c.marginLeft, marginRight: c.marginRight, gutter: c.gutter ?? 0, headerDistance: c.headerDistance, footerDistance: c.footerDistance, titlePage: !!c.titlePage, evenOdd: !!s.doc.settings.evenAndOddHeaders, separator: !!c.columns.separator },
    apply: (v) => {
      const { evenOdd, separator, ...rest } = v;
      s.doc = { ...s.doc, settings: { ...s.doc.settings, evenAndOddHeaders: !!evenOdd } };
      setSection(s, { ...(rest as Record<string, never>), columns: { ...c.columns, separator: !!separator } });
    },
  };
};

const styleForm = (s: EditorStore, id: string, create: boolean): FormDef => {
  const cur: Style = s.doc.styles.styles[id] ?? { id, name: 'New style', kind: 'paragraph', basedOn: 'Normal', next: 'Normal', quick: true };
  const paragraphs = Object.values(s.doc.styles.styles).filter((x) => x.kind === 'paragraph');
  return {
    title: create ? 'New style' : `Edit ${styleLabel(cur)}`,
    fields: [
      { key: 'name', label: 'Name' }, { key: 'basedOn', label: 'Built on', type: 'select', options: [['', 'Nothing'], ...paragraphs.map((p) => [p.id, p.name] as [string, string])] },
      { key: 'font', label: 'Font' }, { key: 'size', label: 'Size (pt)', type: 'number' }, { key: 'color', label: 'Color', type: 'color' },
      { key: 'bold', label: 'Bold', type: 'check' }, { key: 'italic', label: 'Italic', type: 'check' },
      { key: 'spaceBefore', label: 'Space before (pt)', type: 'number' }, { key: 'spaceAfter', label: 'Space after (pt)', type: 'number' }, { key: 'quick', label: 'Show in the style list', type: 'check' },
    ],
    initial: { name: cur.name, basedOn: cur.basedOn ?? '', font: cur.run?.font ?? '', size: cur.run?.size ?? 11, color: cur.run?.color ?? '#000000', bold: !!cur.run?.bold, italic: !!cur.run?.italic, spaceBefore: cur.para?.spaceBefore ?? 0, spaceAfter: cur.para?.spaceAfter ?? 8, quick: !!cur.quick },
    apply: (v) => {
      const next: Style = {
        ...cur, name: String(v['name']), basedOn: v['basedOn'] ? String(v['basedOn']) : undefined, quick: !!v['quick'],
        run: { ...cur.run, font: v['font'] ? String(v['font']) : undefined, size: v['size'] as number, color: v['color'] as string, bold: !!v['bold'], italic: !!v['italic'] },
        para: { ...cur.para, spaceBefore: v['spaceBefore'] as number, spaceAfter: v['spaceAfter'] as number },
      };
      s.commit({ ...s.doc, styles: { ...s.doc.styles, styles: { ...s.doc.styles.styles, [id]: next } } });
    },
  };
};

const SYMBOLS = '©®™°±×÷≠≤≥∞∑∏√αβγδπΩµ€£¥§¶†‡•–—…←↑→↓↔✓✗★☆﷽ﷺ'.split('');

const SymbolGrid = ({ store }: { store: EditorStore }) => (
  <div>
    <h2>Symbol</h2>
    <div className="symbols">{SYMBOLS.map((c) => <button key={c} onClick={() => { store.closeDialog(); store.typeText(c); }}>{c}</button>)}</div>
    <footer><button className="tool" onClick={() => store.closeDialog()}>Close</button></footer>
  </div>
);

const Palette = ({ store }: { store: EditorStore }) => {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return allCommands().filter((c) => words.every((w) => `${c.label} ${c.group}`.toLowerCase().includes(w))).slice(0, 12);
  }, [q]);
  const go = (id: string) => { store.closeDialog(); run(store, id); };
  return (
    <div className="palette">
      <input autoFocus aria-label="Search commands" placeholder="What do you want to do?" value={q}
        onChange={(e) => { setQ(e.target.value); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, list.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
          if (e.key === 'Enter' && list[i]) { e.preventDefault(); go(list[i]!.id); }
        }} />
      <ul>{list.map((c, k) => <li key={c.id}><button className={k === i ? 'on' : ''} onClick={() => go(c.id)}><span>{c.label}</span><small>{c.group}</small><kbd>{prettyKeys(c.keys)}</kbd></button></li>)}</ul>
    </div>
  );
};

const CitePicker = ({ store }: { store: EditorStore }) => {
  const list = store.doc.sources ?? [];
  return (
    <div>
      <h2>Cite a source</h2>
      {!list.length && <p className="muted">No sources yet.</p>}
      <div className="toollist">{list.map((c) => <div key={c.tag} className="outrow"><button className="outlink" onClick={() => { store.closeDialog(); insertCitation(store, c.tag); }}>{c.title || c.tag}</button><button className="tool" onClick={() => store.openDialog('source', { tag: c.tag })}>Edit</button></div>)}</div>
      <footer><button className="primary" onClick={() => store.openDialog('source')}>New source</button></footer>
    </div>
  );
};

const CrossPicker = ({ store }: { store: EditorStore }) => {
  const list = referenceTargets(store);
  return (
    <div>
      <h2>Cross-reference</h2>
      {!list.length && <p className="muted">Add headings, captions or bookmarks first.</p>}
      <div className="toollist">{list.map((t) => (
        <div key={t.key} className="outrow">
          <button className="outlink" title={t.kind} onClick={() => { store.closeDialog(); insertCrossRef(store, t, 'text'); }}>{t.label}</button>
          <button className="tool" onClick={() => { store.closeDialog(); insertCrossRef(store, t, 'page'); }}>Page</button>
        </div>
      ))}</div>
    </div>
  );
};

const Report = ({ store, title, rows }: { store: EditorStore; title: string; rows: [string, string | number][] }) => (
  <div>
    <h2>{title}</h2>
    <dl className="report">{rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
    <footer><button className="primary" onClick={() => store.closeDialog()}>Done</button></footer>
  </div>
);

const a11yIssues = (s: EditorStore): [string, string | number][] => {
  const ps = [...walkParagraphs(s.doc.blocks)];
  const images = ps.flatMap((p) => p.runs).filter((r) => r.atom?.kind === 'image');
  const noAlt = images.filter((r) => r.atom?.kind === 'image' && !r.atom.alt).length;
  const tables = s.doc.blocks.filter((b) => b.type === 'tbl');
  const noHeader = tables.filter((t) => t.type === 'tbl' && !t.rows[0]?.props.header).length;
  const headings = ps.filter((p) => /^Heading/.test(p.props.style ?? '')).length;
  return [['Pictures without a description', noAlt], ['Tables without a header row', noHeader], ['Headings in the document', headings], ['Document title set', s.doc.properties.title ? 'Yes' : 'No']];
};

const insertBefore = (s: EditorStore, blocks: Paragraph[]): void => {
  const first = flatten(storyBlocks(s.doc, 'body')).paras[0]!;
  const d = insertBlocksAfter(s.doc, 'body', first.id, blocks);
  const moved = d.blocks.filter((b) => b.id !== first.id);
  s.commit({ ...d, blocks: [...moved.slice(0, blocks.length), first, ...moved.slice(blocks.length)] });
};

const formFor = (s: EditorStore, id: string, props?: Record<string, unknown>): FormDef | null => {
  switch (id) {
    case 'font': return fontForm(s);
    case 'paragraph': return paraForm(s);
    case 'pageSetup': return pageForm(s);
    case 'style': return styleForm(s, String(props?.['id']), !!props?.['create']);
    case 'table': return {
      title: 'Add a table', ok: 'Add', fields: [{ key: 'rows', label: 'Rows', type: 'number', step: 1 }, { key: 'cols', label: 'Columns', type: 'number', step: 1 }], initial: { rows: 3, cols: 3 },
      apply: (v) => {
        const c = s.doc.section;
        const t = createTable(Math.min(500, Math.max(1, Number(v['rows']))), Math.min(63, Math.max(1, Number(v['cols']))), c.pageWidth - c.marginLeft - c.marginRight);
        const pos = s.sel.focus;
        const tail = para();
        const d = insertBlocksAfter(s.doc, pos.story, pos.para, [t, tail]);
        const first = t.rows[0]!.cells[0]!.blocks[0]!.id;
        s.commit({ doc: d, sel: collapsed({ ...pos, para: first, offset: 0 }) });
      },
    };
    case 'link': return {
      title: 'Link', fields: [{ key: 'href', label: 'Address' }], initial: { href: 'https://' },
      apply: (v) => {
        const href = String(v['href']);
        if (!/^(https?:|mailto:)/i.test(href)) { s.notify('Use an https or mailto address.'); return; }
        if (isCollapsed(s.sel)) { s.typeText(href); return; }
        s.commit(mapRunsInSelection(s.doc, s.sel, (r) => ({ ...r, link: { href }, props: { ...r.props, charStyle: 'Hyperlink' } })));
      },
    };
    case 'bookmark': return {
      title: 'Bookmark', fields: [{ key: 'name', label: 'Name' }], initial: { name: '' },
      apply: (v) => {
        const name = String(v['name']).trim().replace(/\s+/g, '_');
        if (!name) return;
        const a = s.sel.anchor.offset; const b = s.sel.focus.offset;
        s.commit(updatePara(s.doc, s.sel.focus.story, s.sel.focus.para, (p) => ({ ...p, bookmarks: [...(p.bookmarks ?? []), { name, start: Math.min(a, b), end: Math.max(a, b) }] })));
      },
    };
    case 'equation': return { title: 'Equation', fields: [{ key: 'source', label: 'Equation text', type: 'area' }], initial: { source: 'a^2 + b^2 = c^2' }, apply: (v) => s.insertAtom({ kind: 'equation', source: String(v['source']) }) };
    case 'comment': return { title: 'Comment', ok: 'Add', fields: [{ key: 'text', label: 'Comment', type: 'area' }], initial: { text: '' }, apply: (v) => addCommentHere(s, String(v['text'])) };
    case 'caption': return { title: 'Caption', ok: 'Add', fields: [{ key: 'label', label: 'Label', type: 'select', options: [['Figure', 'Figure'], ['Table', 'Table'], ['Equation', 'Equation']] }, { key: 'text', label: 'Text' }], initial: { label: 'Figure', text: '' }, apply: (v) => seqCaption(s, String(v['label']), String(v['text'])) };
    case 'cover': return {
      title: 'Cover page', ok: 'Add', fields: [{ key: 'title', label: 'Title' }, { key: 'subtitle', label: 'Subtitle' }, { key: 'author', label: 'Author' }], initial: { title: s.file.name, subtitle: '', author: s.author },
      apply: (v) => insertBefore(s, [para([], { spaceAfter: 180 }), para([{ text: String(v['title']), props: {} }], { style: 'Title' }), para([{ text: String(v['subtitle']), props: {} }], { style: 'Subtitle' }), para([{ text: `${String(v['author'])}\f`, props: {} }])]),
    };
    case 'properties': {
      const q = s.doc.properties;
      return {
        title: 'Document details',
        fields: [{ key: 'title', label: 'Title' }, { key: 'subject', label: 'Subject' }, { key: 'creator', label: 'Author' }, { key: 'keywords', label: 'Keywords' }, { key: 'yourName', label: 'Your name on comments and changes' }],
        initial: { title: q.title ?? '', subject: q.subject ?? '', creator: q.creator ?? s.author, keywords: q.keywords ?? '', yourName: s.author },
        apply: (v) => { const { yourName, ...rest } = v; s.setAuthor(String(yourName)); s.commit({ ...s.doc, properties: { ...q, ...(rest as Record<string, string>) } }); },
      };
    }
    case 'goto': return {
      title: 'Go to page', ok: 'Go', fields: [{ key: 'page', label: `Page (1 to ${s.layout.pages.length})`, type: 'number', step: 1 }], initial: { page: 1 },
      apply: (v) => {
        const page = s.layout.pages[Math.max(0, Math.min(s.layout.pages.length - 1, Number(v['page']) - 1))];
        const l = page?.body.lines[0];
        if (l) s.setSel(collapsed({ story: 'body', para: l.para, offset: l.from }));
      },
    };
    case 'watermark': return {
      title: 'Watermark', fields: [{ key: 'text', label: 'Text (leave empty to remove)' }, { key: 'color', label: 'Color', type: 'color' }, { key: 'diagonal', label: 'Diagonal', type: 'check' }],
      initial: { text: s.doc.settings.watermark?.text ?? '', color: s.doc.settings.watermark?.color ?? '#c8c8c8', diagonal: s.doc.settings.watermark?.diagonal !== false },
      apply: (v) => s.commit({ ...s.doc, settings: { ...s.doc.settings, watermark: v['text'] ? { text: String(v['text']), color: String(v['color']), diagonal: !!v['diagonal'] } : undefined } }),
    };
    case 'pageBorder': return {
      title: 'Page border', fields: [{ key: 'on', label: 'Show a border', type: 'check' }, { key: 'width', label: 'Width (pt)', type: 'number' }, { key: 'color', label: 'Color', type: 'color' }], initial: { on: !!s.doc.section.pageBorders, width: 1, color: '#000000' },
      apply: (v) => { const b = { style: 'single', width: Number(v['width']), color: String(v['color']), space: 24 }; setSection(s, { pageBorders: v['on'] ? { top: b, bottom: b, left: b, right: b } : undefined }); },
    };
    case 'lineNumbers': return { title: 'Line numbers', fields: [{ key: 'on', label: 'Number the lines', type: 'check' }, { key: 'by', label: 'Count by', type: 'number', step: 1 }], initial: { on: !!s.doc.section.lineNumbers, by: 1 }, apply: (v) => setSection(s, { lineNumbers: v['on'] ? { countBy: Number(v['by']) || 1 } : undefined }) };
    case 'picture': {
      const a = selectedAtom(s);
      if (!a || (a.kind !== 'image' && a.kind !== 'shape' && a.kind !== 'chart')) return null;
      return {
        title: 'Picture settings',
        fields: [{ key: 'width', label: 'Width (pt)', type: 'number' }, { key: 'height', label: 'Height (pt)', type: 'number' }, { key: 'wrap', label: 'Text around it', type: 'select', options: [['inline', 'In line with text'], ['square', 'Wrap around'], ['topBottom', 'Above and below'], ['behind', 'Behind text'], ['front', 'In front of text']] }, { key: 'rotation', label: 'Rotation (degrees)', type: 'number', step: 1 }, { key: 'alt', label: 'Description for screen readers', type: 'area' }],
        initial: { width: a.width, height: a.height, wrap: a.wrap, rotation: a.kind === 'image' ? (a.rotation ?? 0) : 0, alt: a.kind === 'shape' ? '' : (a.alt ?? '') },
        apply: (v) => {
          const wrap = v['wrap'] as string;
          updateSelectedAtom(s, { ...v, float: wrap === 'inline' ? undefined : (a.float ?? { relH: 'column', relV: 'paragraph', x: 0, y: 0 }), ...(wrap !== a.wrap && a.kind !== 'image' ? { xml: undefined } : {}) });
        },
      };
    }
    case 'source': {
      const cur = (s.doc.sources ?? []).find((x) => x.tag === props?.['tag']);
      return {
        title: cur ? 'Edit source' : 'New source',
        fields: [{ key: 'type', label: 'Type', type: 'select', options: [['Book', 'Book'], ['JournalArticle', 'Journal article'], ['InternetSite', 'Website'], ['Report', 'Report'], ['Misc', 'Other']] }, { key: 'title', label: 'Title' }, { key: 'authors', label: 'Authors (Last, First; one per line)', type: 'area' }, { key: 'year', label: 'Year' }, { key: 'publisher', label: 'Publisher' }, { key: 'journal', label: 'Journal' }, { key: 'url', label: 'Web address' }],
        initial: { type: cur?.type ?? 'Book', title: cur?.title ?? '', authors: cur?.authors.join('\n') ?? '', year: cur?.year ?? '', publisher: cur?.publisher ?? '', journal: cur?.journal ?? '', url: cur?.url ?? '' },
        apply: (v) => saveSource(s, v, cur?.tag),
      };
    }
    case 'indexMark': return { title: 'Index entry', ok: 'Mark', fields: [{ key: 'term', label: 'Entry' }], initial: { term: isCollapsed(s.sel) ? '' : selectedText(s.doc, s.sel) }, apply: (v) => markIndexEntry(s, String(v['term'])) };
    case 'shape': {
      const a = selectedAtom(s);
      if (a?.kind !== 'shape') return null;
      return {
        title: 'Shape color and outline',
        fields: [{ key: 'shape', label: 'Shape', type: 'select', options: SHAPES }, { key: 'useFill', label: 'Fill', type: 'check' }, { key: 'fill', label: 'Fill color', type: 'color' }, { key: 'useStroke', label: 'Outline', type: 'check' }, { key: 'stroke', label: 'Outline color', type: 'color' }, { key: 'strokeWidth', label: 'Outline width (pt)', type: 'number', step: 0.25 }],
        initial: { shape: a.shape, useFill: !!a.fill, fill: a.fill ?? '#dbe3ff', useStroke: !!a.stroke, stroke: a.stroke ?? '#2347ff', strokeWidth: a.strokeWidth ?? 0.75 },
        apply: (v) => updateSelectedAtom(s, { shape: v['shape'], fill: v['useFill'] ? v['fill'] : undefined, stroke: v['useStroke'] ? v['stroke'] : undefined, strokeWidth: v['strokeWidth'], xml: undefined }),
      };
    }
    case 'cell': {
      const h = cellOf(s);
      if (!h) return null;
      const c = h.table.rows[h.r]!.cells[h.c]!;
      return {
        title: 'Cell settings',
        fields: [{ key: 'useFill', label: 'Fill the cell', type: 'check' }, { key: 'fill', label: 'Fill color', type: 'color' }, { key: 'vAlign', label: 'Text position', type: 'select', options: [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']] }, { key: 'border', label: 'Border', type: 'select', options: [['keep', 'As the table'], ['none', 'None'], ['single', 'Single line'], ['double', 'Double line'], ['thick', 'Thick line']] }, { key: 'color', label: 'Border color', type: 'color' }, { key: 'whole', label: 'Apply to the whole table', type: 'check' }],
        initial: { useFill: !!c.props.shading, fill: c.props.shading ?? '#dbe3ff', vAlign: c.props.vAlign ?? 'top', border: 'keep', color: '#000000', whole: false },
        apply: (v) => {
          const kind = String(v['border']);
          const line = { style: kind === 'thick' ? 'single' : kind === 'none' ? 'nil' : kind, width: kind === 'thick' ? 1.5 : 0.5, color: String(v['color']) };
          const patch = { shading: v['useFill'] ? String(v['fill']) : undefined, vAlign: v['vAlign'] as 'top', ...(kind === 'keep' ? {} : { borders: { top: line, bottom: line, left: line, right: line } }) };
          s.commit(updateTable(s.doc, s.sel.focus.story, s.sel.focus.para, (t, r, col) => ({
            ...t,
            rows: t.rows.map((row, ri) => ({ ...row, cells: row.cells.map((cell, ci) => (v['whole'] || (ri === r && ci === col) ? { ...cell, props: { ...cell.props, ...patch } } : cell)) })),
          })));
        },
      };
    }
    case 'paraBorder': {
      const b = currentPara(s).borders;
      return {
        title: 'Paragraph border',
        fields: [{ key: 'top', label: 'Top', type: 'check' }, { key: 'bottom', label: 'Bottom', type: 'check' }, { key: 'left', label: 'Left', type: 'check' }, { key: 'right', label: 'Right', type: 'check' }, { key: 'width', label: 'Width (pt)', type: 'number' }, { key: 'color', label: 'Color', type: 'color' }],
        initial: { top: !!b?.top, bottom: !!b?.bottom, left: !!b?.left, right: !!b?.right, width: b?.top?.width ?? 0.5, color: b?.top?.color ?? '#000000' },
        apply: (v) => {
          const line = { style: 'single', width: Number(v['width']), color: String(v['color']), space: 2 };
          const borders = { ...(v['top'] ? { top: line } : {}), ...(v['bottom'] ? { bottom: line } : {}), ...(v['left'] ? { left: line } : {}), ...(v['right'] ? { right: line } : {}) };
          s.commit(setParaProps(s.doc, s.sel, { borders: Object.keys(borders).length ? borders : undefined }));
        },
      };
    }
    case 'autocorrect': {
      const o = typing.options;
      return {
        title: 'Typing helpers',
        fields: [{ key: 'replace', label: 'Fix common typos and symbols', type: 'check' }, { key: 'quotes', label: 'Curly quotes', type: 'check' }, { key: 'capitals', label: 'Capitalize sentences', type: 'check' }, { key: 'lists', label: 'Start lists automatically', type: 'check' }, { key: 'links', label: 'Turn web addresses into links', type: 'check' }],
        initial: { ...o },
        apply: (v) => saveTyping(v as unknown as TypingOptions),
      };
    }
    case 'words': {
      const proof = s.proof;
      return {
        title: 'My dictionary', fields: [{ key: 'words', label: 'One word per line', type: 'area' }], initial: { words: [...(proof?.personal ?? [])].join('\n') },
        apply: (v) => {
          if (!proof) return;
          proof.personal = new Set(String(v['words']).split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean));
          try { localStorage.setItem('clerdodraft.words', JSON.stringify([...proof.personal])); } catch { /* kept for this session */ }
          proof.setEnabled(proof.enabled);
        },
      };
    }
    case 'envelope': return { title: 'Envelope', ok: 'Create', fields: [{ key: 'to', label: 'To', type: 'area' }, { key: 'from', label: 'From', type: 'area' }], initial: { to: '', from: '' }, apply: (v) => makeEnvelope(s, String(v['to']), String(v['from'])) };
    case 'labels': return { title: 'Labels', ok: 'Create', fields: [{ key: 'text', label: 'Label text', type: 'area' }, { key: 'across', label: 'Across', type: 'number', step: 1 }, { key: 'down', label: 'Down', type: 'number', step: 1 }], initial: { text: '', across: 2, down: 7 }, apply: (v) => makeLabels(s, String(v['text']), Number(v['across']), Number(v['down'])) };
    default: return null;
  }
};

export const DialogHost = ({ store }: { store: EditorStore }) => {
  const d = store.dialog;
  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') store.closeDialog(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [d, store]);
  if (!d) return null;
  const form = formFor(store, d.id, d.props);
  let body = form ? <Form key={d.id} store={store} def={form} /> : null;
  if (d.id === 'chart') body = <ChartDialog store={store} create={!!d.props?.['create']} />;
  if (d.id === 'cite') body = <CitePicker store={store} />;
  if (d.id === 'cross') body = <CrossPicker store={store} />;
  if (d.id === 'symbol') body = <SymbolGrid store={store} />;
  if (d.id === 'palette') body = <Palette store={store} />;
  if (d.id === 'count') {
    const r = stats(store);
    const sel = isCollapsed(store.sel) ? '' : selectedText(store.doc, store.sel);
    body = <Report store={store} title="Word count" rows={[['Pages', r.pages], ['Words', r.words], ['Characters', r.chars], ['Characters without spaces', r.charsNoSpaces], ['Paragraphs', r.paras], ['Lines', r.lines], ...(sel ? [['Selected words', sel.split(/\s+/).filter(Boolean).length] as [string, number]] : [])]} />;
  }
  if (d.id === 'a11y') body = <Report store={store} title="Accessibility check" rows={a11yIssues(store)} />;
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) store.closeDialog(); }}>
      <div className={`dialog ${d.id}`} role="dialog" aria-modal="true">
        <button className="ico close" aria-label="Close" onClick={() => store.closeDialog()}><X size={16} strokeWidth={1.9} /></button>
        {body}
      </div>
    </div>
  );
};

void findPara; void hasValue;
