import { ATOM_CHAR, newId, para, type Doc, type Paragraph, type Source } from '../core/model';
import { insertBlocksAfter, removeBlock } from '../core/ops';
import { headingLevel } from '../core/styles';
import { flatten, paraText, updatePara, walkParagraphs } from '../core/tree';
import { register } from '../editor/commands';
import type { EditorStore } from '../editor/store';
import { headingOf } from '../core/extra';
import { refreshFormulas } from './tableFormula';

const surname = (a: string): string => a.split(',')[0]!.trim();

export const citeText = (s: Source, style = 'APA', all: Source[] = []): string => {
  const names = s.authors.length > 2 ? `${surname(s.authors[0]!)} et al.` : s.authors.map(surname).join(style === 'MLA' ? ' and ' : ' & ');
  const who = names || s.title;
  switch (style) {
    case 'MLA': return `(${who})`;
    case 'Chicago': return `(${[who, s.year || 'n.d.'].join(' ')})`;
    case 'Harvard': return `(${[who, s.year || 'n.d.'].join(' ')})`;
    case 'IEEE': return `[${Math.max(1, all.findIndex((x) => x.tag === s.tag) + 1)}]`;
    default: return `(${[who, s.year || 'n.d.'].join(', ')})`;
  }
};

export const bibliographyEntry = (s: Source, style = 'APA', index = 0): string => {
  const who = s.authors.join('; ');
  const place = s.city && s.publisher ? `${s.city}: ${s.publisher}.` : s.publisher ? `${s.publisher}.` : '';
  const year = s.year ?? 'n.d.';
  const parts = (x: (string | undefined)[]) => x.filter(Boolean).join(' ');
  switch (style) {
    case 'MLA': return parts([who && `${who}.`, `${s.title}.`, s.journal && `${s.journal},`, s.publisher && `${s.publisher},`, `${year}.`, s.url]);
    case 'Chicago': return parts([who && `${who}.`, `${year}.`, `${s.title}.`, s.journal && `${s.journal}.`, place, s.url]);
    case 'Harvard': return parts([who, `(${year})`, `${s.title}.`, s.journal && `${s.journal}.`, place, s.url]);
    case 'IEEE': return parts([`[${index + 1}]`, who && `${who},`, `"${s.title},"`, s.journal && `${s.journal},`, s.publisher && `${s.publisher},`, `${year}.`, s.url]);
    default: return parts([who, `(${year}).`, `${s.title}.`, s.journal && `${s.journal}.`, place, s.url]);
  }
};

export const setCitationStyle = (s: EditorStore, style: string): void => {
  s.commit({ ...s.doc, settings: { ...s.doc.settings, citationStyle: style } });
  refreshGenerated(s);
};

export const saveSource = (s: EditorStore, v: Record<string, unknown>, tag?: string): void => {
  const authors = String(v['authors'] ?? '').split('\n').map((a) => a.trim()).filter(Boolean);
  const year = String(v['year'] ?? '');
  const next: Source = {
    tag: tag ?? `${(authors[0] ? surname(authors[0]) : 'Source').replace(/\W/g, '').slice(0, 8)}${year.slice(-2)}${newId().slice(-3)}`,
    type: String(v['type']), title: String(v['title']), authors, year: year || undefined,
    publisher: String(v['publisher'] ?? '') || undefined, journal: String(v['journal'] ?? '') || undefined, url: String(v['url'] ?? '') || undefined,
  };
  const list = s.doc.sources ?? [];
  s.commit({ ...s.doc, sources: tag ? list.map((x) => (x.tag === tag ? next : x)) : [...list, next] });
  refreshCitations(s);
};

export const insertCitation = (s: EditorStore, tag: string): void => {
  const src = s.doc.sources?.find((x) => x.tag === tag);
  if (src) s.insertAtom({ kind: 'field', field: 'other', instr: `CITATION ${tag} \\l 1033`, result: citeText(src, s.doc.settings.citationStyle, s.doc.sources) });
};

const mapFields = (doc: Doc, fn: (instr: string, result: string) => string): Doc => {
  let d = doc;
  for (const p of walkParagraphs(doc.blocks)) {
    if (!p.runs.some((r) => r.atom?.kind === 'field')) continue;
    d = updatePara(d, 'body', p.id, (q) => ({
      ...q,
      runs: q.runs.map((r) => {
        if (r.atom?.kind !== 'field') return r;
        const result = fn(r.atom.instr, r.atom.result);
        return result === r.atom.result ? r : { ...r, atom: { ...r.atom, result } };
      }),
    }));
  }
  return d;
};

const refreshCitations = (s: EditorStore): void => {
  const list = s.doc.sources ?? [];
  s.commit(mapFields(s.doc, (i, res) => {
    const tag = /^CITATION\s+(\S+)/.exec(i)?.[1];
    const src = tag ? list.find((x) => x.tag === tag) : undefined;
    return src ? citeText(src, s.doc.settings.citationStyle, list) : res;
  }));
};

const after = (s: EditorStore, kind: NonNullable<Paragraph['generated']>): { doc: Doc; anchor: string } => {
  let doc = s.doc;
  const old = [...walkParagraphs(doc.blocks)].filter((p) => p.generated === kind);
  const f = flatten(doc.blocks);
  const anchor = old.length ? f.paras[(f.index.get(old[0]!.id) ?? 1) - 1]?.id ?? f.paras[0]!.id : s.sel.focus.para;
  for (const p of old) doc = removeBlock(doc, 'body', p.id);
  return { doc, anchor };
};

const mark = (p: Paragraph, kind: NonNullable<Paragraph['generated']>): Paragraph => ({ ...p, generated: kind });

export const buildBibliography = (s: EditorStore): void => {
  const { doc, anchor } = after(s, 'bibliography');
  const list = [...(doc.sources ?? [])].sort((a, b) => (a.authors[0] ?? a.title).localeCompare(b.authors[0] ?? b.title));
  if (!list.length) { s.notify('Add a source first.'); return; }
  const blocks = [mark(para([{ text: 'References', props: {} }], { style: 'Heading1' }), 'bibliography'), ...list.map((c, i) => mark(para([{ text: bibliographyEntry(c, doc.settings.citationStyle, i) , props: {} }], { indentLeft: 36, firstLine: -36 }), 'bibliography'))];
  s.commit(insertBlocksAfter(doc, 'body', anchor, blocks));
};

const pageOf = (s: EditorStore, id: string): string => s.layout.pages[s.layout.lineIndex.get(id)?.[0]?.page ?? 0]?.number ?? '1';

const width = (doc: Doc): number => doc.section.pageWidth - doc.section.marginLeft - doc.section.marginRight;

export const buildFigures = (s: EditorStore): void => {
  const { doc, anchor } = after(s, 'figures');
  const caps = [...walkParagraphs(doc.blocks)].filter((p) => p.props.style === 'Caption');
  if (!caps.length) { s.notify('Add a caption first.'); return; }
  const entry = (c: Paragraph) => mark(para([{ text: `${headingOf(c)}\t${pageOf(s, c.id)}`, props: {} }], { spaceAfter: 2, tabs: [{ pos: width(doc), kind: 'right', leader: 'dot' }] }), 'figures');
  s.commit(insertBlocksAfter(doc, 'body', anchor, caps.map(entry)));
};

export const markIndexEntry = (s: EditorStore, term: string): void => {
  const t = term.trim().replace(/"/g, '');
  if (t) s.insertAtom({ kind: 'field', field: 'other', instr: `XE "${t}"`, result: '' });
};

export const buildIndex = (s: EditorStore): void => {
  const { doc, anchor } = after(s, 'index');
  const terms = new Map<string, Set<string>>();
  for (const p of walkParagraphs(doc.blocks)) {
    for (const r of p.runs) {
      const m = r.atom?.kind === 'field' ? /^XE\s+"([^"]+)"/.exec(r.atom.instr) : null;
      if (!m) continue;
      let set = terms.get(m[1]!);
      if (!set) terms.set(m[1]!, (set = new Set()));
      set.add(pageOf(s, p.id));
    }
  }
  if (!terms.size) { s.notify('Mark an index entry first.'); return; }
  const list = [...terms].sort(([a], [b]) => a.localeCompare(b)).map(([t, pages]) => mark(para([{ text: `${t}, ${[...pages].join(', ')}`, props: {} }], { spaceAfter: 2 }), 'index'));
  s.commit(insertBlocksAfter(doc, 'body', anchor, list));
};

const AUTHORITY: Record<string, string> = { 1: 'Cases', 2: 'Statutes', 3: 'Other authorities', 4: 'Rules', 5: 'Treatises', 6: 'Regulations', 7: 'Constitutional provisions' };

export const markAuthority = (s: EditorStore, text: string, category: string): void => {
  const t = text.trim().replace(/"/g, '');
  if (t) s.insertAtom({ kind: 'field', field: 'other', instr: `TA \\l "${t}" \\c ${category}`, result: '' });
};

export const buildAuthorities = (s: EditorStore): void => {
  const { doc, anchor } = after(s, 'authorities');
  const groups = new Map<string, Map<string, Set<string>>>();
  for (const p of walkParagraphs(doc.blocks)) {
    for (const r of p.runs) {
      const m = r.atom?.kind === 'field' ? /^TA\s+\\l\s+"([^"]+)"(?:.*\\c\s+(\d))?/.exec(r.atom.instr) : null;
      if (!m) continue;
      const cat = AUTHORITY[m[2] ?? '3'] ?? 'Other authorities';
      if (!groups.has(cat)) groups.set(cat, new Map());
      const items = groups.get(cat)!;
      if (!items.has(m[1]!)) items.set(m[1]!, new Set());
      items.get(m[1]!)!.add(pageOf(s, p.id));
    }
  }
  if (!groups.size) { s.notify('Mark an authority first.'); return; }
  const blocks = [...groups].sort(([a], [b]) => a.localeCompare(b)).flatMap(([cat, items]) => [
    mark(para([{ text: cat, props: { bold: true } }], { spaceBefore: 8, keepNext: true }), 'authorities'),
    ...[...items].sort(([a], [b]) => a.localeCompare(b)).map(([t, pages]) => mark(para([{ text: `${t}\t${[...pages].join(', ')}`, props: {} }], { spaceAfter: 2, tabs: [{ pos: width(doc), kind: 'right', leader: 'dot' }] }), 'authorities')),
  ]);
  s.commit(insertBlocksAfter(doc, 'body', anchor, blocks));
};

export interface RefTarget {
  key: string;
  kind: string;
  label: string;
  para: string;
  bookmark?: string;
}

export const referenceTargets = (s: EditorStore): RefTarget[] => {
  const out: RefTarget[] = [];
  for (const p of walkParagraphs(s.doc.blocks)) {
    if (p.tocEntry || p.generated) continue;
    if (headingLevel(s.doc, p)) out.push({ key: p.id, kind: 'Heading', label: paraText(p) || 'Heading', para: p.id });
    else if (p.props.style === 'Caption') out.push({ key: p.id, kind: 'Caption', label: paraText(p), para: p.id });
    for (const b of p.bookmarks ?? []) if (!b.name.startsWith('_')) out.push({ key: `${p.id}:${b.name}`, kind: 'Bookmark', label: b.name, para: p.id, bookmark: b.name });
  }
  return out;
};

export const insertCrossRef = (s: EditorStore, t: RefTarget, as: 'text' | 'page'): void => {
  let name = t.bookmark;
  if (!name) {
    const p = flatten(s.doc.blocks).paras[flatten(s.doc.blocks).index.get(t.para) ?? 0]!;
    name = p.bookmarks?.find((b) => b.name.startsWith('_Ref'))?.name ?? `_Ref${newId()}`;
    const n = name;
    if (!p.bookmarks?.some((b) => b.name === n)) {
      s.commit(updatePara(s.doc, 'body', t.para, (q) => ({ ...q, bookmarks: [...(q.bookmarks ?? []), { name: n, start: 0, end: q.runs.reduce((c, r) => c + r.text.length, 0) }] })));
    }
  }
  const result = as === 'page' ? pageOf(s, t.para) : t.label;
  s.commit({ ...s.doc });
  const pos = s.sel;
  s.insertAtom({ kind: 'field', field: 'ref', instr: `${as === 'page' ? 'PAGEREF' : 'REF'} ${name} \\h`, result });
  void pos;
};

export const refreshGenerated = (s: EditorStore): void => {
  refreshCitations(s);
  const has = (k: Paragraph['generated']) => [...walkParagraphs(s.doc.blocks)].some((p) => p.generated === k);
  if (has('bibliography')) buildBibliography(s);
  if (has('figures')) buildFigures(s);
  if (has('index')) buildIndex(s);
  if (has('authorities')) buildAuthorities(s);
  s.commit(refreshFormulas(s.doc));
  s.commit(mapFields(s.doc, (i, res) => {
    const m = /^(PAGEREF|REF)\s+(\S+)/.exec(i);
    if (!m) return res;
    const p = [...walkParagraphs(s.doc.blocks)].find((q) => q.bookmarks?.some((b) => b.name === m[2]));
    if (!p) return res;
    return m[1] === 'PAGEREF' ? pageOf(s, p.id) : paraText(p);
  }));
};

export const registerReferences = (): void => {
  register(
    { id: 'ref.sources', label: 'Manage sources', group: 'References', run: (s) => s.openDialog('cite') },
    { id: 'ref.cite', label: 'Add a citation', group: 'References', run: (s) => s.openDialog('cite') },
    { id: 'ref.bibliography', label: 'Reference list', group: 'References', run: buildBibliography },
    { id: 'ref.figures', label: 'List of figures and tables', group: 'References', run: buildFigures },
    { id: 'ref.cross', label: 'Cross-reference', group: 'References', run: (s) => s.openDialog('cross') },
    { id: 'ref.mark', label: 'Mark index entry', group: 'References', keys: 'alt+shift+x', run: (s) => s.openDialog('indexMark') },
    { id: 'ref.index', label: 'Build index', group: 'References', run: buildIndex },
    { id: 'ref.markAuth', label: 'Mark an authority', group: 'References', run: (s) => s.openDialog('authority') },
    { id: 'ref.authorities', label: 'Table of authorities', group: 'References', run: buildAuthorities },
    { id: 'ref.style', label: 'Citation style', group: 'References', run: (s) => s.openDialog('citeStyle') },
  );
  void ATOM_CHAR;
};
