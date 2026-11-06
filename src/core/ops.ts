import {
  ATOM_CHAR, newId, para,
  type Atom, type Block, type Doc, type Id, type Paragraph, type ParaProps, type Pos, type Revision, type Run, type RunProps, type Selection, type StoryId, type Table, type TableCell, type TableRow,
} from './model';
import {
  collapsed, findPara, flatten, isCollapsed, locate, normalizeRuns, orderedSel, paraLength, replaceHome, runAt, selectedParas, sliceRuns, splitRuns, storyBlocks, updatePara, updateParas, withStoryBlocks,
} from './tree';

export interface EditContext {
  track?: Revision; // when set, edits become tracked changes
}

export interface EditResult {
  doc: Doc;
  sel: Selection;
}

const shiftBookmarks = (p: Paragraph, at: number, delta: number): Paragraph['bookmarks'] =>
  p.bookmarks?.map((b) => ({ ...b, start: b.start >= at ? Math.max(at, b.start + delta) : b.start, end: b.end >= at ? Math.max(at, b.end + delta) : b.end }));

const withRuns = (p: Paragraph, runs: Run[]): Paragraph => ({ ...p, runs: normalizeRuns(runs) });

export const insertRuns = (doc: Doc, pos: Pos, runs: Run[]): Doc =>
  updatePara(doc, pos.story, pos.para, (p) => {
    const [a, b] = splitRuns(p.runs, pos.offset);
    const n = runs.reduce((s, r) => s + r.text.length, 0);
    return { ...withRuns(p, [...a, ...runs, ...b]), bookmarks: shiftBookmarks(p, pos.offset, n) };
  });

const removeInPara = (doc: Doc, story: StoryId, id: Id, from: number, to: number): Doc =>
  updatePara(doc, story, id, (p) => {
    const [a, rest] = splitRuns(p.runs, from);
    const b = splitRuns(rest, to - from)[1];
    return { ...withRuns(p, [...a, ...b]), bookmarks: shiftBookmarks(p, to, from - to) };
  });

// The formatting new text picks up at a caret.
export const propsAt = (doc: Doc, pos: Pos): RunProps => {
  const p = findPara(doc, pos);
  if (!p) return {};
  const r = runAt(p, pos.offset);
  if (!r) return p.markProps ?? {};
  return r.props;
};

const markDeleted = (doc: Doc, story: StoryId, id: Id, from: number, to: number, rev: Revision): Doc =>
  updatePara(doc, story, id, (p) => {
    const [a, rest] = splitRuns(p.runs, from);
    const [mid, b] = splitRuns(rest, to - from);
    const kept: Run[] = [];
    for (const r of mid) {
      if (r.ins?.author === rev.author) continue; // removing your own insertion really removes it
      kept.push(r.del ? r : { ...r, del: rev });
    }
    return withRuns(p, [...a, ...kept, ...b]);
  });

const mergeParas = (doc: Doc, story: StoryId, firstId: Id, secondId: Id): Doc => {
  const second = findPara(doc, { story, para: secondId })!;
  const blocks = replaceHome(storyBlocks(doc, story), secondId, (l, i) => [...l.slice(0, i), ...l.slice(i + 1)]);
  const next = withStoryBlocks(doc, story, blocks);
  return updatePara(next, story, firstId, (p) => {
    const off = paraLength(p);
    return {
      ...withRuns(p, [...p.runs, ...second.runs]),
      section: second.section ?? p.section,
      bookmarks: [...(p.bookmarks ?? []), ...(second.bookmarks ?? []).map((b) => ({ ...b, start: b.start + off, end: b.end + off }))],
    };
  });
};

export const deleteSelection = (doc: Doc, sel: Selection, ctx: EditContext = {}): EditResult => {
  if (isCollapsed(sel)) return { doc, sel };
  const [a, b] = orderedSel(doc, sel);
  const story = a.story;
  if (ctx.track) {
    let d = doc;
    for (const p of selectedParas(doc, sel)) {
      const from = p.id === a.para ? a.offset : 0;
      const to = p.id === b.para ? b.offset : paraLength(p);
      d = markDeleted(d, story, p.id, from, to, ctx.track);
      if (p.id !== b.para) d = updatePara(d, story, p.id, (q) => ({ ...q, markDel: ctx.track }));
    }
    return { doc: d, sel: collapsed(b.para === a.para ? { ...a, offset: Math.min(a.offset, paraLength(findPara(d, a)!)) } : a) };
  }
  if (a.para === b.para) return { doc: removeInPara(doc, story, a.para, a.offset, b.offset), sel: collapsed(a) };
  const paras = selectedParas(doc, sel);
  const homeA = locate(storyBlocks(doc, story), a.para);
  const homeB = locate(storyBlocks(doc, story), b.para);
  const sameCell = homeA?.table === homeB?.table && homeA?.rowIndex === homeB?.rowIndex && homeA?.cellIndex === homeB?.cellIndex;
  let d = doc;
  if (!sameCell) {
    // Crossing a table boundary: clear text, keep the table structure.
    for (const p of paras) {
      const from = p.id === a.para ? a.offset : 0;
      const to = p.id === b.para ? b.offset : paraLength(p);
      d = removeInPara(d, story, p.id, from, to);
    }
    return { doc: d, sel: collapsed(a) };
  }
  d = removeInPara(d, story, a.para, a.offset, paraLength(paras[0]!));
  d = removeInPara(d, story, b.para, 0, b.offset);
  const middle = new Set(paras.slice(1, -1).map((p) => p.id));
  const dropMiddle = (blocks: Block[]): Block[] =>
    blocks
      .filter((x) => !(x.type === 'p' && middle.has(x.id)))
      .filter((x) => !(x.type === 'tbl' && x.rows.every((r) => r.cells.every((c) => c.blocks.every((q) => q.type === 'p' && middle.has(q.id))))));
  d = withStoryBlocks(d, story, replaceHome(storyBlocks(d, story), a.para, (l) => dropMiddle(l)));
  d = mergeParas(d, story, a.para, b.para);
  return { doc: d, sel: collapsed(a) };
};

export const insertText = (doc: Doc, sel: Selection, text: string, props: RunProps | undefined, ctx: EditContext = {}): EditResult => {
  const removed = deleteSelection(doc, sel, ctx);
  const pos = removed.sel.focus;
  const useProps = props ?? propsAt(doc, orderedSel(doc, sel)[0]);
  const inherited = findPara(removed.doc, pos) ? runAt(findPara(removed.doc, pos)!, pos.offset) : undefined;
  const run: Run = { text, props: useProps };
  if (inherited?.link && pos.offset > 0) run.link = inherited.link;
  if (inherited?.comments) run.comments = inherited.comments;
  if (ctx.track) run.ins = ctx.track;
  return { doc: insertRuns(removed.doc, pos, [run]), sel: collapsed({ ...pos, offset: pos.offset + text.length }) };
};

export const insertAtom = (doc: Doc, sel: Selection, atom: Atom, props: RunProps = {}, ctx: EditContext = {}): EditResult => {
  const removed = deleteSelection(doc, sel, ctx);
  const pos = removed.sel.focus;
  const run: Run = { text: ATOM_CHAR, props, atom };
  if (ctx.track) run.ins = ctx.track;
  return { doc: insertRuns(removed.doc, pos, [run]), sel: collapsed({ ...pos, offset: pos.offset + 1 }) };
};

export const splitParagraph = (doc: Doc, sel: Selection, ctx: EditContext = {}): EditResult => {
  const removed = deleteSelection(doc, sel, ctx);
  const pos = removed.sel.focus;
  const p = findPara(removed.doc, pos)!;
  const [a, b] = splitRuns(p.runs, pos.offset);
  const atEnd = !b.length;
  const styleId = p.props.style;
  const nextStyle = atEnd && styleId ? removed.doc.styles.styles[styleId]?.next : undefined;
  const isEmptyListItem = !p.runs.length && p.props.numbering;
  if (isEmptyListItem) {
    const { numbering: _n, indentLeft: _i, firstLine: _f, ...rest } = p.props;
    return { doc: updatePara(removed.doc, pos.story, p.id, (q) => ({ ...q, props: rest })), sel: collapsed(pos) };
  }
  const second: Paragraph = {
    type: 'p',
    id: newId(),
    props: nextStyle ? { style: nextStyle } : p.props,
    runs: b,
    markProps: p.markProps ?? a[a.length - 1]?.props,
    section: p.section,
    bookmarks: p.bookmarks?.filter((m) => m.start >= pos.offset).map((m) => ({ ...m, start: m.start - pos.offset, end: m.end - pos.offset })),
  };
  const first: Paragraph = {
    ...p,
    runs: a,
    section: undefined,
    bookmarks: p.bookmarks?.filter((m) => m.start < pos.offset),
    ...(ctx.track ? { markIns: ctx.track } : {}),
  };
  const blocks = replaceHome(storyBlocks(removed.doc, pos.story), p.id, (l, i) => [...l.slice(0, i), first, second, ...l.slice(i + 1)]);
  return { doc: withStoryBlocks(removed.doc, pos.story, blocks), sel: collapsed({ story: pos.story, para: second.id, offset: 0 }) };
};

const graphemePrev = (text: string, offset: number): number => {
  if (offset <= 0) return 0;
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let last = 0;
  for (const s of seg.segment(text.slice(0, offset))) last = s.index;
  return last;
};

const graphemeNext = (text: string, offset: number): number => {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const s of seg.segment(text.slice(offset))) return offset + s.segment.length;
  return offset;
};

export const paraRaw = (p: Paragraph): string => p.runs.map((r) => r.text).join('');

export const wordBoundary = (text: string, offset: number, dir: -1 | 1): number => {
  const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
  const parts = [...seg.segment(text)];
  if (dir < 0) {
    let target = 0;
    for (const s of parts) {
      if (s.index >= offset) break;
      if (s.isWordLike) target = s.index;
      else if (s.index + s.segment.length >= offset && !/^\s+$/.test(s.segment)) target = s.index;
    }
    return target;
  }
  for (const s of parts) {
    const end = s.index + s.segment.length;
    if (end > offset && s.isWordLike) return end;
  }
  return text.length;
};

export const backspace = (doc: Doc, sel: Selection, ctx: EditContext = {}, byWord = false): EditResult => {
  if (!isCollapsed(sel)) return deleteSelection(doc, sel, ctx);
  const pos = sel.focus;
  const p = findPara(doc, pos)!;
  if (pos.offset === 0) {
    if (p.props.numbering) {
      const { numbering: _n, ...rest } = p.props;
      return { doc: updatePara(doc, pos.story, p.id, (q) => ({ ...q, props: { ...rest, numbering: { numId: '0', level: 0 } } })), sel };
    }
    const home = locate(storyBlocks(doc, pos.story), p.id)!;
    const prev = home.list[home.index - 1];
    if (!prev || prev.type !== 'p') return { doc, sel };
    if (ctx.track) return { doc: updatePara(doc, pos.story, prev.id, (q) => ({ ...q, markDel: ctx.track })), sel: collapsed({ ...pos, para: prev.id, offset: paraLength(prev) }) };
    return { doc: mergeParas(doc, pos.story, prev.id, p.id), sel: collapsed({ ...pos, para: prev.id, offset: paraLength(prev) }) };
  }
  const text = paraRaw(p);
  const from = byWord ? wordBoundary(text, pos.offset, -1) : graphemePrev(text, pos.offset);
  return deleteSelection(doc, { anchor: { ...pos, offset: from }, focus: pos }, ctx);
};

export const deleteForward = (doc: Doc, sel: Selection, ctx: EditContext = {}, byWord = false): EditResult => {
  if (!isCollapsed(sel)) return deleteSelection(doc, sel, ctx);
  const pos = sel.focus;
  const p = findPara(doc, pos)!;
  const len = paraLength(p);
  if (pos.offset >= len) {
    const home = locate(storyBlocks(doc, pos.story), p.id)!;
    const next = home.list[home.index + 1];
    if (!next || next.type !== 'p') return { doc, sel };
    if (ctx.track) return { doc: updatePara(doc, pos.story, p.id, (q) => ({ ...q, markDel: ctx.track })), sel };
    return { doc: mergeParas(doc, pos.story, p.id, next.id), sel };
  }
  const text = paraRaw(p);
  const to = byWord ? wordBoundary(text, pos.offset, 1) : graphemeNext(text, pos.offset);
  const res = deleteSelection(doc, { anchor: pos, focus: { ...pos, offset: to } }, ctx);
  return { doc: res.doc, sel: ctx.track ? collapsed({ ...pos, offset: to }) : res.sel };
};

export const mapRunsInSelection = (doc: Doc, sel: Selection, fn: (r: Run) => Run): Doc => {
  const [a, b] = orderedSel(doc, sel);
  let d = doc;
  for (const p of selectedParas(doc, sel)) {
    const from = p.id === a.para ? a.offset : 0;
    const to = p.id === b.para ? b.offset : paraLength(p);
    d = updatePara(d, a.story, p.id, (q) => {
      const [x, rest] = splitRuns(q.runs, from);
      const [mid, y] = splitRuns(rest, to - from);
      return withRuns(q, [...x, ...mid.map(fn), ...y]);
    });
  }
  return d;
};

export const setRunProps = (doc: Doc, sel: Selection, patch: RunProps): Doc =>
  mapRunsInSelection(doc, sel, (r) => ({ ...r, props: { ...r.props, ...patch } }));

export const clearRunProps = (doc: Doc, sel: Selection): Doc => mapRunsInSelection(doc, sel, (r) => ({ ...r, props: {} }));

export const setParaProps = (doc: Doc, sel: Selection, patch: ParaProps | ((p: ParaProps) => ParaProps)): Doc => {
  const story = sel.focus.story;
  const ids = new Set(selectedParas(doc, sel).map((p) => p.id));
  return updateParas(doc, story, ids, (p) => ({ ...p, props: typeof patch === 'function' ? patch(p.props) : { ...p.props, ...patch } }));
};

export const applyStyle = (doc: Doc, sel: Selection, styleId: string): Doc => {
  const style = doc.styles.styles[styleId];
  if (style?.kind === 'character') return setRunProps(doc, sel, { charStyle: styleId });
  return setParaProps(doc, sel, (p) => ({ ...p, style: styleId }));
};

export const insertBlocksAfter = (doc: Doc, story: StoryId, afterId: Id, blocks: Block[]): Doc =>
  withStoryBlocks(doc, story, replaceHome(storyBlocks(doc, story), afterId, (l, i) => [...l.slice(0, i + 1), ...blocks, ...l.slice(i + 1)]));

export const removeBlock = (doc: Doc, story: StoryId, id: Id): Doc =>
  withStoryBlocks(doc, story, replaceHome(storyBlocks(doc, story), id, (l, i) => [...l.slice(0, i), ...l.slice(i + 1)]));

export const replaceBlock = (doc: Doc, story: StoryId, id: Id, block: Block | Block[]): Doc =>
  withStoryBlocks(doc, story, replaceHome(storyBlocks(doc, story), id, (l, i) => [...l.slice(0, i), ...(Array.isArray(block) ? block : [block]), ...l.slice(i + 1)]));

// Pastes content blocks at the caret: a single paragraph merges inline, several split the target.
export const insertContent = (doc: Doc, sel: Selection, blocks: Block[], ctx: EditContext = {}): EditResult => {
  const removed = deleteSelection(doc, sel, ctx);
  if (!blocks.length) return removed;
  const first = blocks[0]!;
  if (blocks.length === 1 && first.type === 'p') {
    const runs = ctx.track ? first.runs.map((r) => ({ ...r, ins: ctx.track })) : first.runs;
    const n = runs.reduce((s, r) => s + r.text.length, 0);
    const pos = removed.sel.focus;
    return { doc: insertRuns(removed.doc, pos, runs), sel: collapsed({ ...pos, offset: pos.offset + n }) };
  }
  const split = splitParagraph(removed.doc, removed.sel, {});
  const tail = split.sel.focus;
  const head = flatten(storyBlocks(split.doc, tail.story));
  const headId = head.paras[(head.index.get(tail.para) ?? 1) - 1]!.id;
  const fresh = blocks.map((b) => (b.type === 'p' ? { ...b, id: newId() } : b));
  const d = insertBlocksAfter(split.doc, tail.story, headId, fresh);
  return { doc: d, sel: split.sel };
};

const emptyCell = (width?: number, props: ParaProps = {}): TableCell => ({ id: newId(), props: { width }, blocks: [para([], props)] });

export const createTable = (rows: number, cols: number, width: number, style = 'TableGrid'): Table => {
  const w = width / cols;
  return {
    type: 'tbl',
    id: newId(),
    props: { style, width: { value: 0, unit: 'auto' }, look: { firstRow: true, noVBand: true } },
    grid: Array.from({ length: cols }, () => w),
    rows: Array.from({ length: rows }, () => ({ id: newId(), props: {}, cells: Array.from({ length: cols }, () => emptyCell(w)) })),
  };
};

export const updateTable = (doc: Doc, story: StoryId, paraId: Id, fn: (t: Table, row: number, cell: number) => Table | Block[]): Doc => {
  const home = locate(storyBlocks(doc, story), paraId);
  if (!home?.table) return doc;
  return replaceBlock(doc, story, home.table.id, fn(home.table, home.rowIndex!, home.cellIndex!) as Block | Block[]);
};

const cellCol = (row: TableRow, index: number): number => {
  let col = 0;
  for (let i = 0; i < index; i++) col += row.cells[i]!.props.gridSpan ?? 1;
  return col;
};

const cellAtCol = (row: TableRow, col: number): number => {
  let c = 0;
  for (let i = 0; i < row.cells.length; i++) {
    c += row.cells[i]!.props.gridSpan ?? 1;
    if (col < c) return i;
  }
  return row.cells.length - 1;
};

export const tableOps = {
  insertRow(t: Table, row: number, below: boolean): Table {
    const src = t.rows[row]!;
    const fresh: TableRow = { id: newId(), props: { ...src.props, header: false }, cells: src.cells.map((c) => ({ ...emptyCell(c.props.width), props: { ...c.props, vMerge: undefined } })) };
    const at = row + (below ? 1 : 0);
    return { ...t, rows: [...t.rows.slice(0, at), fresh, ...t.rows.slice(at)] };
  },
  deleteRow(t: Table, row: number): Table | Block[] {
    if (t.rows.length === 1) return [];
    return { ...t, rows: t.rows.filter((_, i) => i !== row) };
  },
  insertColumn(t: Table, row: number, cell: number, right: boolean): Table {
    const col = cellCol(t.rows[row]!, cell) + (right ? (t.rows[row]!.cells[cell]!.props.gridSpan ?? 1) : 0);
    const w = t.grid[Math.min(col, t.grid.length - 1)] ?? 72;
    return {
      ...t,
      grid: [...t.grid.slice(0, col), w, ...t.grid.slice(col)],
      rows: t.rows.map((r) => {
        let at = r.cells.length;
        let c = 0;
        for (let i = 0; i < r.cells.length; i++) {
          if (c >= col) { at = i; break; }
          c += r.cells[i]!.props.gridSpan ?? 1;
        }
        return { ...r, cells: [...r.cells.slice(0, at), emptyCell(w), ...r.cells.slice(at)] };
      }),
    };
  },
  deleteColumn(t: Table, row: number, cell: number): Table | Block[] {
    if (t.grid.length === 1) return [];
    const col = cellCol(t.rows[row]!, cell);
    return {
      ...t,
      grid: t.grid.filter((_, i) => i !== col),
      rows: t.rows.map((r) => {
        const i = cellAtCol(r, col);
        const c = r.cells[i]!;
        if ((c.props.gridSpan ?? 1) > 1) return { ...r, cells: r.cells.map((x, j) => (j === i ? { ...x, props: { ...x.props, gridSpan: (x.props.gridSpan ?? 2) - 1 } } : x)) };
        return { ...r, cells: r.cells.filter((_, j) => j !== i) };
      }),
    };
  },
  mergeRight(t: Table, row: number, cell: number): Table {
    const r = t.rows[row]!;
    const a = r.cells[cell]!;
    const b = r.cells[cell + 1];
    if (!b) return t;
    const merged: TableCell = {
      ...a,
      props: { ...a.props, gridSpan: (a.props.gridSpan ?? 1) + (b.props.gridSpan ?? 1), width: (a.props.width ?? 0) + (b.props.width ?? 0) },
      blocks: [...a.blocks, ...b.blocks.filter((x) => !(x.type === 'p' && !x.runs.length))],
    };
    const cells = [...r.cells.slice(0, cell), merged, ...r.cells.slice(cell + 2)];
    return { ...t, rows: t.rows.map((x, i) => (i === row ? { ...x, cells } : x)) };
  },
  splitCell(t: Table, row: number, cell: number): Table {
    const r = t.rows[row]!;
    const c = r.cells[cell]!;
    const span = c.props.gridSpan ?? 1;
    if (span < 2) return t;
    const left = Math.ceil(span / 2);
    const cells = [...r.cells.slice(0, cell), { ...c, props: { ...c.props, gridSpan: left } }, { ...emptyCell(), props: { ...c.props, gridSpan: span - left } }, ...r.cells.slice(cell + 1)];
    return { ...t, rows: t.rows.map((x, i) => (i === row ? { ...x, cells } : x)) };
  },
  setCellProps(t: Table, row: number, cell: number, patch: Partial<TableCell['props']>): Table {
    return { ...t, rows: t.rows.map((r, i) => (i !== row ? r : { ...r, cells: r.cells.map((c, j) => (j === cell ? { ...c, props: { ...c.props, ...patch } } : c)) })) };
  },
  toText(t: Table, sep = '\t'): Block[] {
    return t.rows.map((r) => para([{ text: r.cells.map((c) => c.blocks.map((b) => (b.type === 'p' ? b.runs.map((x) => x.text).join('') : '')).join(' ')).join(sep), props: {} }]));
  },
};

export const textToTable = (paras: Paragraph[], width: number, sep = '\t'): Table => {
  const rows = paras.map((p) => p.runs.map((r) => r.text).join('').split(sep));
  const cols = Math.max(...rows.map((r) => r.length), 1);
  const t = createTable(rows.length, cols, width);
  return {
    ...t,
    rows: t.rows.map((r, i) => ({ ...r, cells: r.cells.map((c, j) => ({ ...c, blocks: [para(rows[i]![j] ? [{ text: rows[i]![j]!, props: {} }] : [])] })) })),
  };
};

export const sortTable = (t: Table, col: number, desc: boolean, hasHeader: boolean): Table => {
  const cellText = (r: TableRow): string => {
    const c = r.cells[col];
    return c ? c.blocks.map((b) => (b.type === 'p' ? b.runs.map((x) => x.text).join('') : '')).join(' ') : '';
  };
  const head = hasHeader ? t.rows.slice(0, 1) : [];
  const body = [...t.rows.slice(head.length)].sort((a, b) => {
    const x = cellText(a);
    const y = cellText(b);
    const nx = Number(x);
    const ny = Number(y);
    const c = x && y && !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y, undefined, { numeric: true });
    return desc ? -c : c;
  });
  return { ...t, rows: [...head, ...body] };
};

export const sortParagraphs = (doc: Doc, sel: Selection, desc: boolean): Doc => {
  const ps = selectedParas(doc, sel);
  const sorted = [...ps].sort((a, b) => paraRaw(a).localeCompare(paraRaw(b), undefined, { numeric: true }) * (desc ? -1 : 1));
  const byId = new Map(ps.map((p, i) => [p.id, sorted[i]!]));
  return updateParas(doc, sel.focus.story, new Set(byId.keys()), (p) => ({ ...byId.get(p.id)!, id: p.id }));
};

export const changeCase = (doc: Doc, sel: Selection, mode: 'upper' | 'lower' | 'title' | 'sentence' | 'toggle'): Doc =>
  mapRunsInSelection(doc, sel, (r) => {
    if (r.atom) return r;
    const t = r.text;
    const text =
      mode === 'upper' ? t.toLocaleUpperCase()
      : mode === 'lower' ? t.toLocaleLowerCase()
      : mode === 'title' ? t.toLocaleLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toLocaleUpperCase())
      : mode === 'sentence' ? t.toLocaleLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_m, a: string, b: string) => a + b.toLocaleUpperCase())
      : [...t].map((c) => (c === c.toLocaleUpperCase() ? c.toLocaleLowerCase() : c.toLocaleUpperCase())).join('');
    return { ...r, text };
  });

const paraKeepsRun = (r: Run, accept: boolean): Run | null => {
  if (accept) {
    if (r.del) return null;
    if (r.ins) { const { ins: _i, ...rest } = r; return rest; }
  } else {
    if (r.ins) return null;
    if (r.del) { const { del: _d, ...rest } = r; return rest; }
  }
  return r;
};

// Accepts or rejects revisions in a paragraph, optionally only one revision id.
export const resolveRevisions = (doc: Doc, story: StoryId, accept: boolean, sel?: Selection, revisionId?: string): Doc => {
  const targets = sel && !isCollapsed(sel) ? new Set(selectedParas(doc, sel).map((p) => p.id)) : undefined;
  const blocks = storyBlocks(doc, story);
  let d = doc;
  const merges: [Id, Id][] = [];
  const list = flatten(blocks).paras;
  list.forEach((p, i) => {
    if (targets && !targets.has(p.id)) return;
    d = updatePara(d, story, p.id, (q) => ({
      ...q,
      runs: normalizeRuns(q.runs.flatMap((r) => {
        const rev = r.ins ?? r.del;
        if (!rev || (revisionId && rev.id !== revisionId)) return [r];
        const k = paraKeepsRun(r, accept);
        return k ? [k] : [];
      })),
    }));
    const mergeMark = (accept && p.markDel) || (!accept && p.markIns);
    const rev = p.markDel ?? p.markIns;
    if (rev && (!revisionId || rev.id === revisionId)) {
      d = updatePara(d, story, p.id, (q) => { const { markDel: _a, markIns: _b, ...rest } = q; return rest as Paragraph; });
      if (mergeMark && list[i + 1]) merges.push([p.id, list[i + 1]!.id]);
    }
  });
  for (const [a, b] of merges.reverse()) {
    const home = locate(storyBlocks(d, story), b);
    const homeA = locate(storyBlocks(d, story), a);
    if (home && homeA && home.list === homeA.list) d = mergeParas(d, story, a, b);
  }
  return d;
};

export const addComment = (doc: Doc, sel: Selection, id: string): Doc =>
  mapRunsInSelection(doc, sel, (r) => ({ ...r, comments: [...(r.comments ?? []), id] }));

export const removeCommentMarks = (doc: Doc, id: string): Doc => {
  const strip = (blocks: Block[]): Block[] =>
    blocks.map((b) =>
      b.type === 'p' ? { ...b, runs: normalizeRuns(b.runs.map((r) => (r.comments?.includes(id) ? { ...r, comments: r.comments.filter((c) => c !== id) } : r)).map((r) => (r.comments?.length ? r : (({ comments: _c, ...x }) => x)(r)))) }
      : b.type === 'tbl' ? { ...b, rows: b.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, blocks: strip(c.blocks) })) })) }
      : b);
  return { ...doc, blocks: strip(doc.blocks) };
};

export { sliceRuns };
