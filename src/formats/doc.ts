import { unzlibSync, inflateSync } from 'fflate';
import type { Block, Doc, FloatPlacement, ImageAtom, Paragraph, ParaProps, Run, RunProps, WrapKind } from '../core/model';
import { para } from '../core/model';
import { DocBuilder, makeTable } from './build';
import { readCompound } from './cfb';

// Reads the older binary format: text, tables, pictures, and the common character and paragraph formatting.
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

// Pictures are stored as drawing records (a small tree of typed records) holding the picture file.
interface Pic { mime: string; data: Uint8Array }

const BLIP: Record<number, [string, boolean]> = {
  0xf01a: ['image/emf', true], 0xf01b: ['image/wmf', true], 0xf01c: ['image/pict', true],
  0xf01d: ['image/jpeg', false], 0xf01e: ['image/png', false], 0xf01f: ['image/bmp', false], 0xf029: ['image/tiff', false], 0xf02a: ['image/jpeg', false],
};

const dibToBmp = (dib: Uint8Array): Uint8Array => {
  const v = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const size = v.getUint32(0, true);
  const bits = size === 12 ? v.getUint16(10, true) : v.getUint16(14, true);
  const comp = size === 12 ? 0 : v.getUint32(16, true);
  const used = size === 12 ? 0 : v.getUint32(32, true);
  const pal = (bits <= 8 ? used || 1 << bits : 0) * (size === 12 ? 3 : 4) + (comp === 3 && size === 40 ? 12 : 0);
  const out = new Uint8Array(14 + dib.length);
  const o = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4d;
  o.setUint32(2, out.length, true);
  o.setUint32(10, 14 + size + pal, true);
  out.set(dib, 14);
  return out;
};

const blipAt = (b: Uint8Array, at: number): Pic | null => {
  if (at + 8 > b.length) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const inst = v.getUint16(at, true) >> 4;
  const type = v.getUint16(at + 2, true);
  const len = v.getUint32(at + 4, true);
  const kind = BLIP[type];
  if (!kind) return null;
  const end = Math.min(b.length, at + 8 + len);
  const uids = inst & 1 ? 32 : 16;
  if (kind[1]) {
    const h = at + 8 + uids;
    const cbSave = v.getUint32(h + 28, true);
    const compressed = b[h + 32] === 0;
    let data = b.subarray(h + 34, Math.min(end, h + 34 + cbSave));
    if (compressed) { try { data = data[0] === 0x78 ? unzlibSync(data) : inflateSync(data); } catch { return null; } }
    else data = data.slice();
    if (type === 0xf01b && !(data[0] === 0xd7 && data[1] === 0xcd)) {
      // Pictures of this kind are stored without the placeable header; add it from the stored bounds.
      const l = v.getInt32(h + 4, true); const t = v.getInt32(h + 8, true); const r = v.getInt32(h + 12, true); const bt = v.getInt32(h + 16, true);
      const head = new Uint8Array(22); const hv = new DataView(head.buffer);
      hv.setUint32(0, 0x9ac6cdd7, true);
      hv.setInt16(6, l, true); hv.setInt16(8, t, true); hv.setInt16(10, r, true); hv.setInt16(12, bt, true);
      hv.setUint16(14, 1440, true);
      let sum = 0; for (let i = 0; i < 10; i++) sum ^= hv.getUint16(i * 2, true);
      hv.setUint16(20, sum, true);
      const fixed = new Uint8Array(22 + data.length); fixed.set(head); fixed.set(data, 22);
      data = fixed;
    }
    return { mime: kind[0], data };
  }
  const data = b.slice(at + 8 + uids + 1, end);
  return type === 0xf01f ? { mime: 'image/bmp', data: dibToBmp(data) } : { mime: kind[0], data };
};

// Walks drawing records, calling visit for each one; containers are walked into.
const walkArt = (b: Uint8Array, from: number, to: number, visit: (type: number, at: number, len: number, inst: number) => boolean | void): void => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = from;
  while (at + 8 <= Math.min(to, b.length)) {
    const verInst = v.getUint16(at, true);
    const type = v.getUint16(at + 2, true);
    const len = v.getUint32(at + 4, true);
    if (type < 0xf000 || at + 8 + len > b.length + 8) return;
    if (visit(type, at, len, verInst >> 4) === false) return;
    if ((verInst & 0xf) === 0xf) walkArt(b, at + 8, at + 8 + len, visit);
    at += 8 + len;
  }
};

const fbsePic = (b: Uint8Array, at: number, len: number, word: Uint8Array): Pic | null => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const cbName = b[at + 8 + 33] ?? 0;
  if (len > 36 + cbName) return blipAt(b, at + 8 + 36 + cbName);
  const delay = v.getUint32(at + 8 + 28, true);
  return delay && delay < word.length ? blipAt(word, delay) : null;
};

// A picture placed in the text: a picture header in the data stream, then its drawing records.
const inlinePic = (data: Uint8Array, fc: number, word: Uint8Array): { pic: Pic; width: number; height: number } | null => {
  if (fc + 68 > data.length) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const lcb = v.getUint32(fc, true);
  const cbHeader = v.getUint16(fc + 4, true);
  const mm = v.getInt16(fc + 6, true);
  const end = Math.min(data.length, fc + lcb);
  const goalX = v.getInt16(fc + 28, true); const goalY = v.getInt16(fc + 30, true);
  const mx = v.getUint16(fc + 32, true) || 1000; const my = v.getUint16(fc + 34, true) || 1000;
  const crop = [v.getInt16(fc + 36, true), v.getInt16(fc + 38, true), v.getInt16(fc + 40, true), v.getInt16(fc + 42, true)];
  const width = Math.max(1, ((goalX - crop[0]! - crop[2]!) * mx) / 1000 / 20);
  const height = Math.max(1, ((goalY - crop[1]! - crop[3]!) * my) / 1000 / 20);
  let at = fc + cbHeader;
  if (mm === 0x66) at += 1 + (data[at] ?? 0);
  let pic: Pic | null = null;
  if (mm === 0x64 || mm === 0x66) {
    walkArt(data, at, end, (type, rec, len) => {
      if (type === 0xf007) pic = fbsePic(data, rec, len, word);
      else if (BLIP[type]) pic = blipAt(data, rec);
      return pic ? false : undefined;
    });
  } else if (mm >= 1 && mm <= 8) {
    // Older pictures hold a plain metafile right after the header.
    const raw = data.slice(at, end);
    const head = new Uint8Array(22); const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x9ac6cdd7, true); hv.setInt16(10, v.getInt16(fc + 8, true) || goalX, true); hv.setInt16(12, v.getInt16(fc + 10, true) || goalY, true); hv.setUint16(14, 1440, true);
    const out = new Uint8Array(22 + raw.length); out.set(head); out.set(raw, 22);
    pic = { mime: 'image/wmf', data: out };
  }
  return pic ? { pic, width, height } : null;
};

interface Floating { cp: number; spid: number; x: number; y: number; w: number; h: number; flags: number }

// Floating pictures: anchor positions in one table, drawings and picture files in another.
const floatingPics = (word: Uint8Array, table: Uint8Array): { anchors: Map<number, Floating>; pics: Map<number, Pic>; rel: Map<number, [number, number]> } => {
  const v = new DataView(word.buffer, word.byteOffset, word.byteLength);
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const anchors = new Map<number, Floating>();
  const pics = new Map<number, Pic>();
  const rel = new Map<number, [number, number]>();
  const fcSpa = v.getUint32(474, true); const lcbSpa = v.getUint32(478, true);
  if (lcbSpa && fcSpa + lcbSpa <= table.length) {
    const n = (lcbSpa - 4) / 30;
    for (let i = 0; i < n; i++) {
      const cp = t.getUint32(fcSpa + i * 4, true);
      const s = fcSpa + (n + 1) * 4 + i * 26;
      const l = t.getInt32(s + 4, true); const top = t.getInt32(s + 8, true);
      anchors.set(cp, { cp, spid: t.getUint32(s, true), x: l / 20, y: top / 20, w: (t.getInt32(s + 12, true) - l) / 20, h: (t.getInt32(s + 16, true) - top) / 20, flags: t.getUint16(s + 20, true) });
    }
  }
  const fcDgg = v.getUint32(554, true); const lcbDgg = v.getUint32(558, true);
  if (!lcbDgg || fcDgg + lcbDgg > table.length) return { anchors, pics, rel };
  const store: (Pic | null)[] = [];
  let dggEnd = fcDgg;
  walkArt(table, fcDgg, fcDgg + 8 + t.getUint32(fcDgg + 4, true), (type, at, len) => {
    if (type === 0xf000) dggEnd = at + 8 + len;
    if (type === 0xf007) store.push(fbsePic(table, at, len, word));
  });
  const shapes = (from: number, to: number) => {
    let spid = 0; let pib = 0;
    walkArt(table, from, to, (type, at, len, inst) => {
      if (type === 0xf004) { spid = 0; pib = 0; }
      if (type === 0xf00a) spid = t.getUint32(at + 8, true);
      if (type === 0xf00b || type === 0xf122) for (let k = 0; k < inst && 8 + k * 6 + 6 <= len + 8; k++) {
        const id = t.getUint16(at + 8 + k * 6, true) & 0x3fff;
        const val = t.getUint32(at + 8 + k * 6 + 2, true);
        if (id === 0x0104) pib = val;
        if ((id === 0x0390 || id === 0x0392) && spid) { const r = rel.get(spid) ?? [-1, -1]; r[id === 0x0390 ? 0 : 1] = val; rel.set(spid, r); }
      }
      if (spid && pib && store[pib - 1]) { pics.set(spid, store[pib - 1]!); pib = 0; }
    });
  };
  // After the shared records come the drawings, each led by one byte saying where it belongs.
  let at = dggEnd;
  while (at + 9 <= fcDgg + lcbDgg) {
    const len = t.getUint32(at + 1 + 4, true);
    shapes(at + 1, at + 9 + len);
    at += 9 + len;
  }
  return { anchors, pics, rel };
};

const floatFor = (f: Floating, rel?: [number, number]): { wrap: WrapKind; float: FloatPlacement } => {
  // Positions set on the shape itself take priority over the anchor's own setting.
  const bx = rel && rel[0] >= 0 ? rel[0] : (f.flags >> 1) & 3;
  const by = rel && rel[1] >= 0 ? rel[1] : (f.flags >> 3) & 3; const wr = (f.flags >> 5) & 15; const below = !!(f.flags & 0x4000);
  const wrap: WrapKind = wr === 1 ? 'topBottom' : wr === 3 ? (below ? 'behind' : 'front') : wr === 4 ? 'tight' : wr === 5 ? 'through' : 'square';
  return { wrap, float: { relH: bx === 1 ? 'page' : bx === 2 ? 'column' : bx === 3 ? 'character' : 'margin', relV: by === 1 ? 'page' : by === 2 ? 'paragraph' : by === 3 ? 'line' : 'margin', x: f.x, y: f.y } };
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
    if (!off) return { props: {} as RunProps };
    const list = sprms(page, off + 1, off + 1 + page[off]!);
    const loc = list.find((s) => s.op === 0x6a03);
    return { props: charProps(list, fonts), pic: loc ? loc.arg.getUint32(loc.at, true) : undefined };
  });
  const dataStream = files.get('Data');
  const floating = floatingPics(word, table);
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

  const runAt = (i: number): RunProps => find(chpx, fcOf(list, kept[i]!))?.props ?? {};
  const b = new DocBuilder();
  const picture = (pic: Pic, width: number, height: number, place?: { wrap: WrapKind; float: FloatPlacement }): Run => {
    const r = b.image({ mime: pic.mime, data: pic.data, width, height });
    const k = !place && width > 468 ? 468 / width : 1;
    const atom = { ...(r.atom as ImageAtom), width: Math.max(1, width * k), height: Math.max(1, height * k), ...(place ?? {}) };
    return { ...r, atom };
  };
  const paraAt = (i: number): ParaProps => find(papx, fcOf(list, kept[i]!)) ?? {};
  const clean = (c: string): string => (c === '\x1e' ? '-' : c === '\x1f' ? '­' : c === '\x0e' ? '\v' : c === '\x0b' ? '\n' : c === '\x0c' ? '\f' : /[\x01\x02\x05\x08]/.test(c) ? '' : c);
  const runs = (from: number, to: number): Run[] => {
    const out: Run[] = [];
    for (let i = from; i < to; i++) {
      if (text[i] === '\x01' && dataStream) {
        const loc = find(chpx, fcOf(list, kept[i]!))?.pic;
        const found = loc !== undefined ? inlinePic(dataStream, loc, word) : null;
        if (found) { out.push(picture(found.pic, found.width, found.height)); continue; }
      }
      if (text[i] === '\x08') {
        const a = floating.anchors.get(kept[i]!);
        const pic = a ? floating.pics.get(a.spid) : undefined;
        if (a && pic) { out.push(picture(pic, a.w, a.h, floatFor(a, floating.rel.get(a.spid)))); continue; }
      }
      const ch = clean(text[i]!);
      if (!ch) continue;
      const props = runAt(i);
      const last = out[out.length - 1];
      if (last && !last.atom && JSON.stringify(last.props) === JSON.stringify(props)) last.text += ch;
      else out.push({ text: ch, props });
    }
    return out;
  };

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
