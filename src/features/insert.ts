import { isOutlineOnly, SHAPE_GROUPS } from '../core/shapes';
import { ATOM_CHAR, newId, para, type FieldKind, type Note, type Section, type ShapeAtom } from '../core/model';
import { addComment, createTable, insertBlocksAfter, insertContent, mapRunsInSelection, propsAt, removeBlock, splitParagraph } from '../core/ops';
import { flatten, headingOf, isCollapsed, orderedSel, storyBlocks, updatePara, walkAll } from '../core/extra';
import { register } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { headingLevel } from '../core/styles';
import { enterHeaderFooter } from './headerFooter';
import { selectedAtom as selectedDrawing } from './images';

export const field = (s: EditorStore, f: FieldKind, instr: string, result: string): void => s.insertAtom({ kind: 'field', field: f, instr, result });

export const insertNote = (s: EditorStore, kind: 'footnote' | 'endnote'): void => {
  const id = String(Date.now() % 100000000);
  const note: Note = { id, kind: 'normal', blocks: [para([{ text: ' ', props: {} }], { style: kind === 'footnote' ? 'FootnoteText' : 'EndnoteText' })] };
  const doc = kind === 'footnote' ? { ...s.doc, footnotes: { ...s.doc.footnotes, [id]: note } } : { ...s.doc, endnotes: { ...s.doc.endnotes, [id]: note } };
  s.doc = doc;
  s.insertAtom({ kind, id }, { charStyle: kind === 'footnote' ? 'FootnoteReference' : 'EndnoteReference' });
  const story = `${kind === 'footnote' ? 'fn' : 'en'}:${id}` as const;
  s.setSel({ anchor: { story, para: note.blocks[0]!.id, offset: 1 }, focus: { story, para: note.blocks[0]!.id, offset: 1 } });
};

export const insertSectionBreak = (s: EditorStore, type: NonNullable<Section['breakType']>): void => {
  const split = splitParagraph(s.doc, s.sel, {});
  const pos = split.sel.focus;
  const f = flatten(storyBlocks(split.doc, pos.story));
  const before = f.paras[(f.index.get(pos.para) ?? 1) - 1]!;
  // The new section starts after the break, so the following section takes the break type.
  const sec = { ...split.doc.section };
  const d = updatePara(split.doc, pos.story, before.id, (p) => ({ ...p, section: sec }));
  s.commit({ doc: { ...d, section: { ...d.section, breakType: type } }, sel: split.sel });
};

export const addCommentHere = (s: EditorStore, text: string): void => {
  if (isCollapsed(s.sel)) { s.notify('Select some text to comment on.'); return; }
  const id = String(Date.now() % 100000000);
  const d = addComment(s.doc, s.sel, id);
  s.commit({ ...d, comments: { ...d.comments, [id]: { id, author: s.author, date: new Date().toISOString(), blocks: [para([{ text, props: {} }])] } } });
  s.setView({ pane: 'comments' });
};

export const insertShape = (s: EditorStore, shape: string): void => {
  const outline = isOutlineOnly(shape);
  const square = /^(ellipse|star|smiley|sun|heart|noSmoking|donut|gear|flowChartConnector|flowChartOr|flowChartSummingJunction|math|cube|can|irregularSeal)/.test(shape);
  const atom: ShapeAtom = { kind: 'shape', shape, width: square ? 108 : 144, height: square ? 108 : 96, fill: outline ? undefined : '#dbe3ff', stroke: '#2347ff', strokeWidth: outline ? 1.5 : 1, wrap: 'inline' };
  s.insertAtom(atom, {});
};

const pageField = (s: EditorStore, where: 'header' | 'footer'): void => {
  const page = s.layout.pages[0];
  if (!page) return;
  enterHeaderFooter(s, page, where);
  s.insertAtom({ kind: 'field', field: 'page', instr: 'PAGE', result: '1' }, {});
};

const TOC_LEVELS = 3;

export const buildToc = (s: EditorStore, afterId?: string): void => {
  let doc = s.doc;
  const old = [...walkAll(doc.blocks)].filter((p) => p.tocEntry);
  const anchor = afterId ?? (old.length ? flatten(doc.blocks).paras[(flatten(doc.blocks).index.get(old[0]!.id) ?? 1) - 1]?.id : s.sel.focus.para);
  for (const p of old) doc = removeBlock(doc, 'body', p.id);
  const headings = doc.blocks.flatMap((b) => {
    if (b.type !== 'p') return [];
    const h = headingLevel(doc, b);
    return h && h <= TOC_LEVELS && !b.tocEntry ? [{ p: b, level: h }] : [];
  });
  const width = doc.section.pageWidth - doc.section.marginLeft - doc.section.marginRight;
  const named = new Map<string, string>();
  for (const { p } of headings) {
    const existing = p.bookmarks?.find((m) => m.name.startsWith('_Toc'));
    const name = existing?.name ?? `_Toc${newId()}`;
    named.set(p.id, name);
    if (!existing) doc = updatePara(doc, 'body', p.id, (q) => ({ ...q, bookmarks: [...(q.bookmarks ?? []), { name, start: 0, end: q.runs.reduce((n, r) => n + r.text.length, 0) }] }));
  }
  const pageOf = (id: string) => s.layout.pages[s.layout.lineIndex.get(id)?.[0]?.page ?? 0]?.number ?? '1';
  const entries = headings.map(({ p, level }) => {
    const text = headingOf(p);
    const q = para([
      { text, props: {}, link: { anchor: named.get(p.id) } },
      { text: '\t', props: {}, link: { anchor: named.get(p.id) } },
      { text: ATOM_CHAR, props: {}, atom: { kind: 'field', field: 'ref', instr: `PAGEREF ${named.get(p.id)} \\h`, result: pageOf(p.id) }, link: { anchor: named.get(p.id) } },
    ], { style: `TOC${level}`, tabs: [{ pos: width, kind: 'right', leader: 'dot' }] });
    q.tocEntry = true;
    return q;
  });
  if (!entries.length) { s.notify('Add headings first, then build the contents.'); return; }
  if (anchor) doc = insertBlocksAfter(doc, 'body', anchor, entries);
  s.commit(doc);
  // Page numbers change once the contents take up space, so fill them from the new layout.
  let d2 = s.doc;
  for (const e of entries) {
    const target = e.runs[2]!.atom;
    if (target?.kind !== 'field') continue;
    const name = /PAGEREF (\S+)/.exec(target.instr)?.[1];
    const head = headings.find((h) => named.get(h.p.id) === name);
    if (!head) continue;
    const num = pageOf(head.p.id);
    d2 = updatePara(d2, 'body', e.id, (q) => ({ ...q, runs: q.runs.map((r) => (r.atom?.kind === 'field' ? { ...r, atom: { ...r.atom, result: num } } : r)) }));
  }
  s.commit(d2);
};

const refreshFields = (s: EditorStore): void => {
  const now = new Date();
  const update = (b: typeof s.doc.blocks) => b.map((x) => (x.type === 'p' ? { ...x, runs: x.runs.map((r) => {
    const a = r.atom;
    if (a?.kind !== 'field' || a.locked) return r;
    if (a.field === 'date') return { ...r, atom: { ...a, result: now.toLocaleDateString() } };
    if (a.field === 'time') return { ...r, atom: { ...a, result: now.toLocaleTimeString() } };
    if (a.field === 'title') return { ...r, atom: { ...a, result: s.doc.properties.title ?? s.file.name } };
    if (a.field === 'author') return { ...r, atom: { ...a, result: s.doc.properties.creator ?? s.author } };
    return r;
  }) } : x));
  s.commit({ ...s.doc, blocks: update(s.doc.blocks) });
  if ([...walkAll(s.doc.blocks)].some((p) => p.tocEntry)) buildToc(s);
  void import('./references').then((m) => m.refreshGenerated(s));
};

export const seqCaption = (s: EditorStore, label: string, text: string): void => {
  const n = 1 + [...walkAll(s.doc.blocks)].flatMap((p) => p.runs).filter((r) => r.atom?.kind === 'field' && r.atom.field === 'seq' && r.atom.instr.includes(`SEQ ${label}`)).length;
  const cap = para([{ text: `${label} `, props: {} }, { text: ATOM_CHAR, props: {}, atom: { kind: 'field', field: 'seq', instr: `SEQ ${label} \\* ARABIC`, result: String(n) } }, { text: text ? `: ${text}` : '', props: {} }], { style: 'Caption' });
  s.commit(insertBlocksAfter(s.doc, s.sel.focus.story, s.sel.focus.para, [cap]));
};

export const registerInsertCommands = (): void => {
  register(
    { id: 'ins.footnote', label: 'Footnote', group: 'References', keys: 'mod+alt+f', run: (s) => insertNote(s, 'footnote') },
    { id: 'ins.endnote', label: 'Endnote', group: 'References', keys: 'mod+alt+d', run: (s) => insertNote(s, 'endnote') },
    { id: 'ins.toc', label: 'Table of contents', group: 'References', run: (s) => buildToc(s) },
    { id: 'ins.refresh', label: 'Refresh fields and contents', group: 'References', keys: 'f9', run: refreshFields },
    { id: 'ins.caption', label: 'Caption', group: 'References', run: (s) => s.openDialog('caption') },
    { id: 'ins.link', label: 'Link', group: 'Insert', keys: 'mod+k', run: (s) => s.openDialog('link') },
    { id: 'ins.unlink', label: 'Remove link', group: 'Insert', run: (s) => s.commit(mapRunsInSelection(s.doc, s.sel, ({ link: _l, ...r }) => r)) },
    { id: 'ins.bookmark', label: 'Bookmark', group: 'Insert', keys: 'mod+shift+f5', run: (s) => s.openDialog('bookmark') },
    { id: 'ins.symbol', label: 'Symbol', group: 'Insert', run: (s) => s.openDialog('symbol') },
    { id: 'ins.equation', label: 'Equation', group: 'Insert', run: (s) => s.openDialog('equation') },
    { id: 'ins.date', label: 'Date', group: 'Insert', keys: 'alt+shift+d', run: (s) => field(s, 'date', 'DATE', new Date().toLocaleDateString()) },
    { id: 'ins.time', label: 'Time', group: 'Insert', keys: 'alt+shift+t', run: (s) => field(s, 'time', 'TIME', new Date().toLocaleTimeString()) },
    { id: 'ins.pageNum', label: 'Page number at the bottom', group: 'Insert', run: (s) => pageField(s, 'footer') },
    { id: 'ins.pageNumTop', label: 'Page number at the top', group: 'Insert', run: (s) => pageField(s, 'header') },
    { id: 'ins.header', label: 'Edit header', group: 'Insert', run: (s) => { const p = s.layout.pages[0]; if (p) enterHeaderFooter(s, p, 'header'); } },
    { id: 'ins.footer', label: 'Edit footer', group: 'Insert', run: (s) => { const p = s.layout.pages[0]; if (p) enterHeaderFooter(s, p, 'footer'); } },
    { id: 'ins.checkbox', label: 'Checkbox', group: 'Insert', run: (s) => s.insertAtom({ kind: 'checkbox', checked: false }) },
    { id: 'ins.rect', label: 'Rectangle', group: 'Insert', run: (s) => insertShape(s, 'rect') },
    { id: 'ins.round', label: 'Rounded rectangle', group: 'Insert', run: (s) => insertShape(s, 'roundRect') },
    { id: 'ins.ellipse', label: 'Ellipse', group: 'Insert', run: (s) => insertShape(s, 'ellipse') },
    { id: 'ins.comment', label: 'Comment', group: 'Review', keys: 'mod+alt+m', run: (s) => s.openDialog('comment') },
    { id: 'ins.nextPage', label: 'Section break, next page', group: 'Page', run: (s) => insertSectionBreak(s, 'nextPage') },
    { id: 'ins.continuous', label: 'Section break, same page', group: 'Page', run: (s) => insertSectionBreak(s, 'continuous') },
    { id: 'ins.cover', label: 'Cover page', group: 'Insert', run: (s) => s.openDialog('cover') },
  );
  void createTable; void insertContent; void orderedSel; void propsAt;
};

export const insertTextBox = (s: EditorStore): void => {
  const id = newId();
  const blocks = [para([], { spaceAfter: 0 })];
  const atom: ShapeAtom = { kind: 'shape', shape: 'rect', width: 216, height: 108, fill: '#ffffff', stroke: '#2347ff', strokeWidth: 0.75, textId: id, wrap: 'square', float: { relH: 'column', relV: 'paragraph', x: 0, y: 0, distL: 9, distR: 9, distT: 4, distB: 4 } };
  s.doc = { ...s.doc, boxes: { ...s.doc.boxes, [id]: blocks } };
  s.insertAtom(atom, {});
  s.setSel({ anchor: { story: `box:${id}`, para: blocks[0]!.id, offset: 0 }, focus: { story: `box:${id}`, para: blocks[0]!.id, offset: 0 } });
};

export const SHAPES: [string, string][] = SHAPE_GROUPS.flatMap(([, l]) => l);

export const addTextToShape = (s: EditorStore): void => {
  const atom = selectedDrawing(s);
  if (atom?.kind !== 'shape') return;
  const id = atom.textId ?? newId();
  const blocks = s.doc.boxes?.[id] ?? [para([], { spaceAfter: 0, align: 'center' })];
  if (!atom.textId) {
    s.doc = { ...s.doc, boxes: { ...s.doc.boxes, [id]: blocks } };
    s.commit(mapRunsInSelection(s.doc, s.sel, (r) => (r.atom?.kind === 'shape' ? { ...r, atom: { ...r.atom, textId: id } } : r)));
  }
  const first = flatten(blocks).paras[0]!;
  s.setSel({ anchor: { story: `box:${id}`, para: first.id, offset: 0 }, focus: { story: `box:${id}`, para: first.id, offset: 0 } });
};

export const registerShapes = (): void => {
  register(
    { id: 'ins.textbox', label: 'Text box', group: 'Insert', run: insertTextBox },
    ...SHAPES.map(([id, label]) => ({ id: `ins.shape.${id}`, label: `Shape: ${label}`, group: 'Insert', run: (s: EditorStore) => insertShape(s, id) })),
    { id: 'obj.text', label: 'Add text to the shape', group: 'Insert', enabled: (s) => selectedDrawing(s)?.kind === 'shape', run: addTextToShape },
    { id: 'obj.shapeSettings', label: 'Shape color and outline', group: 'Insert', enabled: (s) => selectedDrawing(s)?.kind === 'shape', run: (s) => s.openDialog('shape') },
  );
};
