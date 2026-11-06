import { ATOM_CHAR, type Block, type Doc, type Id, type Paragraph, type Pos, type Run, type RunProps, type Selection, type StoryId, type Table } from './model';

export const storyBlocks = (doc: Doc, story: StoryId): Block[] => {
  if (story === 'body') return doc.blocks;
  const [kind, id] = story.split(':') as [string, string];
  if (kind === 'hdr') return doc.headers[id] ?? [];
  if (kind === 'ftr') return doc.footers[id] ?? [];
  if (kind === 'fn') return doc.footnotes[id]?.blocks ?? [];
  if (kind === 'en') return doc.endnotes[id]?.blocks ?? [];
  if (kind === 'cmt') return doc.comments[id]?.blocks ?? [];
  if (kind === 'box') return doc.boxes?.[id] ?? [];
  return [];
};

export const withStoryBlocks = (doc: Doc, story: StoryId, blocks: Block[]): Doc => {
  if (story === 'body') return { ...doc, blocks };
  const [kind, id] = story.split(':') as [string, string];
  if (kind === 'hdr') return { ...doc, headers: { ...doc.headers, [id]: blocks } };
  if (kind === 'ftr') return { ...doc, footers: { ...doc.footers, [id]: blocks } };
  if (kind === 'fn') return { ...doc, footnotes: { ...doc.footnotes, [id]: { ...doc.footnotes[id]!, blocks } } };
  if (kind === 'en') return { ...doc, endnotes: { ...doc.endnotes, [id]: { ...doc.endnotes[id]!, blocks } } };
  if (kind === 'cmt') return { ...doc, comments: { ...doc.comments, [id]: { ...doc.comments[id]!, blocks } } };
  if (kind === 'box') return { ...doc, boxes: { ...doc.boxes, [id]: blocks } };
  return doc;
};

// Paragraphs of a story in reading order, including those inside table cells.
export function* walkParagraphs(blocks: Block[]): Generator<Paragraph> {
  for (const b of blocks) {
    if (b.type === 'p') yield b;
    else if (b.type === 'tbl') for (const r of b.rows) for (const c of r.cells) yield* walkParagraphs(c.blocks);
  }
}

export interface FlatStory {
  paras: Paragraph[];
  index: Map<Id, number>;
}

const flatCache = new WeakMap<Block[], FlatStory>();

export const flatten = (blocks: Block[]): FlatStory => {
  let f = flatCache.get(blocks);
  if (!f) {
    const paras = [...walkParagraphs(blocks)];
    f = { paras, index: new Map(paras.map((p, i) => [p.id, i])) };
    flatCache.set(blocks, f);
  }
  return f;
};

export const findPara = (doc: Doc, pos: Pick<Pos, 'story' | 'para'>): Paragraph | undefined => {
  const f = flatten(storyBlocks(doc, pos.story));
  const i = f.index.get(pos.para);
  return i === undefined ? undefined : f.paras[i];
};

export const paraLength = (p: Paragraph): number => p.runs.reduce((n, r) => n + r.text.length, 0);

export const paraText = (p: Paragraph): string => p.runs.map((r) => (r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text)).join('');

export const rawParaText = (p: Paragraph): string => p.runs.map((r) => r.text).join('');

export const sameProps = (a: RunProps, b: RunProps): boolean => {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof RunProps)[];
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
};

const sameMeta = (a: Run, b: Run): boolean =>
  JSON.stringify([a.link, a.ins, a.del, a.comments]) === JSON.stringify([b.link, b.ins, b.del, b.comments]);

export const normalizeRuns = (runs: Run[]): Run[] => {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text.length) continue;
    const last = out[out.length - 1];
    if (last && !last.atom && !r.atom && sameProps(last.props, r.props) && sameMeta(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push(r);
  }
  return out;
};

// Splits runs so a boundary exists at `offset`; returns [before, after].
export const splitRuns = (runs: Run[], offset: number): [Run[], Run[]] => {
  const a: Run[] = [];
  const b: Run[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (end <= offset) a.push(r);
    else if (pos >= offset) b.push(r);
    else {
      a.push({ ...r, text: r.text.slice(0, offset - pos) });
      b.push({ ...r, text: r.text.slice(offset - pos) });
    }
    pos = end;
  }
  return [a, b];
};

export const sliceRuns = (runs: Run[], from: number, to: number): Run[] => splitRuns(splitRuns(runs, to)[0], from)[1];

export const runAt = (p: Paragraph, offset: number): Run | undefined => {
  let pos = 0;
  let last: Run | undefined;
  for (const r of p.runs) {
    const end = pos + r.text.length;
    if (offset > pos && offset <= end) return r;
    if (offset === pos && pos === 0) last = r;
    pos = end;
  }
  return last;
};

export const mapBlocks = (blocks: Block[], fn: (p: Paragraph) => Paragraph): Block[] => {
  let changed = false;
  const out = blocks.map((b) => {
    const n = mapBlock(b, fn);
    if (n !== b) changed = true;
    return n;
  });
  return changed ? out : blocks;
};

const mapBlock = (b: Block, fn: (p: Paragraph) => Paragraph): Block => {
  if (b.type === 'p') return fn(b);
  if (b.type === 'tbl') {
    let changed = false;
    const rows = b.rows.map((r) => {
      let rowChanged = false;
      const cells = r.cells.map((c) => {
        const blocks = mapBlocks(c.blocks, fn);
        if (blocks === c.blocks) return c;
        rowChanged = true;
        return { ...c, blocks };
      });
      if (!rowChanged) return r;
      changed = true;
      return { ...r, cells };
    });
    return changed ? ({ ...b, rows } as Table) : b;
  }
  return b;
};

export const updatePara = (doc: Doc, story: StoryId, id: Id, fn: (p: Paragraph) => Paragraph): Doc => {
  const blocks = storyBlocks(doc, story);
  return withStoryBlocks(doc, story, mapBlocks(blocks, (p) => (p.id === id ? fn(p) : p)));
};

export const updateParas = (doc: Doc, story: StoryId, ids: Set<Id>, fn: (p: Paragraph) => Paragraph): Doc => {
  const blocks = storyBlocks(doc, story);
  return withStoryBlocks(doc, story, mapBlocks(blocks, (p) => (ids.has(p.id) ? fn(p) : p)));
};

// Sibling list containing a paragraph, and the path of table cell ids above it.
export interface BlockHome {
  list: Block[];
  index: number;
  table?: Table;
  rowIndex?: number;
  cellIndex?: number;
}

export const locate = (blocks: Block[], id: Id): BlockHome | undefined => {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.id === id) return { list: blocks, index: i };
    if (b.type === 'tbl') {
      for (let r = 0; r < b.rows.length; r++) {
        const cells = b.rows[r]!.cells;
        for (let c = 0; c < cells.length; c++) {
          const found = locate(cells[c]!.blocks, id);
          if (found) return found.table ? found : { ...found, table: b, rowIndex: r, cellIndex: c };
        }
      }
    }
  }
  return undefined;
};

// Replaces the sibling list that contains `id`.
export const replaceHome = (blocks: Block[], id: Id, fn: (list: Block[], index: number) => Block[]): Block[] => {
  const i = blocks.findIndex((b) => b.id === id);
  if (i >= 0) return fn(blocks, i);
  let changed = false;
  const out = blocks.map((b) => {
    if (changed || b.type !== 'tbl') return b;
    const rows = b.rows.map((r) => {
      const cells = r.cells.map((c) => {
        if (changed) return c;
        const n = replaceHome(c.blocks, id, fn);
        if (n === c.blocks) return c;
        changed = true;
        return { ...c, blocks: n };
      });
      return changed ? { ...r, cells } : r;
    });
    return changed ? { ...b, rows } : b;
  });
  return changed ? out : blocks;
};

export const comparePos = (doc: Doc, a: Pos, b: Pos): number => {
  if (a.para === b.para) return a.offset - b.offset;
  const f = flatten(storyBlocks(doc, a.story));
  return (f.index.get(a.para) ?? 0) - (f.index.get(b.para) ?? 0);
};

export const orderedSel = (doc: Doc, s: Selection): [Pos, Pos] => (comparePos(doc, s.anchor, s.focus) <= 0 ? [s.anchor, s.focus] : [s.focus, s.anchor]);

export const isCollapsed = (s: Selection): boolean => s.anchor.para === s.focus.para && s.anchor.offset === s.focus.offset;

export const collapsed = (p: Pos): Selection => ({ anchor: p, focus: p });

export const selectedParas = (doc: Doc, s: Selection): Paragraph[] => {
  const [a, b] = orderedSel(doc, s);
  const f = flatten(storyBlocks(doc, a.story));
  return f.paras.slice(f.index.get(a.para) ?? 0, (f.index.get(b.para) ?? 0) + 1);
};

export const selectedText = (doc: Doc, s: Selection): string => {
  const [a, b] = orderedSel(doc, s);
  return selectedParas(doc, s)
    .map((p) => {
      const from = p.id === a.para ? a.offset : 0;
      const to = p.id === b.para ? b.offset : paraLength(p);
      return sliceRuns(p.runs, from, to)
        .filter((r) => !r.del)
        .map((r) => (r.atom ? (r.atom.kind === 'field' ? r.atom.result : '') : r.text.replaceAll(ATOM_CHAR, '')))
        .join('');
    })
    .join('\n');
};

export const docStart = (doc: Doc, story: StoryId = 'body'): Pos => ({ story, para: flatten(storyBlocks(doc, story)).paras[0]!.id, offset: 0 });

export const docEnd = (doc: Doc, story: StoryId = 'body'): Pos => {
  const ps = flatten(storyBlocks(doc, story)).paras;
  const p = ps[ps.length - 1]!;
  return { story, para: p.id, offset: paraLength(p) };
};
