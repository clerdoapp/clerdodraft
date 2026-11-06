import type { Block, Doc, Paragraph, ParaProps, Run, RunProps } from '../core/model';
import { para } from '../core/model';
import { DocBuilder, makeTable } from './build';
import { readCompound } from './cfb';

// Reads the older binary format: text, tables, and the common character and paragraph formatting.
interface Piece { cp: number; len: number; fc: number; compressed: boolean }

const pieces = (word: Uint8Array, table: Uint8Array): { text: string; list: Piece[] } => {
  const w = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const fcClx = w.getUint32(418, true);
  const lcbClx = w.getUint32(422, true);
  let at = fcClx;
  const end = fcClx + lcbClx;
  while (at < end && table[at] === 1) at += 3 + t.getUint16(at + 1, true);
  if (table[at] !== 2) throw new Error("This older document couldn't be read.");
  const size = t.getUint32(at + 1, true);
  const base = at + 5;
  const count = (size - 4) / 12;
  let text = '';
  const list: Piece[] = [];
  const cp1252 = new TextDecoder('windows-1252');
  const utf16 = new TextDecoder('utf-16le');
  for (let i = 0; i < count; i++) {
    const from = t.getUint32(base + i * 4, true);
    const to = t.getUint32(base + (i + 1) * 4, true);
    const raw = t.getUint32(base + (count + 1) * 4 + i * 8 + 2, true);
    const chars = to - from;
    const compressed = !!(raw & 0x40000000);
    const fc = compressed ? (raw & 0x3fffffff) >>> 1 : raw;
    list.push({ cp: from, len: chars, fc, compressed });
    text += compressed ? cp1252.decode(word.subarray(fc, fc + chars)) : utf16.decode(word.subarray(fc, fc + chars * 2));
  }
  return { text, list };
};

const fcOf = (list: Piece[], cp: number): number => {
  for (const p of list) if (cp >= p.cp && cp < p.cp + p.len) return p.fc + (cp - p.cp) * (p.compressed ? 1 : 2);
  return -1;
};

interface Sprm { op: number; arg: DataView; at: number; size: number }

const sprms = (bytes: Uint8Array, from: number, to: number): Sprm[] => {
  const out: Sprm[] = [];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let i = from;
  while (i + 2 <= to) {
    const op = v.getUint16(i, true);
    const spra = op >> 13;
    let size = [1, 1, 2, 4, 2, 2, 0, 3][spra]!;
    let at = i + 2;
    if (spra === 6) { size = bytes[at] ?? 0; at += 1; if (op === 0xd608 || op === 0xc615) { size = v.getUint16(i + 2, true) - 1; at = i + 4; } }
    if (at + size > bytes.length) break;
    out.push({ op, arg: v, at, size });
    i = at + size;
  }
  return out;
};

const ICO = ['', '#000000', '#0000ff', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#ffff00', '#ffffff', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0'];
const on = (v: number, base?: boolean): boolean | undefined => (v === 1 ? true : v === 0 ? false : v === 0x81 ? !base : base);

const charProps = (list: Sprm[], fonts: string[]): RunProps => {
  const p: RunProps = {};
  for (const s of list) {
    const b = s.arg.getUint8(s.at);
    switch (s.op) {
      case 0x0835: p.bold = on(b) || undefined; break;
      case 0x0836: p.italic = on(b) || undefined; break;
      case 0x0837: p.strike = on(b) || undefined; break;
      case 0x0838: p.outline = on(b) || undefined; break;
      case 0x0839: p.shadow = on(b) || undefined; break;
      case 0x083a: p.smallCaps = on(b) || undefined; break;
      case 0x083b: p.caps = on(b) || undefined; break;
      case 0x083c: p.hidden = on(b) || undefined; break;
      case 0x2a3e: p.underline = b === 0 ? undefined : b === 3 ? 'double' : b === 4 ? 'dotted' : b === 6 ? 'thick' : 'single'; break;
      case 0x4a43: p.size = s.arg.getUint16(s.at, true) / 2; break;
      case 0x2a42: if (ICO[b]) p.color = ICO[b]; break;
      case 0x6870: { const r = s.arg.getUint8(s.at); const g = s.arg.getUint8(s.at + 1); const bl = s.arg.getUint8(s.at + 2); if (s.arg.getUint8(s.at + 3) !== 0xff) p.color = `#${[r, g, bl].map((x) => x.toString(16).padStart(2, '0')).join('')}`; break; }
      case 0x2a0c: { const hl = ICO[b]; if (hl && b !== 1) p.highlight = hl; break; }
      case 0x2a48: p.vertAlign = b === 1 ? 'super' : b === 2 ? 'sub' : undefined; break;
      case 0x4a4f: case 0x4a5e: { const f = fonts[s.arg.getUint16(s.at, true)]; if (f) { if (s.op === 0x4a5e) p.fontCs = f; else p.font = f; } break; }
      default: break;
    }
  }
  return p;
};

const paraProps = (list: Sprm[], istd: number): ParaProps => {
  const p: ParaProps = {};
  if (istd >= 1 && istd <= 9) p.style = `Heading${istd}`;
  for (const s of list) {
    const b = s.arg.getUint8(s.at);
    switch (s.op) {
      case 0x2403: case 0x2461: p.align = b === 1 ? 'center' : b === 2 ? 'right' : b === 3 ? 'justify' : undefined; break;
      case 0x840f: case 0x845e: p.indentLeft = s.arg.getInt16(s.at, true) / 20 || undefined; break;
      case 0x840e: case 0x845d: p.indentRight = s.arg.getInt16(s.at, true) / 20 || undefined; break;
      case 0x8411: case 0x8460: p.firstLine = s.arg.getInt16(s.at, true) / 20 || undefined; break;
      case 0xa413: p.spaceBefore = s.arg.getUint16(s.at, true) / 20; break;
      case 0xa414: p.spaceAfter = s.arg.getUint16(s.at, true) / 20; break;
      case 0x2640: if (b < 9 && !p.style) p.style = `Heading${b + 1}`; break;
      case 0x2441: p.bidi = b === 1 || undefined; break;
      case 0x2405: p.keepLines = b === 1 || undefined; break;
      case 0x2406: p.keepNext = b === 1 || undefined; break;
      case 0x2407: p.pageBreakBefore = b === 1 || undefined; break;
      default: break;
    }
  }
  return p;
};

interface Span<T> { from: number; to: number; v: T }

const fkpRuns = <T>(word: Uint8Array, table: Uint8Array, fcPlc: number, lcbPlc: number, read: (page: Uint8Array, i: number) => T | null): Span<T>[] => {
  const out: Span<T>[] = [];
  if (!lcbPlc || fcPlc + lcbPlc > table.length) return out;
  const t = new DataView(table.buffer, table.byteOffset + fcPlc, lcbPlc);
  const n = (lcbPlc - 4) / 8;
  for (let i = 0; i < n; i++) {
    const pn = t.getUint32((n + 1) * 4 + i * 4, true) & 0x3fffff;
    const page = word.subarray(pn * 512, pn * 512 + 512);
    if (page.length < 512) continue;
    const pv = new DataView(page.buffer, page.byteOffset, 512);
    const crun = page[511]!;
    for (let k = 0; k < crun; k++) {
      const v = read(page, k);
      if (v !== null) out.push({ from: pv.getUint32(k * 4, true), to: pv.getUint32((k + 1) * 4, true), v });
    }
  }
  return out;
};

const fontTable = (word: Uint8Array, table: Uint8Array): string[] => {
  const w = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const fc = w.getUint32(274, true); const lcb = w.getUint32(278, true);
  if (!lcb || fc + lcb > table.length) return [];
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let count = t.getUint16(fc, true); let at = fc + 4;
  if (count === 0xffff) { count = t.getUint16(fc + 2, true); at = fc + 6; }
  const out: string[] = [];
  for (let i = 0; i < count && at < fc + lcb; i++) {
    const len = table[at]!;
    let name = '';
    for (let k = at + 1 + 39; k + 1 < at + 1 + len; k += 2) { const c = t.getUint16(k, true); if (!c) break; name += String.fromCharCode(c); }
    out.push(name);
    at += 1 + len;
  }
  return out;
};

const find = <T>(spans: Span<T>[], fc: number): T | undefined => {
  let lo = 0; let hi = spans.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; const s = spans[m]!; if (fc < s.from) hi = m - 1; else if (fc >= s.to) lo = m + 1; else return s.v; }
  return undefined;
};

export const readDoc = (bytes: Uint8Array): Doc => {
  const files = readCompound(bytes);
  const word = files.get('WordDocument');
  if (!word) throw new Error('This file is not a document this app can read.');
  const v = new DataView(word.buffer, word.byteOffset, word.byteLength);
  if (v.getUint16(0, true) !== 0xa5ec || v.getUint16(2, true) < 101) throw new Error('This document uses a format that is too old to open.');
  const flags = v.getUint16(10, true);
  if (flags & 0x0100) throw new Error('This older document is protected with a password.');
  const table = files.get(flags & 0x0200 ? '1Table' : '0Table');
  if (!table) throw new Error("This older document couldn't be read.");
  const bodyLen = v.getUint32(76, true);
  const { text: all, list } = pieces(word, table);
  const fonts = fontTable(word, table);
  const chpx = fkpRuns(word, table, v.getUint32(250, true), v.getUint32(254, true), (page, k) => {
    const off = page[(page[511]! + 1) * 4 + k]! * 2;
    if (!off) return {};
    return charProps(sprms(page, off + 1, off + 1 + page[off]!), fonts);
  });
  const papx = fkpRuns(word, table, v.getUint32(258, true), v.getUint32(262, true), (page, k) => {
    const crun = page[511]!;
    const off = page[(crun + 1) * 4 + k * 13]! * 2;
    if (!off) return {};
    let cb = page[off]!; let at = off + 1;
    let size = cb * 2 - 1;
    if (cb === 0) { cb = page[off + 1]!; at = off + 2; size = cb * 2; }
    const pv = new DataView(page.buffer, page.byteOffset, 512);
    const istd = pv.getUint16(at, true);
    return paraProps(sprms(page, at + 2, Math.min(512, at + size)), istd);
  });

  // Field codes are dropped and their results kept, with each kept character remembering its position.
  const kept: number[] = [];
  let text = '';
  const stack: boolean[] = [];
  for (let i = 0; i < Math.min(bodyLen, all.length); i++) {
    const c = all[i]!;
    if (c === '\x13') { stack.push(true); continue; }
    if (c === '\x14') { if (stack.length) stack[stack.length - 1] = false; continue; }
    if (c === '\x15') { stack.pop(); continue; }
    if (stack.some(Boolean)) continue;
    text += c;
    kept.push(i);
  }

  const runAt = (i: number): RunProps => find(chpx, fcOf(list, kept[i]!)) ?? {};
  const paraAt = (i: number): ParaProps => find(papx, fcOf(list, kept[i]!)) ?? {};
  const clean = (c: string): string => (c === '\x1e' ? '-' : c === '\x1f' ? '­' : c === '\x0e' ? '\v' : c === '\x0b' ? '\n' : c === '\x0c' ? '\f' : /[\x01\x02\x05\x08]/.test(c) ? '' : c);
  const runs = (from: number, to: number): Run[] => {
    const out: Run[] = [];
    for (let i = from; i < to; i++) {
      const ch = clean(text[i]!);
      if (!ch) continue;
      const props = runAt(i);
      const last = out[out.length - 1];
      if (last && JSON.stringify(last.props) === JSON.stringify(props)) last.text += ch;
      else out.push({ text: ch, props });
    }
    return out;
  };

  const b = new DocBuilder();
  let rows: Block[][][] = [];
  let row: Block[][] = [];
  let cell: Block[] = [];
  let start = 0;
  const mk = (end: number): Paragraph => para(runs(start, end), paraAt(end));
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\r') {
      if (row.length || cell.length) cell.push(mk(i));
      else { if (rows.length) { b.blocks.push(makeTable(rows)); rows = []; } b.blocks.push(mk(i)); }
      start = i + 1;
    } else if (c === '\x07') {
      if (text[i + 1] === '\x07') {
        cell.push(mk(i)); row.push(cell); rows.push(row);
        row = []; cell = []; i++; start = i + 1;
      } else if (start < i || !cell.length || row.length) {
        cell.push(mk(i)); row.push(cell); cell = []; start = i + 1;
      } else { rows.push(row); row = []; start = i + 1; }
    }
  }
  if (rows.length) b.blocks.push(makeTable(rows));
  if (start < text.length) b.blocks.push(mk(text.length - 1));
  return b.finish();
};
