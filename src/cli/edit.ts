import type { Block, Doc, Paragraph, ParaProps, Run, RunProps, Table } from '../core/model';
import { newId, para, textRun } from '../core/model';
import { createTable } from '../core/ops';
import { effectivePara, headingLevel } from '../core/styles';
import { normalizeRuns, paraText } from '../core/tree';
import { readMarkdown } from '../formats/markdown';
import { countWords, toText } from '../formats/plain';

// Edits a document without the editor: blocks are addressed by their position in the main text, starting at 0.

export class EditError extends Error {}

const now = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export const blockAt = (doc: Doc, index: number): Block => {
  const b = doc.blocks[index];
  if (!b) throw new EditError(`There is no block ${index}. The document has ${doc.blocks.length} blocks (0 to ${doc.blocks.length - 1}).`);
  return b;
};

export const paraAt = (doc: Doc, index: number): Paragraph => {
  const b = blockAt(doc, index);
  if (b.type !== 'p') throw new EditError(`Block ${index} is a ${b.type === 'tbl' ? 'table' : 'section break'}, not a paragraph.`);
  return b;
};

const styleId = (doc: Doc, style: string | undefined): string | undefined => {
  if (!style) return undefined;
  const all = Object.values(doc.styles.styles);
  const hit = all.find((s) => s.id === style) ?? all.find((s) => s.name.toLowerCase() === style.toLowerCase()) ?? all.find((s) => s.id.toLowerCase() === style.replace(/\s+/g, '').toLowerCase());
  if (!hit) throw new EditError(`There is no style "${style}". Use list_styles to see the styles in this document.`);
  return hit.id;
};

const blockKind = (doc: Doc, b: Block): string => {
  if (b.type === 'tbl') return `table ${b.rows.length}×${b.rows[0]?.cells.length ?? 0}`;
  if (b.type !== 'p') return b.type;
  const h = headingLevel(doc, b);
  if (h) return `heading ${h}`;
  if (effectivePara(doc, b.props).numbering) return 'list item';
  return 'paragraph';
};

const visibleText = (b: Block): string =>
  b.type === 'p' ? b.runs.filter((r) => !r.del).map((r) => (r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text)).join('') : b.type === 'tbl' ? b.rows.map((r) => r.cells.map((c) => c.blocks.map(visibleText).join(' ')).join(' | ')).join(' / ') : '';

export interface OutlineItem { index: number; kind: string; style?: string; text: string }

export const outline = (doc: Doc, max = 120): OutlineItem[] =>
  doc.blocks.map((b, index) => {
    const t = visibleText(b).replace(/￼/g, '').trim();
    return { index, kind: blockKind(doc, b), style: b.type === 'p' ? b.props.style : undefined, text: t.length > max ? `${t.slice(0, max)}…` : t };
  });

export const readBlocks = (doc: Doc, from = 0, to = doc.blocks.length - 1): string =>
  doc.blocks.slice(from, to + 1).map((b, i) => `[${from + i}] (${blockKind(doc, b)}) ${visibleText(b).replace(/￼/g, '')}`).join('\n');

export const info = (doc: Doc) => {
  const text = toText(doc);
  const runs = (blocks: Block[]): Run[] => blocks.flatMap((b) => (b.type === 'p' ? b.runs : b.type === 'tbl' ? b.rows.flatMap((r) => r.cells.flatMap((c) => runs(c.blocks))) : []));
  const all = runs(doc.blocks);
  const fonts = new Set<string>();
  for (const r of all) if (r.props.font) fonts.add(r.props.font);
  for (const s of Object.values(doc.styles.styles)) if (s.run?.font) fonts.add(s.run.font);
  return {
    words: countWords(text),
    characters: text.replace(/\n/g, '').length,
    paragraphs: doc.blocks.filter((b) => b.type === 'p' && visibleText(b).trim()).length,
    tables: doc.blocks.filter((b) => b.type === 'tbl').length,
    headings: doc.blocks.filter((b) => b.type === 'p' && headingLevel(doc, b)).length,
    pictures: Object.keys(doc.media).filter((k) => doc.media[k]!.mime.startsWith('image/')).length,
    comments: Object.keys(doc.comments).length,
    trackedChanges: new Set(all.flatMap((r) => [r.ins?.id, r.del?.id]).filter(Boolean)).size,
    footnotes: Object.keys(doc.footnotes).length,
    title: doc.properties.title,
    author: doc.properties.creator,
    fonts: [...fonts].sort(),
  };
};

// Markdown is turned into real headings, lists, tables and formatting.
export const blocksFromMarkdown = (target: Doc, markdown: string): Block[] => {
  const src = readMarkdown(markdown);
  const map = new Map<string, string>();
  for (const [id, inst] of Object.entries(src.numbering.instances)) {
    const absId = `md${newId()}`;
    const abs = src.numbering.abstracts[inst.abstractId];
    if (abs) target.numbering.abstracts[absId] = { ...abs, id: absId };
    const numId = String(1000 + Object.keys(target.numbering.instances).length + map.size);
    target.numbering.instances[numId] = { ...inst, id: numId, abstractId: absId };
    map.set(id, numId);
  }
  const fix = (b: Block): Block => {
    if (b.type === 'p') return b.props.numbering ? { ...b, id: newId(), props: { ...b.props, numbering: { ...b.props.numbering, numId: map.get(b.props.numbering.numId) ?? b.props.numbering.numId } } } : { ...b, id: newId() };
    if (b.type === 'tbl') return { ...b, id: newId(), rows: b.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, blocks: c.blocks.map(fix) })) })) };
    return b;
  };
  for (const [k, v] of Object.entries(src.media)) target.media[k] = v;
  return src.blocks.filter((b) => !(b.type === 'p' && !b.runs.length && !b.section)).map(fix);
};

export interface NewParagraph { text: string; style?: string; bold?: boolean; italic?: boolean; align?: ParaProps['align'] }

const insertAt = (doc: Doc, after: number | undefined, blocks: Block[]): number => {
  const at = after === undefined ? lastBodyIndex(doc) + 1 : after < 0 ? 0 : after + 1;
  if (at > doc.blocks.length) throw new EditError(`Can't insert after block ${after}; the document has ${doc.blocks.length} blocks.`);
  doc.blocks.splice(at, 0, ...blocks);
  return at;
};

// New text goes before a trailing empty paragraph that only carries the final section.
const lastBodyIndex = (doc: Doc): number => {
  let i = doc.blocks.length - 1;
  while (i >= 0) {
    const b = doc.blocks[i]!;
    if (!(b.type === 'p' && !paraText(b).trim() && !b.runs.some((r) => r.atom))) break;
    i--;
  }
  return i;
};

export const insertParagraphs = (doc: Doc, items: NewParagraph[], after?: number): number =>
  insertAt(doc, after, items.map((p) => para(p.text.split('\n').flatMap((line, i) => (i ? [textRun('\n'), textRun(line, { bold: p.bold, italic: p.italic })] : [textRun(line, { bold: p.bold, italic: p.italic })])).filter((r) => r.text), { style: styleId(doc, p.style), align: p.align })));

export const insertMarkdown = (doc: Doc, markdown: string, after?: number): { at: number; count: number } => {
  const blocks = blocksFromMarkdown(doc, markdown);
  return { at: insertAt(doc, after, blocks), count: blocks.length };
};

export const insertTable = (doc: Doc, rows: string[][], after?: number, header = true): number => {
  if (!rows.length || !rows[0]!.length) throw new EditError('A table needs at least one row and one column.');
  const cols = Math.max(...rows.map((r) => r.length));
  const width = doc.section.pageWidth - doc.section.marginLeft - doc.section.marginRight;
  const t: Table = createTable(rows.length, cols, width);
  rows.forEach((r, i) => r.forEach((text, j) => {
    const cell = t.rows[i]!.cells[j]!;
    cell.blocks = [para([textRun(text, header && i === 0 ? { bold: true } : {})])];
  }));
  if (header) t.rows[0]!.props = { ...t.rows[0]!.props, header: true };
  return insertAt(doc, after, [t]);
};

export const deleteBlocks = (doc: Doc, from: number, to = from): number => {
  blockAt(doc, from); blockAt(doc, to);
  if (to < from) throw new EditError('The end block comes before the start block.');
  const removed = doc.blocks.splice(from, to - from + 1);
  if (!doc.blocks.length) doc.blocks.push(para());
  // Keep a section that ended in a removed paragraph.
  const lost = removed.filter((b) => b.type === 'p' && b.section).pop();
  if (lost?.type === 'p' && lost.section) { const prev = doc.blocks[Math.max(0, from - 1)]; if (prev?.type === 'p' && !prev.section) prev.section = lost.section; }
  return removed.length;
};

export const updateParagraph = (doc: Doc, index: number, patch: { text?: string; style?: string; align?: ParaProps['align'] }): void => {
  const p = paraAt(doc, index);
  if (patch.text !== undefined) {
    const first = p.runs.find((r) => !r.atom)?.props ?? {};
    p.runs = [textRun(patch.text, first)];
  }
  if (patch.style !== undefined) p.props = { ...p.props, style: styleId(doc, patch.style) };
  if (patch.align !== undefined) p.props = { ...p.props, align: patch.align };
};

// Finds text in paragraphs, also inside tables.
export interface Match { index: number; inTable: boolean; text: string; context: string }

const eachPara = (blocks: Block[], fn: (p: Paragraph, top: number, inTable: boolean) => void, top?: number): void => {
  blocks.forEach((b, i) => {
    const at = top ?? i;
    if (b.type === 'p') fn(b, at, top !== undefined);
    else if (b.type === 'tbl') for (const r of b.rows) for (const c of r.cells) eachPara(c.blocks, fn, at);
  });
};

const flags = (matchCase?: boolean) => (matchCase ? 'g' : 'gi');
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const find = (doc: Doc, text: string, matchCase = false): Match[] => {
  if (!text) throw new EditError('Give some text to find.');
  const out: Match[] = [];
  eachPara(doc.blocks, (p, index, inTable) => {
    const t = visibleText(p);
    for (const m of t.matchAll(new RegExp(escRe(text), flags(matchCase)))) out.push({ index, inTable, text: m[0], context: t.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 40) });
  });
  return out;
};

// Replaces text run by run so the surrounding formatting is kept; tracked replacements keep the old text as a deletion.
const replaceInPara = (p: Paragraph, re: RegExp, replacement: string, track?: { author: string }, limit = Infinity): number => {
  const raw = p.runs.map((r) => (r.del || r.atom ? '\u0000'.repeat(r.text.length) : r.text)).join('');
  const hits = [...raw.matchAll(re)].slice(0, limit);
  if (!hits.length) return 0;
  let runs = p.runs;
  for (const h of hits.reverse()) {
    const from = h.index!; const to = from + h[0].length;
    const out: Run[] = [];
    let at = 0; let placed = false;
    for (const r of runs) {
      const s = at; const e = at + r.text.length; at = e;
      if (e <= from || s >= to || r.del) { out.push(r); continue; }
      const before = r.text.slice(0, Math.max(0, from - s));
      const mid = r.text.slice(Math.max(0, from - s), Math.min(r.text.length, to - s));
      const after = r.text.slice(Math.min(r.text.length, to - s));
      if (before) out.push({ ...r, text: before });
      if (track) out.push({ ...r, text: mid, del: { id: newId(), author: track.author, date: now() } });
      if (!placed && s <= from) {
        if (replacement) out.push({ ...r, text: replacement, ...(track ? { ins: { id: newId(), author: track.author, date: now() } } : {}) });
        placed = true;
      }
      if (after) out.push({ ...r, text: after });
    }
    runs = out;
  }
  p.runs = normalizeRuns(runs);
  return hits.length;
};

export const replace = (doc: Doc, findText: string, replacement: string, opts: { all?: boolean; matchCase?: boolean; index?: number; trackAuthor?: string } = {}): number => {
  if (!findText) throw new EditError('Give some text to find.');
  let count = 0;
  const re = new RegExp(escRe(findText), flags(opts.matchCase));
  const track = opts.trackAuthor ? { author: opts.trackAuthor } : undefined;
  eachPara(doc.blocks, (p, index) => {
    if (opts.index !== undefined && index !== opts.index) return;
    if (!opts.all && count) return;
    count += replaceInPara(p, re, replacement, track, opts.all ? Infinity : 1);
  });
  return count;
};

export const formatText = (doc: Doc, index: number, patch: RunProps, findText?: string, matchCase = false): number => {
  let changed = 0;
  const apply = (p: Paragraph) => {
    if (!findText) { p.runs = p.runs.map((r) => (r.atom ? r : { ...r, props: { ...r.props, ...patch } })); changed++; return; }
    const raw = p.runs.map((r) => r.text).join('');
    const hits = [...raw.matchAll(new RegExp(escRe(findText), flags(matchCase)))];
    for (const h of hits) {
      const from = h.index!; const to = from + h[0].length;
      const out: Run[] = []; let at = 0;
      for (const r of p.runs) {
        const s = at; const e = at + r.text.length; at = e;
        if (e <= from || s >= to || r.atom) { out.push(r); continue; }
        const a = Math.max(0, from - s); const b = Math.min(r.text.length, to - s);
        if (a) out.push({ ...r, text: r.text.slice(0, a) });
        out.push({ ...r, text: r.text.slice(a, b), props: { ...r.props, ...patch } });
        if (b < r.text.length) out.push({ ...r, text: r.text.slice(b) });
      }
      p.runs = out;
      changed++;
    }
    p.runs = normalizeRuns(p.runs);
  };
  const b = blockAt(doc, index);
  if (b.type === 'p') apply(b); else eachPara([b], (p) => apply(p), index);
  return changed;
};

export const addComment = (doc: Doc, index: number, text: string, author: string, findText?: string): string => {
  const p = paraAt(doc, index);
  const id = String(Math.max(0, ...Object.keys(doc.comments).map(Number).filter(Number.isFinite)) + 1);
  doc.comments[id] = { id, author, initials: author.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(), date: now(), blocks: [para([textRun(text)])] };
  if (findText) {
    const raw = p.runs.map((r) => r.text).join('');
    const at = raw.toLowerCase().indexOf(findText.toLowerCase());
    if (at < 0) throw new EditError(`"${findText}" isn't in block ${index}.`);
    const end = at + findText.length;
    let pos = 0;
    p.runs = p.runs.flatMap((r) => {
      const s = pos; const e = pos + r.text.length; pos = e;
      if (e <= at || s >= end || r.atom) return [r];
      const a = Math.max(0, at - s); const z = Math.min(r.text.length, end - s);
      return [r.text.slice(0, a) && { ...r, text: r.text.slice(0, a) }, { ...r, text: r.text.slice(a, z), comments: [...(r.comments ?? []), id] }, r.text.slice(z) && { ...r, text: r.text.slice(z) }].filter((x): x is Run => !!x);
    });
  } else p.runs = p.runs.map((r) => ({ ...r, comments: [...(r.comments ?? []), id] }));
  return id;
};

export const listComments = (doc: Doc) => Object.values(doc.comments).map((c) => {
  let on = '';
  eachPara(doc.blocks, (p) => { const t = p.runs.filter((r) => r.comments?.includes(c.id)).map((r) => r.text).join(''); if (t) on += t; });
  return { id: c.id, author: c.author, date: c.date, text: c.blocks.map(visibleText).join('\n'), on, replyTo: c.parent, resolved: !!c.resolved };
});

export const listStyles = (doc: Doc) => Object.values(doc.styles.styles).filter((s) => s.kind === 'paragraph' || s.kind === 'character').map((s) => ({ id: s.id, name: s.name, kind: s.kind }));

// Accepts or rejects every tracked change in the main text.
export const resolveAll = (doc: Doc, accept: boolean): number => {
  let n = 0;
  const fixPara = (p: Paragraph) => {
    p.runs = p.runs.flatMap((r) => {
      if (r.ins) { n++; return accept ? [{ ...r, ins: undefined }] : []; }
      if (r.del) { n++; return accept ? [] : [{ ...r, del: undefined }]; }
      if (r.fmtRev) { n++; return [accept ? { ...r, fmtRev: undefined } : { ...r, props: r.fmtRev.old, fmtRev: undefined }]; }
      return [r];
    });
  };
  eachPara(doc.blocks, fixPara);
  return n;
};

export const wordCount = (doc: Doc): number => countWords(toText(doc));
