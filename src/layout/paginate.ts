import type { Block, BorderLine, CellProps, Doc, DrawingAtom, ParaProps, HeaderFooterRefs, Id, Paragraph, RunProps, Section, StoryId, Table, TableBorders } from '../core/model';
import { formatNumber, sectionsOf, styleChain } from '../core/styles';
import { flatten, storyBlocks } from '../core/tree';
import { layoutParagraph, type LineShape } from './paragraph';
import type { Box, FieldContext, Laid, Layout, LayoutEnv, LayoutOptions, Line, Measurer, Page, ParaLayout, PlacedFloat, PlacedLine } from './types';

export const BOX_INSET_X = 7.2;
export const BOX_INSET_Y = 3.6;

const noteOrder = (doc: Doc): Map<string, string> => {
  const out = new Map<string, string>();
  let fn = 0;
  let en = 0;
  for (const p of flatten(doc.blocks).paras)
    for (const r of p.runs) {
      const a = r.atom;
      if (a?.kind === 'footnote') out.set(`footnote:${a.id}`, String(++fn));
      else if (a?.kind === 'endnote') out.set(`endnote:${a.id}`, formatNumber(++en, 'lowerRoman'));
    }
  return out;
};

const placeLine = (l: Line, story: StoryId, x: number, y: number): PlacedLine => {
  const offset = l.align === 'center' ? (l.avail - l.textWidth) / 2 : l.align === 'right' ? l.avail - l.textWidth : 0;
  return { ...l, story, x: x + l.indent + Math.max(0, offset), y };
};

interface TableStyle {
  borders: TableBorders;
  margins: { top: number; bottom: number; left: number; right: number };
  cond: NonNullable<NonNullable<Doc['styles']['styles'][string]['table']>['conditions']>;
  baseCell?: CellProps;
  para?: ParaProps;
}

const tableStyle = (doc: Doc, t: Table): TableStyle => {
  const chain = styleChain(doc, t.props.style ?? 'TableNormal');
  const borders: TableBorders = {};
  let margins = { top: 0, bottom: 0, left: 5.4, right: 5.4 };
  let cond: TableStyle['cond'] = {};
  let baseCell: CellProps | undefined;
  let para: ParaProps | undefined;
  for (const s of chain) {
    if (s.table?.props?.borders) Object.assign(borders, s.table.props.borders);
    if (s.table?.props?.cellMargins) margins = { ...margins, ...s.table.props.cellMargins };
    if (s.table?.conditions) cond = { ...cond, ...s.table.conditions };
    if (s.table?.cell) baseCell = { ...baseCell, ...s.table.cell };
    if (s.para) para = { ...para, ...s.para };
  }
  if (t.props.borders) Object.assign(borders, t.props.borders);
  if (t.props.cellMargins) margins = { ...margins, ...t.props.cellMargins };
  return { borders, margins, cond, baseCell, para };
};

const columnWidths = (t: Table, avail: number): number[] => {
  const n = t.grid.length || Math.max(...t.rows.map((r) => r.cells.reduce((s, c) => s + (c.props.gridSpan ?? 1), 0)), 1);
  const grid = t.grid.length ? t.grid : Array.from({ length: n }, () => avail / n);
  const sum = grid.reduce((a, b) => a + b, 0) || avail;
  const w = t.props.width;
  const target = w?.unit === 'pct' ? (avail * w.value) / 100 : w?.unit === 'pt' && w.value > 0 ? w.value : sum;
  const scale = (sum > avail * 1.001 && !t.props.fixedLayout ? Math.min(target, avail) : target) / sum;
  return grid.map((g) => g * scale);
};

const visibleBorder = (b?: BorderLine): BorderLine | undefined => (b && b.style !== 'nil' && b.style !== 'none' ? b : undefined);

interface CellLaid extends Laid {
  turn?: 'btLr' | 'tbRl';
  cellIndex: number;
  span: number;
  x: number;
  w: number;
  props: CellProps;
  vSpan: number;
  fill?: string;
  border: { top?: BorderLine; bottom?: BorderLine; left?: BorderLine; right?: BorderLine };
}

const TURNED_WIDTH = 2000;
const TURNED_PAD = 4;

class Engine {
  env: LayoutEnv;
  doc: Doc;
  pages: Page[] = [];
  page!: Page;
  section!: Section;
  sectionIndex = 0;
  pageCounter = 0;
  columns: { x: number; w: number }[] = [];
  col = 0;
  y = 0;
  regionTop = 0;
  bottom = 0;
  notesHeight = 0;
  noteIds = new Set<string>();
  prevSpaceAfter = 0;
  prevStyle: string | undefined;
  atTop = true;
  hdrRefs: HeaderFooterRefs = {};
  ftrRefs: HeaderFooterRefs = {};

  constructor(env: LayoutEnv) {
    this.env = env;
    this.doc = env.doc;
  }

  setColumns(sec: Section, regionTop: number): void {
    const even = !!this.doc.settings.mirrorMargins && this.pageCounter % 2 === 0;
    const left = (even ? sec.marginRight : sec.marginLeft) + (sec.gutter ?? 0);
    const usable = sec.pageWidth - sec.marginLeft - sec.marginRight - (sec.gutter ?? 0);
    if (even) this.page.leftMargin = sec.marginRight;
    const c = sec.columns;
    const cols: { x: number; w: number }[] = [];
    if (c.widths?.length) {
      let x = left;
      for (const k of c.widths) { cols.push({ x, w: k.w }); x += k.w + k.space; }
    } else {
      const n = Math.max(1, c.count);
      const w = (usable - c.space * (n - 1)) / n;
      for (let i = 0; i < n; i++) cols.push({ x: left + i * (w + c.space), w });
    }
    this.columns = sec.bidi ? cols.reverse() : cols;
    this.col = 0;
    this.y = regionTop;
    this.regionTop = regionTop;
    if (cols.length > 1 && c.separator) {
      for (let i = 1; i < cols.length; i++) this.page.columnRules.push({ x: cols[i]!.x - c.space / 2, y: regionTop, h: this.bottom - regionTop });
    }
  }

  chooseRef(refs: HeaderFooterRefs, number: number, first: boolean, sec: Section): string | undefined {
    if (first && sec.titlePage) return refs.first;
    if (this.doc.settings.evenAndOddHeaders && number % 2 === 0) return refs.even ?? refs.default;
    return refs.default;
  }

  laidStory(story: StoryId, sec: Section, field: FieldContext): Laid {
    const saved = this.env.field;
    this.env.field = field;
    const blocks = storyBlocks(this.doc, story);
    const w = sec.pageWidth - sec.marginLeft - sec.marginRight;
    const laid = this.flow(blocks, story, w);
    this.env.field = saved;
    return laid;
  }

  newPage(sec: Section, firstOfSection = false): void {
    this.flushNotes();
    const start = firstOfSection ? sec.pageNumbers?.start : undefined;
    if (start !== undefined) this.pageCounter = start;
    else this.pageCounter++;
    const number = formatNumber(this.pageCounter, sec.pageNumbers?.format ?? 'decimal');
    const page: Page = {
      index: this.pages.length, number, section: sec, sectionIndex: this.sectionIndex,
      width: sec.pageWidth, height: sec.pageHeight,
      body: { lines: [], boxes: [], height: 0 }, notes: [], noteBoxes: [], floats: [], lineNumbers: [], columnRules: [],
    };
    this.pages.push(page);
    this.page = page;
    this.section = sec;
    const field: FieldContext = { page: number, numPages: 0, section: this.sectionIndex + 1 };
    const hdrId = this.chooseRef(this.hdrRefs, this.pageCounter, firstOfSection, sec);
    const ftrId = this.chooseRef(this.ftrRefs, this.pageCounter, firstOfSection, sec);
    let top = sec.marginTop;
    let bot = sec.pageHeight - sec.marginBottom;
    if (hdrId && this.doc.headers[hdrId]) {
      const story = `hdr:${hdrId}` as StoryId;
      const h = this.laidStory(story, sec, field);
      page.header = { ...h, story };
      top = Math.max(top, sec.headerDistance + h.height);
    }
    if (ftrId && this.doc.footers[ftrId]) {
      const story = `ftr:${ftrId}` as StoryId;
      const f = this.laidStory(story, sec, field);
      page.footer = { ...f, story };
      bot = Math.min(bot, sec.pageHeight - sec.footerDistance - f.height);
    }
    this.bottom = bot;
    this.notesHeight = 0;
    this.noteIds = new Set();
    this.atTop = true;
    this.prevSpaceAfter = 0;
    this.setColumns(sec, top);
  }

  flushNotes(): void {
    if (!this.page || !this.page.notes.length) return;
    const notes = this.page.notes;
    const h = notes.reduce((m, l) => Math.max(m, l.y + l.height), 0);
    const top = this.bottom - h;
    for (const l of notes) l.y += top;
    this.page.noteSeparator = { x: this.page.leftMargin ?? this.section.marginLeft, y: top - 6, w: 144 };
  }

  noteLayout(kind: 'footnote' | 'endnote', id: string): Laid | null {
    const note = (kind === 'footnote' ? this.doc.footnotes : this.doc.endnotes)[id];
    if (!note) return null;
    const story = `${kind === 'footnote' ? 'fn' : 'en'}:${id}` as StoryId;
    const laid = this.flow(note.blocks, story, this.columns[0]!.w);
    const first = laid.lines[0];
    if (first) {
      const text = `${this.env.noteNumber(kind, id)} `;
      const font = { family: 'Calibri', size: 8, bold: false, italic: false };
      laid.lines[0] = { ...first, label: { text, x: 0, width: this.env.m.width(text, font), eff: { size: 8 }, font } };
    }
    return laid;
  }

  addNotes(l: Line): void {
    for (const ref of l.noteRefs ?? []) {
      if (ref.kind !== 'footnote' || this.noteIds.has(ref.id)) continue;
      const laid = this.noteLayout(ref.kind, ref.id);
      if (!laid) continue;
      this.noteIds.add(ref.id);
      const base = this.notesHeight;
      for (const nl of laid.lines) this.page.notes.push({ ...nl, x: nl.x + (this.page.leftMargin ?? this.section.marginLeft), y: nl.y + base });
      this.notesHeight += laid.height;
    }
  }

  noteCost(l: Line): number {
    let h = 0;
    for (const ref of l.noteRefs ?? []) {
      if (ref.kind !== 'footnote' || this.noteIds.has(ref.id)) continue;
      h += this.noteLayout(ref.kind, ref.id)?.height ?? 0;
    }
    if (h && !this.notesHeight) h += 12;
    return h;
  }

  limit(): number {
    return this.bottom - (this.notesHeight ? this.notesHeight + 12 : 0);
  }

  nextColumn(): void {
    if (this.col + 1 < this.columns.length) {
      this.col++;
      this.y = this.regionTop;
      this.atTop = true;
      this.prevSpaceAfter = 0;
    } else this.newPage(this.section);
  }

  // Wrapping rectangles on the current page from text-wrapped floats.
  shapeFor(x: number, w: number, startY: number): LineShape | undefined {
    const fl = this.page.floats.filter((f) => !f.behind && f.atom.wrap !== 'inline' && f.atom.wrap !== 'front');
    if (!fl.length) return undefined;
    return (_i, y, h) => {
      const top = startY + y;
      let left = 0;
      let right = 0;
      let dy = 0;
      for (const f of fl) {
        const d = f.atom.float;
        const y0 = f.y - (d?.distT ?? 0);
        const y1 = f.y + f.h + (d?.distB ?? 0);
        if (top + h <= y0 || top >= y1) continue;
        const x0 = f.x - (d?.distL ?? 9);
        const x1 = f.x + f.w + (d?.distR ?? 9);
        if (x1 <= x || x0 >= x + w) continue;
        if (f.atom.wrap === 'topBottom') { dy = Math.max(dy, y1 - top); continue; }
        const leftRoom = x0 - x;
        const rightRoom = x + w - x1;
        if (leftRoom >= rightRoom) right = Math.max(right, x + w - x0);
        else left = Math.max(left, x1 - x);
      }
      return { left, right, dy };
    };
  }

  placeFloats(pl: ParaLayout, story: StoryId, colX: number, colW: number, paraY: number): void {
    const sec = this.section;
    pl.para.runs.reduce((off, r) => {
      const a = r.atom;
      if (a && (a.kind === 'image' || a.kind === 'shape' || a.kind === 'chart') && a.wrap !== 'inline') {
        const f = a.float;
        const relX = f?.relH === 'page' ? 0 : f?.relH === 'margin' ? sec.marginLeft : colX;
        const relW = f?.relH === 'page' ? sec.pageWidth : f?.relH === 'margin' ? sec.pageWidth - sec.marginLeft - sec.marginRight : colW;
        const relY = f?.relV === 'page' ? 0 : f?.relV === 'margin' ? sec.marginTop : paraY;
        const relH = f?.relV === 'page' ? sec.pageHeight : sec.pageHeight - sec.marginTop - sec.marginBottom;
        const x = f?.alignH === 'center' ? relX + (relW - a.width) / 2 : f?.alignH === 'right' ? relX + relW - a.width : f?.alignH === 'left' ? relX : relX + (f?.x ?? 0);
        const y = f?.alignV === 'center' ? relY + (relH - a.height) / 2 : f?.alignV === 'bottom' ? relY + relH - a.height : f?.alignV === 'top' ? relY : relY + (f?.y ?? 0);
        this.page.floats.push({ atom: a as DrawingAtom, para: pl.para.id, story, offset: off, x, y, w: a.width, h: a.height, behind: a.wrap === 'behind' });
      }
      return off + r.text.length;
    }, 0);
  }

  // Lays blocks with no page limit, for cells, headers, footers and notes.
  flow(blocks: Block[], story: StoryId, width: number): Laid {
    const lines: PlacedLine[] = [];
    const boxes: Box[] = [];
    let y = 0;
    let prevStyle: string | undefined;
    let prevAfter = 0;
    for (const b of blocks) {
      if (b.type === 'p') {
        const pl = layoutParagraph(this.env, blocks, b, width);
        const before = pl.contextual && prevStyle === pl.style ? 0 : pl.spaceBefore;
        y += before + (prevStyle !== undefined && pl.contextual && prevStyle === pl.style ? -prevAfter : 0);
        const y0 = y;
        for (const l of pl.lines) { lines.push(placeLine(l, story, 0, y + (l.dy ?? 0))); y += l.height + (l.dy ?? 0); }
        this.paraDecor(pl, 0, width, y0, y, boxes);
        y += pl.spaceAfter;
        prevAfter = pl.spaceAfter;
        prevStyle = pl.style;
      } else if (b.type === 'tbl') {
        const t = this.tableRows(b, story, width);
        for (const row of t.rows) {
          this.emitRow(row, 0, y, row.height, lines, boxes, t.borders, row === t.rows[0], true);
          y += row.height;
        }
      } else {
        y += 16;
      }
    }
    return { lines, boxes, height: y };
  }

  paraDecor(pl: ParaLayout, x: number, w: number, y0: number, y1: number, boxes: Box[]): void {
    const b = pl.borders;
    if (!pl.shading && !b) return;
    const pad = (s?: BorderLine) => (s ? (s.space ?? 1) : 0);
    boxes.push({
      x: x + pl.indentL - pad(b?.left), y: y0 - pad(b?.top), w: w - pl.indentL - pl.indentR + pad(b?.left) + pad(b?.right), h: y1 - y0 + pad(b?.top) + pad(b?.bottom),
      fill: pl.shading, top: visibleBorder(b?.top), bottom: visibleBorder(b?.bottom), left: visibleBorder(b?.left), right: visibleBorder(b?.right),
    });
  }

  tableRows(t: Table, story: StoryId, avail: number) {
    const style = tableStyle(this.doc, t);
    const widths = columnWidths(t, avail);
    const look = t.props.look ?? { firstRow: true };
    const rows = t.rows.map((row, ri) => {
      let col = 0;
      const cells: CellLaid[] = [];
      row.cells.forEach((cell, ci) => {
        const span = cell.props.gridSpan ?? 1;
        const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0) || cell.props.width || 72;
        const x = widths.slice(0, col).reduce((a, b) => a + b, 0);
        const m = { ...style.margins, ...cell.props.margins };
        const conds: string[] = ['wholeTable'];
        if (!look.noHBand && style.cond['band1Horz']) conds.push(((ri - (look.firstRow ? 1 : 0)) % 2 === 0) ? 'band1Horz' : 'band2Horz');
        if (!look.noVBand && style.cond['band1Vert']) conds.push(col % 2 === 0 ? 'band1Vert' : 'band2Vert');
        if (look.firstColumn && col === 0) conds.push('firstCol');
        if (look.lastColumn && col + span >= widths.length) conds.push('lastCol');
        if (look.firstRow && ri === 0) conds.push('firstRow');
        if (look.lastRow && ri === t.rows.length - 1) conds.push('lastRow');
        let overlay: RunProps | undefined;
        let tablePara = style.para;
        let fill = style.baseCell?.shading;
        let condBorders: TableBorders | undefined;
        for (const c of conds) {
          const k = style.cond[c];
          if (!k) continue;
          if (k.run) overlay = { ...overlay, ...k.run };
          if (k.para) tablePara = { ...tablePara, ...k.para };
          if (k.cell?.shading) fill = k.cell.shading;
          if (k.cell?.borders) condBorders = { ...condBorders, ...k.cell.borders };
        }
        fill = cell.props.shading ?? fill;
        const b = { ...style.borders, ...condBorders, ...cell.props.borders };
        const border = {
          top: visibleBorder(ri === 0 ? (cell.props.borders?.top ?? condBorders?.top ?? style.borders.top) : (cell.props.borders?.top ?? b.insideH)),
          bottom: visibleBorder(ri === t.rows.length - 1 ? (cell.props.borders?.bottom ?? condBorders?.bottom ?? style.borders.bottom) : (cell.props.borders?.bottom ?? b.insideH)),
          left: visibleBorder(col === 0 ? (cell.props.borders?.left ?? style.borders.left) : (cell.props.borders?.left ?? b.insideV)),
          right: visibleBorder(col + span >= widths.length ? (cell.props.borders?.right ?? style.borders.right) : (cell.props.borders?.right ?? b.insideV)),
        };
        const innerW = Math.max(8, w - m.left - m.right);
        const turn = cell.props.textDirection === 'btLr' || cell.props.textDirection === 'tbRl' ? cell.props.textDirection : undefined;
        const laid = cell.props.vMerge === 'continue' ? { lines: [], boxes: [], height: 0 } : this.cellFlow(cell.blocks, story, turn ? TURNED_WIDTH : innerW, overlay, tablePara);
        const long = turn ? laid.lines.reduce((a, l) => Math.max(a, l.textWidth), 0) : 0;
        cells.push({
          ...laid,
          lines: laid.lines.map((l) => ({ ...l, x: l.x + x + m.left, y: l.y + m.top })),
          boxes: turn ? [] : laid.boxes.map((q) => ({ ...q, x: q.x + x + m.left, y: q.y + m.top })),
          height: turn ? long + m.top + m.bottom + TURNED_PAD * 2 : laid.height + m.top + m.bottom,
          turn,
          cellIndex: ci, span, x, w, props: cell.props, vSpan: 1, fill, border,
        });
        col += span;
      });
      let height = cells.filter((c) => c.props.vMerge !== 'restart').reduce((m, c) => Math.max(m, c.height), 0);
      if (row.props.heightRule === 'exact' && row.props.height) height = row.props.height;
      else if (row.props.height) height = Math.max(height, row.props.height);
      return { height, cells, props: row.props, source: row };
    });
    // Vertically merged cells: extend the last spanned row so the content fits.
    rows.forEach((row, ri) => {
      for (const c of row.cells) {
        if (c.props.vMerge !== 'restart') continue;
        let total = row.height;
        let last = ri;
        for (let k = ri + 1; k < rows.length; k++) {
          const below = rows[k]!.cells.find((x) => x.x === c.x);
          if (below?.props.vMerge !== 'continue') break;
          total += rows[k]!.height;
          last = k;
        }
        c.vSpan = last - ri + 1;
        if (c.height > total) rows[last]!.height += c.height - total;
      }
    });
    const tw = widths.reduce((a, b) => a + b, 0);
    const indent = t.props.indent ?? 0;
    const off = t.props.align === 'center' ? (avail - tw) / 2 : t.props.align === 'right' ? avail - tw : indent;
    return { rows, borders: style.borders, offset: off, width: tw };
  }

  cellFlow(blocks: Block[], story: StoryId, width: number, overlay?: RunProps, tablePara?: ParaProps): Laid {
    if (!overlay && !tablePara) return this.flow(blocks, story, width);
    const lines: PlacedLine[] = [];
    const boxes: Box[] = [];
    let y = 0;
    for (const b of blocks) {
      if (b.type === 'p') {
        const pl = layoutParagraph(this.env, blocks, b, width, overlay, undefined, tablePara);
        y += pl.spaceBefore;
        const y0 = y;
        for (const l of pl.lines) { lines.push(placeLine(l, story, 0, y)); y += l.height; }
        this.paraDecor(pl, 0, width, y0, y, boxes);
        y += pl.spaceAfter;
      } else if (b.type === 'tbl') {
        const inner = this.flow([b], story, width);
        lines.push(...inner.lines.map((l) => ({ ...l, y: l.y + y })));
        boxes.push(...inner.boxes.map((q) => ({ ...q, y: q.y + y })));
        y += inner.height;
      }
    }
    return { lines, boxes, height: y };
  }

  emitRow(row: { height: number; cells: CellLaid[] }, x: number, y: number, h: number, lines: PlacedLine[], boxes: Box[], _b: TableBorders, _first: boolean, full: boolean, rowsAfter?: { height: number }[]): void {
    for (const c of row.cells) {
      if (c.props.vMerge === 'continue') continue;
      let cellH = h;
      if (c.vSpan > 1 && rowsAfter) for (let k = 0; k < c.vSpan - 1; k++) cellH += rowsAfter[k]?.height ?? 0;
      boxes.push({ x: x + c.x, y, w: c.w, h: cellH, fill: c.fill, ...c.border });
      const extra = c.props.vAlign === 'center' ? (cellH - c.height) / 2 : c.props.vAlign === 'bottom' ? cellH - c.height : 0;
      if (full && c.turn) {
        // Turned text starts at the bottom left or the top right of the cell.
        const inset = c.lines[0] ? c.lines[0].x - c.x : 0;
        for (const l of c.lines) {
          const across = l.y - (c.lines[0]?.y ?? 0);
          lines.push(c.turn === 'btLr'
            ? { ...l, turn: -90, x: x + c.x + inset + across, y: y + cellH - TURNED_PAD }
            : { ...l, turn: 90, x: x + c.x + c.w - inset - across, y: y + TURNED_PAD });
        }
      } else if (full) {
        for (const l of c.lines) lines.push({ ...l, x: l.x + x, y: l.y + y + Math.max(0, extra) });
        for (const q of c.boxes) boxes.push({ ...q, x: q.x + x, y: q.y + y + Math.max(0, extra) });
      }
    }
  }

  placeTable(t: Table, story: StoryId): void {
    const col = this.columns[this.col]!;
    const laid = this.tableRows(t, story, col.w);
    const headers = laid.rows.filter((r, i) => r.props.header && laid.rows.slice(0, i).every((q) => q.props.header));
    this.y += this.prevSpaceAfter;
    this.prevSpaceAfter = 0;
    const body = this.page.body;
    for (let i = 0; i < laid.rows.length; i++) {
      let row = laid.rows[i]!;
      let pending: typeof row | null = row;
      while (pending) {
        row = pending;
        pending = null;
        const c = this.columns[this.col]!;
        const room = this.limit() - this.y;
        if (row.height > room) {
          const full = this.limit() - this.regionTop;
          const splittable = !row.props.cantSplit && row.props.heightRule !== 'exact' && room > 24 && !row.cells.some((x) => x.vSpan > 1);
          if (splittable) {
            const [a, b] = splitRow(row, room);
            if (a && b) {
              this.emitRow(a, c.x + laid.offset, this.y, a.height, body.lines, body.boxes, laid.borders, false, true);
              this.y += a.height;
              pending = b as typeof row;
              this.nextColumn();
              this.repeatHeaders(headers, laid, i);
              continue;
            }
          }
          if (!this.atTop || row.height <= full) {
            if (!this.atTop) {
              this.nextColumn();
              this.repeatHeaders(headers, laid, i);
              pending = row;
              continue;
            }
          }
        }
        const c2 = this.columns[this.col]!;
        this.emitRow(row, c2.x + laid.offset, this.y, row.height, body.lines, body.boxes, laid.borders, i === 0, true, laid.rows.slice(i + 1));
        this.y += row.height;
        this.atTop = false;
        for (const cell of row.cells) for (const l of cell.lines) if (l.noteRefs) { const cost = this.noteCost(l); if (cost >= 0) this.addNotes(l); }
      }
    }
  }

  repeatHeaders(headers: { height: number; cells: CellLaid[] }[], laid: { offset: number; borders: TableBorders }, nextRow: number): void {
    if (!headers.length || nextRow < headers.length) return;
    const body = this.page.body;
    const c = this.columns[this.col]!;
    for (const h of headers) {
      this.emitRow(h, c.x + laid.offset, this.y, h.height, body.lines, body.boxes, laid.borders, false, true);
      this.y += h.height;
    }
  }

  placeParagraph(p: Paragraph, blocks: Block[], story: StoryId, nextIsKeep: number): void {
    let col = this.columns[this.col]!;
    const hasFloat = p.runs.some((r) => (r.atom?.kind === 'image' || r.atom?.kind === 'shape' || r.atom?.kind === 'chart') && r.atom.wrap !== 'inline');
    let pl = layoutParagraph(this.env, blocks, p, col.w);
    if (pl.pageBreakBefore && !(this.atTop && this.page.body.lines.length === 0)) this.newPage(this.section);
    const contextual = pl.contextual && this.prevStyle === pl.style;
    const before = this.atTop ? (this.page.index === 0 && this.col === 0 ? pl.spaceBefore : 0) : contextual ? 0 : pl.spaceBefore;
    const gap = (contextual ? 0 : this.prevSpaceAfter) + before;
    const total = pl.lines.reduce((s, l) => s + l.height, 0);
    const need = pl.keepLines ? total : Math.min(total, pl.lines.slice(0, 2).reduce((s, l) => s + l.height, 0));
    if (!this.atTop && this.y + gap + need + nextIsKeep > this.limit() && need + nextIsKeep < this.limit() - this.regionTop) {
      this.nextColumn();
      col = this.columns[this.col]!;
    }
    const after = this.atTop ? 0 : gap;
    this.y += after;
    const paraY = this.y;
    if (hasFloat) this.placeFloats(pl, story, col.x, col.w, paraY);
    const shape = this.shapeFor(col.x, col.w, this.y);
    if (shape) pl = layoutParagraph(this.env, blocks, p, col.w, undefined, shape);
    const lines = pl.lines;
    let i = 0;
    let startY = this.y;
    const body = this.page.body;
    while (i < lines.length) {
      const l = lines[i]!;
      const lim = this.limit();
      const cost = this.noteCost(l);
      const dy = l.dy ?? 0;
      let fits = this.y + dy + l.height + cost <= lim + 0.01;
      if (fits && pl.widowControl && lines.length > 1) {
        if (i === 0 && lines.length > 1 && this.y + lines[0]!.height + lines[1]!.height > lim + 0.01 && !this.atTop) fits = false;
        if (i === lines.length - 2 && this.y + l.height + lines[i + 1]!.height > lim + 0.01 && i > 0) fits = false;
      }
      if (!fits && !this.atTop) {
        this.paraDecor(pl, col.x, col.w, startY, this.y, this.page.body.boxes);
        this.nextColumn();
        col = this.columns[this.col]!;
        startY = this.y;
        continue;
      }
      this.page.body.lines.push(placeLine(l, story, col.x, this.y + dy));
      if (l.noteRefs) this.addNotes(l);
      this.y += l.height + dy;
      this.atTop = false;
      i++;
      if (l.breakAfter === 'page') {
        this.paraDecor(pl, col.x, col.w, startY, this.y, this.page.body.boxes);
        this.newPage(this.section);
        col = this.columns[this.col]!;
        startY = this.y;
      } else if (l.breakAfter === 'column') {
        this.paraDecor(pl, col.x, col.w, startY, this.y, this.page.body.boxes);
        this.nextColumn();
        col = this.columns[this.col]!;
        startY = this.y;
      }
    }
    void body;
    this.paraDecor(pl, col.x, col.w, startY, this.y, this.page.body.boxes);
    this.prevSpaceAfter = pl.spaceAfter;
    this.prevStyle = pl.style;
  }

  keepHeight(blocks: Block[], i: number, width: number): number {
    let h = 0;
    for (let k = i + 1; k < blocks.length; k++) {
      const b = blocks[k];
      if (!b) break;
      if (b.type !== 'p') { h += 24; break; }
      const pl = layoutParagraph(this.env, blocks, b, width);
      const head = pl.lines.slice(0, 2).reduce((s, l) => s + l.height, 0);
      h += pl.spaceBefore + (pl.keepNext ? pl.lines.reduce((s, l) => s + l.height, 0) + pl.spaceAfter : head);
      if (!pl.keepNext) break;
    }
    return h;
  }

  run(): void {
    const secs = sectionsOf(this.doc);
    const blocks = this.doc.blocks;
    secs.forEach((s, si) => {
      this.sectionIndex = si;
      const sec = s.section;
      this.hdrRefs = { ...this.hdrRefs, ...sec.headers };
      this.ftrRefs = { ...this.ftrRefs, ...sec.footers };
      const kind = si === 0 ? 'nextPage' : (sec.breakType ?? 'nextPage');
      if (si === 0) this.newPage(sec, true);
      else if (kind === 'continuous' && sec.pageWidth === this.section.pageWidth) {
        this.balanceColumns();
        this.section = sec;
        const top = this.y + this.prevSpaceAfter;
        this.setColumns(sec, top);
      } else if (kind === 'nextColumn') this.nextColumn();
      else {
        this.newPage(sec, true);
        const odd = this.pageCounter % 2 === 1;
        if ((kind === 'evenPage' && odd) || (kind === 'oddPage' && !odd)) this.newPage(sec, true);
      }
      for (let i = s.from; i < s.to; i++) {
        const b = blocks[i]!;
        if (b.type === 'p') {
          const w = this.columns[this.col]!.w;
          const pl = layoutParagraph(this.env, blocks, b, w);
          this.placeParagraph(b, blocks, 'body', pl.keepNext ? this.keepHeight(blocks, i, w) : 0);
        } else if (b.type === 'tbl') {
          this.placeTable(b, 'body');
          this.prevStyle = undefined;
        } else {
          const col = this.columns[this.col]!;
          this.page.body.boxes.push({ x: col.x, y: this.y, w: col.w, h: 16, fill: '#eef1fb' });
          this.y += 18;
          this.atTop = false;
        }
      }
    });
    this.flushNotes();
    this.endnotes();
    this.finish();
  }

  // A continuous break evens out the columns above it, keeping each line in reading order.
  balanceColumns(): void {
    const cols = this.columns;
    if (cols.length < 2) return;
    const top = this.regionTop;
    const body = this.page.body;
    if (body.boxes.some((b) => b.y >= top - 0.5)) return;
    const own = body.lines.filter((l) => l.y >= top - 0.5);
    if (!own.length) return;
    const home = (l: PlacedLine) => Math.max(0, cols.findIndex((c) => l.x >= c.x - 0.5 && l.x < c.x + c.w));
    const steps = own.map((l, i) => {
      const next = own[i + 1];
      const same = next && home(next) === home(l);
      return { l, h: same ? next.y - l.y : l.height };
    });
    const total = steps.reduce((s, x) => s + x.h, 0);
    const target = total / cols.length;
    let col = 0;
    let y = 0;
    let tallest = 0;
    for (const { l, h } of steps) {
      if (y > 0 && y + h / 2 > target && col < cols.length - 1) { col++; y = 0; }
      const from = cols[home(l)]!;
      l.x += cols[col]!.x - from.x;
      l.y = top + y;
      y += h;
      tallest = Math.max(tallest, y);
    }
    this.col = 0;
    this.y = top + tallest;
  }

  endnotes(): void {
    const ids = flatten(this.doc.blocks).paras.flatMap((p) => p.runs.flatMap((r) => (r.atom?.kind === 'endnote' ? [r.atom.id] : [])));
    if (!ids.length) return;
    const col = this.columns[this.col]!;
    this.y += 12;
    for (const id of ids) {
      const laid = this.noteLayout('endnote', id);
      if (!laid) continue;
      for (const l of laid.lines) {
        if (this.y + l.height > this.bottom) { this.newPage(this.section); }
        this.page.body.lines.push({ ...l, x: l.x + col.x, y: this.y });
        this.y += l.height;
      }
    }
  }

  finish(): void {
    const total = this.pages.length;
    for (const page of this.pages) {
      const field: FieldContext = { page: page.number, numPages: total, section: page.sectionIndex + 1 };
      if (page.header) page.header = { ...this.laidStory(page.header.story, page.section, field), story: page.header.story };
      if (page.footer) page.footer = { ...this.laidStory(page.footer.story, page.section, field), story: page.footer.story };
      const va = page.section.vAlign;
      if ((va === 'center' || va === 'bottom') && !page.notes.length && page.body.lines.length) {
        const end = Math.max(...page.body.lines.map((l) => l.y + l.height));
        const free = page.section.pageHeight - page.section.marginBottom - end;
        const dy = va === 'center' ? free / 2 : free;
        if (dy > 0) page.body = { ...page.body, lines: page.body.lines.map((l) => ({ ...l, y: l.y + dy })), boxes: page.body.boxes.map((b) => ({ ...b, y: b.y + dy })) };
      }
      const ln = page.section.lineNumbers;
      if (ln) {
        let n = ln.start ?? 1;
        const seen = new Set<number>();
        for (const l of [...page.body.lines].sort((a, b) => a.y - b.y)) {
          if (seen.has(Math.round(l.y))) continue;
          seen.add(Math.round(l.y));
          if ((n - (ln.start ?? 1) + 1) % ln.countBy === 0 || ln.countBy === 1) page.lineNumbers.push({ x: (page.leftMargin ?? page.section.marginLeft) - (ln.distance ?? 18), y: l.y, n, size: 9 });
          n++;
        }
      }
    }
  }
}

const splitRow = <R extends { height: number; cells: CellLaid[] }>(row: R, room: number): [R | null, R | null] => {
  const a: CellLaid[] = [];
  const b: CellLaid[] = [];
  let any = false;
  for (const c of row.cells) {
    const stay = c.lines.filter((l) => l.y + l.height <= room);
    const move = c.lines.filter((l) => l.y + l.height > room);
    if (move.length) any = true;
    const firstY = move.length ? Math.min(...move.map((l) => l.y)) : 0;
    a.push({ ...c, lines: stay, boxes: c.boxes.filter((q) => q.y + q.h <= room), height: room });
    const shifted = move.map((l) => ({ ...l, y: l.y - firstY + 2 }));
    b.push({ ...c, lines: shifted, boxes: [], height: shifted.reduce((m, l) => Math.max(m, l.y + l.height), 0) + 2 });
  }
  if (!any || !a.some((c) => c.lines.length)) return [null, null];
  return [{ ...row, cells: a, height: room }, { ...row, cells: b, height: Math.max(...b.map((c) => c.height)) }];
};

export const layoutDocument = (doc: Doc, m: Measurer, opts: LayoutOptions): Layout => {
  const order = noteOrder(doc);
  const env: LayoutEnv = { doc, m, opts, field: {}, noteNumber: (k, id) => order.get(`${k}:${id}`) ?? '*' };
  const e = new Engine(env);
  e.run();
  const lineIndex = new Map<Id, { page: number; line: PlacedLine }[]>();
  const add = (page: number, lines: PlacedLine[]) => {
    for (const line of lines) {
      let l = lineIndex.get(line.para);
      if (!l) lineIndex.set(line.para, (l = []));
      l.push({ page, line });
    }
  };
  for (const p of e.pages) {
    add(p.index, p.body.lines);
    add(p.index, p.notes);
    if (p.header) add(p.index, p.header.lines);
    if (p.footer) add(p.index, p.footer.lines);
  }
  const boxes = new Map<string, Laid>();
  for (const p of flatten(doc.blocks).paras) {
    for (const r of p.runs) {
      const a = r.atom;
      if (a?.kind !== 'shape' || !a.textId || !doc.boxes?.[a.textId]) continue;
      const laid = e.flow(doc.boxes[a.textId]!, `box:${a.textId}`, Math.max(12, a.width - BOX_INSET_X * 2));
      boxes.set(a.textId, laid);
      add(lineIndex.get(p.id)?.[0]?.page ?? 0, laid.lines);
    }
  }
  return { pages: e.pages, lineIndex, boxes };
};

export type { PlacedFloat };
